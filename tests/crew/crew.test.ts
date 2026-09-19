import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crewProblems, crewWarnings, validateCrewOrThrow } from "../../src/crew/validate.js";
import { installCrew, planInstall, mergeMcpConfig, crewSkillMarkdown } from "../../src/crew/install.js";
import { readCatalogLocal, emptyCatalog } from "../../src/crew/registry.js";
import { CrewError } from "../../src/crew/types.js";
import type { CrewDefinition } from "../../src/crew/types.js";

/**
 * CREW-* — tests for the crew/registry subsystem. All offline.
 */

const CLI = path.resolve("dist/cli/index.js");

function baseCrew(): CrewDefinition {
  return {
    id: "test-crew",
    name: "Test Crew",
    version: "1.0.0",
    description: "A crew for tests",
    author: "proagents",
    tags: ["test"],
    workers: [
      {
        id: "alpha",
        name: "Alpha",
        role: "researcher",
        description: "Finds things",
        permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: ["read_file"], approvalGates: [] },
        mcpServers: ["github"],
        context: [{ framework: "filesystem", scope: "src/**" }],
        instructions: "1. Look.\n2. Report.",
        receivesFrom: [],
        emits: ["alpha-report.md"],
      },
      {
        id: "beta",
        name: "Beta",
        role: "reviewer",
        description: "Checks things",
        permissions: { read: "scoped", write: "none", production: "none", secrets: "none", tools: [], approvalGates: [] },
        mcpServers: [],
        context: [],
        instructions: "1. Read alpha-report.md.\n2. Verdict.",
        receivesFrom: ["alpha"],
        emits: ["beta-verdict.md"],
      },
    ],
    mcpServers: [{ name: "github", transport: "http", url: "https://api.githubcopilot.com/mcp/" }],
    handoffs: [{ from: "alpha", to: "beta", artifact: "alpha-report.md" }],
    entryPoints: ["alpha"],
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// CREW-VALIDATE-*
// ---------------------------------------------------------------------------

describe("crew validation (CREW-VALIDATE)", () => {
  it("CREW-VALIDATE-001: a well-formed crew has no problems", () => {
    expect(crewProblems(baseCrew())).toEqual([]);
  });

  it("CREW-VALIDATE-002: bad id, version and missing fields are caught", () => {
    const crew = { ...baseCrew(), id: "Bad Id", version: "not-semver", description: "" };
    const joined = crewProblems(crew).join(" ");
    expect(joined).toMatch(/lowercase slug/);
    expect(joined).toMatch(/semver/);
    expect(joined).toMatch(/description is required/);
  });

  it("CREW-VALIDATE-003: unknown MCP and unknown upstream references fail", () => {
    const crew = baseCrew();
    crew.workers[0]!.mcpServers = ["nonexistent"];
    crew.workers[1]!.receivesFrom = ["ghost"];
    const joined = crewProblems(crew).join(" ");
    expect(joined).toMatch(/unknown MCP server/);
    expect(joined).toMatch(/unknown worker "ghost"/);
  });

  it("CREW-VALIDATE-004: handoff must pass an artifact the sender emits", () => {
    const crew = baseCrew();
    crew.handoffs[0]!.artifact = "never-emitted.md";
    expect(crewProblems(crew).join(" ")).toMatch(/is not in alpha's emits/);
  });

  it("CREW-VALIDATE-005: cycles are rejected (DAG requirement)", () => {
    const crew = baseCrew();
    crew.workers[0]!.receivesFrom = ["beta"];
    expect(crewProblems(crew).join(" ")).toMatch(/acyclic/);
  });

  it("CREW-VALIDATE-006: permission vocabulary is enforced", () => {
    const crew = baseCrew();
    (crew.workers[0]!.permissions as unknown as Record<string, string>).read = "everything";
    expect(crewProblems(crew).join(" ")).toMatch(/permissions.read/);
  });

  it("CREW-VALIDATE-007: validateCrewOrThrow throws CREW_VALIDATION_ERROR", () => {
    const crew = baseCrew();
    crew.entryPoints = [];
    try {
      validateCrewOrThrow(crew);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      expect((err as CrewError).code).toBe("CREW_VALIDATION_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-INSTALL-*
// ---------------------------------------------------------------------------

describe("crew install (CREW-INSTALL)", () => {
  it("CREW-INSTALL-001: plan covers crew skill, worker skills and agent contracts", () => {
    const plan = planInstall(baseCrew());
    const paths = plan.entries.map((e) => e.path);
    expect(paths).toContain(path.join(".agents", "crews", "test-crew", "manifest.json"));
    expect(paths).toContain(path.join(".agents", "crews", "test-crew", "SKILL.md"));
    expect(paths.filter((p) => p.endsWith("SKILL.md"))).toHaveLength(3);
    expect(paths.filter((p) => p.endsWith("agent.json"))).toHaveLength(2);
  });

  it("CREW-INSTALL-002: writes the deterministic layout and merges .mcp.json", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-install-"));
    try {
      fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "echo" } } }, null, 2));
      const result = await installCrew(baseCrew(), root);
      // manifest.json + crew SKILL.md + 2 worker SKILL.md + 2 agent.json = 6
      expect(result.filesWritten).toHaveLength(6);
      for (const f of result.filesWritten) {
        expect(fs.existsSync(path.join(root, f))).toBe(true);
      }
      const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")) as { mcpServers: Record<string, unknown> };
      expect(Object.keys(mcp.mcpServers).sort()).toEqual(["existing", "github"]);
      // crew.json content matches the definition
      const written = JSON.parse(fs.readFileSync(path.join(root, ".agents", "crews", "test-crew", "manifest.json"), "utf8")) as CrewDefinition;
      expect(written.id).toBe("test-crew");
      // worker skill contains the normative permission table
      const betaSkill = fs.readFileSync(path.join(root, ".agents", "crews", "test-crew", "workers", "beta", "SKILL.md"), "utf8");
      expect(betaSkill).toContain("| read | scoped |");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-INSTALL-003: refuses to install an invalid crew", async () => {
    const crew = baseCrew();
    crew.workers[1]!.receivesFrom = ["ghost"];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-bad-"));
    try {
      await expect(installCrew(crew, root)).rejects.toThrow(/unknown worker/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-INSTALL-004: mergeMcpConfig is pure and preserves unknown keys", () => {
    const existing = JSON.stringify({ other: true, mcpServers: { a: { command: "x" } } });
    const merged = JSON.parse(mergeMcpConfig(existing, baseCrew())) as { other: boolean; mcpServers: Record<string, unknown> };
    expect(merged.other).toBe(true);
    expect(merged.mcpServers["a"]).toEqual({ command: "x" });
    expect(merged.mcpServers["github"]).toMatchObject({ url: "https://api.githubcopilot.com/mcp/" });
    expect(mergeMcpConfig(null, baseCrew())).toContain("github");
  });

  it("CREW-INSTALL-005: crew skill markdown lists workers, pipeline and rules", () => {
    const md = crewSkillMarkdown(baseCrew());
    expect(md).toContain("# Crew: Test Crew");
    expect(md).toContain("| Alpha (");
    expect(md).toContain("`alpha` hands **alpha-report.md** to `beta`");
    expect(md).toContain("never a shared context pool");
  });
});

// ---------------------------------------------------------------------------
// CREW-REGISTRY-*
// ---------------------------------------------------------------------------

describe("crew registry (CREW-REGISTRY)", () => {
  it("CREW-REGISTRY-001: local catalog round-trip (missing → empty, written → parsed)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-registry-"));
    try {
      expect(await readCatalogLocal(root)).toEqual(emptyCatalog());
      fs.mkdirSync(path.join(root, "registry"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "registry", "catalog.json"),
        JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-15T00:00:00.000Z", items: [] }),
      );
      const catalog = await readCatalogLocal(root);
      expect(catalog.schemaVersion).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-REGISTRY-002: invalid catalog JSON raises CREW_REGISTRATION_ERROR", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-registry-bad-"));
    try {
      fs.mkdirSync(path.join(root, "registry"), { recursive: true });
      fs.writeFileSync(path.join(root, "registry", "catalog.json"), "{ nope");
      try {
        await readCatalogLocal(root);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(CrewError);
        expect((err as CrewError).code).toBe("CREW_REGISTRATION_ERROR");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-CLI-* — end-to-end through the real binary
// ---------------------------------------------------------------------------

let cliRoot = "";

function cliProject(): string {
  if (!cliRoot) {
    cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crew-cli-"));
  }
  return cliRoot;
}

function cli(args: string[], expectFailure = false): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync("node", [CLI, ...args], { cwd: cliProject(), encoding: "utf8" }), status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (!expectFailure) throw err;
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

afterAll(() => {
  if (cliRoot) fs.rmSync(cliRoot, { recursive: true, force: true });
});

describe("crew CLI (CREW-CLI)", () => {
  it("CREW-CLI-001: validate accepts a shipped catalog crew folder", () => {
    const file = path.resolve("registry", "crews", "incidere-incident-response");
    const { stdout } = cli(["crew", "validate", file, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.crew).toBe("incidere-incident-response");
  });

  it("CREW-CLI-002: validate reports problems with non-zero exit on invalid crews", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-cli-bad-"));
    const file = path.join(dir, "bad.json");
    const crew = baseCrew();
    crew.id = "Not Valid";
    fs.writeFileSync(file, JSON.stringify(crew));
    const { status, stdout } = cli(["crew", "validate", file, "--json"], true);
    expect(status).not.toBe(0);
    expect(JSON.parse(stdout).status).toBe("invalid");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("CREW-CLI-003: install from a local crew folder writes the full layout", () => {
    const file = path.resolve("registry", "crews", "test-healer");
    const { stdout } = cli(["crew", "install", file, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.installed.crewId).toBe("test-healer");
    expect(parsed.installed.filesWritten.length).toBeGreaterThanOrEqual(3);
  });

  it("CREW-CLI-004: dry-run prints the plan without writing", () => {
    const file = path.resolve("registry", "crews", "pr-review-gate");
    const { stdout } = cli(["crew", "install", file, "--dry-run", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.plan.entries.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(cliProject(), ".agents", "crews", "pr-review-gate"))).toBe(false);
  });

  it("CREW-CLI-005b: crew build installs from a local builder JSON", async () => {
    const root = cliProject();
    const crewFile = path.join(root, "manifest.json");
    // Builder output is inline: hydrate the shipped folder item and write it
    // as a flat definition, exactly what the SPA builder exports.
    const { loadCrewFile } = await import("../../src/crew/hydrate.js");
    const crew = await loadCrewFile(path.resolve("registry", "crews", "test-healer", "manifest.json"));
    fs.writeFileSync(crewFile, JSON.stringify(crew));
    const { stdout } = cli(["crew", "build", crewFile, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(fs.existsSync(path.join(root, ".agents", "crews", "test-healer", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agents", "crews", "test-healer", "workers", "healer", "SKILL.md"))).toBe(true);
  });

  it("CREW-CLI-005a: crew create maps --role flags to members in order", () => {
    const root = cliProject();
    const { stdout } = cli([
      "crew", "create", "database-engineer", "backend-engineer", "qa-engineer",
      "--name", "Role Order Crew", "--id", "role-order-crew",
      "--role", "schema-owner", "--role", "serving", "--role", "quality",
      "--json",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    const dir = path.join(root, ".proagent", "crews", "role-order-crew");
    const first = JSON.parse(fs.readFileSync(path.join(dir, "members", "01-database-engineer.json"), "utf8")) as { role: string };
    const second = JSON.parse(fs.readFileSync(path.join(dir, "members", "02-backend-engineer.json"), "utf8")) as { role: string };
    const third = JSON.parse(fs.readFileSync(path.join(dir, "members", "03-qa-engineer.json"), "utf8")) as { role: string };
    // Order matters: roles apply positionally, not last-wins to every member.
    expect(first.role).toBe("schema-owner");
    expect(second.role).toBe("serving");
    expect(third.role).toBe("quality");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("CREW-CLI-005: all shipped catalog crew folders validate", () => {
    const crewsDir = path.resolve("registry", "crews");
    const catalog = JSON.parse(fs.readFileSync(path.resolve("registry", "catalog.json"), "utf8")) as {
      items: Array<{ id: string; kind: string }>;
    };
    const crewKinds = new Set(catalog.items.filter((i) => i.kind !== "profile").map((i) => i.id));
    for (const entry of fs.readdirSync(crewsDir, { withFileTypes: true })) {
      // Profile items are validated by the profiles pipeline, not crew validate.
      if (!entry.isDirectory() || !crewKinds.has(entry.name)) continue;
      const { stdout } = cli(["crew", "validate", path.join(crewsDir, entry.name), "--json"]);
      expect(JSON.parse(stdout).status).toBe("ok");
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-STANDARD — subagent-standard checks PA043–PA047 (mirror PA006–PA010)
// ---------------------------------------------------------------------------

describe("crew subagent standards (CREW-STANDARD)", () => {
  it("CREW-STANDARD-001: PA043 — production write without an approval gate is an error", () => {
    const crew = baseCrew();
    crew.workers[0]!.permissions.production = "write";
    const joined = crewProblems(crew).join(" ");
    expect(joined).toContain("[PA043]");
    expect(joined).toContain("worker alpha");
    // Adding a gate clears it.
    crew.workers[0]!.permissions.approvalGates = ["restart_service"];
    expect(crewProblems(crew).join(" ")).not.toContain("[PA043]");
  });

  it("CREW-STANDARD-002: PA044 — secret access without gates is flagged", () => {
    const crew = baseCrew();
    crew.workers[0]!.permissions.secrets = "named";
    expect(crewProblems(crew).join(" ")).toContain("[PA044]");
    crew.workers[0]!.permissions.approvalGates = ["read_secret"];
    expect(crewProblems(crew).join(" ")).not.toContain("[PA044]");
  });

  it("CREW-STANDARD-003: PA045 — an unconnected worker in a multi-worker crew is flagged", () => {
    const crew = baseCrew();
    crew.workers.push({
      id: "gamma", name: "Gamma", role: "observer", description: "Watches",
      permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: [] },
      mcpServers: [], context: [], instructions: "Watch.",
      receivesFrom: [], emits: [],
    });
    const joined = crewProblems(crew).join(" ");
    expect(joined).toContain("[PA045]");
    expect(joined).toContain("worker gamma");
  });

  it("CREW-STANDARD-004: PA046 — more than 5 upstream sources is flagged", () => {
    const crew = baseCrew();
    // Add 6 upstream workers, all feeding beta.
    for (let i = 1; i <= 6; i++) {
      crew.workers.push({
        id: `src${i}`, name: `Src${i}`, role: "researcher", description: "Feeds",
        permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: [] },
        mcpServers: [], context: [], instructions: "Feed.",
        receivesFrom: [], emits: [`out-${i}.md`],
      });
      crew.workers[1]!.receivesFrom.push(`src${i}`);
    }
    expect(crewProblems(crew).join(" ")).toContain("[PA046]");
  });

  it("CREW-STANDARD-005: PA047 — a missing worker manifest path is flagged (folder standard)", () => {
    const crew = baseCrew();
    const problems = crewProblems(crew, { workerEntries: ["workers/ghost/worker.json"] });
    expect(problems.join(" ")).toContain("[PA047]");
    expect(problems.join(" ")).toContain("workers/ghost/worker.json");
  });

  it("CREW-STANDARD-006: shipped crews pass every subagent-standard check", () => {
    // Every catalog crew must be exemplary: manifest id matches the folder,
    // graph connects, permissions follow the subagent standards.
    const crewsDir = path.resolve("registry", "crews");
    const catalog = JSON.parse(fs.readFileSync(path.resolve("registry", "catalog.json"), "utf8")) as {
      items: Array<{ id: string; kind: string }>;
    };
    for (const item of catalog.items.filter((i) => i.kind !== "profile")) {
      const raw = fs.readFileSync(path.join(crewsDir, item.id, "manifest.json"), "utf8");
      expect(JSON.parse(raw).crew.id).toBe(item.id);
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-CATALOG — the shipped catalog as a dataset: every crew folder is real,
// registered, and its profile bindings resolve.
// ---------------------------------------------------------------------------

describe("CREW-CATALOG — shipped crews as a dataset", () => {
  interface CatalogEntry {
    id: string;
    kind: string;
    version: string;
    description: string;
    author: string;
    tags: string[];
  }

  const catalog = JSON.parse(
    fs.readFileSync(path.resolve("registry", "catalog.json"), "utf8"),
  ) as { items: CatalogEntry[] };
  const crewItems = catalog.items.filter((i) => i.kind !== "profile");
  const profileIds = new Set(catalog.items.filter((i) => i.kind === "profile").map((i) => i.id));

  it("CREW-CATALOG-001: every catalog crew has a folder-standard folder that hydrates and validates", async () => {
    expect(crewItems.length).toBeGreaterThanOrEqual(8);
    const { loadCrewFile } = await import("../../src/crew/hydrate.js");
    const { crewProblems, crewWarnings } = await import("../../src/crew/validate.js");
    for (const item of crewItems) {
      const crew = await loadCrewFile(path.resolve("registry", "crews", item.id, "manifest.json"));
      expect(crew.id).toBe(item.id);
      expect(crew.version).toBe(item.version);
      expect(crewProblems(crew)).toEqual([]);
      expect(crewWarnings(crew)).toEqual([]);
    }
  });

  it("CREW-CATALOG-002: every worker's profile binding resolves to a real catalog profile", async () => {
    const { loadCrewFile } = await import("../../src/crew/hydrate.js");
    for (const item of crewItems) {
      const crew = await loadCrewFile(path.resolve("registry", "crews", item.id, "manifest.json"));
      for (const w of crew.workers) {
        if (!w.profile) continue;
        // Crews may only bind profiles that exist in the registry — a
        // dangling slug would fail every install with a resolver error.
        expect(profileIds.has(w.profile)).toBe(true);
      }
    }
  });

  it("CREW-CATALOG-003: catalog index metadata stays consistent with the crew manifests", async () => {
    const { loadCrewFile } = await import("../../src/crew/hydrate.js");
    for (const item of crewItems) {
      const crew = await loadCrewFile(path.resolve("registry", "crews", item.id, "manifest.json"));
      expect(item.name).toBe(crew.name);
      expect(item.author).toBe(crew.author);
      expect(item.description).toBe(crew.description);
      expect(item.tags).toEqual(crew.tags);
      // Multi-worker crews are "crew", single-worker ones are "agent" —
      // mirroring publishCrew's derivation.
      expect(item.kind).toBe(crew.workers.length > 1 ? "crew" : "agent");
    }
  });

  it("CREW-CATALOG-004: catalog stays canonically sorted by id (publishCrew order)", () => {
    const ids = catalog.items.map((i) => i.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// CREW-PROFILE — workers referencing profile specs (profiles are the atoms)
// ---------------------------------------------------------------------------

describe("CREW-PROFILE — profile-backed workers", () => {
  const baseWorker = {
    id: "sec",
    name: "Security worker",
    role: "reviewer",
    description: "Reviews changes",
    permissions: { read: "repo" as const, write: "none" as const, production: "none" as const, secrets: "none" as const, tools: [] },
    mcpServers: [],
    context: [],
    receivesFrom: [],
    emits: [],
  };

  const securityProfile = {
    version: "1.0.0",
    profile: { name: "Security Engineer", slug: "security-engineer" },
    identity: { title: "Security Engineer", summary: "You operate as a security engineer." },
    expertise: ["application security"],
    tools: { required: ["filesystem", "shell", "git"] },
    verification: { required: ["tests"] },
    rules: ["Never expose secrets."],
    methods: ["threat-modeling"],
    standards: ["OWASP"],
  };

  it("CREW-PROFILE-001: profile-backed worker needs no hand-written instructions", () => {
    const crew = {
      id: "profiled", name: "Profiled", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, profile: "security-engineer" }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    expect(crewProblems(crew)).toEqual([]);
  });

  it("CREW-PROFILE-002: profile-less worker still requires instructions", () => {
    const crew = {
      id: "plain", name: "Plain", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    expect(crewProblems(crew).join(" ")).toContain("instructions are required");
  });

  it("CREW-PROFILE-003: install compiles profession sections from the resolved profile", async () => {
    const crew = {
      id: "profiled", name: "Profiled", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, profile: "security-engineer" }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-profile-"));
    const { installCrew } = await import("../../src/crew/install.js");
    const result = await installCrew(crew, root, async (slug) =>
      slug === "security-engineer" ? (securityProfile as never) : null,
    );
    const skill = fs.readFileSync(path.join(root, ".agents", "crews", "profiled", "workers", "sec", "SKILL.md"), "utf8");
    expect(skill).toContain("Profession:** Security Engineer v1.0.0");
    expect(skill).toContain("Never expose secrets.");
    expect(skill).toContain("threat-modeling");
    expect(skill).toContain("Operate as a Security Engineer");
    expect(result.filesWritten.length).toBeGreaterThan(0);
  });

  it("CREW-PROFILE-004: missing profile fails the install with an actionable error", async () => {
    const crew = {
      id: "profiled", name: "Profiled", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, profile: "no-such-profession" }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-profile-"));
    const { installCrew } = await import("../../src/crew/install.js");
    await expect(installCrew(crew, root, async () => null)).rejects.toThrow(/no-such-profession.*equip it first/s);
  });

  it("CREW-PROFILE-005: profile-less install path is unchanged (no resolver needed)", async () => {
    const crew = {
      id: "plain", name: "Plain", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, instructions: "Do the job." }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-profile-"));
    const { installCrew } = await import("../../src/crew/install.js");
    await installCrew(crew, root);
    const skill = fs.readFileSync(path.join(root, ".agents", "crews", "plain", "workers", "sec", "SKILL.md"), "utf8");
    expect(skill).toContain("Do the job.");
    expect(skill).not.toContain("Profession:**");
  });

  it("CREW-PROFILE-006: an empty profile slug is treated as no profile (instructions still required)", () => {
    const crew = {
      id: "empty-slug", name: "Empty", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, profile: "" }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
    expect(crewProblems(crew).join(" ")).toContain("instructions are required");
  });
});

// ---------------------------------------------------------------------------
// CREW-WARN — non-blocking warnings (the dogfood context-framework guard)
// ---------------------------------------------------------------------------

describe("CREW-WARN — crewWarnings (non-blocking findings)", () => {
  const baseWorker = {
    id: "sec", name: "Security worker", role: "reviewer", description: "Reviews changes",
    permissions: { read: "repo" as const, write: "none" as const, production: "none" as const, secrets: "none" as const, tools: [] },
    mcpServers: [], context: [] as unknown[], receivesFrom: [], emits: [],
  };

  function crewWithContext(framework: string): CrewDefinition {
    return {
      id: "warn-crew", name: "Warn", version: "1.0.0", description: "d", author: "a", tags: [],
      workers: [{ ...baseWorker, instructions: "Do the job.", context: [{ framework, scope: "src/**" }] }],
      mcpServers: [], handoffs: [], entryPoints: ["sec"],
      createdAt: "2026-01-01", updatedAt: "2026-01-01",
    } as unknown as CrewDefinition;
  }

  it("CREW-WARN-001: a non-builtin context.framework is lexically valid but warns (artifact leak shape)", () => {
    // The exact dogfood bug: an artifact name ("draft-docs") typed into the
    // framework field. Must NOT block (frameworks are extensible via adapters)
    // but must produce a warning naming the builtin alternatives.
    const crew = crewWithContext("draft-docs");
    expect(crewProblems(crew)).toEqual([]);
    const warnings = crewWarnings(crew);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("worker sec");
    expect(warnings[0]).toContain("draft-docs");
    expect(warnings[0]).toContain("filesystem");
    expect(warnings[0]).toContain("adapter");
  });

  it("CREW-WARN-002: builtin frameworks produce no warnings", () => {
    expect(crewWarnings(crewWithContext("filesystem"))).toEqual([]);
    expect(crewWarnings(crewWithContext("git"))).toEqual([]);
    expect(crewWarnings(crewWithContext("acc"))).toEqual([]);
  });

  it("CREW-WARN-003: crew validate --json surfaces warnings in the machine contract (additive pin)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-warn-"));
    const crew = crewWithContext("draft-docs");
    const file = path.join(root, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(crew));
    const { stdout } = cli(["crew", "validate", file, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.problems).toEqual([]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain("draft-docs");
  });
});
