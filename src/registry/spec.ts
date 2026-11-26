/**
 * ProAgents spec — parse, validate and serialize `proagents.yaml`.
 *
 * The spec is the human-authored source of truth (NEW_CHANGES.md §12):
 * desired capabilities, artifact references, policies and harness
 * compatibility. It is deliberately harness-agnostic — adapters compile it
 * per target; the spec never names harness-specific paths.
 *
 * Deterministic core: parsing/validation are pure; serialization emits
 * stable, sorted YAML with no timestamps, and `specHash` is the sha256 of
 * that canonical form (PA510 staleness checks key off it).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { SPEC_SCHEMA, type SpecDocument, type SpecEnvironment, type SpecFinding } from "./types.js";

/** Known artifact kinds accepted as spec environment keys (singular form). */
const ENV_KINDS = ["profiles", "crews", "agents", "workflows", "capabilities", "skills", "tools", "mcp"] as const;
type EnvKind = (typeof ENV_KINDS)[number];

/** The spec file name at repo root. */
export const SPEC_FILE = "proagents.yaml";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedSpec {
  spec?: SpecDocument;
  findings: SpecFinding[];
}

/** Parse and schema-check a proagents.yaml document (PA501 on violations). */
export function parseSpec(raw: string): ParsedSpec {
  const findings: SpecFinding[] = [];
  let doc: unknown;
  try {
    doc = yamlParse(raw);
  } catch (err) {
    return { findings: [pa501(`invalid YAML: ${(err as Error).message}`)] };
  }
  if (typeof doc !== "object" || doc === null) {
    return { findings: [pa501("document must be a YAML mapping")] };
  }
  const d = doc as Record<string, unknown>;

  if (d.schema !== SPEC_SCHEMA) {
    findings.push(pa501(`schema must be "${SPEC_SCHEMA}"`, ["schema"]));
  }
  const project = (typeof d.project === "object" && d.project !== null ? d.project : {}) as Record<string, unknown>;
  if (typeof project.name !== "string" || project.name.trim().length === 0) {
    findings.push(pa501("project.name must be a non-empty string", ["project.name"]));
  }
  const envRaw = (typeof d.environment === "object" && d.environment !== null ? d.environment : {}) as Record<string, unknown>;
  const environment: SpecEnvironment = {};
  for (const [key, value] of Object.entries(envRaw)) {
    if (!(ENV_KINDS as readonly string[]).includes(key)) {
      findings.push(pa500(`unknown artifact kind "${key}" (expected one of: ${ENV_KINDS.join(", ")})`, [`environment.${key}`]));
      continue;
    }
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      findings.push(pa501(`environment.${key} must be a list of strings`, [`environment.${key}`]));
      continue;
    }
    (environment as Record<string, string[]>)[key] = value as string[];
  }

  const policiesRaw = (typeof d.policies === "object" && d.policies !== null ? d.policies : {}) as Record<string, unknown>;
  const policies: SpecDocument["policies"] = {};
  const fsRaw = (typeof policiesRaw.filesystem === "object" && policiesRaw.filesystem !== null ? policiesRaw.filesystem : {}) as Record<string, unknown>;
  if (typeof fsRaw["workspace-only"] === "boolean") {
    policies.filesystem = { "workspace-only": fsRaw["workspace-only"] };
  } else if (policiesRaw.filesystem !== undefined) {
    findings.push(pa501("policies.filesystem.workspace-only must be a boolean", ["policies.filesystem"]));
  }
  const netRaw = (typeof policiesRaw.network === "object" && policiesRaw.network !== null ? policiesRaw.network : {}) as Record<string, unknown>;
  if (netRaw.allowed !== undefined) {
    if (!Array.isArray(netRaw.allowed) || netRaw.allowed.some((v) => typeof v !== "string")) {
      findings.push(pa501("policies.network.allowed must be a list of strings", ["policies.network"]));
    } else {
      policies.network = { allowed: netRaw.allowed as string[] };
    }
  }

  const harnessRaw = (typeof d.harness === "object" && d.harness !== null ? d.harness : {}) as Record<string, unknown>;
  const harness: SpecDocument["harness"] = {};
  if (harnessRaw.mode !== undefined) {
    if (harnessRaw.mode === "compatible") {
      harness.mode = "compatible";
    } else {
      findings.push(pa501('harness.mode must be "compatible"', ["harness.mode"]));
    }
  }
  if (harnessRaw.compatibility !== undefined) {
    if (!Array.isArray(harnessRaw.compatibility) || harnessRaw.compatibility.some((v) => typeof v !== "string")) {
      findings.push(pa501("harness.compatibility must be a list of strings", ["harness.compatibility"]));
    } else {
      harness.compatibility = harnessRaw.compatibility as string[];
    }
  }

  if (findings.some((f) => f.severity === "error")) return { findings };

  return {
    spec: {
      schema: SPEC_SCHEMA,
      project: { name: project.name as string },
      environment,
      ...(Object.keys(policies).length > 0 ? { policies } : {}),
      ...(Object.keys(harness).length > 0 ? { harness } : {}),
    },
    findings,
  };
}

