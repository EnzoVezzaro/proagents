import fs from "node:fs/promises";
import path from "node:path";
import type { ProfileManifest } from "./types.js";
import { validateProfile } from "./validation.js";
import { loadProfileFile } from "./registry.js";
import { getRemoteFile, putRemoteFile } from "../crew/registry.js";
import type { GitHubCommitTarget } from "../crew/registry.js";
import { CrewError } from "../crew/types.js";

/**
 * Profile marketplace publishing — mirrors the crew pipeline (Git-as-database:
 * items/<id>.json + catalog.json, committed through the GitHub Contents API).
 *
 * A profile "item file" is the ProfileManifest itself (same shape as
 * profiles/*.json); the catalog index entry carries kind: "profile".
 */

/** Directory the item files live in (relative to repo root). */
export const MARKETPLACE_ITEMS_DIR = ".marketplace/items";
/** Path of the catalog index (relative to repo root). */
export const CATALOG_PATH = ".marketplace/catalog.json";

/**
 * Deterministic validation problems for a profile manifest (for CI gating).
 * `profileDir` enables the section-path checks (PA042) for folder-format
 * items; omit it for inline drafts that have no directory yet.
 */
export function profileProblems(manifest: ProfileManifest, profileDir?: string): string[] {
  if (typeof manifest !== "object" || manifest === null || typeof manifest.profile !== "object") {
    return ["item is not a profile manifest (profile object expected)"];
  }
  const report = validateProfile(manifest, { checkKnowledge: false, profileDir });
  return report.findings
    .filter((f) => f.severity === "error")
    .map((f) => `[${f.code}] ${f.message}${f.suggestion ? ` — ${f.suggestion}` : ""}`);
}

/** Extract identity fields with fallbacks so index entries always materialize. */
function indexFields(manifest: ProfileManifest): {
  slug: string;
  title: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
} {
  return {
    slug: manifest.profile?.slug ?? "unknown-profile",
    title: manifest.identity?.title ?? manifest.profile?.name ?? manifest.profile?.slug ?? "Unknown Profile",
    version: manifest.version ?? "0.0.0",
    description: manifest.profile?.description ?? manifest.identity?.summary ?? "",
    author: manifest.profile?.author ?? "community",
    tags: ["profile", ...(manifest.profile?.tags ?? [])],
  };
}

/**
 * Publish a profile to the Git-backed marketplace catalog: writes the full
 * manifest to items/<slug>.json and upserts the lightweight index entry with
 * kind: "profile". Two commits, both reviewable in Git history.
 */
export async function publishProfile(manifest: ProfileManifest, target: GitHubCommitTarget): Promise<{ itemPath: string; catalogPath: string }> {
  const problems = profileProblems(manifest);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `refusing to publish invalid profile: ${problems.join("; ")}`, { problems });
  }

  const { slug, title, version, description, author, tags } = indexFields(manifest);

  // 1. Upsert the full manifest (standardized folder layout; the legacy flat
  //    items/<slug>.json is left untouched for backward compatibility).
  const itemPath = `.marketplace/items/${slug}/profile.json`;
  const itemFile = await getRemoteFile(target, itemPath);
  await putRemoteFile(target, itemPath, JSON.stringify(manifest, null, 2) + "\n", itemFile.sha, `profile: publish ${slug}@${version}`);

  // 2. Update the catalog index.
  const catalogPath = ".marketplace/catalog.json";
  const catalogFile = await getRemoteFile(target, catalogPath);
  let catalog: { schemaVersion: 1; updatedAt: string; items: Array<Record<string, unknown>> };
  try {
    catalog = JSON.parse(catalogFile.content ?? "{}") as typeof catalog;
    if (!Array.isArray(catalog.items)) catalog.items = [];
  } catch {
    catalog = { schemaVersion: 1, updatedAt: new Date(0).toISOString(), items: [] };
  }
  const existing = catalog.items.find((i) => i.id === slug) as { downloads?: number; createdAt?: string } | undefined;
  const item = {
    id: slug,
    name: title,
    version,
    description,
    author,
    tags,
    kind: "profile" as const,
    downloads: existing?.downloads ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const items = [...catalog.items.filter((i) => i.id !== slug), item].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const updated = { schemaVersion: 1 as const, updatedAt: new Date().toISOString(), items };
  await putRemoteFile(target, catalogPath, JSON.stringify(updated, null, 2) + "\n", catalogFile.sha, `profile: update catalog index for ${slug}`);

  return { itemPath, catalogPath };
}

/** Read the local marketplace item (for tests/CLI dev), hydrating paths. */
export async function readProfileItemLocal(root: string, slug: string): Promise<ProfileManifest> {
  const folder = path.join(root, MARKETPLACE_ITEMS_DIR, slug, "profile.json");
  try {
    return await loadProfileFile(folder);
  } catch {
    // fall through to the legacy flat layout
  }
  const file = path.join(root, MARKETPLACE_ITEMS_DIR, `${slug}.json`);
  try {
    return await loadProfileFile(file);
  } catch {
    throw new CrewError("CREW_NOT_FOUND", `profile item not found locally: ${slug} (expected ${folder})`);
  }
}
