/**
 * Project spec builder — the pure client-side core of the Studio Build flow.
 *
 * NEW_CHANGES.md §6: the Studio Build mode walks intent → capabilities →
 * artifacts → policies → export. This module holds the deterministic parts:
 * canonical YAML serialization (mirroring src/registry/spec.ts), client-side
 * validation (PA501/PA502/PA505 over the local catalog + taxonomy), and
 * download helpers. The page renders; this decides.
 *
 * The resolver stays server-side by design: federated search needs network
 * IO the browser cannot do for every source (CORS), and `proagent setup` is
 * the enforcement point. The Studio produces the *spec* — the universal,
 * harness-agnostic artifact.
 */

import type { MarketplaceItem, SpecDocument, SpecFinding, SpecEnvironment } from "./types.js";
import { SPEC_SCHEMA } from "./types.js";

/** One taxonomy entry (mirror of CapabilityDefinition; browser subset). */
export interface CapabilityDef {
  id: string;
  title?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Serialization (canonical form — matches src/registry/spec.ts)
// ---------------------------------------------------------------------------

/** Environment key order for canonical output. */
const CANON_ORDER: Array<keyof SpecEnvironment> = [
  "profiles", "crews", "agents", "workflows", "capabilities", "skills", "tools", "mcp",
];

/** YAML-dump a string list with `- ` bullets (sorted + deduped upstream). */
function yamlList(items: string[], indent: string): string[] {
  return items.map((v) => `${indent}- ${v}`);
}

/** Escape a scalar for YAML double-quoted output when needed. */
function yamlScalar(v: string): string {
  return /^[\w./@ -]+$/.test(v) ? v : JSON.stringify(v);
}

/**
 * Serialize a spec to canonical proagents.yaml: fixed key order, lists
 * sorted + deduplicated, sections omitted when empty. The exact bytes the
 * CLI's `serializeSpec` emits for the same intent.
 */
export function serializeSpecYaml(spec: SpecDocument): string {
  const lines: string[] = [];
  lines.push(`schema: ${SPEC_SCHEMA}`);
  lines.push(`project:`);
  lines.push(`  name: ${yamlScalar(spec.project.name)}`);
  const environment: Record<string, string[]> = {};
  for (const kind of CANON_ORDER) {
    const ids = spec.environment[kind];
    if (ids && ids.length > 0) environment[kind] = [...new Set(ids)].sort();
  }
  lines.push(`environment:`);
  const keys = Object.keys(environment);
  if (keys.length === 0) lines.push(`  {}`);
  for (const k of keys) {
    lines.push(`  ${k}:`);
    lines.push(...yamlList(environment[k]!, "    "));
  }
  if (spec.policies && Object.keys(spec.policies).length > 0) {
    lines.push(`policies:`);
    if (spec.policies.filesystem) {
      lines.push(`  filesystem:`);
      lines.push(`    workspace-only: ${spec.policies.filesystem["workspace-only"] === true}`);
    }
    if (spec.policies.network?.allowed?.length) {
      lines.push(`  network:`);
      lines.push(`    allowed:`);
      lines.push(...yamlList([...new Set(spec.policies.network.allowed)], "      "));
    }
  }
  if (spec.harness && Object.keys(spec.harness).length > 0) {
    lines.push(`harness:`);
    if (spec.harness.mode) lines.push(`  mode: ${spec.harness.mode}`);
    if (spec.harness.compatibility?.length) {
      lines.push(`  compatibility:`);
      lines.push(...yamlList([...new Set(spec.harness.compatibility)], "    "));
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Client-side validation (mirror of the PA5xx semantic checks)
// ---------------------------------------------------------------------------

/**
 * Client-side mirror of the CLI's semantic validation. The full PA5xx set
 * (parse errors, lock checks, cycles) lives in the deterministic core; here
 * the builder checks what it has locally: PA501 structure, PA502
 * satisfiability over the catalog (native provides), PA505 harness
 * compatibility. Network-dependent checks (federated PA502) are left to
 * `proagent resolve` — surfaced in the export panel as the next step.
 */
export function validateSpecClient(spec: SpecDocument, catalog: MarketplaceItem[]): SpecFinding[] {
  const findings: SpecFinding[] = [];

  // PA501 — structural sanity (the builder constructs valid specs, but the
  // name comes from user input).
  if (spec.schema !== SPEC_SCHEMA) {
    findings.push({ code: "PA501", severity: "error", message: `schema must be "${SPEC_SCHEMA}"`, suggestion: "Reload the builder." });
  }
  if (!spec.project.name.trim()) {
    findings.push({ code: "PA501", severity: "error", message: "project.name must be a non-empty string", suggestion: "Name your project in the header." });
  }

  // PA502 — native-catalog satisfiability. A capability no catalog item
  // provides may still resolve on a federated source; the CLI decides.
  const providers = new Map<string, MarketplaceItem[]>();
  for (const item of catalog) {
    for (const cap of item.provides ?? []) {
      const list = providers.get(cap) ?? [];
      list.push(item);
      providers.set(cap, list);
    }
  }
  for (const capability of spec.environment.capabilities ?? []) {
    if (!providers.has(capability)) {
      findings.push({
        code: "PA502",
        severity: "warning",
        message: `capability "${capability}" is not provided by any native catalog item`,
        suggestion: "It may resolve from a federated source — run `proagent resolve` to check, or remove it.",
      });
    }
  }

  // PA505 — artifact vs harness.compatibility.
  const targets = spec.harness?.compatibility ?? [];
  if (targets.length > 0) {
    for (const [kind, ids] of Object.entries(spec.environment)) {
      if (kind === "capabilities") continue;
      for (const id of ids ?? []) {
        const item = catalog.find((i) => i.kind === kind.replace(/s$/, "") && i.id === id);
        const compat = item?.compatibility ?? [];
        if (compat.length > 0 && !targets.some((t) => compat.includes(t))) {
          findings.push({
            code: "PA505",
            severity: "warning",
            message: `${kind.replace(/s$/, "")} "${id}" declares compatibility [${compat.join(", ")}] which excludes all spec targets [${targets.join(", ")}]`,
            suggestion: "Remove the artifact, widen its compatibility, or drop the harness target.",
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Capability derivation (the "what are you building?" → chips step)
// ---------------------------------------------------------------------------

/**
 * Derive candidate capabilities from a free-text intent by matching words
 * against the taxonomy titles/descriptions. Deterministic keyword matching —
 * the LLM assist (llm.ts) is optional and only drafts text, never the spec.
 */
export function deriveCapabilities(intent: string, taxonomy: CapabilityDef[]): CapabilityDef[] {
  const norm = intent.toLowerCase();
  const hits: Array<{ def: CapabilityDef; score: number }> = [];
  for (const def of taxonomy) {
    const words = (def.title ?? def.id).toLowerCase().split(/[\s-]+/).filter((w) => w.length > 2);
    let score = 0;
    for (const w of words) if (norm.includes(w)) score += 1;
    if (score > 0) hits.push({ def, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.def.id.localeCompare(b.def.id)).map((h) => h.def);
}

/** Toggle a value in a list (immutable). */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

/** Trigger a browser download of one text file. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
