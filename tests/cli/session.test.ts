import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../helpers/run-cli.js";

/**
 * SESSION-CLI — JSON contracts for the agent-building session commands
 * (`status`, `question`, `answer`, `context`, `spec`, `validate`, `build`,
 * `agents`, `inspect`, `improve`/`self-improve`), asserted against the
 * documented behavior in docs/cli/index.md and docs/cli/json.md.
 *
 * CLI JSON output changes must be additive: these tests pin the documented
 * shape so the session commands extend, never break, the machine contract.
 */

function makeRepo(files: Record<string, string> = {}): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "session-cli-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

function run(root: string, args: string[]): string {
  return runCli(root, args, { input: "" });
}

/** Runs a command expected to fail; returns { status, stdout, stderr }. */
function runFailing(root: string, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    runCli(root, args, { input: "" });
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
}

const INTENT = "An agent that reviews pull requests for security issues and comments on the PR";

async function seedSession(root: string, intent = INTENT): Promise<void> {
  run(root, ["init", "--intent", intent, "--json", "--non-interactive"]);
}

/** A minimal, schema-valid AgentSpec for file-based validate tests. */
function agentSpec(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    role: "review",
    purpose: "review changes",
    scope: "the repository",
    responsibilities: [],
    nonGoals: [],
    inputs: [],
    outputs: [],
    tools: [],
    skills: [],
    context: { framework: "builtin", scopes: [] },
    permissions: { read: [], write: [], execute: [], network: [], secrets: [], production: "none", humanApproval: [] },
    constraints: [],
    escalation: [],
    validation: [],
    dependencies: [],
    provenance: { sessionId: "test", derivedFromFacts: [], derivedFromQuestions: [] },
    ...overrides,
  };
}

function writeArch(root: string, name: string, arch: unknown): Promise<string> {
  const file = path.join(root, name);
  return fs.writeFile(file, JSON.stringify(arch)).then(() => file);
}

