/**
 * Tooling discovery — the interview-facing view of the registry federation.
 *
 * During `init` (and on demand via `proagent discover`), the session queries
 * public registries over HTTP for tooling that matches the declared intent.
 * Since Phase 1 the transport lives in the registry layer
 * (`src/registry/source-adapters.ts`) — one implementation of the four
 * federated searchers — and this module delegates to it, rewrapping the
 * normalized findings into the session-facing types below.
 *
 * Every finding is provenance-tagged (source + registry URL) and staged as
 * `discovered` tooling in the session (.proagent/session.json). Nothing is
 * installed automatically: build flows surface findings as the profile's
 * MCP servers / packages / skills so the final profile is complete, and the
 * equip compiler merges what the target harness can express.
 *
 * Design rules (AGENTS.md): no model calls, no randomness — each search is
 * a pure function of (query, page). Network failures degrade to empty
 * results with an error note, never an exception: discovery is an
 * enhancement, not a gate.
 */

import { searchSources } from "../registry/source-adapters.js";
import type { RegistrySearchInput, RegistryFinding, SourceManifest, SourceResult } from "../registry/types.js";

// ---------------------------------------------------------------------------
// Session-facing types (the discovery contract — stable since Phase 0)
// ---------------------------------------------------------------------------

/** A tool the agent being built may need, discovered from a public registry. */
export interface ToolingFinding {
  /** Discriminator consumed by profile/crew builders. */
  kind: "mcp" | "npm" | "skill" | "github";
  /** Canonical display name (npm package name, MCP server id, skill name, repo). */
  name: string;
  /** One-line description from the registry. */
  description: string;
  /** Where it came from — always a concrete registry label. */
  source: "mcp-registry" | "npm" | "skills.sh" | "github";
  /** Stable reference: registry detail URL, package spec, or repo slug. */
  reference: string;
  /** Relevance score as returned by the registry (0 when not provided). */
  score: number;
}

/** Result of one registry lookup, including the failure mode when degraded. */
export interface RegistryResult {
  source: ToolingFinding["source"];
  results: ToolingFinding[];
  /** Present when the registry was unreachable/timed out — surfaced, never swallowed. */
  error?: string;
}

