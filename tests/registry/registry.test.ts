/**
 * REGISTRY — the unified artifact layer (Phase 1).
 *
 * Invariants under test:
 *  - sources/*.yaml load and validate against proagents/registry-source/v1
 *  - malformed/disallowed sources yield problems, never crashes
 *  - source adapters normalize findings with provenance and degrade to { error }
 *  - searchSources is deterministic (sorted by source id), policy-enforced
 *  - discovery delegates to the registry layer with a stable public API
 *  - the unified catalog lists/filters/loads items across kinds
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SOURCE_SCHEMA,
  loadSourceFile,
  loadSources,
  allowedSources,
} from "../../src/registry/sources.js";
import {
  BUILTIN_ADAPTERS,
  searchSources,
  findingsOfSources,
} from "../../src/registry/source-adapters.js";
import type { SourceManifest } from "../../src/registry/types.js";
import {
  ALL_KINDS,
  listItems,
  getItem,
  hasLoader,
  isListableKind,
  localDirForKind,
} from "../../src/registry/catalog.js";
import {
  discoverTooling,
  searchNpm,
  searchSkills,
  findingsOf,
} from "../../src/discovery/registry.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal valid manifest for direct adapter/searchSources calls. */
function manifest(overrides: Partial<SourceManifest> = {}): SourceManifest {
  return {
    schema: SOURCE_SCHEMA,
    id: "testsrc",
    name: "Test Source",
    type: "custom",
    capabilities: { search: true, metadata: false, resolve: false, install: false },
    artifact_types: ["tool"],
    policy: { allowed: true },
    ...overrides,
  };
}

/** fetch mock: routes by URL prefix (query string stripped). */
function fetchMock(routes: Record<string, unknown>): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const key = String(url).replace(/\?.*$/, "");
    if (!(key in routes)) throw new Error("HTTP 404");
    return new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const alwaysFails: typeof fetch = (async () => {
  throw new Error("network unreachable");
}) as unknown as typeof fetch;

/** Temp dir with the given files written (relative paths). */
function tempDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-registry-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return root;
}

// ---------------------------------------------------------------------------
// sources/*.yaml loading (REG-SRC)
// ---------------------------------------------------------------------------

describe("source declarations (REG-SRC)", () => {
  it("REG-SRC-001: loads the shipped sources and filters to queryable ones", async () => {
    const loaded = await loadSources(process.cwd());
    expect(loaded.length).toBeGreaterThanOrEqual(4);
    const ids = allowedSources(loaded).map((m) => m.id).sort();
    expect(ids).toEqual(["github", "mcp", "npm", "skillsmp"]);
    for (const m of allowedSources(loaded)) {
      expect(m.schema).toBe(SOURCE_SCHEMA);
      expect(m.capabilities.search).toBe(true);
      expect(m.policy.allowed).toBe(true);
    }
  });

  it("REG-SRC-002: a valid file parses into a full manifest", async () => {
    const root = tempDir({
      "sources/custom.yaml": [
        "schema: proagents/registry-source/v1",
        "id: custom",
        "name: Custom Feed",
        "type: custom",
        "capabilities:",
        "  search: true",
        "  metadata: false",
        "  resolve: false",
        "  install: false",
        "artifact_types:",
        "  - tool",
        "policy:",
        "  allowed: true",
      ].join("\n"),
    });
    const [loaded] = await loadSources(root, "sources");
    expect(loaded?.problems).toEqual([]);
    expect(loaded?.manifest).toMatchObject({ id: "custom", name: "Custom Feed", type: "custom" });
  });

  it("REG-SRC-003: bad schema/id/capabilities yield problems, not crashes", async () => {
    const root = tempDir({
      "sources/bad.yaml": [
        "schema: some-other/v9",
        "id: BAD_ID",
        "capabilities:",
        "  search: false",
        "artifact_types: []",
        "policy:",
        "  allowed: maybe",
      ].join("\n"),
    });
    const [loaded] = await loadSources(root, "sources");
    expect(loaded?.manifest).toBeUndefined();
    expect(loaded?.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("schema"),
        expect.stringContaining("id"),
        expect.stringContaining("capabilities.search"),
        expect.stringContaining("artifact_types"),
        expect.stringContaining("policy.allowed"),
      ]),
    );
  });

  it("REG-SRC-004: disallowed sources load with a manifest but are filtered out", async () => {
    const root = tempDir({
      "sources/off.yaml": [
        "schema: proagents/registry-source/v1",
        "id: off",
        "name: Off Source",
        "capabilities:",
        "  search: true",
        "artifact_types:",
        "  - tool",
        "policy:",
        "  allowed: false",
      ].join("\n"),
    });
    const loaded = await loadSources(root, "sources");
    expect(loaded[0]?.manifest).toMatchObject({ id: "off", policy: { allowed: false } });
    expect(allowedSources(loaded)).toEqual([]);
  });

  it("REG-SRC-005: a missing sources dir means native-only (empty, no throw)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pa-registry-empty-"));
    expect(await loadSources(root, "sources")).toEqual([]);
  });

  it("REG-SRC-006: unreadable YAML yields a problem entry, siblings still load", async () => {
    const root = tempDir({
      "sources/broken.yaml": "schema: [unclosed",
      "sources/good.yaml": [
        "schema: proagents/registry-source/v1",
        "id: good",
        "name: Good",
        "capabilities:",
        "  search: true",
        "artifact_types:",
        "  - skill",
        "policy:",
        "  allowed: true",
      ].join("\n"),
    });
    const loaded = await loadSources(root, "sources");
    expect(loaded).toHaveLength(2);
    const broken = loaded.find((l) => l.file.endsWith("broken.yaml"));
    const good = loaded.find((l) => l.file.endsWith("good.yaml"));
    expect(broken?.problems.length ?? 0).toBeGreaterThan(0);
    expect(good?.manifest?.id).toBe("good");
  });
});

