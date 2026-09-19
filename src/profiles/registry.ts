import fs from "node:fs/promises";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  ProfileManifest,
  ProfileManifestSource,
  ProfileMcpServer,
  ProfilePackage,
  ProfileSkillsDetail,
  ProfileValidationReport,
} from "./types.js";
import { isPathEntry, validateProfile } from "./validation.js";

/**
 * Profile registry — deterministic loading and discovery of Professional
 * Agent Profiles. Registry-native: the Git-backed `registry/profiles/`
 * folders are the single source (shipped with the npm package and
 * overridable by a local checkout); crews/agents are registry items of
 * their own kinds.
 *
 * Manifests come in two shapes, both loaded into a plain ProfileManifest:
 *   - folder standard (source of truth): every section entry is a path to a
 *     file inside the profile folder; the loader hydrates paths to content.
 *   - inline (web builder drafts, legacy files): entries carry the content.
 *
 * The registry is side-effect free: the same directory always yields the
 * same list, sorted by slug. No model calls, no randomness.
 */

/**
 * Profiles shipped with the npm package are the packaged registry items.
 * `dist/profiles/registry.js` → `<pkgroot>/registry/profiles`.
 */
const BUILTIN_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../registry/profiles",
);

/** Local checkout of the Git-backed registry (profile slice). */
export const REGISTRY_PROFILES_DIR = "registry/profiles";

/**
 * Consumer-repo local profiles (.proagent/profiles) — where `build --kind
 * profile` and `profile create` write custom items. Searched FIRST by
 * listProfiles so a repo's own creations win over both the registry
 * checkout and the packaged snapshot.
 */
export const LOCAL_PROFILES_DIR = ".proagent/profiles";

export interface ProfileEntry {
  manifest: ProfileManifest;
  /** Where this profile came from: packaged, a registry checkout, or this repo's local .proagent dir. */
  origin: "builtin" | "marketplace" | "local";
  /** Absolute directory containing the manifest (section/knowledge refs resolve against it). */
  dir: string;
}

function isValidProfile(json: unknown): json is ProfileManifestSource {
  return (
    typeof json === "object" &&
    json !== null &&
    typeof (json as ProfileManifestSource).version === "string" &&
    typeof (json as ProfileManifestSource).profile === "object" &&
    (typeof (json as ProfileManifestSource).identity === "object" ||
      // Path format: identity may be a section path, hydrated at load time.
      typeof (json as ProfileManifestSource).identity === "string")
  );
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (constrained: "key: value" lines)
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: (m[2] ?? "").trim() };
}

// ---------------------------------------------------------------------------
// Hydration: path-format source → plain manifest
// ---------------------------------------------------------------------------

