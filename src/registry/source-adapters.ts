/**
 * Source adapters — the registry's one implementation of federated search.
 *
 * Each built-in adapter wraps one public registry over HTTP and normalizes
 * its findings into the unified `RegistryFinding` model (kind mapping +
 * provenance). The interview-era discovery module
 * (`src/discovery/registry.ts`) delegates here and rewraps the normalized
 * results into its legacy session types — one transport implementation,
 * two views.
 *
 * Deterministic: pure functions over (query, page) with an injected fetch.
 * Every adapter degrades to { error } on failure, never throws: federation
 * is an enhancement, not a gate.
 */

import type { RegistrySearchInput, RegistryFinding, SourceResult, SourceAdapter, SourceManifest } from "./types.js";

const MCP_REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers";
const NPM_REGISTRY = "https://registry.npmjs.org/-/v1/search";
const SKILLS_SEARCH = "https://skills.sh/api/search";
const GITHUB_SEARCH = "https://api.github.com/search/repositories";
const USER_AGENT = "proagent-cli";
/** Hard per-request budget; federation must never hang a CLI flow. */
const TIMEOUT_MS = 6_000;

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Built-in adapters (id ↔ sources/*.yaml declarations)
// ---------------------------------------------------------------------------

/** skills.sh search: { skills: [{ id, skillId, name, installs, source }] }. */
export const skillsmpAdapter: SourceAdapter = async (input) => {
  const limit = input.limit ?? 5;
  try {
    const url = `${SKILLS_SEARCH}?q=${encodeURIComponent(input.query)}&limit=${limit}`;
    const body = (await fetchJson(url, input.fetchImpl ?? fetch)) as { skills?: Array<Record<string, unknown>> };
    const list = Array.isArray(body.skills) ? body.skills : [];
    return {
      source: "skillsmp",
      results: list.slice(0, limit).map((s) => ({
        kind: "skill" as const,
        name: typeof s.name === "string" ? s.name : typeof s.skillId === "string" ? s.skillId : "unknown",
        description: typeof s.description === "string" ? s.description : typeof s.id === "string" ? s.id : "",
        source: "skillsmp",
        sourceLabel: "skills.sh",
        reference: typeof s.source === "string" && s.source ? `github:${s.source}` : "https://skills.sh",
        score: typeof s.installs === "number" ? s.installs : 0,
      })),
    };
  } catch (err) {
    return { source: "skillsmp", results: [], error: (err as Error).message };
  }
};

/** npm search endpoint: objects[].package {name, description, links}. */
export const npmAdapter: SourceAdapter = async (input) => {
  const limit = input.limit ?? 5;
  try {
    const url = `${NPM_REGISTRY}?text=${encodeURIComponent(input.query)}&size=${limit}`;
    const body = (await fetchJson(url, input.fetchImpl ?? fetch)) as {
      objects?: Array<{ package?: { name?: string; description?: string; links?: { repository?: string } }; score?: { final?: number } }>;
    };
    return {
      source: "npm",
      results: (body.objects ?? []).slice(0, limit).map((o) => ({
        kind: "tool" as const,
        name: o.package?.name ?? "unknown",
        description: o.package?.description ?? "",
        source: "npm",
        sourceLabel: "npm",
        reference: o.package?.links?.repository ?? `https://www.npmjs.com/package/${o.package?.name ?? ""}`,
        score: o.score?.final ?? 0,
      })),
    };
  } catch (err) {
    return { source: "npm", results: [], error: (err as Error).message };
  }
};

/**
 * Official MCP registry (GET /v0.1/servers?search=…). Each entry nests the
 * server object ({ name, description, remotes[] }); the search param is a
 * case-insensitive substring match on server names.
 */
export const mcpAdapter: SourceAdapter = async (input) => {
  const limit = input.limit ?? 5;
  try {
    const url = `${MCP_REGISTRY}?search=${encodeURIComponent(input.query)}&limit=${limit}`;
    const body = (await fetchJson(url, input.fetchImpl ?? fetch)) as { servers?: Array<Record<string, unknown>> };
    const list = Array.isArray(body.servers) ? body.servers : [];
    return {
      source: "mcp",
      results: list.slice(0, limit).map((entry) => {
        const s = (typeof entry.server === "object" && entry.server !== null ? entry.server : entry) as Record<string, unknown>;
        const name = typeof s.name === "string" ? s.name : "unknown";
        const remotes = Array.isArray(s.remotes) ? s.remotes : [];
        const remoteUrl = remotes.find((r) => typeof (r as Record<string, unknown>).url === "string");
        return {
          kind: "mcp" as const,
          name,
          description: typeof s.description === "string" ? s.description : "",
          source: "mcp",
          sourceLabel: "mcp-registry",
          reference:
            typeof s.websiteUrl === "string" && s.websiteUrl
              ? s.websiteUrl
              : typeof remoteUrl === "object" && remoteUrl !== null && typeof (remoteUrl as Record<string, unknown>).url === "string"
                ? ((remoteUrl as Record<string, unknown>).url as string)
                : `https://registry.modelcontextprotocol.io/servers/${encodeURIComponent(name)}`,
          score: 0,
        };
      }),
    };
  } catch (err) {
    return { source: "mcp", results: [], error: (err as Error).message };
  }
};

/** GitHub repo search — reference implementations and MCP servers by topic. */
export const githubAdapter: SourceAdapter = async (input) => {
  const limit = input.limit ?? 5;
  try {
    const url = `${GITHUB_SEARCH}?q=${encodeURIComponent(input.query)}&per_page=${limit}&sort=stars`;
    const body = (await fetchJson(url, input.fetchImpl ?? fetch)) as {
      items?: Array<{ full_name?: string; description?: string; html_url?: string; stargazers_count?: number }>;
    };
    return {
      source: "github",
      results: (body.items ?? []).slice(0, limit).map((r) => ({
        kind: "agent" as const,
        name: r.full_name ?? "unknown",
        description: r.description ?? "",
        source: "github",
        sourceLabel: "github",
        reference: r.html_url ?? `https://github.com/${r.full_name ?? ""}`,
        score: r.stargazers_count ?? 0,
      })),
    };
  } catch (err) {
    return { source: "github", results: [], error: (err as Error).message };
  }
};

/** Built-in adapters keyed by canonical source id. */
export const BUILTIN_ADAPTERS: Record<string, SourceAdapter> = {
  skillsmp: skillsmpAdapter,
  npm: npmAdapter,
  mcp: mcpAdapter,
  github: githubAdapter,
};

/**
 * Run one query across the given source manifests. Disallowed sources are
 * skipped with a surfaced note; a manifest whose adapter is unknown yields
 * an error result ("no adapter") rather than being silently dropped.
 * Results are sorted by source id for deterministic output.
 */
export async function searchSources(manifests: SourceManifest[], input: RegistrySearchInput): Promise<SourceResult[]> {
  const results = await Promise.all(
    manifests.map(async (m): Promise<SourceResult> => {
      if (!m.policy.allowed) {
        return { source: m.id, results: [], error: `source "${m.id}" is not allowed by policy` };
      }
      const adapter = BUILTIN_ADAPTERS[m.adapter ?? m.id];
      if (!adapter) {
        return { source: m.id, results: [], error: `no adapter for source "${m.id}"` };
      }
      // Provenance contract (types.ts): findings carry the SourceManifest id,
      // not the adapter's builtin id — two manifests may share one adapter.
      const r = await adapter(input);
      return { ...r, source: m.id, results: r.results.map((f) => ({ ...f, source: m.id })) };
    }),
  );
  const filtered = input.kind
    ? results.map((r) => ({ ...r, results: r.results.filter((f) => f.kind === input.kind) }))
    : results;
  return filtered.sort((a, b) => a.source.localeCompare(b.source));
}

/** Flatten source results into the finding list consumed by consumers. */
export function findingsOfSources(results: SourceResult[]): RegistryFinding[] {
  return results.flatMap((r) => r.results);
}