// ---------------------------------------------------------------------------
// Source adapters + federation (REG-ADAPT)
// ---------------------------------------------------------------------------

describe("source adapters (REG-ADAPT)", () => {
  it("REG-ADAPT-001: all four built-in adapters are registered by id", () => {
    expect(Object.keys(BUILTIN_ADAPTERS).sort()).toEqual(["github", "mcp", "npm", "skillsmp"]);
  });

  it("REG-ADAPT-002: npm findings normalize with provenance and reference", async () => {
    const res = await searchSources(
      [manifest({ id: "npm", adapter: "npm" })],
      {
        query: "left-pad",
        fetchImpl: fetchMock({
          "https://registry.npmjs.org/-/v1/search": {
            objects: [
              {
                package: { name: "left-pad", description: "pads", links: { repository: "https://github.com/o/r" } },
                score: { final: 0.91 },
              },
            ],
          },
        }),
      },
    );
    expect(res[0]?.error).toBeUndefined();
    expect(res[0]?.results[0]).toMatchObject({
      kind: "tool",
      name: "left-pad",
      source: "npm",
      sourceLabel: "npm",
      reference: "https://github.com/o/r",
      score: 0.91,
    });
  });

  it("REG-ADAPT-003: skills.sh findings carry github: references", async () => {
    const res = await searchSources(
      [manifest({ id: "skillsmp", adapter: "skillsmp" })],
      {
        query: "tdd",
        fetchImpl: fetchMock({
          "https://skills.sh/api/search": {
            skills: [{ id: "owner/skills/tdd-guard", skillId: "tdd-guard", name: "tdd-guard", installs: 42, source: "owner/repo" }],
          },
        }),
      },
    );
    expect(res[0]?.results[0]).toMatchObject({
      kind: "skill",
      name: "tdd-guard",
      source: "skillsmp",
      reference: "github:owner/repo",
      score: 42,
    });
  });

  it("REG-ADAPT-004: MCP servers map to kind mcp with websiteUrl reference", async () => {
    const res = await searchSources(
      [manifest({ id: "mcp", adapter: "mcp" })],
      {
        query: "postgres",
        fetchImpl: fetchMock({
          "https://registry.modelcontextprotocol.io/v0.1/servers": {
            servers: [{ server: { name: "io.example/pg", description: "PG", websiteUrl: "https://example.com/pg" } }],
          },
        }),
      },
    );
    expect(res[0]?.results[0]).toMatchObject({ kind: "mcp", name: "io.example/pg", reference: "https://example.com/pg" });
  });

  it("REG-ADAPT-005: GitHub repos map to kind agent with star scores", async () => {
    const res = await searchSources(
      [manifest({ id: "github", adapter: "github" })],
      {
        query: "kubernetes",
        fetchImpl: fetchMock({
          "https://api.github.com/search/repositories": {
            items: [{ full_name: "o/r", description: "d", html_url: "https://github.com/o/r", stargazers_count: 123 }],
          },
        }),
      },
    );
    expect(res[0]?.results[0]).toMatchObject({ kind: "agent", name: "o/r", reference: "https://github.com/o/r", score: 123 });
  });

  it("REG-ADAPT-006: results are sorted by source id for deterministic output", async () => {
    const res = await searchSources(
      [manifest({ id: "zzz", adapter: "github" }), manifest({ id: "aaa", adapter: "npm" })],
      { query: "x", fetchImpl: fetchMock({}) }, // routes miss → both degrade to error, still sorted
    );
    expect(res.map((r) => r.source)).toEqual(["aaa", "zzz"]);
    for (const r of res) expect(r.error).toBeTruthy();
  });

  it("REG-ADAPT-007: policy-allowed=false is enforced before any network call", async () => {
    let called = 0;
    const counting: typeof fetch = (async () => {
      called++;
      throw new Error("nope");
    }) as unknown as typeof fetch;
    const res = await searchSources([manifest({ id: "blocked", policy: { allowed: false } })], { query: "x", fetchImpl: counting });
    expect(called).toBe(0);
    expect(res[0]?.results).toEqual([]);
    expect(res[0]?.error).toContain("not allowed");
  });

  it("REG-ADAPT-008: unknown adapter degrades to 'no adapter' error", async () => {
    const res = await searchSources([manifest({ id: "mystery" })], { query: "x", fetchImpl: alwaysFails });
    expect(res[0]?.error).toContain("no adapter");
  });

  it("REG-ADAPT-009: kind filter keeps only matching findings", async () => {
    const res = await searchSources(
      [manifest({ id: "npm", adapter: "npm" }), manifest({ id: "github", adapter: "github" })],
      {
        query: "x",
        kind: "agent",
        fetchImpl: fetchMock({
          "https://registry.npmjs.org/-/v1/search": { objects: [{ package: { name: "pkg", description: "" } }] },
          "https://api.github.com/search/repositories": { items: [{ full_name: "o/r", description: "" }] },
        }),
      },
    );
    const npmRes = res.find((r) => r.source === "npm");
    const ghRes = res.find((r) => r.source === "github");
    expect(npmRes?.results).toEqual([]);
    expect(ghRes?.results[0]?.name).toBe("o/r");
  });

  it("REG-ADAPT-010: findingsOfSources flattens across sources", () => {
    const flat = findingsOfSources([
      { source: "a", results: [{ kind: "tool", name: "x", description: "", source: "a", sourceLabel: "a", reference: "r", score: 0 }] },
      { source: "b", results: [] },
    ]);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.name).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// Unified catalog (REG-CAT)
// ---------------------------------------------------------------------------

describe("unified catalog (REG-CAT)", () => {
  it("REG-CAT-001: the 13-kind union is complete and stable", () => {
    expect([...ALL_KINDS].sort()).toEqual([
      "adapter", "agent", "capability", "crew", "extension", "hook", "mcp",
      "policy", "profile", "prompt", "skill", "template", "tool", "workflow",
    ]);
  });

  it("REG-CAT-002: listItems reads the shipped catalog and filters by kind", async () => {
    const all = await listItems();
    expect(all.length).toBeGreaterThan(0);
    for (const kind of new Set(all.map((i) => i.kind))) {
      const ofKind = await listItems({ kind });
      expect(ofKind.every((i) => i.kind === kind)).toBe(true);
      expect(ofKind.length).toBeGreaterThan(0);
    }
    // Union property: filtering by every observed kind partitions the catalog.
    const sumOfParts = (await Promise.all([...new Set(all.map((i) => i.kind))].map((k) => listItems({ kind: k })))).flat().length;
    expect(sumOfParts).toBe(all.length);
    // Deterministic order: sorted by id then kind.
    const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
    expect(all).toEqual(sorted);
  });

  it("REG-CAT-003: getItem resolves kind:id, undefined for unknown id", async () => {
    const profiles = await listItems({ kind: "profile" });
    const first = profiles[0]!;
    expect(await getItem("profile", first.id)).toMatchObject({ id: first.id, kind: "profile" });
    expect(await getItem("profile", "no-such-profile")).toBeUndefined();
    expect(await getItem("crew", first.id)).toBeUndefined(); // kind mismatch → no hit
  });

  it("REG-CAT-004: loader capability is kind-scoped", () => {
    expect(hasLoader("profile")).toBe(true);
    expect(hasLoader("crew")).toBe(true);
    expect(hasLoader("agent")).toBe(true);
    expect(hasLoader("skill")).toBe(false);
    expect(isListableKind("profile")).toBe(true);
    expect(isListableKind("crew")).toBe(true);
    expect(isListableKind("skill")).toBe(false);
  });

  it("REG-CAT-005: local write targets are deterministic per kind", () => {
    expect(localDirForKind("profile")).toBe(path.join(".proagent", "profiles"));
    expect(localDirForKind("crew")).toBe(path.join(".proagent", "crews"));
    expect(localDirForKind("agent")).toBe(path.join(".proagent", "crews"));
  });
});

// ---------------------------------------------------------------------------
// Discovery delegation (REG-DISC — contract parity with tests/discovery.test.ts)
// ---------------------------------------------------------------------------

describe("discovery delegation (REG-DISC)", () => {
  it("REG-DISC-001: discoverTooling returns all four registries in historical order", async () => {
    const results = await discoverTooling({
      query: "kubernetes",
      fetchImpl: fetchMock({
        "https://registry.modelcontextprotocol.io/v0.1/servers": { servers: [] },
        "https://registry.npmjs.org/-/v1/search": { objects: [] },
        "https://skills.sh/api/search": { skills: [] },
        "https://api.github.com/search/repositories": { items: [] },
      }),
    });
    expect(results.map((r) => r.source)).toEqual(["mcp-registry", "npm", "skills.sh", "github"]);
    for (const r of results) expect(r.error).toBeUndefined();
  });

  it("REG-DISC-002: failing registries degrade to { error } per registry", async () => {
    const results = await discoverTooling({ query: "x", fetchImpl: alwaysFails });
    expect(results).toHaveLength(4);
    for (const r of results) expect(r.error).toBeTruthy();
  });

  it("REG-DISC-003: searchNpm/searchSkills findings carry the legacy source labels", async () => {
    const npm = await searchNpm({
      query: "left-pad",
      fetchImpl: fetchMock({
        "https://registry.npmjs.org/-/v1/search": { objects: [{ package: { name: "left-pad", description: "pads" } }] },
      }),
    });
    expect(npm.source).toBe("npm");
    expect(npm.results[0]).toMatchObject({ kind: "npm", name: "left-pad", source: "npm" });

    const skills = await searchSkills({
      query: "tdd",
      fetchImpl: fetchMock({
        "https://skills.sh/api/search": { skills: [{ skillId: "tdd-guard", name: "tdd-guard", source: "o/r" }] },
      }),
    });
    expect(skills.source).toBe("skills.sh");
    expect(skills.results[0]).toMatchObject({ kind: "skill", name: "tdd-guard", reference: "github:o/r" });
  });

  it("REG-DISC-004: findingsOf flattens across registries", async () => {
    const results = await discoverTooling({
      query: "x",
      fetchImpl: fetchMock({
        "https://registry.modelcontextprotocol.io/v0.1/servers": { servers: [] },
        "https://registry.npmjs.org/-/v1/search": { objects: [{ package: { name: "p", description: "" } }] },
        "https://skills.sh/api/search": { skills: [] },
        "https://api.github.com/search/repositories": { items: [] },
      }),
    });
    const flat = findingsOf(results);
    expect(flat.map((f) => f.name)).toEqual(["p"]);
  });
});
