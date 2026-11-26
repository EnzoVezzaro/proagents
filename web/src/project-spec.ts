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

  // PA506 — policy sanity, client mirror of the CLI's spec-level check:
  // trailing wildcards defeat an allowlist, and non-hostname shapes usually
  // mean a typo that would silently never match.
  for (const entry of spec.policies?.network?.allowed ?? []) {
    if (/\*$/.test(entry) && entry !== "*") {
      findings.push({
        code: "PA506",
        severity: "warning",
        message: `network allowlist entry "${entry}" uses a trailing wildcard — allowlisting a whole domain suffix`,
        suggestion: "Prefer exact hostnames; wildcards defeat the purpose of an allowlist.",
      });
    } else if (entry !== "*" && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(entry)) {
      findings.push({
        code: "PA506",
        severity: "warning",
        message: `network allowlist entry "${entry}" does not look like a hostname`,
        suggestion: "Use exact hostnames like api.example.com — or * to allow all outbound.",
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
// Agent handoff brief (what the Copy button puts on the clipboard)
// ---------------------------------------------------------------------------

/**
 * Serialize the full build instructions an AI coding agent needs to construct
 * this environment inside the user's repository — one self-contained markdown
 * document: who the instructions are for, what the environment contains, the
 * exact proagents.yaml to save, the CLI commands to run, how to verify the
 * build, and the operating rules the agent must follow afterwards. The YAML
 * embedded here is byte-identical to serializeSpecYaml's output, so copying
 * the brief and saving the fenced block yields the canonical file.
 *
 * Deterministic: pure function of the spec.
 */
export function serializeAgentBrief(spec: SpecDocument): string {
  const name = spec.project.name || "my-project";
  const env = spec.environment;
  const list = (items: string[]): string => items.map((i) => `  - ${i}`).join("\n");
  const lines: string[] = [];

  lines.push(`# Instructions to build proagent ${name}`);
  lines.push(``);
  lines.push(`You are an AI coding agent working inside this repository. These instructions`);
  lines.push(`set up your own professional operating environment with ProAgents — expert`);
  lines.push(`profiles, crews, skills, rules, tools and verification for the ${name} project.`);
  lines.push(`Execute every step in order. Do not skip, reorder or invent sections.`);
  lines.push(``);
  lines.push(`## 1. What this environment contains`);
  lines.push(``);
  if (env.profiles?.length) {
    lines.push(`Professional profiles (discipline-specific expertise, methods, rules):`);
    lines.push(list(env.profiles));
  }
  if (env.crews?.length) {
    lines.push(`Crews (multi-agent systems with roles and handoffs):`);
    lines.push(list(env.crews));
  }
  if (env.capabilities?.length) {
    lines.push(`Required capabilities (resolved to concrete implementations by the CLI):`);
    lines.push(list(env.capabilities));
  }
  const policies = spec.policies;
  if (policies?.filesystem?.["workspace-only"] === true) {
    lines.push(`Filesystem policy: workspace-only — only read/write inside this repository.`);
  }
  if (policies?.network?.allowed?.length) {
    lines.push(`Network allowlist: ${policies.network.allowed.join(", ")}.`);
  }
  const targets = spec.harness?.compatibility ?? [];
  lines.push(`Harness targets: ${targets.length > 0 ? targets.join(", ") : "any — the spec is harness-agnostic; run \`proagent detect\` to identify yours"}.`);
  lines.push(``);
  lines.push(`## 2. Save the spec`); 
  lines.push(``);
  lines.push(`Create \`proagents.yaml\` at the repository root, next to the code, with`);
  lines.push(`exactly this content:`);
  lines.push(``);
  lines.push("```yaml");
  lines.push(serializeSpecYaml(spec).replace(/\n$/, ""));
  lines.push("```");
  lines.push(``);
  lines.push(`## 3. Install the CLI (skip if already available)`); 
  lines.push(``);
  lines.push("```bash");
  lines.push(`npm install -g proagent`);
  lines.push("```");
  lines.push(``);
  lines.push(`## 4. Build the environment`); 
  lines.push(``);
  lines.push("```bash");
  lines.push(`proagent resolve    # capability → implementation graph (may use federated sources)`);
  lines.push(`proagent lock       # persist the resolution`);
  lines.push(`proagent setup      # install the environment for your harness`);
  lines.push("```");
  lines.push(``);
  lines.push(`\`resolve\` may pull implementations from federated sources (skills.sh, npm, MCP`);
  lines.push(`registry, GitHub) for capabilities no native catalog item provides. Warnings`);
  lines.push(`like \`[PA502] capability "x" is not provided by any native catalog item\` are`);
  lines.push(`advisory — check \`resolve\` output, or remove the capability from the spec.`);
  lines.push(``);
  lines.push(`## 5. Verify the build`); 
  lines.push(``);
  lines.push(`- \`proagent setup\` must finish with a success report; fix any error-severity`);
  lines.push(`  findings before continuing.`);
  lines.push(`- Read the files the setup report lists for your harness (instructions, rules,`);
  lines.push(`  MCP config) and confirm they exist and mention the equipped profiles.`);
  lines.push(`- Run \`proagent status\` — the environment should list every spec section as`);
  lines.push(`  installed.`);
  lines.push(`- Commit both \`proagents.yaml\` and the generated \`proagents.lock\`.`);
  lines.push(``);
  lines.push(`## 6. Operating rules once equipped`); 
  lines.push(``);
  lines.push(`- Follow the equipped profiles' methods and rules for work in this repository.`);
  lines.push(`- Complete every verification step a profile requires before claiming done —`);
  lines.push(`  evidence over assertion.`);
  lines.push(`- Stay inside the policies above (filesystem scope, network allowlist).`);
  lines.push(`- When the spec changes, re-run resolve → lock → setup and commit the updated`);
  lines.push(`  spec and lock file.`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// AI Magic — prompt building + response parsing for the intent-review assist
// ---------------------------------------------------------------------------

/**
 * Build the review prompt for the Intent step's fields. The model returns
 * strict JSON (no fences) with improved `name` and `intent` plus short
 * `notes` on what it changed and why. The page supplies the catalog's
 * capability vocabulary so suggestions stay grounded in real chips.
 */
export function buildIntentReviewPrompt(input: {
  name: string;
  intent: string;
  capabilityTitles: string[];
}): string {
  return [
    "You review the project brief of an agent environment being designed in the ProAgents Studio.",
    "Improve the two fields so a deterministic capability matcher and a human reviewer both get maximum signal:",
    "- name: a short, specific project name (kebab-case or Title Case, no spaces at the edges, max 40 chars).",
    "- intent: 1–3 sentences describing WHAT is being built, the stack/domain, scale or constraints, and what professional expertise the team needs. Mention concrete technologies when known.",
    "- notes: 1–3 short bullets (start with '- ') saying what you improved and why.",
    "Only draw on capabilities from the provided vocabulary when implying expertise; never invent capability names.",
    "Return STRICT JSON only — no markdown fences, no commentary:",
    '{ "name": string, "intent": string, "notes": string[] }',
    "",
    "Capability vocabulary:",
    input.capabilityTitles.length > 0 ? input.capabilityTitles.join(", ") : "(none provided)",
    "",
    "Current name:",
    input.name || "(empty)",
    "",
    "Current intent:",
    input.intent || "(empty)",
  ].join("\n");
}

/**
 * Parse the model's reply into the review result. Tolerant of fenced JSON
 * and stray prose around the object; falls back to extracting a bare
 * `intent:`-style line only as a last resort. Returns null when nothing
 * usable came back — the caller keeps the user's fields untouched.
 */
export function parseIntentReview(text: string): { name?: string; intent?: string; notes: string[] } | null {
  if (!text || !text.trim()) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(candidate.slice(start, end + 1)) as { name?: unknown; intent?: unknown; notes?: unknown };
      const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : undefined;
      const intent = typeof obj.intent === "string" && obj.intent.trim() ? obj.intent.trim() : undefined;
      const notes = Array.isArray(obj.notes) ? obj.notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0) : [];
      if (name || intent || notes.length > 0) return { name, intent, notes };
    } catch {
      /* fall through to last-resort extraction */
    }
  }
  return null;
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

/**
 * Copy text to the clipboard. Prefers the async Clipboard API; falls back to
 * a temporary textarea + execCommand for non-secure contexts (plain http).
 * Resolves false when no path can write — the caller shows its fallback
 * (the file download) instead of a success state.
 */
export async function copyText(content: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    // permission denial or insecure context — try the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = content;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    try {
      ta.select();
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  } catch {
    return false;
  }
}
