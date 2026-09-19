/**
 * Unified registry catalog — one read API over the Git-as-database catalog
 * plus item resolution across all artifact kinds.
 *
 * Delegation, not duplication: local/remote catalog reads delegate to the
 * existing crew registry readers (`src/crew/registry.ts`); profile item
 * hydration delegates to `src/profiles/registry.ts`; crew items delegate to
 * `src/crew/hydrate.ts`. This module adds only what's genuinely new: kind-
 * aware lookup, normalization of catalog entries into the unified artifact
 * model, and listing across kinds.
 *
 * Deterministic: the same inputs always yield the same listing, sorted by
 * id then kind. No model calls, no randomness.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { MarketplaceItem, ArtifactKind } from "./types.js";
import type { ProfileManifest } from "../profiles/types.js";
import { readCatalogLocal, readCatalogRemote, CATALOG_PATH, REGISTRY_DIR, CREWS_DIR } from "../crew/registry.js";
import { loadCrewFile } from "../crew/hydrate.js";
import type { CrewDefinition } from "../crew/types.js";

/**
 * Catalog lookup order: the repo's own checkout (registry/catalog.json)
 * first; when absent — a consumer repo has none — fall back to the catalog
 * shipped with the npm package (same mechanism as the packaged profiles).
 * `dist/registry/catalog.js` → `<pkgroot>/registry/catalog.json`.
 */
const PACKAGED_CATALOG = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../registry/catalog.json",
);

/** All 13 artifact kinds — the registry models them all from day one. */
export const ALL_KINDS: readonly ArtifactKind[] = [
  "profile", "crew", "agent", "workflow", "capability", "skill", "tool", "mcp",
  "prompt", "hook", "adapter", "policy", "template", "extension",
];

/** Kind ids that have item loaders in this release (list/info/install). */
export const LOADER_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>(["profile", "crew", "agent"]);

/** Kinds whose content ships in this repo under registry/<plural>/ or can be listed. */
function dirForKind(kind: ArtifactKind): string | undefined {
  switch (kind) {
    case "profile":
      return "profiles";
    case "crew":
    case "agent":
      return CREWS_DIR; // agents are crew items with kind "agent"
    default:
      return undefined; // no content dir yet; catalog-only kinds
  }
}

/** True when the kind's items live in this repo (or the local .proagent dir). */
export function isListableKind(kind: ArtifactKind): boolean {
  return dirForKind(kind) !== undefined;
}

/**
 * The normalized artifact the registry layer hands to consumers (CLI
 * search/info/list, Studio). A catalog entry plus the item's content when a
 * loader exists for its kind.
 */
export interface Artifact {
  item: MarketplaceItem;
  /** Present for kinds with loaders (profile manifests, crew definitions). */
  content?: ProfileManifest | CrewDefinition;
}

// ---------------------------------------------------------------------------
// Catalog reads (delegating)
// ---------------------------------------------------------------------------

export { readCatalogLocal, readCatalogRemote, CATALOG_PATH, REGISTRY_DIR };

/** List catalog entries of one kind (or all kinds). Deterministic order. */
export async function listItems(opts: { kind?: ArtifactKind; root?: string; repo?: string; ref?: string; token?: string } = {}): Promise<MarketplaceItem[]> {
  let catalog: Awaited<ReturnType<typeof readCatalogLocal>>;
  if (opts.repo) {
    catalog = await readCatalogRemote(opts.repo, opts.ref ?? "main", opts.token);
  } else {
    const root = opts.root ?? process.cwd();
    catalog = await readCatalogLocal(root);
    if (catalog.items.length === 0) {
      // No local checkout — the packaged catalog is the registry.
      try {
        const raw = await fs.readFile(PACKAGED_CATALOG, "utf8");
        catalog = JSON.parse(raw) as Awaited<ReturnType<typeof readCatalogLocal>>;
      } catch {
        // Neither exists — genuinely empty registry (degrades, never crashes).
      }
    }
  }
  const items = catalog.items.filter((i) => (opts.kind ? i.kind === opts.kind : true));
  return items.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
}

/** Look up one catalog entry by kind:id (kind defaults to "profile"). */
export async function getItem(kind: ArtifactKind, id: string, opts: { root?: string; repo?: string; ref?: string; token?: string } = {}): Promise<MarketplaceItem | undefined> {
  const items = await listItems(opts);
  return items.find((i) => i.id === id && i.kind === kind);
}

// ---------------------------------------------------------------------------
// Item content loaders (per kind, delegating to domain layers)
// ---------------------------------------------------------------------------

/** Load the full content of one item by kind. Undefined = no loader / not found. */
export async function loadItem(kind: ArtifactKind, id: string, opts: { root?: string; repo?: string; ref?: string; token?: string } = {}): Promise<Artifact | undefined> {
  const item = await getItem(kind, id, opts);
  if (!item) return undefined;
  switch (kind) {
    case "profile": {
      const { listProfiles } = await import("../profiles/registry.js");
      const entries = await listProfiles(opts.root ?? process.cwd());
      const entry = entries.find((e) => e.manifest.profile.slug === id);
      return entry ? { item, content: entry.manifest } : { item };
    }
    case "crew":
    case "agent": {
      const root = opts.root ?? process.cwd();
      const localFile = path.join(root, REGISTRY_DIR, CREWS_DIR, id, "manifest.json");
      try {
        return { item, content: await loadCrewFile(localFile) };
      } catch {
        return { item }; // remote-only or malformed — catalog entry is still valid
      }
    }
    default:
      return { item }; // schema-complete kind, loader lands with content
  }
}

/** Report whether a kind can be fully loaded in this release (`info` uses this). */
export function hasLoader(kind: ArtifactKind): boolean {
  return LOADER_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Local item creation (proagent build/profile create write targets)
// ---------------------------------------------------------------------------

/** Where new local items of a kind are written (.proagent/<plural>). */
export function localDirForKind(kind: ArtifactKind): string {
  const plural = kind === "crew" || kind === "agent" ? "crews" : `${kind}s`;
  return path.join(".proagent", plural);
}

/**
 * Write a local item manifest for a kind whose folder standard matches the
 * profile manifest shape. Used by `proagent build --kind spec`-adjacent
 * flows and `profile create`; deterministic (no timestamps injected).
 */
export async function writeLocalItem(kind: ArtifactKind, id: string, manifestJson: string, root: string = process.cwd()): Promise<string> {
  if (!isListableKind(kind)) {
    throw new Error(`kind "${kind}" has no local item layout yet`);
  }
  const dir = path.resolve(root, localDirForKind(kind), id);
  await fs.mkdir(dir, { recursive: true });
  // Unified registry format: the entry point is always manifest.json.
  const file = path.join(dir, "manifest.json");
  await fs.writeFile(file, manifestJson, "utf8");
  return file;
}