function pa501(message: string, entities?: string[]): SpecFinding {
  return {
    code: "PA501",
    severity: "error",
    message,
    suggestion: "Fix the proagents.yaml structure — see docs (Registry guide, spec reference).",
    ...(entities ? { entities } : {}),
  };
}

function pa500(message: string, entities?: string[]): SpecFinding {
  return {
    code: "PA500",
    severity: "error",
    message,
    suggestion: "Use one of the known artifact kinds in the environment section.",
    ...(entities ? { entities } : {}),
  };
}

// ---------------------------------------------------------------------------
// Semantic validation (pure; artifacts/harness checks need the catalog passed in)
// ---------------------------------------------------------------------------

/** Known harness ids (mirror of src/adapters HarnessId) for PA505. */
const KNOWN_HARNESSES = ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "copilot", "openclaude", "freebuff", "generic-cli"] as const;

/**
 * Validate a parsed spec. `catalogCompat` maps artifact id → the harness
 * compatibility list declared in its catalog entry; when provided,
 * PA505 fires for entries whose compatibility excludes every harness the
 * spec targets. Pure.
 */
export function validateSpec(spec: SpecDocument, catalogCompat: Record<string, string[]> = {}): SpecFinding[] {
  const findings: SpecFinding[] = [];
  const targets = spec.harness?.compatibility ?? [];

  // PA505 — artifact vs harness.compatibility.
  for (const [kind, ids] of Object.entries(spec.environment)) {
    for (const id of ids ?? []) {
      const compat = catalogCompat[id];
      if (!compat || compat.length === 0) continue;
      if (targets.length > 0 && !targets.some((t) => compat.includes(t))) {
        findings.push({
          code: "PA505",
          severity: "warning",
          message: `${kind.replace(/s$/, "")} "${id}" declares compatibility [${compat.join(", ")}] which excludes all spec targets [${targets.join(", ")}]`,
          suggestion: "Remove the artifact, widen its compatibility, or drop the harness from harness.compatibility.",
          entities: [`${kind}:${id}`],
        });
      }
    }
  }

  // PA506 — policy violations: spec-level policy declarations must be sane.
  const networkAllowed = spec.policies?.network?.allowed ?? [];
  for (const entry of networkAllowed) {
    if (/\*$/.test(entry) && entry !== "*") {
      findings.push({
        code: "PA506",
        severity: "warning",
        message: `network allowlist entry "${entry}" uses a trailing wildcard — allowlisting a whole domain suffix`,
        suggestion: "Prefer exact hostnames; wildcards defeat the purpose of an allowlist.",
        entities: [entry],
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Canonical serialization + hashing
// ---------------------------------------------------------------------------

/** Environment key order for canonical output (stable across runs). */
const CANON_ORDER: EnvKind[] = ["profiles", "crews", "agents", "workflows", "capabilities", "skills", "tools", "mcp"];

/**
 * Canonical form: keys in fixed order, lists sorted and deduplicated.
 * Two specs with identical intent always serialize byte-identically.
 */
export function serializeSpec(spec: SpecDocument): string {
  const environment: Record<string, string[]> = {};
  for (const kind of CANON_ORDER) {
    const ids = spec.environment[kind];
    if (ids && ids.length > 0) environment[kind] = [...new Set(ids)].sort();
  }
  const doc: Record<string, unknown> = {
    schema: SPEC_SCHEMA,
    project: { name: spec.project.name },
    environment,
  };
  if (spec.policies && Object.keys(spec.policies).length > 0) doc.policies = spec.policies;
  if (spec.harness && Object.keys(spec.harness).length > 0) doc.harness = spec.harness;
  return yamlStringify(doc, { sortMapEntries: false, lineWidth: 100 });
}

/** sha256 of the canonical serialization — the PA510 staleness key. */
export function specHash(spec: SpecDocument): string {
  return `sha256:${createHash("sha256").update(serializeSpec(spec), "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// File IO
// ---------------------------------------------------------------------------

/** Load and parse proagents.yaml from a repo root (or an explicit path). */
export async function loadSpec(root: string = process.cwd(), file: string = SPEC_FILE): Promise<ParsedSpec> {
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(root, file), "utf8");
  } catch {
    return { findings: [pa501(`cannot read ${file} — run \`proagent build --kind spec\` or create it first`, [file])] };
  }
  return parseSpec(raw);
}

/** Serialize and write proagents.yaml (canonical form) to a repo root. */
export async function saveSpec(spec: SpecDocument, root: string = process.cwd(), file: string = SPEC_FILE): Promise<string> {
  const filePath = path.resolve(root, file);
  await fs.writeFile(filePath, serializeSpec(spec), "utf8");
  return filePath;
}
