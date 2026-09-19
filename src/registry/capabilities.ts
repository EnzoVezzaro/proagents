/**
 * Capability taxonomy — the registry's central abstraction.
 *
 * NEW_CHANGES.md: "Profiles, crews, workflows, and agents declare what they
 * need. ProAgents Registry resolves where those capabilities come from."
 * Artifacts declare `requires.capabilities` (abstract abilities, e.g.
 * `browser-automation`); implementations `provide` them. This module holds
 * the seed taxonomy (registry/capabilities/index.json), alias resolution,
 * and the deterministic mapper: manifest → required capabilities.
 *
 * Deterministic core: the mapper is a pure function of (manifest, taxonomy)
 * — no model calls, no randomness, no timestamps. The same manifest always
 * yields the same capability list.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { CapabilityDefinition } from "./types.js";
import type { ProfileManifest } from "../profiles/types.js";
import type { CrewDefinition } from "../crew/types.js";

/** The registry's canonical capability ids (all lowercase, kebab-case). */
export type CapabilityId = string;

/** The shipped taxonomy file, relative to the repo root. */
export const CAPABILITIES_INDEX = "registry/capabilities/index.json";

/**
 * Packaged taxonomy (npm package): consumer repos have no registry
 * checkout, so taxonomy loads fall back to the shipped file.
 * `dist/registry/capabilities.js` → `<pkgroot>/registry/capabilities/index.json`.
 */
const PACKAGED_TAXONOMY = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  "../../registry/capabilities/index.json",
);

// ---------------------------------------------------------------------------
// Taxonomy loading
// ---------------------------------------------------------------------------

