import fsSync from "node:fs";
import path from "node:path";
import type {
  ProfileValidationCode,
  ProfileValidationFinding,
  ProfileValidationReport,
} from "./types.js";
import type { ProfileManifest } from "./types.js";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A section entry in path format: a relative .json path inside the profile folder. */
const PATH_RE = /^[\w./-]+\.json$/;

/**
 * True when a section entry is a folder-standard path ("rules/01-x.json")
 * rather than inline content. Registry-ref skill entries ("npm:…",
 * "github:…") and inline drafts are not paths. Knowledge references
 * ("knowledge/**") are checked by PA037, not this predicate.
 */
export function isPathEntry(entry: string): boolean {
  return PATH_RE.test(entry) && !entry.includes("..") && !entry.startsWith("/") && !entry.startsWith("npm:") && !entry.startsWith("github:");
}

export interface ValidateProfileOpts {
  /** Other distinct slugs in the registry (PA038 duplicate detection). */
  registrySlugs?: Set<string>;
  /** Slugs defined by more than one source file (shadowing). */
  duplicateSlugs?: Set<string>;
  /** Absolute profile directory — enables knowledge-reference checks (PA037). */
  profileDir?: string;
  /** Set false in tests to skip filesystem checks. */
  checkKnowledge?: boolean;
}

/**
 * Static validation of a single professional profile. Deterministic and
 * side-effect free: the same manifest always produces the same report.
 */
