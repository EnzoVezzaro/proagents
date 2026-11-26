/**
 * DISCOVERY — registry tooling search staged into the interview session.
 *
 * Invariants under test:
 *  - every registry searcher degrades to { error } on failure, never throws
 *  - findings are provenance-tagged (source + reference + query)
 *  - stageTooling dedupes and caps; builders can consume the stage
 *  - toolingToProfileParts maps findings to profile parts purely
 */
import { describe, expect, it } from "vitest";
import { searchMcpRegistry, searchNpm, searchSkills, searchGitHub, discoverTooling } from "../src/discovery/registry.js";
import { deriveQueries, toolingToProfileParts } from "../src/discovery/session.js";
import type { KnowledgeState } from "../src/core/types.js";

/** fetch mock: routes by URL prefix, returns canned JSON. */
function fetchMock(routes: Record<string, unknown>): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const key = String(url).replace(/\?.*$/, "");
    if (!(key in routes)) throw new Error(`HTTP 404`);
    return new Response(JSON.stringify(routes[key]), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const alwaysFails: typeof fetch = (async () => {
  throw new Error("network unreachable");
}) as unknown as typeof fetch;

describe("registry searchers (DISC-REG)", () => {
  it("DISC-REG-001: MCP registry maps servers to provenance-tagged findings", async () => {
    const res = await searchMcpRegistry({
      query: "postgres",
      fetchImpl: fetchMock({
        "https://registry.modelcontextprotocol.io/v0.1/servers": {
          servers: [
            {
              server: { name: "io.example/pg", description: "Postgres access", websiteUrl: "https://example.com/pg" },
              _meta: { "io.modelcontextprotocol.registry/official": { status: "active" } },
            },
          ],
        },
      }),
    });
    expect(res.error).toBeUndefined();
    expect(res.results[0]).toMatchObject({ kind: "mcp", name: "io.example/pg", reference: "https://example.com/pg", source: "mcp-registry" });
  });

  it("DISC-REG-002: a failing registry degrades to { error }, never throws", async () => {
    const res = await searchNpm({ query: "anything", fetchImpl: alwaysFails });
    expect(res.results).toEqual([]);
    expect(res.error).toBe("network unreachable");
  });

  it("DISC-REG-003: skills.sh findings carry github: references", async () => {
    const res = await searchSkills({
      query: "tdd",
      fetchImpl: fetchMock({
        "https://skills.sh/api/search": {
          skills: [{ id: "owner/skills/tdd-guard", skillId: "tdd-guard", name: "tdd-guard", installs: 929736, source: "owner/repo" }],
        },
      }),
    });
    expect(res.results[0]).toMatchObject({ kind: "skill", name: "tdd-guard", reference: "github:owner/repo" });
  });

  it("DISC-REG-004: discoverTooling runs all four registries and reports failures per registry", async () => {
    const results = await discoverTooling({ query: "kubernetes", fetchImpl: alwaysFails });
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.error).toBeTruthy();
  });
});

describe("session staging (DISC-SESSION)", () => {
  it("DISC-SESSION-001: deriveQueries takes intent + capability facts, deduped and capped", () => {
    const state = {
      intent: "Build a CI fixer agent. It should also summarize failures.",
      facts: [
        { id: "f1", statement: "targets Kubernetes", category: "capability", source: "q_001", confidence: 1, createdAt: "" },
        { id: "f2", statement: "targets kubernetes", category: "capability", source: "q_002", confidence: 1, createdAt: "" },
        { id: "f3", statement: "uses pnpm", category: "constraint", source: "q_003", confidence: 1, createdAt: "" },
      ],
    } as unknown as Pick<KnowledgeState, "intent" | "facts">;
    const queries = deriveQueries(state);
    expect(queries[0]).toBe("build a ci fixer agent");
    expect(queries).toContain("kubernetes");
    expect(queries).not.toContain("uses pnpm"); // constraints are not tooling queries
  });

  it("DISC-SESSION-002: toolingToProfileParts maps findings to profile parts purely", () => {
    const parts = toolingToProfileParts({
      queries: ["q"],
      findings: [
        { kind: "mcp", name: "io.example/pg", description: "", source: "mcp-registry", reference: "https://x", query: "q" },
        { kind: "npm", name: "left-pad", description: "pads", source: "npm", reference: "https://npm", query: "q" },
        { kind: "skill", name: "tdd-guard", description: "", source: "skills.sh", reference: "github:owner/repo", query: "q" },
        { kind: "github", name: "owner/repo", description: "", source: "github", reference: "https://github.com/owner/repo", query: "q" },
      ],
    });
    expect(parts.mcp[0]).toMatchObject({ name: "io.example/pg", transport: "stdio", command: "npx" });
    expect(parts.packages.map((p) => p.registry)).toEqual(["npm:left-pad", "github:owner/repo"]);
    expect(parts.skills[0]?.ref).toBe("github:owner/repo");
  });
});
