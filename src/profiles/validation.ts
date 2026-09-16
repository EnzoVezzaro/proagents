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
  if (!p.version) push("PA030", "error", "missing profile.version", [slug]);
  if (!manifest.identity?.title) push("PA030", "error", "missing identity.title", [slug]);

  // PA031 — slug shape.
  if (p.slug && !SLUG.test(p.slug)) {
    push("PA031", "error", `slug "${p.slug}" is not kebab-case`, [slug], "Use lowercase words separated by hyphens.");
  }

  // PA032 — semver.
  if (p.version && !SEMVER.test(p.version)) {
    push("PA032", "error", `profile.version "${p.version}" is not semver`, [slug], "Use major.minor.patch.");
  }

  // PA033 — expertise must say what makes this a profession.
  if (!manifest.expertise || manifest.expertise.length === 0) {
    push("PA033", "error", "expertise is empty — a profession needs at least one domain", [slug]);
  }

  // PA034 — tools.
  if (!manifest.tools?.required || manifest.tools.required.length === 0) {
    push("PA034", "error", "tools.required is empty — declare what the profession needs", [slug]);
  }

  // PA035 — verification is first-class, never optional.
  if (!manifest.verification?.required || manifest.verification.required.length === 0) {
    push("PA035", "error", "verification.required is empty — a profession verifies its work", [slug], "Add at least one verification requirement.");
  }

  // PA036 — forbidden tool also required.
  const required = new Set((manifest.tools?.required ?? []).map((t) => t.trim().toLowerCase()));
  for (const tool of manifest.tools?.forbidden ?? []) {
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