export interface DiscoveryInput {
  query: string;
  /** Cap per registry (default 5). */
  limit?: number;
  /** Injected fetch (tests); defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Source manifests (data form of the four built-in federated sources)
// ---------------------------------------------------------------------------

/** Historical order of the four registries (mcp, npm, skills, github). */
const SOURCE_ORDER = ["mcp", "npm", "skillsmp", "github"] as const;

/** The four built-in sources as manifests, in historical order. */
const BUILTIN_SOURCES: SourceManifest[] = [
  {
    schema: "proagents/registry-source/v1",
    id: "mcp",
    name: "MCP Registry",
    type: "registry",
    capabilities: { search: true, metadata: true, resolve: false, install: false },
    artifact_types: ["mcp"],
    policy: { allowed: true },
  },
  {
    schema: "proagents/registry-source/v1",
    id: "npm",
    name: "npm",
    type: "package-registry",
    capabilities: { search: true, metadata: true, resolve: false, install: false },
    artifact_types: ["tool"],
    policy: { allowed: true },
  },
  {
    schema: "proagents/registry-source/v1",
    id: "skillsmp",
    name: "SkillsMP",
    type: "marketplace",
    capabilities: { search: true, metadata: true, resolve: false, install: true },
    artifact_types: ["skill"],
    policy: { allowed: true },
  },
  {
    schema: "proagents/registry-source/v1",
    id: "github",
    name: "GitHub",
    type: "git",
    capabilities: { search: true, metadata: true, resolve: false, install: false },
    artifact_types: ["agent"],
    policy: { allowed: true },
  },
];

/** Canonical source id → legacy discovery discriminator + label. */
const LEGACY_VIEW: Record<string, { kind: ToolingFinding["kind"]; source: ToolingFinding["source"] }> = {
  mcp: { kind: "mcp", source: "mcp-registry" },
  npm: { kind: "npm", source: "npm" },
  skillsmp: { kind: "skill", source: "skills.sh" },
  github: { kind: "github", source: "github" },
};

/** Normalize one registry-layer finding into the session-facing type. */
function toToolingFinding(sourceId: string, f: RegistryFinding): ToolingFinding {
  const view = LEGACY_VIEW[sourceId] ?? { kind: "github" as const, source: "github" as const };
  return {
    kind: view.kind,
    name: f.name,
    description: f.description,
    source: view.source,
    reference: f.reference,
    score: f.score,
  };
}

/** Rewrap one registry-layer result into the legacy shape (id-derived label). */
function toRegistryResult(r: SourceResult): RegistryResult {
  const view = LEGACY_VIEW[r.source];
  return {
    source: view?.source ?? "github",
    results: r.results.map((f) => toToolingFinding(r.source, f)),
    ...(r.error ? { error: r.error } : {}),
  };
}

/** Run one query against one built-in source and rewrap the result. */
async function searchOne(manifest: SourceManifest, input: DiscoveryInput): Promise<RegistryResult> {
  const opts: RegistrySearchInput = {
    query: input.query,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };
  return toRegistryResult((await searchSources([manifest], opts))[0]!);
}

// ---------------------------------------------------------------------------
// Per-registry searchers (delegating to the registry layer)
// ---------------------------------------------------------------------------

/** MCP registry search (canonical source id "mcp"). */
export async function searchMcpRegistry(input: DiscoveryInput): Promise<RegistryResult> {
  return searchOne(BUILTIN_SOURCES[0]!, input);
}

/** npm registry search (canonical source id "npm"). */
export async function searchNpm(input: DiscoveryInput): Promise<RegistryResult> {
  return searchOne(BUILTIN_SOURCES[1]!, input);
}

/** skills.sh search (canonical source id "skillsmp"). */
export async function searchSkills(input: DiscoveryInput): Promise<RegistryResult> {
  return searchOne(BUILTIN_SOURCES[2]!, input);
}

/** GitHub repo search (canonical source id "github"). */
export async function searchGitHub(input: DiscoveryInput): Promise<RegistryResult> {
  return searchOne(BUILTIN_SOURCES[3]!, input);
}

/**
 * Discover tooling across all registries in parallel. Never throws: a
 * registry that fails yields { error } and the others still answer. Order
 * matches the historical contract: mcp, npm, skills, github.
 */
export async function discoverTooling(input: DiscoveryInput): Promise<RegistryResult[]> {
  const opts: RegistrySearchInput = {
    query: input.query,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  };
  const bySource = new Map((await searchSources(BUILTIN_SOURCES, opts)).map((r) => [r.source, r]));
  return SOURCE_ORDER.map((id) => {
    const r = bySource.get(id);
    if (!r) return { source: LEGACY_VIEW[id]!.source, results: [], error: `source "${id}" did not answer` };
    return toRegistryResult(r);
  });
}

/** Flatten registry results into the finding list consumed by builders. */
export function findingsOf(results: RegistryResult[]): ToolingFinding[] {
  return results.flatMap((r) => r.results);
}

/** Compact human-readable rendering for CLI output. */
export function renderFindings(results: RegistryResult[], query: string): string {
  const lines: string[] = [`\nDiscovered tooling for "${query}":\n`];
  for (const r of results) {
    if (r.error) {
      lines.push(`  ✗ ${r.source}: ${r.error}`);
      continue;
    }
    if (r.results.length === 0) {
      lines.push(`  ○ ${r.source}: no matches`);
      continue;
    }
    lines.push(`  ✓ ${r.source}:`);
    for (const f of r.results) {
      lines.push(`      • ${f.name} — ${f.description.slice(0, 90)}${f.description.length > 90 ? "…" : ""}`);
    }
  }
  lines.push("");
  lines.push("  Findings are staged in the session; `proagent build` bakes them into the profile.");
  lines.push("  No registry result should be installed without review — provenance is recorded.");
  return lines.join("\n");
}
