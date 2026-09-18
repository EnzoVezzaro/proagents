import fs from "node:fs/promises";
import path from "node:path";
import type { ProfileManifest, ProfileValidationReport } from "./types.js";
import { validateProfile } from "./validation.js";

/**
 * Profile registry — deterministic loading and discovery of Professional
 * Agent Profiles.
 *
 * Sources, in precedence order:
 *   1. built-in profiles shipped in the package (`profiles/*.json`)
 *   2. local `./profiles/*.json` in the current repository
 *
 * The registry is side-effect free: the same directory always yields the
 * same list, sorted by slug. No model calls, no randomness.
 */

const BUILTIN_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../profiles",
);

/** Local checkout of the Git-backed marketplace (same layout as .marketplace). */
export const MARKETPLACE_ITEMS_DIR = path.join(".marketplace", "items");

export interface ProfileEntry {
  manifest: ProfileManifest;
  /** Where this profile came from: "builtin", a local path, or the marketplace. */
  origin: "builtin" | "local" | "marketplace";
  /** Absolute directory containing the manifest (knowledge refs resolve against it). */
  dir: string;
}

function isValidProfile(json: unknown): json is ProfileManifest {
  return (
    typeof json === "object" &&
    json !== null &&
    typeof (json as ProfileManifest).version === "string" &&
    typeof (json as ProfileManifest).profile === "object" &&
    typeof (json as ProfileManifest).identity === "object"
  );
}

/** Load a single profile manifest from a JSON file. */
export async function loadProfileFile(file: string): Promise<ProfileManifest> {
  const raw = await fs.readFile(file, "utf8");
  const json: unknown = JSON.parse(raw);
  if (!isValidProfile(json)) {
    throw new Error(`not a profile manifest: ${file}`);
  }
  return json;
}

async function listJson(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => path.join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * List candidate manifest files for a profile source directory. Both layouts
 * are discovered so old checkouts keep working:
 *   flat:    <dir>/<slug>.json
 *   folder:  <dir>/<slug>/profile.json  (the standardized, extensible layout
 *            — a profile is a self-contained folder: profile.json + knowledge/)
 */
async function listManifestCandidates(dir: string): Promise<string[]> {
  const flat = await listJson(dir);
  let folder: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    folder = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name, "profile.json"))
      .sort();
  } catch {
    // Directory missing entirely — flat already returned [].
  }
  return [...flat, ...folder];
}

/**
 * List all discoverable profiles. Precedence per slug (last write wins in
 * insertion order, marketplace never shadows the others):
 *   1. built-in (shipped with the package)
 *   2. local ./profiles/ — user overrides of built-ins (flagged as local)
 *   3. local .marketplace/items/ — fills only gaps (never shadows 1 or 2)
 * Deterministic ordering by slug.
 */
export async function listProfiles(root: string = process.cwd()): Promise<ProfileEntry[]> {
  const bySlug = new Map<string, ProfileEntry>();
  const put = (entry: ProfileEntry): void => {
    bySlug.set(entry.manifest.profile.slug, entry);
  };

  for (const file of await listManifestCandidates(BUILTIN_DIR)) {
    try {
      const manifest = await loadProfileFile(file);
      put({ manifest, origin: "builtin", dir: path.dirname(file) });
    } catch {
      // A malformed built-in never breaks discovery; validation reports it.
    }
  }

  for (const file of await listManifestCandidates(path.join(root, "profiles"))) {
    try {
      const manifest = await loadProfileFile(file);
      put({ manifest, origin: "local", dir: path.dirname(file) });
    } catch {
      // Local files that are not profiles are ignored by discovery.
    }
  }

  for (const file of await listManifestCandidates(path.join(root, MARKETPLACE_ITEMS_DIR))) {
    try {
      const manifest = await loadProfileFile(file);
      // Marketplace copies of builtin/local slugs never shadow them.
      if (bySlug.has(manifest.profile.slug)) continue;
      put({ manifest, origin: "marketplace", dir: path.dirname(file) });
    } catch {
      // Marketplace items that are crews/agents (not profile manifests) are skipped.
    }
  }

  return [...bySlug.values()].sort((a, b) => a.manifest.profile.slug.localeCompare(b.manifest.profile.slug));
}

/** Resolve one or more profile slugs (or paths) to loaded entries. */
export async function resolveProfiles(slugs: string[], root: string = process.cwd()): Promise<ProfileEntry[]> {
  if (slugs.length === 0) throw new Error("no profiles requested");
  const entries: ProfileEntry[] = [];
  for (const slug of slugs) {
    const all = await listProfiles(root);
    const found = all.find((e) => e.manifest.profile.slug === slug);
    if (!found) {
      const available = all.map((e) => e.manifest.profile.slug).join(", ");
      throw new Error(`unknown profile: ${slug} (available: ${available || "none"})`);
    }
    entries.push(found);
  }
  return entries;
}

/**
 * Fetch a profile manifest from the remote Git-backed marketplace catalog.
 * Tries the folder layout first (items/<id>/profile.json), then the legacy
 * flat layout (items/<id>.json) so older catalogs keep working.
 */
export async function fetchProfileManifest(id: string, repo: string, ref: string, token?: string): Promise<ProfileManifest> {
  const base = `https://raw.githubusercontent.com/${repo}/${ref}/${MARKETPLACE_ITEMS_DIR}`;
  const urls = [`${base}/${id}/profile.json`, `${base}/${id}.json`];
  // Mirrors fetchRaw in crew/registry.ts: retry unauthenticated on 404, since
  // an invalid token makes GitHub raw answer 404 even for public files.
  let res!: Response;
  for (const url of urls) {
    res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (res.status === 404 && token) {
      res = await fetch(url);
    }
    if (res.status !== 404) break;
  }
  if (res.status === 404) throw new Error(`profile not found in marketplace: ${id}`);
  if (!res.ok) throw new Error(`profile fetch failed: HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (!isValidProfile(json)) throw new Error(`marketplace item "${id}" is not a profile manifest`);
  return json;
}

/** Validate every discoverable profile (used by `proagent validate --profiles`). */
export async function validateAllProfiles(root: string = process.cwd()): Promise<ProfileValidationReport[]> {
  const all = await listProfiles(root);
  const slugCounts = new Map<string, number>();
  for (const e of all) {
    const s = e.manifest.profile.slug;
    slugCounts.set(s, (slugCounts.get(s) ?? 0) + 1);
  }
  const duplicates = new Set([...slugCounts.entries()].filter(([, n]) => n > 1).map(([s]) => s));
  return all.map((e) => {
    const report = validateProfile(e.manifest, { duplicateSlugs: duplicates, profileDir: e.dir });
    if (e.origin === "local") {
      report.findings.push({
        code: "PA037",
        severity: "warning",
        message: `${e.manifest.profile.slug} is a local profile — reviewed but not shipped with the package`,
        entities: [e.manifest.profile.slug],
      });
    }
    const errors = report.findings.filter((f) => f.severity === "error").length;
    const warnings = report.findings.filter((f) => f.severity === "warning").length;
    return { ...report, errors, warnings, ok: errors === 0 };
  });
}