describe("session CLI (SESSION-CLI)", () => {
  it("SESSION-CLI-001: init without intent returns the documented needs_input contract (non-zero exit)", async () => {
    const root = await makeRepo();
    try {
      // JSON on stdout for the machine, usage guidance on stderr and a
      // non-zero exit for CI/scripts (docs/cli/json.md § init).
      const { status, stdout, stderr } = runFailing(root, ["init", "--json"]);
      expect(status).not.toBe(0);
      expect(JSON.parse(stdout)).toEqual({ status: "needs_input", error: "intent_required" });
      expect(stderr).toContain("--intent");
      // No session may be created by a failed init.
      await expect(fs.access(path.join(root, ".proagent", "session.json"))).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-002: status --json returns the persisted knowledge state", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["status", "--json"]));
      expect(parsed.version).toBe(1);
      expect(parsed.intent).toBe(INTENT);
      expect(parsed.sessionId).toBeTruthy();
      expect(parsed.facts.length).toBeGreaterThan(0);
      expect(typeof parsed.confidence).toBe("number");
      expect(parsed.readiness).toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-003: status without a session fails with usage guidance on stderr", async () => {
    const root = await makeRepo();
    try {
      const { status, stderr, stdout } = runFailing(root, ["status", "--json"]);
      expect(status).not.toBe(0);
      expect(stderr).toContain("init");
      expect(stdout).toBe("");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-004: question --json returns the documented question shape", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["question", "--json"]));
      expect(parsed.status).toBe("needs_input");
      expect(parsed.questions.length).toBeGreaterThan(0);
      for (const q of parsed.questions) {
        expect(typeof q.id).toBe("string");
        expect(typeof q.question).toBe("string");
        expect(typeof q.reason).toBe("string");
        expect(typeof q.impact).toBe("string");
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-005: question --all returns every open question in both modes", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const all = JSON.parse(run(root, ["question", "--all", "--json"]));
      const first = JSON.parse(run(root, ["question", "--json"]));
      expect(all.questions.length).toBeGreaterThanOrEqual(first.questions.length);
      // Non-JSON mode: one rendered block per open question (the block
      // headers are "Question N/M"; split on the marker the renderer emits).
      const rendered = run(root, ["question", "--all"]);
      const blocks = (rendered.match(/◇ Question \d+\//g) ?? []).length;
      expect(blocks).toBe(all.questions.length);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-006: answer --json follows the documented contract", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["answer", "q_001", "Node.js services in AWS production and staging", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.answered).toBe("q_001");
      expect(typeof parsed.confidence).toBe("number");
      expect(parsed.readiness).toBeTruthy();
      expect(Array.isArray(parsed.contradictions)).toBe(true);
      expect(Array.isArray(parsed.nextQuestions)).toBe(true);
      expect(parsed.nextQuestions.length).toBeGreaterThan(0);
      // The answer was persisted (facts are normalized to lower-case).
      const session = JSON.parse(await fs.readFile(path.join(root, ".proagent", "session.json"), "utf8")) as {
        facts: Array<{ statement: string; source: string }>;
      };
      const answered = session.facts.filter((f) => f.source === "q_001").map((f) => f.statement).join(" ");
      expect(answered).toContain("node js services in aws production");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-007: contradictory answers surface an open contradiction (CONFLICTING_REQUIREMENTS)", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root, "An agent that manages our deployment pipeline");
      run(root, ["answer", "q_001", "It must have read-only production access"]);
      const parsed = JSON.parse(run(root, ["answer", "q_002", "It can automatically restart production deployments without approval", "--json"]));
      expect(parsed.readiness).toBe("CONFLICTING_REQUIREMENTS");
      const open = parsed.contradictions.filter((c: { status?: string }) => c.status === "open");
      expect(open.length).toBeGreaterThan(0);
      expect(open[0].a.statement).toBeTruthy();
      expect(open[0].b.statement).toBeTruthy();
      // The resolution question is offered next.
      expect(parsed.nextQuestions.map((q: { id: string }) => q.id).join(" ")).toContain("resolve");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-008: answer without arguments fails with usage guidance", async () => {
    const root = await makeRepo();
    try {
      const { status, stderr } = runFailing(root, ["answer", "--json"]);
      expect(status).not.toBe(0);
      expect(stderr).toContain("Usage");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-009: context --json returns framework results with provenance-tagged snippets", async () => {
    const root = await makeRepo({
      "src/auth/session.ts": "export const session = {};\n",
    });
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["context", "auth session", "--json"]));
      expect(Array.isArray(parsed)).toBe(true);
      const fw = parsed[0];
      expect(fw.framework).toBe("filesystem");
      expect(fw.snippets.length).toBeGreaterThan(0);
      for (const s of fw.snippets) {
        expect(typeof s.path).toBe("string");
        expect(typeof s.text).toBe("string");
        expect(typeof s.reason).toBe("string");
        expect(typeof s.confidence).toBe("number");
        expect(Array.isArray(s.provenance)).toBe(true);
      }
      expect(fw.truncated).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-010: context frameworks --json lists the builtin filesystem framework", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["context", "frameworks", "--json"]));
      expect(Array.isArray(parsed)).toBe(true);
      const builtin = parsed.find((f: { name: string }) => f.name === "filesystem");
      expect(builtin.origin).toBe("builtin");
      expect(typeof builtin.description).toBe("string");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-011: spec --json returns the full AgentArchitecture", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const arch = JSON.parse(run(root, ["spec", "--json"]));
      expect(arch.version).toBe(1);
      expect(Array.isArray(arch.agents)).toBe(true);
      expect(arch.agents.length).toBeGreaterThan(0);
      expect(Array.isArray(arch.edges)).toBe(true);
      expect(arch.decision).toBeTruthy();
      for (const a of arch.agents) {
        expect(a.id).toBeTruthy();
        expect(a.context).toHaveProperty("framework");
        expect(a.permissions).toHaveProperty("production");
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-012: validate --json returns the documented report and ok=true for a fresh session", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["validate", "--json"]));
      expect(parsed.ok).toBe(true);
      expect(parsed.errors).toBe(0);
      expect(Array.isArray(parsed.findings)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-013: validate <file> validates that file even with a live session (PA001)", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root); // session architecture is valid
      const dup = await writeArch(root, "dup.json", {
        version: 1,
        agents: [agentSpec("a"), agentSpec("a")],
        edges: [],
      });
      const { status, stdout } = runFailing(root, ["validate", dup, "--json"]);
      expect(status).not.toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.errors).toBeGreaterThan(0);
      expect(parsed.findings.map((f: { code: string }) => f.code)).toContain("PA001");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-014: validate flags production write without approval as PA009 and exits non-zero", async () => {
    const root = await makeRepo();
    try {
      const unsafe = await writeArch(root, "unsafe.json", {
        version: 1,
        agents: [
          agentSpec("w", { permissions: { read: [], write: [], execute: [], network: [], secrets: [], production: "write", humanApproval: [] } }),
        ],
        edges: [],
      });
      const { status, stdout } = runFailing(root, ["validate", unsafe, "--json"]);
      expect(status).not.toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.findings.map((f: { code: string }) => f.code)).toContain("PA009");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-015: validate without a session falls back to profile validation (equip quickstart)", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["validate", "--json"]));
      expect(parsed.command).toBe("validate");
      expect(Array.isArray(parsed.reports)).toBe(true);
      expect(parsed.reports.length).toBeGreaterThanOrEqual(13);
      expect(parsed.reports.every((r: { ok: boolean }) => r.ok)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-016: build --json generates the documented contract and the deployable layout", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["build", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.runtime).toHaveProperty("id");
      expect(parsed.runtime).toHaveProperty("gaps");
      expect(parsed.agents.length).toBeGreaterThan(0);
      for (const file of parsed.agents) {
        expect(file).toMatch(/SKILL\.md$/);
        const skill = await fs.readFile(path.join(root, file), "utf8");
        expect(skill).toContain("agent.json"); // the machine contract is referenced
        const dir = path.dirname(path.join(root, file));
        await fs.access(path.join(dir, "agent.json"));
        await fs.access(path.join(dir, "references", "permissions.md"));
        await fs.access(path.join(dir, "references", "escalation.md"));
      }
      await fs.access(path.join(root, parsed.architecture));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-017: build --agent <id> emits only that agent", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const arch = JSON.parse(run(root, ["agents", "--json"]));
      const target = arch[0].id;
      const parsed = JSON.parse(run(root, ["build", "--agent", target, "--json"]));
      expect(parsed.agents.length).toBe(1);
      expect(parsed.agents[0]).toContain(target);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-018: agents --json lists the architecture agents", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["agents", "--json"]));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      for (const a of parsed) {
        expect(typeof a.id).toBe("string");
        expect(typeof a.role).toBe("string");
        expect(typeof a.purpose).toBe("string");
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-019: inspect --json dumps everything needed for a programmatic resume", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["inspect", "--json"]));
      expect(parsed.state.intent).toBe(INTENT);
      expect(Array.isArray(parsed.architecture.agents)).toBe(true);
      expect(parsed.runtime).toHaveProperty("runtimeId");
      // The state round-trips: re-init is not required to keep working.
      const status = JSON.parse(run(root, ["status", "--json"]));
      expect(status.sessionId).toBe(parsed.state.sessionId);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-020: inspect <profile> still inspects profiles while a session exists", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["inspect", "security-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profile.profile.slug).toBe("security-engineer");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-021: improve --json reports the self-improvement policy", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["improve", "--json"]));
      expect(parsed.enabled).toBe(false);
      expect(parsed.frequency).toBe("manual");
      expect(parsed.mode).toBe("propose");
      expect(Array.isArray(parsed.protected)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-022: self-improve --schedule weekly persists and improve reflects it", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      run(root, ["self-improve", "--schedule", "weekly", "--json"]);
      const parsed = JSON.parse(run(root, ["improve", "--json"]));
      expect(parsed.enabled).toBe(true);
      expect(parsed.frequency).toBe("weekly");
      // Protected subjects are always part of the policy once scheduled.
      expect(parsed.protected.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-023: version / --version print the semver", () => {
    const root = "."; // version needs no repo
    expect(run(root, ["version"]).trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(run(root, ["--version"]).trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("SESSION-CLI-024: unknown commands fail with exit 1 and machine-usable stderr", async () => {
    const root = await makeRepo();
    try {
      const { status, stderr } = runFailing(root, ["definitely-not-a-command"]);
      expect(status).toBe(1);
      expect(stderr).toContain("unknown command: definitely-not-a-command");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-025: build --kind profile materializes the session as an equippable profile", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["build", "--kind", "profile", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.kind).toBe("profile");
      const dir = path.join(root, ".proagent", "profiles", parsed.slug);
      expect(await fs.readFile(path.join(dir, "manifest.json"), "utf8")).toContain(parsed.slug);
      // PA-gated: the scaffold passes profileProblems, so equip works now.
      const equip = JSON.parse(run(root, ["equip", parsed.slug, "--json"]));
      expect(equip.status).toBe("ok");
      expect(equip.profile).toContain(parsed.slug);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("SESSION-CLI-026: build --kind crew materializes the session as an installable crew", async () => {
    const root = await makeRepo();
    try {
      await seedSession(root);
      const parsed = JSON.parse(run(root, ["build", "--kind", "crew", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.kind).toBe("crew");
      const dir = path.join(root, ".proagent", "crews", parsed.crewId);
      await fs.access(path.join(dir, "manifest.json"));
      await fs.access(path.join(dir, "members"));
      // The derived crew passes the PA043–PA048 gate.
      const gate = JSON.parse(run(root, ["crew", "validate", dir, "--json"]));
      expect(gate.status).toBe("ok");
      // And installs without a profile resolver hit (members are profile-less).
      const built = JSON.parse(run(root, ["crew", "build", path.join(dir, "manifest.json"), "--json"]));
      expect(built.status).toBe("ok");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