export function validateProfile(
  manifest: ProfileManifest,
  opts: ValidateProfileOpts = {},
): ProfileValidationReport {
  const findings: ProfileValidationFinding[] = [];
  const slug = manifest.profile?.slug ?? "(unknown)";
  const push = (code: ProfileValidationCode, severity: "error" | "warning", message: string, entities: string[] = [], suggestion?: string): void => {
    findings.push({ code, severity, message, entities, ...(suggestion ? { suggestion } : {}) });
  };

  // PA030 — required structure.
  const p = manifest.profile ?? ({} as ProfileManifest["profile"]);
  if (!manifest.version) push("PA030", "error", "missing top-level version", [slug]);
  if (!p.name) push("PA030", "error", "missing profile.name", [slug]);
  if (!p.slug) push("PA030", "error", "missing profile.slug", [slug]);
  if ("version" in p) {
    push("PA030", "error", "profile.version is removed — use the single top-level version", [slug], "Move the semver to the outermost \"version\" field.");
  }
  const identityTitle = typeof manifest.identity === "string" ? undefined : manifest.identity?.title;
  if (!identityTitle) push("PA030", "error", "missing identity.title", [slug]);

  // PA031 — slug shape.
  if (p.slug && !SLUG.test(p.slug)) {
    push("PA031", "error", `slug "${p.slug}" is not kebab-case`, [slug], "Use lowercase words separated by hyphens.");
  }

  // PA032 — semver (the single, outer version).
  if (manifest.version && !SEMVER.test(manifest.version)) {
    push("PA032", "error", `version "${manifest.version}" is not semver`, [slug], "Use major.minor.patch.");
  }

  // PA033 — expertise must say what makes this a profession.
  if (!manifest.expertise || manifest.expertise.length === 0) {
    push("PA033", "error", "expertise is empty — a profession needs at least one domain", [slug]);
  }

  // PA034 — tools (path format: hydrated before validation; a string here
  // means the loader never hydrated it, so require the directory to check).
  const toolsIsPath = typeof manifest.tools === "string";
  if (!manifest.tools) {
    push("PA034", "error", "tools is missing — declare what the profession needs", [slug]);
  } else if (!toolsIsPath && (!manifest.tools.required || manifest.tools.required.length === 0)) {
    push("PA034", "error", "tools.required is empty — declare what the profession needs", [slug]);
  }

  // PA035 — verification is first-class, never optional.
  if (!manifest.verification?.required || manifest.verification.required.length === 0) {
    push("PA035", "error", "verification.required is empty — a profession verifies its work", [slug], "Add at least one verification requirement.");
  }

  // PA036 — forbidden tool also required.
  const required = new Set(toolsIsPath ? [] : (manifest.tools.required ?? []).map((t) => t.trim().toLowerCase()));
  for (const tool of toolsIsPath ? [] : (manifest.tools.forbidden ?? [])) {
    if (required.has(tool.trim().toLowerCase())) {
      push("PA036", "error", `tool "${tool}" is both required and forbidden`, [slug, tool], "Remove it from one of the two lists.");
    }
  }

  // PA037 — knowledge references must exist inside the profile directory.
  // Synchronous on purpose: validation is part of the deterministic core.
  if (opts.checkKnowledge !== false && opts.profileDir) {
    for (const ref of manifest.knowledge ?? []) {
      const target = path.resolve(opts.profileDir, ref);
      try {
        fsSync.accessSync(target);
      } catch {
        push("PA037", "warning", `knowledge reference "${ref}" does not exist in the profile directory`, [slug, ref]);
      }
    }
  }

  // PA038 — the same slug defined by more than one source (one shadows the other).
  if (opts.duplicateSlugs?.has(slug)) {
    push("PA038", "warning", `slug "${slug}" is defined in more than one profile source — the last discovered wins`, [slug], "Rename one of the profiles or remove the shadowed file.");
  }

  // PA042 — folder-standard section paths must exist inside the profile
  // directory (same deterministic-fs policy as PA037). The hydration step in
  // the registry already left unhydratable paths in place; this reports them.
  if (opts.profileDir) {
    const checkPath = (section: string, entry: string): void => {
      if (!isPathEntry(entry)) return;
      try {
        fsSync.accessSync(path.resolve(opts.profileDir!, entry));
      } catch {
        push("PA042", "warning", `${section} entry "${entry}" does not exist in the profile directory`, [slug, entry], "Create the file or fix the path — the entry is loaded verbatim until it resolves.");
      }
    };
    if (typeof manifest.identity === "string") checkPath("identity", manifest.identity);
    for (const section of ["expertise", "methods", "rules", "policies", "standards"] as const) {
      for (const entry of manifest[section] ?? []) checkPath(section, entry);
    }
    for (const entry of manifest.skills ?? []) checkPath("skills", entry);
    if (typeof manifest.tools === "string") checkPath("tools", manifest.tools);
    for (const entry of manifest.verification?.required ?? []) checkPath("verification.required", entry);
    for (const entry of manifest.verification?.optional ?? []) checkPath("verification.optional", entry);
  }

  // PA039 — MCP server entries must be well-formed and self-consistent.
  const mcpServers = manifest.tools?.mcp ?? [];
  const mcpNames = new Set<string>();
  for (const [i, s] of mcpServers.entries()) {
    const label = s?.name || `mcp[${i}]`;
    if (s?.name && mcpNames.has(s.name)) {
      push("PA039", "error", `tools.mcp duplicate server name "${s.name}"`, [slug, s.name], "MCP server names are keys in .mcp.json — they must be unique.");
      continue;
    }
    if (s?.name) mcpNames.add(s.name);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s?.name ?? "")) {
      push("PA039", "error", `tools.mcp server "${label}" has an invalid name (lowercase kebab-case expected)`, [slug, s?.name ?? ""], "This name becomes the key in .mcp.json.");
    }
    if (!s || !s.transport) {
      push("PA039", "error", `tools.mcp server "${label}" is missing transport`, [slug], "Use \"stdio\", \"http\" or \"sse\".");
    } else if (s.transport === "stdio") {
      if (!s.command) push("PA039", "error", `tools.mcp server "${s.name}" uses stdio but has no command`, [slug, s.name], "Set command, e.g. \"npx -y <package>\".");
    } else if (!s.url) {
      push("PA039", "error", `tools.mcp server "${s.name}" uses ${s.transport} but has no url`, [slug, s.name], "Set the server URL.");
    }
  }

  // PA040 — package refs must name a registry: npm:<pkg>[@v] or github:o/r[@ref].
  const registryRef = /^(npm|github):\S+$/;
  for (const [i, pkg] of (manifest.tools?.packages ?? []).entries()) {
    if (!pkg || !registryRef.test(pkg.registry ?? "")) {
      push("PA040", "error", `tools.packages[${i}] "${pkg?.registry ?? ""}" is not a registry reference`, [slug], "Use npm:<package>[@version] or github:owner/repo[@ref].");
    }
  }

  // Cross-check: skills entries that look like registry refs must be valid.
  for (const [i, sk] of (manifest.skills ?? []).entries()) {
    if (sk.includes(":") && !registryRef.test(sk)) {
      push("PA040", "error", `skills[${i}] "${sk}" looks like a registry reference but is not npm:/github:`, [slug], "Use npm:<package>[@version] or github:owner/repo[@ref].");
    }
  }

  // skillsDetail keys must reference an entry of skills (no orphan details).
  const skillsSet = new Set(manifest.skills ?? []);
  for (const key of Object.keys(manifest.skillsDetail ?? {})) {
    if (!skillsSet.has(key)) {
      push("PA040", "error", `skillsDetail key "${key}" does not match any skills entry`, [slug, key], "Add the matching skills entry or rename the detail key.");
    }
  }

  // PA041 — references must carry a credible authoritative URL.
  const httpUrl = /^https:\/\/\S+$/;
  for (const [name, ref] of Object.entries(manifest.references ?? {})) {
    if (!ref || !httpUrl.test(ref.url ?? "")) {
      push("PA041", "error", `references["${name}"] must carry an https:// URL for the standard/method/certification`, [slug, name], "Point to the official spec, body, or documentation page.");
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    ok: errors === 0,
    errors,
    warnings,
    findings,
    profile: slug,
    checkedAt: new Date().toISOString(),
  };
}
