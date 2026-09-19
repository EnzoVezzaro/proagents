/**
 * Source declarations — load and validate `registry/sources/*.yaml`.
 *
 * Per NEW_CHANGES.md, federated sources are declared as data (schema
 * `proagents/registry-source/v1`), never special-cased in code. Loading is
 * deterministic and tolerant: one malformed file yields a surfaced problem,
 * the valid files still load. Governance is enforced here: a source with
 * `policy.allowed: false` is never queried — it loads with a problem note
 * so callers can report why it was skipped.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import type { SourceManifest } from "./types.js";

/**
 * Packaged source declarations (npm package): consumer repos have no
 * registry/sources checkout, so federation falls back to the shipped
 * declarations. `dist/registry/sources.js` → `<pkgroot>/registry/sources`.
 */
const PACKAGED_SOURCES_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../registry/sources",
);

/** Schema literal every source file must declare. */
export const SOURCE_SCHEMA = "proagents/registry-source/v1" as const;

/** Directory holding source declarations, relative to the repo root. */
export const SOURCES_DIR = "registry/sources";

export interface LoadedSource {
  manifest?: SourceManifest;
  /** File the declaration came from (for surfacing problems). */
  file: string;
  /** Load/validate problems — a manifest with problems is never queried. */
  problems: string[];
}

/**
 * Validate one parsed source document. Returns the manifest when valid;
 * problems are collected (not thrown) so one bad file never blocks others.
 */
function validateSource(raw: unknown, file: string): LoadedSource {
  const problems: string[] = [];
  const doc = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  if (doc.schema !== SOURCE_SCHEMA) {
    problems.push(`schema must be "${SOURCE_SCHEMA}"`);
  }
  if (typeof doc.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(doc.id)) {
    problems.push("id must be a lowercase slug");
  }
  if (typeof doc.name !== "string" || doc.name.length === 0) {
    problems.push("name must be a non-empty string");
  }
  const caps = (typeof doc.capabilities === "object" && doc.capabilities !== null ? doc.capabilities : {}) as Record<string, unknown>;
  const capabilities = {
    search: caps.search === true,
    metadata: caps.metadata === true,
    resolve: caps.resolve === true,
    install: caps.install === true,
  };
  if (!capabilities.search) {
    problems.push("capabilities.search must be true for this release (search-only federation)");
  }
  const artifact_types = Array.isArray(doc.artifact_types) ? doc.artifact_types.filter((t): t is SourceManifest["artifact_types"][number] => typeof t === "string") : [];
  if (artifact_types.length === 0) {
    problems.push("artifact_types must list at least one artifact kind");
  }
  const policy = (typeof doc.policy === "object" && doc.policy !== null ? doc.policy : {}) as Record<string, unknown>;
  const allowed = policy.allowed === true;
  if (typeof policy.allowed !== "boolean") {
    problems.push("policy.allowed must be a boolean");
  }
  const adapter = typeof doc.adapter === "string" ? doc.adapter : undefined;

  if (problems.length > 0) return { file, problems };

  return {
    file,
    problems: [],
    manifest: {
      schema: SOURCE_SCHEMA,
      id: doc.id as string,
      name: doc.name as string,
      type: typeof doc.type === "string" ? doc.type : "custom",
      capabilities,
      artifact_types,
      policy: { allowed },
      ...(adapter ? { adapter } : {}),
    },
  };
}

/**
 * Load one source declaration file (YAML). Tolerant: returns problems
 * instead of throwing for unreadable/malformed files.
 */
export async function loadSourceFile(file: string): Promise<LoadedSource> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return validateSource(yamlParse(raw), file);
  } catch (err) {
    return { file, problems: [`cannot read source file: ${(err as Error).message}`] };
  }
}

/**
 * Load all source declarations from a directory (default
 * `<root>/registry/sources`). Deterministic: sorted by file name, then by
 * source id. Disallowed sources load with their manifest but are filtered
 * from searches by `allowedSources`.
 */
export async function loadSources(root: string = process.cwd(), dir: string = SOURCES_DIR): Promise<LoadedSource[]> {
  const localDir = path.resolve(root, dir);
  let files: string[] = [];
  try {
    files = (await fs.readdir(localDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && /\.(yaml|yml)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    // No local checkout — fall back to the packaged declarations when the
    // requested dir is the default (an explicit dir means the caller knows).
    if (dir !== SOURCES_DIR) return []; // explicit dir — no fallback
    try {
      files = (await fs.readdir(PACKAGED_SOURCES_DIR, { withFileTypes: true }))
        .filter((e) => e.isFile() && /\.(yaml|yml)$/.test(e.name))
        .map((e) => e.name)
        .sort();
      return (await Promise.all(files.map((f) => loadSourceFile(path.join(PACKAGED_SOURCES_DIR, f))))).sort(
        (a, b) => (a.manifest?.id ?? a.file).localeCompare(b.manifest?.id ?? b.file),
      );
    } catch {
      return []; // No sources anywhere — native-only registry.
    }
  }
  const loaded = await Promise.all(files.map((f) => loadSourceFile(path.resolve(root, dir, f))));
  return loaded.sort((a, b) => (a.manifest?.id ?? a.file).localeCompare(b.manifest?.id ?? b.file));
}

/** Filter to queryable sources: valid, search-capable, policy-allowed. */
export function allowedSources(loaded: LoadedSource[]): SourceManifest[] {
  return loaded.flatMap((l) => (l.manifest && l.problems.length === 0 && l.manifest.policy.allowed && l.manifest.capabilities.search ? [l.manifest] : []));
}