/** Read a section file: frontmatter meta + body. Undefined when missing. */
async function readSectionFile(file: string): Promise<{ meta: Record<string, string>; body: string } | undefined> {
  try {
    return parseFrontmatter(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Hydrate one skills path entry back into structured data: a `ref:` file is
 * a registry-ref skill (skillsDetail); a file without `ref:` is a written
 * skill (skillBodies — body installs standalone at equip time).
 */
async function hydrateSkillEntry(
  entry: string,
  dir: string,
): Promise<{ skills: string[]; skillsDetail: Record<string, ProfileSkillsDetail>; skillBodies: Record<string, { description: string; body: string }> }> {
  const skills: string[] = [];
  const skillsDetail: Record<string, ProfileSkillsDetail> = {};
  const skillBodies: Record<string, { description: string; body: string }> = {};
  const file = await readSectionFile(path.join(dir, entry));
  if (!file) {
    // Tolerant: keep the path so PA042 can report it.
    skills.push(entry);
    return { skills, skillsDetail, skillBodies };
  }
  const { meta, body } = file;
  if (meta.ref) {
    skills.push(meta.ref);
    skillsDetail[meta.ref] = {
      skills: (meta.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      ...(meta.install ? { install: meta.install } : {}),
      ...(meta.note || body ? { note: meta.note || body } : {}),
    };
  } else {
    const name = meta.name ?? entry.replace(/^skills\//, "").replace(/\.md$/, "");
    skills.push(name);
    skillBodies[name] = { description: meta.description ?? "", body };
  }
  return { skills, skillsDetail, skillBodies };
}

/** Structured tools object as carried by tools/requirements.md frontmatter. */
interface ToolsFrontmatter {
  required?: string[];
  optional?: string[];
  forbidden?: string[];
  mcp?: ProfileMcpServer[];
  packages?: ProfilePackage[];
}

/** Parse the tools file's YAML frontmatter into the structured tools object. */
function parseToolsFrontmatter(raw: string): ProfileManifest["tools"] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return { required: [] };
  const parsed = yamlParse(m[1] ?? "") as ToolsFrontmatter | null;
  return {
    required: parsed?.required ?? [],
    ...(parsed?.optional?.length ? { optional: parsed.optional } : {}),
    ...(parsed?.forbidden?.length ? { forbidden: parsed.forbidden } : {}),
    ...(parsed?.mcp?.length ? { mcp: parsed.mcp } : {}),
    ...(parsed?.packages?.length ? { packages: parsed.packages } : {}),
  };
}

const SECTION_LISTS = ["expertise", "methods", "rules", "policies", "standards"] as const;

/**
 * Hydrate a manifest in path format: replace every path-shaped section entry
 * with the content of the file it points at (resolved against the manifest's
 * directory). identity hydrates to {title, summary} from its file; skills
 * entries rebuild skills/skillsDetail/skillBodies; tools hydrates from the
 * requirements file's YAML frontmatter; references rebuild from standards
 * files (url/note frontmatter). Tolerant by design: a missing file leaves
 * the path in place so validation can report it (PA042) instead of crashing.
 * Section entries hydrate to body, falling back to the file's title.
 */
export async function hydrateProfileManifest(json: ProfileManifestSource, dir?: string): Promise<ProfileManifest> {
  if (!dir) return json as ProfileManifest;
  const readEntry = async (entry: string): Promise<string> => {
    if (typeof entry !== "string" || !isPathEntry(entry)) return entry;
    const file = await readSectionFile(path.join(dir, entry));
    return file?.body || file?.meta.title || entry;
  };
  const out = { ...json } as ProfileManifest;

  // identity — a single path hydrates to {title, summary}.
  if (typeof json.identity === "string" && isPathEntry(json.identity)) {
    const file = await readSectionFile(path.join(dir, json.identity));
    out.identity = { title: file?.meta.title ?? "", summary: file?.body ?? "" };
  }

  for (const section of SECTION_LISTS) {
    const arr = out[section];
    if (Array.isArray(arr)) out[section] = await Promise.all(arr.map(readEntry));
  }

  // skills — path entries rebuild skills + skillsDetail + skillBodies;
  // registry refs (npm:/github:) and written-skill names pass through.
  if (Array.isArray(out.skills)) {
    const skills: string[] = [];
    const skillsDetail: Record<string, ProfileSkillsDetail> = { ...(out.skillsDetail ?? {}) };
    const skillBodies: Record<string, { description: string; body: string }> = { ...(out.skillBodies ?? {}) };
    for (const entry of out.skills) {
      if (typeof entry === "string" && isPathEntry(entry)) {
        const h = await hydrateSkillEntry(entry, dir);
        skills.push(...h.skills);
        Object.assign(skillsDetail, h.skillsDetail);
        Object.assign(skillBodies, h.skillBodies);
      } else {
        skills.push(entry);
      }
    }
    out.skills = skills;
    if (Object.keys(skillsDetail).length > 0) out.skillsDetail = skillsDetail;
    if (Object.keys(skillBodies).length > 0) out.skillBodies = skillBodies;
  }

  // tools — a path hydrates from the requirements file's YAML frontmatter.
  if (typeof json.tools === "string" && isPathEntry(json.tools)) {
    const raw = await fs.readFile(path.join(dir, json.tools), "utf8").catch(() => undefined);
    out.tools = raw !== undefined ? parseToolsFrontmatter(raw) : { required: [] };
  }

  // verification — both lists hydrate like the other sections.
  if (out.verification) {
    out.verification = {
      required: await Promise.all((out.verification.required ?? []).map(readEntry)),
      optional: await Promise.all((out.verification.optional ?? []).map(readEntry)),
    };
  }

  // references — rebuilt from the standards files (url + note frontmatter),
  // keyed by the hydrated standard name so the compiler's lookups match.
  const standards = out.standards ?? [];
  if (Array.isArray(json.standards)) {
    const references: ProfileManifest["references"] = {};
    for (const [i, entry] of json.standards.entries()) {
      if (typeof entry !== "string" || !isPathEntry(entry)) continue;
      const file = await readSectionFile(path.join(dir, entry));
      if (file?.meta.url) {
        const name = standards[i] ?? file.meta.title ?? "unknown";
        references[name] = { url: file.meta.url, ...(file.meta.note ? { note: file.meta.note } : {}) };
      }
    }
    if (Object.keys(references).length > 0) out.references = references;
  }

  return out;
}

/** Load a single profile manifest from a JSON file (hydrating path entries). */
export async function loadProfileFile(file: string): Promise<ProfileManifest> {
  const raw = await fs.readFile(file, "utf8");
  const json: unknown = JSON.parse(raw);
  if (!isValidProfile(json)) {
    throw new Error(`not a profile manifest: ${file}`);
  }
  return hydrateProfileManifest(json, path.dirname(file));
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

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
 *   folder:  <dir>/<slug>/profile.json  (the standardized layout)
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
 * List all discoverable profiles. Sources, in precedence order per slug
 * The registry checkout is the single source of truth. A repo's own
 * ./registry/profiles checkout IS the registry (it is what the repo
 * manages via PRs), so it wins; the packaged snapshot shipped with the npm
 * package fills gaps only:
 *   1. registry — a ./registry/profiles checkout in the current repo
 *      (skipped when it is the same directory as the packaged source)
 *   2. builtin — the packaged registry/profiles shipped with the package
 * Deterministic ordering by slug. No network: remote items are fetched
 * explicitly (see fetchProfileManifest), never during discovery.
 */
export async function listProfiles(root: string = process.cwd()): Promise<ProfileEntry[]> {
  const bySlug = new Map<string, ProfileEntry>();
  const put = (entry: ProfileEntry): void => {
    bySlug.set(entry.manifest.profile.slug, entry);
  };

  // Consumer-repo local dir first (.proagent/profiles) — a repo's own
  // creations win over everything else.
  const proagentDir = path.resolve(path.join(root, LOCAL_PROFILES_DIR));
  for (const file of await listManifestCandidates(proagentDir)) {
    try {
      const manifest = await loadProfileFile(file);
      put({ manifest, origin: "local", dir: path.dirname(file) });
    } catch {
      // Local files that are not profiles (crews, agents) are ignored.
    }
  }

  const localDir = path.resolve(path.join(root, REGISTRY_PROFILES_DIR));
  if (localDir !== path.resolve(BUILTIN_DIR)) {
    for (const file of await listManifestCandidates(localDir)) {
      try {
        const manifest = await loadProfileFile(file);
        put({ manifest, origin: "marketplace", dir: path.dirname(file) });
      } catch {
        // Local files that are not profiles (crews, agents) are ignored.
      }
    }
  }

  for (const file of await listManifestCandidates(BUILTIN_DIR)) {
    try {
      const manifest = await loadProfileFile(file);
      const slug = manifest.profile.slug;
      if (bySlug.has(slug)) continue; // checkout wins; packaged fills gaps only
      put({ manifest, origin: "builtin", dir: path.dirname(file) });
    } catch {
      // A malformed item never breaks discovery; validation reports it.
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
 * Fetch a profile manifest from the remote Git-backed registry catalog
 * and hydrate it over HTTP: folder layout first (profiles/<id>/profile.json,
 * every section path fetched from profiles/<id>/…), then the legacy flat
 * layout (profiles/<id>.json, inline — nothing to hydrate). Mirrors fetchRaw
 * in crew/registry.ts: retry unauthenticated on 404, since an invalid token
 * makes GitHub raw answer 404 even for public files.
 */
export async function fetchProfileManifest(id: string, repo: string, ref: string, token?: string): Promise<ProfileManifest> {
  const base = `https://raw.githubusercontent.com/${repo}/${ref}/${REGISTRY_PROFILES_DIR}`;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const get = async (url: string): Promise<string | undefined> => {
    let res = await fetch(url, { headers });
    if (res.status === 404 && token) res = await fetch(url);
    if (!res.ok) return undefined;
    return res.text();
  };

  const manifestUrl = `${base}/${id}/profile.json`;
  const rawManifest = await get(manifestUrl);
  if (rawManifest === undefined) {
    // Legacy flat layout (inline manifest — no hydration needed).
    const raw = await get(`${base}/${id}.json`);
    if (raw === undefined) throw new Error(`profile not found in registry: ${id}`);
    const json: unknown = JSON.parse(raw);
    if (!isValidProfile(json)) throw new Error(`registry item "${id}" is not a profile manifest`);
    return hydrateProfileManifest(json);
  }
  const json: unknown = JSON.parse(rawManifest);
  if (!isValidProfile(json)) throw new Error(`registry item "${id}" is not a profile manifest`);
  const dirUrl = `${base}/${id}`;
  const readFile = async (rel: string): Promise<string | undefined> => {
    if (rel.includes("..") || rel.startsWith("/")) return undefined;
    return get(`${dirUrl}/${rel}`);
  };
  return hydrateProfileManifestRemote(json, readFile);
}

/** Remote hydration: same semantics as hydrateProfileManifest, over HTTP. */
async function hydrateProfileManifestRemote(
  json: ProfileManifestSource,
  readFile: (rel: string) => Promise<string | undefined>,
): Promise<ProfileManifest> {
  const out = { ...json } as ProfileManifest;
  const parseRemote = async (entry: string): Promise<string> => {
    if (typeof entry !== "string" || !isPathEntry(entry)) return entry;
    const raw = await readFile(entry);
    if (raw === undefined) return entry;
    const { meta, body } = parseFrontmatter(raw);
    return body || meta.title || entry;
  };

  if (typeof json.identity === "string" && isPathEntry(json.identity)) {
    const raw = await readFile(json.identity);
    if (raw !== undefined) {
      const { meta, body } = parseFrontmatter(raw);
      out.identity = { title: meta.title ?? "", summary: body };
    }
  }
  for (const section of SECTION_LISTS) {
    const arr = out[section];
    if (Array.isArray(arr)) out[section] = await Promise.all(arr.map(parseRemote));
  }
  if (Array.isArray(out.skills)) {
    const skills: string[] = [];
    const skillsDetail: Record<string, ProfileSkillsDetail> = {};
    const skillBodies: Record<string, { description: string; body: string }> = {};
    for (const entry of out.skills) {
      if (typeof entry !== "string" || !isPathEntry(entry)) {
        skills.push(entry);
        continue;
      }
      const raw = await readFile(entry);
      if (raw === undefined) {
        skills.push(entry);
        continue;
      }
      const { meta, body } = parseFrontmatter(raw);
      if (meta.ref) {
        skills.push(meta.ref);
        skillsDetail[meta.ref] = {
          skills: (meta.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          ...(meta.install ? { install: meta.install } : {}),
          ...(meta.note || body ? { note: meta.note || body } : {}),
        };
      } else {
        const name = meta.name ?? entry.replace(/^skills\//, "").replace(/\.md$/, "");
        skills.push(name);
        skillBodies[name] = { description: meta.description ?? "", body };
      }
    }
    out.skills = skills;
    if (Object.keys(skillsDetail).length > 0) out.skillsDetail = skillsDetail;
    if (Object.keys(skillBodies).length > 0) out.skillBodies = skillBodies;
  }
  if (typeof json.tools === "string" && isPathEntry(json.tools)) {
    const raw = await readFile(json.tools);
    out.tools = raw !== undefined ? parseToolsFrontmatter(raw) : { required: [] };
  }
  if (out.verification) {
    out.verification = {
      required: await Promise.all((out.verification.required ?? []).map(parseRemote)),
      optional: await Promise.all((out.verification.optional ?? []).map(parseRemote)),
    };
  }
  if (Array.isArray(json.standards)) {
    const references: ProfileManifest["references"] = {};
    for (const [i, entry] of json.standards.entries()) {
      if (typeof entry !== "string" || !isPathEntry(entry)) continue;
      const raw = await readFile(entry);
      if (raw === undefined) continue;
      const { meta } = parseFrontmatter(raw);
      if (meta.url) {
        const name = out.standards?.[i] ?? meta.title ?? "unknown";
        references[name] = { url: meta.url, ...(meta.note ? { note: meta.note } : {}) };
      }
    }
    if (Object.keys(references).length > 0) out.references = references;
  }
  return out;
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
    const errors = report.findings.filter((f) => f.severity === "error").length;
    const warnings = report.findings.filter((f) => f.severity === "warning").length;
    return { ...report, errors, warnings, ok: errors === 0 };
  });
}