/** Load the seed taxonomy from disk (or a provided JSON string). */
export async function loadTaxonomy(root: string = process.cwd(), file: string = CAPABILITIES_INDEX): Promise<CapabilityDefinition[]> {
  try {
    const raw = await fs.readFile(path.resolve(root, file), "utf8");
    return parseTaxonomy(raw);
  } catch (err) {
    // No local checkout — fall back to the packaged taxonomy (default file
    // only; an explicit file means the caller knows what they're reading).
    if (file !== CAPABILITIES_INDEX || (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const raw = await fs.readFile(PACKAGED_TAXONOMY, "utf8");
    return parseTaxonomy(raw);
  }
}

/**
 * Parse a taxonomy document. Tolerant: entries with a missing/invalid id are
 * skipped; duplicates (first wins) and out-of-order entries are normalized
 * deterministically (sorted by id).
 */
export function parseTaxonomy(raw: string): CapabilityDefinition[] {
  let doc: unknown;
  { try {
      doc = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(doc)) return [];
  const byId = new Map<string, CapabilityDefinition>();
  for (const e of doc) {
    if (typeof e !== "object" || e === null) continue;
    const d = e as Record<string, unknown>;
    if (typeof d.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(d.id)) continue;
    if (byId.has(d.id)) continue; // first wins
    byId.set(d.id, {
      id: d.id,
      ...(typeof d.title === "string" ? { title: d.title } : {}),
      ...(typeof d.description === "string" ? { description: d.description } : {}),
      ...(Array.isArray(d.aliases) ? { aliases: d.aliases.filter((a): a is string => typeof a === "string") } : {}),
      ...(Array.isArray(d.implHints) ? { implHints: d.implHints.filter((h): h is string => typeof h === "string") } : {}),
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Resolve a capability reference through the taxonomy's aliases. Unknown ids
 * pass through unchanged (never crash — unknown capabilities are surfaced by
 * the resolver as unsatisfiable, PA502).
 */
export function resolveAlias(id: string, taxonomy: CapabilityDefinition[]): string {
  const byId = new Map(taxonomy.map((c) => [c.id, c]));
  const direct = byId.get(id);
  if (direct) return direct.id;
  const alias = taxonomy.find((c) => c.aliases?.includes(id));
  return alias ? alias.id : id;
}

// ---------------------------------------------------------------------------
// Deterministic capability mapper
// ---------------------------------------------------------------------------

/**
 * Signals extracted from a manifest: the mapper's only inputs besides the
 * taxonomy. Built from profile and crew manifests uniformly.
 */
export interface CapabilitySignals {
  /** Lowercase tokens from tools.required + tools.optional (never forbidden). */
  tools: string[];
  /** MCP server names. */
  mcp: string[];
  /** Package registry refs: "npm:<pkg>[@v]", "github:o/r". */
  packages: string[];
  /** Expertise/method/standard tokens (lowercased, punctuation stripped). */
  expertise: string[];
}

/** Extract the mapper's signals from a profile manifest. Pure. */
export function signalsOfProfile(m: ProfileManifest): CapabilitySignals {
  return {
    tools: [...m.tools.required, ...(m.tools.optional ?? [])].map(conceptualToken),
    mcp: (m.tools.mcp ?? []).map((s) => conceptualToken(s.name)),
    packages: (m.tools.packages ?? []).map((p) => p.registry),
    expertise: [
      ...m.expertise,
      ...(m.methods ?? []),
      ...(m.standards ?? []),
    ].map(conceptualToken),
  };
}

/** Extract the mapper's signals from a crew definition. Pure. */
export function signalsOfCrew(c: CrewDefinition): CapabilitySignals {
  const tools = new Set<string>();
  const mcp = new Set<string>();
  for (const w of c.workers) {
    for (const t of w.permissions.tools) tools.add(conceptualToken(t));
    for (const name of w.mcpServers) mcp.add(conceptualToken(name));
  }
  for (const s of c.mcpServers) mcp.add(conceptualToken(s.name));
  return {
    tools: [...tools].sort(),
    mcp: [...mcp].sort(),
    packages: [],
    expertise: [...c.tags, ...(c.mission ? [c.mission] : [])].map(conceptualToken),
  };
}

/** Normalize a signal token: lowercase, strip punctuation, collapse spaces. */
function conceptualToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The mapping rules: (token, signal kind) → capability id. A rule fires when
 * ANY token of the kind contains ANY pattern. Rules are evaluated in order;
 * the first match per signal wins. Pure data — extend this table to extend
 * the taxonomy coverage, never the algorithm.
 */
const MAP_RULES: ReadonlyArray<{
  capability: string;
  patterns: string[];
  kinds: ReadonlyArray<keyof CapabilitySignals & ("tools" | "mcp" | "packages" | "expertise")>;
}> = [
  { capability: "source-control", patterns: ["git", "github", "gitlab", "version control"], kinds: ["tools", "mcp"] },
  { capability: "browser-automation", patterns: ["browser", "playwright", "puppeteer", "chromium", "web UI"], kinds: ["tools", "mcp", "expertise"] },
  { capability: "database-access", patterns: ["postgres", "mysql", "sqlite", "database", "db ", "sql"], kinds: ["tools", "mcp", "expertise"] },
  { capability: "javascript-runtime", patterns: ["node", "nodejs", "npm", "pnpm", "bun", "deno", "javascript", "typescript"], kinds: ["tools", "expertise"] },
  { capability: "python-runtime", patterns: ["python", "pip ", "poetry", "venv"], kinds: ["tools", "expertise"] },
  { capability: "frontend-development", patterns: ["react", "vue", "svelte", "angular", "frontend", "css", "html"], kinds: ["tools", "expertise"] },
  { capability: "backend-development", patterns: ["api", "server", "backend", "express", "fastify", "rest", "graphql"], kinds: ["expertise"] },
  { capability: "testing", patterns: ["test", "vitest", "jest", "pytest", "coverage"], kinds: ["tools", "expertise"] },
  { capability: "frontend-testing", patterns: ["react-testing", "component test", "story", "playwright-testing", "browser test"], kinds: ["tools", "expertise"] },
  { capability: "api-testing", patterns: ["api test", "supertest", "postman", "contract test"], kinds: ["tools", "expertise"] },
  { capability: "code-review", patterns: ["code review", "review"], kinds: ["expertise"] },
  { capability: "security-review", patterns: ["security", "owasp", "threat model", "vulnerab"], kinds: ["expertise"] },
  { capability: "ci-cd", patterns: ["ci ", "cd ", "pipeline", "github actions", "workflow yml", "deploy script"], kinds: ["tools", "expertise"] },
  { capability: "documentation", patterns: ["documentation", "docs ", "readme", "adr"], kinds: ["expertise"] },
  { capability: "planning", patterns: ["planning", "breakdown", "estimat", "roadmap"], kinds: ["expertise"] },
  { capability: "observability", patterns: ["observab", "telemetry", "metrics", "logging", "tracing"], kinds: ["expertise"] },
  { capability: "containerization", patterns: ["docker", "container", "podman", "kubernetes", "k8s"], kinds: ["tools", "expertise"] },
  { capability: "cloud-deploy", patterns: ["cloud", "aws", "azure", "gcp", "vercel", "cloudflare", "deploy"], kinds: ["tools", "expertise"] },
  { capability: "data-pipelines", patterns: ["etl", "data pipeline", "airflow", "dbt", "warehouse"], kinds: ["expertise"] },
  { capability: "ml-training", patterns: ["machine learning", "ml training", "pytorch", "tensorflow", "model training"], kinds: ["expertise"] },
  { capability: "accessibility", patterns: ["accessib", "a11y", "wcag", "screen reader"], kinds: ["expertise"] },
  { capability: "performance", patterns: ["performance", "profiling", "benchmark", "latency", "optimiz"], kinds: ["expertise"] },
  { capability: "privacy", patterns: ["privacy", "gdpr", "ccpa", "pii", "data handling"], kinds: ["expertise"] },
  { capability: "communication", patterns: ["communication", "stakeholder", "report", "summary", "handoff"], kinds: ["expertise"] },
];

/** Capabilities implied by package registry refs ("npm:playwright" → browser-automation). */
const PACKAGE_RULES: ReadonlyArray<{ capability: string; patterns: string[] }> = [
  { capability: "browser-automation", patterns: ["playwright", "puppeteer", "browser-use"] },
  { capability: "testing", patterns: ["vitest", "jest", "pytest", "mocha", "karma"] },
  { capability: "source-control", patterns: ["github", "gitlab", "simple-git"] },
  { capability: "containerization", patterns: ["docker", "kubernetes", "@kubernetes/client"] },
  { capability: "database-access", patterns: ["pg", "mysql", "sqlite", "prisma", "drizzle", "mongoose", "typeorm"] },
];

/** Fire a rule set against one signal list; returns matched capability ids. */
function fireRules(rules: ReadonlyArray<{ capability: string; patterns: string[] }>, tokens: Iterable<string>): string[] {
  const tokensArr = [...tokens];
  const hits: string[] = [];
  for (const rule of rules) {
    const matched = rule.patterns.some((p) => tokensArr.some((t) => t.includes(p)));
    if (matched) hits.push(rule.capability);
  }
  return hits;
}

/**
 * The deterministic capability mapper: manifest signals → required
 * capability ids. Pure: (signals, taxonomy) → capabilities, sorted,
 * deduplicated, alias-resolved. Unknown capabilities pass through — the
 * resolver, not the mapper, decides satisfiability (PA502).
 */
export function mapToCapabilities(signals: CapabilitySignals, taxonomy: CapabilityDefinition[] = []): string[] {
  const hits = new Set<string>();
  for (const rule of MAP_RULES) {
    for (const kind of rule.kinds) {
      if (rule.patterns.some((p) => signals[kind].some((t) => t.includes(p)))) {
        hits.add(rule.capability);
        break;
      }
    }
  }
  for (const hit of fireRules(PACKAGE_RULES, signals.packages)) hits.add(hit);
  const resolved = [...hits].map((c) => resolveAlias(c, taxonomy));
  return [...new Set(resolved)].sort();
}

// ---------------------------------------------------------------------------
// provides/requires graph queries
// ---------------------------------------------------------------------------

/** Capabilities an artifact provides (from its catalog entry). */
export function providesOf(item: { provides?: string[] }): string[] {
  return item.provides ?? [];
}

/** Capabilities and artifacts an artifact requires (from its catalog entry). */
export function requiresOf(item: { requires?: { capabilities?: string[]; artifacts?: string[] } }): { capabilities: string[]; artifacts: string[] } {
  return {
    capabilities: item.requires?.capabilities ?? [],
    artifacts: item.requires?.artifacts ?? [],
  };
}
