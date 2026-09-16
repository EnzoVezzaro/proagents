import { describe, expect, it } from "vitest";
import { newWorker, renameMcpServer, stripEmptyContexts, validateCrewDraft } from "./crew-draft.js";
import type { CrewDefinition } from "./types.js";

/**
 * CREW-DRAFT — regression tests for the crew builder wizard's pure logic.
 * Each test traces to a bug found while building 10 profiles + 5 crews
 * through the wizard in a real browser.
 */

function draftCrew(overrides: Partial<CrewDefinition> = {}): CrewDefinition {
  return {
    id: "test-crew",
    name: "Test Crew",
    version: "1.0.0",
    description: "A test crew",
    author: "proagents",
    tags: ["test"],
    workers: [
      {
        ...newWorker(0),
        description: "Does things",
        instructions: "1. Do the bounded job.",
      },
    ],
    mcpServers: [],
    handoffs: [],
    entryPoints: ["worker-1"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as CrewDefinition;
}

describe("validateCrewDraft (CREW-DRAFT-VAL)", () => {
  it("CREW-DRAFT-VAL-001: a complete draft has no problems", () => {
    expect(validateCrewDraft(draftCrew())).toEqual([]);
  });

  it("CREW-DRAFT-VAL-002: an incomplete draft refuses to ship — every dogfood gap is caught", () => {
    const crew = draftCrew({ description: "", author: "", entryPoints: [] });
    const problems = validateCrewDraft(crew);
    expect(problems.join(" ")).toContain("Description is required");
    expect(problems.join(" ")).toContain("Author is required");
    expect(problems.join(" ")).toContain("entry point");
  });

  it("CREW-DRAFT-VAL-003: a profile-backed worker needs no hand-written instructions", () => {
    const crew = draftCrew({
      workers: [{ ...newWorker(0, "security-engineer"), description: "Reviews" }],
    });
    expect(validateCrewDraft(crew)).toEqual([]);
  });

  it("CREW-DRAFT-VAL-004: the dogfood context-framework leak is flagged (artifact name as framework)", () => {
    const crew = draftCrew({
      workers: [{ ...newWorker(0), description: "d", instructions: "i", context: [{ framework: "draft-docs", scope: "" }] }],
    });
    const problems = validateCrewDraft(crew);
    expect(problems.some((p) => p.includes("draft-docs") && p.includes("not a builtin"))).toBe(true);
  });

  it("CREW-DRAFT-VAL-005: duplicate MCP server names are rejected client-side", () => {
    const crew = draftCrew({
      mcpServers: [
        { name: "github", transport: "http", url: "https://x" },
        { name: "github", transport: "http", url: "https://y" },
      ],
    });
    expect(validateCrewDraft(crew).join(" ")).toContain('Duplicate MCP server name: "github"');
  });

  it("CREW-DRAFT-VAL-006: unknown MCP references, self-receives, and bad handoffs all caught", () => {
    const crew = draftCrew({
      workers: [
        { ...newWorker(0), description: "d", instructions: "i", mcpServers: ["nope"], receivesFrom: ["worker-1"], emits: ["a.md"] },
      ],
      handoffs: [{ from: "worker-1", to: "worker-1", artifact: "not-emitted" }],
    });
    const joined = validateCrewDraft(crew).join(" ");
    expect(joined).toContain('unknown MCP server "nope"');
    expect(joined).toContain("cannot receive from itself");
    expect(joined).toContain("not-emitted");
    expect(joined).toContain("self-handoff");
  });
});

describe("renameMcpServer (CREW-DRAFT-MCP)", () => {
  it("CREW-DRAFT-MCP-001: renaming moves every worker binding with it", () => {
    const crew = draftCrew({
      mcpServers: [{ name: "server-1", transport: "stdio", command: "npx -y context7", args: [] }],
      workers: [{ ...newWorker(0), description: "d", instructions: "i", mcpServers: ["server-1"] }],
    });
    const patch = renameMcpServer(crew, "server-1", "context7");
    expect(patch.mcpServers?.[0]?.name).toBe("context7");
    expect(patch.workers?.[0]?.mcpServers).toEqual(["context7"]);
  });

  it("CREW-DRAFT-MCP-002: the name is slugified (the .mcp.json key must be clean)", () => {
    const crew = draftCrew({ mcpServers: [{ name: "server-1", transport: "stdio", command: "x", args: [] }] });
    expect(renameMcpServer(crew, "server-1", "Context 7!").mcpServers?.[0]?.name).toBe("context-7");
  });

  it("CREW-DRAFT-MCP-003: empty or unchanged names are no-ops", () => {
    const crew = draftCrew();
    expect(renameMcpServer(crew, "server-1", "")).toEqual({});
    expect(renameMcpServer(crew, "server-1", "server-1")).toEqual({});
  });
});

describe("stripEmptyContexts (CREW-DRAFT-CTX)", () => {
  it("CREW-DRAFT-CTX-001: placeholder rows (no scope) are dropped at export", () => {
    const crew = draftCrew({
      workers: [
        {
          ...newWorker(0),
          description: "d",
          instructions: "i",
          context: [{ framework: "filesystem", scope: "" }, { framework: "git", scope: "src/**" }],
        },
      ],
    });
    const cleaned = stripEmptyContexts(crew);
    expect(cleaned.workers[0]?.context).toEqual([{ framework: "git", scope: "src/**" }]);
  });

  it("CREW-DRAFT-CTX-002: an empty-scope binding is exactly the silent-garbage shape the CLI warns about", () => {
    // Cross-check with the intent of core crewWarnings: scope-less bindings
    // must never survive export.
    const crew = draftCrew({
      workers: [{ ...newWorker(0), description: "d", instructions: "i", context: [{ framework: "filesystem", scope: "   " }] }],
    });
    expect(stripEmptyContexts(crew).workers[0]?.context).toEqual([]);
  });
});
