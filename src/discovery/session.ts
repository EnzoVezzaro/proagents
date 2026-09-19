/**
 * Discovery ↔ session bridge: derives registry queries from the interview
 * state, runs them, and persists findings as staged session state
 * (.proagent/session.json). Deterministic mapping from facts/intent to
 * queries; findings are provenance-tagged and never auto-installed.
 */
import type { DiscoveredTooling, KnowledgeState } from "../core/types.js";
import { discoverTooling, findingsOf, type RegistryResult } from "./registry.js";

/** Cap on total findings staged per discovery run (all registries, all queries). */
const MAX_FINDINGS = 24;
/** Cap on queries per run — the top-of-intent signal only. */
const MAX_QUERIES = 3;

/**
 * Derive registry queries from the session: the stated intent plus the
 * highest-signal tooling facts (capabilities/tools the interview captured).
 * Deterministic: the same session state always yields the same queries.
 */
export function deriveQueries(state: Pick<KnowledgeState, "intent" | "facts">): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const push = (q: string): void => {
    // Registry search endpoints match on plain terms: strip punctuation and
    // keep only word characters so `text=ci:pipeline…` can't 400 the npm API.
    const clean = q
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 80)
      .trim();
    if (clean.length < 3 || seen.has(clean)) return;
    seen.add(clean);
    queries.push(clean);
  };

  const intent = (state.intent.split(/[.!?;\n]/)[0]?.trim() ?? "").split(/[:—]/)[0]?.trim() ?? "";
  if (intent) push(intent);

  // Tool/capability facts carry the concrete nouns registries match on.
  for (const fact of state.facts) {
    if (fact.category !== "capability" && fact.category !== "requirement") continue;
    const cleaned = fact.statement
      .replace(/^(the |it |should |must |uses |needs |requires |targets |wants )+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 4) push(cleaned);
    if (queries.length >= MAX_QUERIES) break;
  }
  return queries.slice(0, MAX_QUERIES);
}

/**
 * Run discovery over the session's queries and stage the findings
 * (deduplicated by kind+name, capped) onto the session state.
 * Returns the per-registry results for rendering; mutates state.tooling.
 */
export async function stageTooling(
  state: KnowledgeState,
  opts: { fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<RegistryResult[]> {
  const queries = state.tooling?.queries.length ? state.tooling.queries : deriveQueries(state);
  if (queries.length === 0) {
    state.tooling = { queries: [], findings: [], discoveredAt: new Date().toISOString() };
    return [];
  }

  // Run each query's four registries as one grouped promise so findings can
  // be attributed to their query (perQuery arrays stay aligned).
  const grouped = await Promise.all(
    queries.map((query) =>
      discoverTooling({ query, ...(opts.limit !== undefined ? { limit: opts.limit } : {}), ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) }),
    ),
  );

  // Tag each finding with the query that surfaced it, dedupe, cap. On the
  // cap we break OUT of the loops and still run the assignment below — an
  // early return here would drop the findings we just collected.
  const staged: DiscoveredTooling[] = [];
  const seen = new Set<string>();
  let capped = false;
  for (const [qi, queryResults] of grouped.entries()) {
    const query = queries[qi] ?? "";
    for (const f of findingsOf(queryResults)) {
      const key = `${f.kind}:${f.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      staged.push({ kind: f.kind, name: f.name, description: f.description, source: f.source, reference: f.reference, query });
      if (staged.length >= MAX_FINDINGS) {
        capped = true;
        break;
      }
    }
    if (capped) break;
  }

  state.tooling = { queries, findings: staged, discoveredAt: new Date().toISOString() };
  return grouped.flat();
}

/**
 * Materialize staged tooling into the profile-shaped structures the
 * builders consume: MCP servers (stdio placeholders), npm/GitHub packages,
 * and skills registry refs. Pure: mapping only, no IO, no network.
 */
export function toolingToProfileParts(tooling: KnowledgeState["tooling"]): {
  mcp: Array<{ name: string; transport: "stdio"; command: string; args: string[]; healthCheck?: string }>;
  packages: Array<{ registry: string; reason?: string }>;
  skills: Array<{ ref: string; note?: string }>;
} {
  const mcp: Array<{ name: string; transport: "stdio"; command: string; args: string[]; healthCheck?: string }> = [];
  const packages: Array<{ registry: string; reason?: string }> = [];
  const skills: Array<{ ref: string; note?: string }> = [];
  for (const f of tooling?.findings ?? []) {
    if (f.kind === "mcp") {
      // The registry gives metadata, not a runnable command; build publishes
      // it as a named http placeholder so the human wires the real transport.
      mcp.push({ name: f.name, transport: "stdio", command: "npx", args: ["-y", f.name], healthCheck: f.reference });
    } else if (f.kind === "npm") {
      packages.push({ registry: `npm:${f.name}`, reason: f.description || `discovered via "${f.query}"` });
    } else if (f.kind === "github") {
      // PA040: packages carry `github:owner/repo[@ref]`, never a URL. Derive
      // the slug from the html_url and drop anything past owner/repo
      // (tree refs, .git suffixes, query strings).
      const fromUrl = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/.exec(f.reference);
      const slug = f.reference.startsWith("github:")
        ? f.reference.slice("github:".length)
        : fromUrl?.[1]
          ? fromUrl[1]
          : f.reference;
      const clean = slug.replace(/\.git$/, "").split("/").slice(0, 2).join("/");
      packages.push({ registry: `github:${clean}`, reason: f.description || `discovered via "${f.query}"` });
    } else if (f.kind === "skill") {
      skills.push({ ref: f.reference.startsWith("github:") ? f.reference : `github:${f.reference}`, note: f.description || `discovered via "${f.query}"` });
    }
  }
  return { mcp, packages, skills };
}
