import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../helpers/run-cli.js";

/**
 * CLI-WORKFLOW — command + workflow conformance.
 *
 * Executes the CLI the way users and agents meet it:
 *  1. every top-level command answers — read-only commands succeed on a bare
 *     repo, state-dependent commands fail with guidance (never a stack trace);
 *  2. the workflows the shipped skill teaches run end-to-end: the equip
 *     quickstart, the progressive interview, the registry project flow
 *     (`proagents.yaml` → resolve/lock/setup) and the benchmark flow;
 *  3. `.agents/skills/proagent/SKILL.md` is Anthropic-spec-valid frontmatter
 *     with resolvable references, and every fenced `proagent` invocation it
 *     teaches replays green, in document order, with the skill's own
 *     "keep answering until READY" rule applied.
 */

const SKILL_DIR = path.resolve(".agents/skills/proagent");
const SKILL = path.join(SKILL_DIR, "SKILL.md");

function makeRepo(files: Record<string, string> = {}): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "cli-workflow-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

interface Spawn {
  status: number;
  stdout: string;
  stderr: string;
}

function spawn(root: string, args: string[]): Spawn {
  try {
    return { status: 0, stdout: runCli(root, args, { input: "" }), stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

const ANSWER = "Read-only reviewer; proposes patches as diffs, never pushes to production";

/** The skill's documented rule: NEEDS_INFORMATION → keep answering; READY → proceed. */
async function driveToReady(root: string): Promise<string> {
  let readiness = "";
  for (let i = 0; i < 10; i++) {
    const status = JSON.parse(spawn(root, ["status", "--json"]).stdout || "{}") as { readiness?: string };
    readiness = String(status.readiness ?? "");
    if (readiness === "READY") return readiness;
    const q = JSON.parse(spawn(root, ["question", "--json"]).stdout || "{}") as { questions?: Array<{ id: string }> };
    const first = q.questions?.[0];
    if (!first || spawn(root, ["answer", first.id, ANSWER, "--json"]).status !== 0) break;
  }
  return readiness;
}

describe("CLI workflow conformance (CLI-WORKFLOW)", () => {
  it(
    "CLI-WORKFLOW-001: every top-level command answers — read-only ok, state-dependent guided",
    async () => {
      const root = await makeRepo();
      try {
        const okWithoutState = [
          ["detect", "--json"], ["list", "--json"], ["validate", "--json"],
          ["benchmark", "list", "--json"], ["crew", "list", "--json"],
          ["profile", "list", "--json"], ["profile", "show", "security-engineer", "--json"],
          ["search", "security", "--json"], ["info", "profile:security-engineer", "--json"],
          ["compose", "profile:security-engineer", "--json"], ["setup", "--dry-run", "--json"],
          ["remove", "profile:security-engineer", "--json"],
          ["install", "profile:security-engineer", "--dry-run", "--json"],
          ["context", "frameworks", "--json"], ["help"], ["version"],
        ];
        for (const args of okWithoutState) {
          const r = spawn(root, args);
          expect({ args, status: r.status }).toEqual({ args, status: 0 });
        }

        const needSession = ["status", "question", "agents", "inspect", "discover", "spec", "build", "improve", "self-improve"];
        for (const cmd of needSession) {
          const r = spawn(root, [cmd, "--json"]);
          expect(r.status).not.toBe(0);
          expect(`${r.stdout}${r.stderr}`).toMatch(/No (active )?session/);
        }

        for (const cmd of [["resolve"], ["lock"], ["update"]]) {
          const r = spawn(root, [...cmd, "--json"]);
          expect(r.status).not.toBe(0);
          expect(`${r.stdout}${r.stderr}`).toContain("proagents.yaml");
        }

        // No command ever answers with a stack trace.
        const all = [...okWithoutState, ...needSession.map((c) => [c, "--json"]), ["resolve", "--json"]];
        for (const args of all) {
          const r = spawn(root, args);
          expect(`${r.stdout}${r.stderr}`).not.toMatch(/\n\s+at \w+ \(/);
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    30000,
  );

  it(
    "CLI-WORKFLOW-002: the equip quickstart runs end-to-end (skill Path 1)",
    async () => {
      const root = await makeRepo({ "CLAUDE.md": "# App\n" });
      try {
        expect(spawn(root, ["detect", "--json"]).status).toBe(0);

        const list = JSON.parse(spawn(root, ["list", "--json"]).stdout) as { profiles: Array<{ slug: string }> };
        expect(list.profiles.map((p) => p.slug)).toContain("security-engineer");

        const inspect = JSON.parse(spawn(root, ["inspect", "security-engineer", "--json"]).stdout);
        expect(inspect.profile.profile.slug).toBe("security-engineer");

        const dry = spawn(root, ["equip", "security-engineer", "--dry-run", "--json"]);
        expect(dry.status).toBe(0);
        await expect(fs.access(path.join(root, ".agents", "skills", "security-engineer"))).rejects.toThrow();

        const equip = spawn(root, ["equip", "security-engineer", "--json"]);
        expect(equip.status).toBe(0);
        await expect(fs.readFile(path.join(root, ".agents", "skills", "security-engineer", "SKILL.md"), "utf8")).resolves.toContain("Security Engineer");
        await expect(fs.readFile(path.join(root, ".agents", "skills", "security-engineer", "manifest.json"), "utf8")).resolves.toContain("security-engineer");

        const validate = JSON.parse(spawn(root, ["validate", "--profiles", "--json"]).stdout) as { reports: Array<{ ok: boolean }> };
        expect(validate.reports.every((r) => r.ok)).toBe(true);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    30000,
  );

  it(
    "CLI-WORKFLOW-003: the progressive interview reaches READY, specs, validates and builds (skill Path 2)",
    async () => {
      const root = await makeRepo();
      try {
        const init = spawn(root, ["init", "--intent", "An agent that reviews pull requests for security issues", "--non-interactive", "--json"]);
        expect(init.status).toBe(0);

        expect(await driveToReady(root)).toBe("READY");

        const spec = JSON.parse(spawn(root, ["spec", "--json"]).stdout) as {
          agents?: unknown[];
          sessionId?: string;
          runtime?: Record<string, unknown>;
        };
        expect(spec.agents?.length ?? 0).toBeGreaterThan(0);
        expect(spec.sessionId).toBeTruthy();
        expect(typeof spec.runtime?.toolUse).toBe("boolean");

        expect(spawn(root, ["validate", "--json"]).status).toBe(0);

        const build = JSON.parse(spawn(root, ["build", "--json"]).stdout) as {
          status: string;
          runtime?: { id?: string };
        };
        expect(build.status).toBe("ok");
        expect(build.runtime?.id).toBeTruthy();

        const agents = JSON.parse(spawn(root, ["agents", "--json"]).stdout) as Array<{ id?: string }>;
        expect(agents.length).toBeGreaterThan(0);

        // The generated layout matches what SKILL.md promises: SKILL.md +
        // references/permissions.md (normative) + agent.json (machine contract).
        const skillsDir = path.join(root, ".agents", "skills");
        const built: string[] = [];
        for (const dir of await fs.readdir(skillsDir)) {
          try {
            await fs.access(path.join(skillsDir, dir, "agent.json"));
            built.push(dir);
          } catch {
            // not a built agent skill
          }
        }
        expect(built.length).toBeGreaterThan(0);
        await expect(fs.access(path.join(skillsDir, built[0], "references", "permissions.md"))).resolves.toBeUndefined();
        await expect(fs.access(path.join(skillsDir, built[0], "SKILL.md"))).resolves.toBeUndefined();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    60000,
  );

  it(
    "CLI-WORKFLOW-004: the registry project flow works end-to-end (spec → resolve → lock → validate → setup)",
    async () => {
      const root = await makeRepo();
      try {
        expect(spawn(root, ["init", "--intent", "An agent that reviews pull requests for security issues", "--non-interactive", "--json"]).status).toBe(0);
        expect(spawn(root, ["build", "--kind", "spec", "--json"]).status).toBe(0);
        await expect(fs.readFile(path.join(root, "proagents.yaml"), "utf8")).resolves.toContain("proagents/v1");

        expect(spawn(root, ["resolve", "--json"]).status).toBe(0);
        expect(spawn(root, ["lock", "--json"]).status).toBe(0);
        await expect(fs.access(path.join(root, "proagents.lock"))).resolves.toBeUndefined();
        expect(spawn(root, ["validate", "--spec", "--json"]).status).toBe(0);
        expect(spawn(root, ["setup", "--dry-run", "--json"]).status).toBe(0);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    30000,
  );

  it("CLI-WORKFLOW-005: the benchmark flow lists and validates shipped suites", async () => {
    // Shipped suites are project-local (`.agents/benchmarks/`) — same as CI runs it.
    const repo = process.cwd();
    const list = JSON.parse(spawn(repo, ["benchmark", "list", "--json"]).stdout) as { benchmarks?: Array<{ id: string }> };
    expect((list.benchmarks ?? []).map((s) => s.id)).toContain("privacy-guardrails");
    expect(spawn(repo, ["benchmark", "validate", "privacy-guardrails", "--json"]).status).toBe(0);
  });

  it("CLI-WORKFLOW-006: SKILL.md frontmatter is Anthropic-spec-valid and its references exist", async () => {
    const text = await fs.readFile(SKILL, "utf8");
    const fm = /^---\n([\s\S]*?)\n---/.exec(text);
    expect(fm).toBeDefined();
    const name = /^name:\s*(.+)$/m.exec(fm?.[1] ?? "")?.[1]?.trim() ?? "";
    const desc = /^description:\s*([\s\S]+)$/m.exec(fm?.[1] ?? "")?.[1]?.trim() ?? "";
    expect(name).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(1024);
    expect(desc).toMatch(/[Ww]hen the user/);

    // References the skill itself ships (the `## References` section) must exist.
    // (Body prose may also mention `references/…` files that `proagent build`
    // generates into the consumer's repo — those are not this skill's files.)
    const referencesSection = /## References\s*([\s\S]*?)(?:\n## |$)/.exec(text)?.[1] ?? "";
    const referenced = [...referencesSection.matchAll(/`(references\/[a-z-]+\.md)`/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThanOrEqual(5);
    for (const rel of referenced) {
      await expect(fs.access(path.join(SKILL_DIR, rel))).resolves.toBeUndefined();
    }
  });

  it(
    "CLI-WORKFLOW-007: every fenced proagent invocation SKILL.md teaches replays green, in document order",
    async () => {
      const text = await fs.readFile(SKILL, "utf8");
      const lines: string[] = [];
      let inFence = false;
      for (const raw of text.split("\n")) {
        if (raw.startsWith("```")) {
          inFence = !inFence;
          continue;
        }
        if (inFence && /\bproagent\b/.test(raw)) lines.push(raw);
      }
      expect(lines.length).toBeGreaterThanOrEqual(15);

      const invocations: string[][] = [];
      for (const raw of lines) {
        let line = raw.replace(/^\s*→\s*/, "").replace(/\s*→.*$/, "");
        line = line.replace(/\s*#[^"]*$/, "").trim();
        if (!line.startsWith("proagent")) continue;
        const spec = /^proagent\s+spec\/validate\/build$/.test(line);
        if (spec) {
          invocations.push(["spec"], ["validate"], ["build"]);
          continue;
        }
        const tokens: string[] = [];
        for (const m of line.matchAll(/"([^"]*)"|(\S+)/g)) {
          const token = m[1] ?? m[2];
          if (!token || token === "…" || token === "…" ) continue;
          tokens.push(token);
        }
        const substituted = tokens.slice(1).flatMap((t) => {
          if (t === "[slug…]") return [];
          if (t === "<slug>") return ["security-engineer"];
          if (t === "<task>") return ["deployment flow"];
          if (t === "..." || t === "\"...\"") return [ANSWER];
          if (/^<.*>$/.test(t)) return ["An agent that reviews pull requests for security issues"];
          return [t];
        });
        if (substituted.length > 0) invocations.push(substituted);
      }
      expect(invocations.length).toBeGreaterThanOrEqual(20);

      const root = await makeRepo();
      try {
        for (const args of invocations) {
          const cmd = args[0];
          if (cmd === "spec" || cmd === "build") {
            if (spawn(root, ["status", "--json"]).status === 0) expect(await driveToReady(root)).toBe("READY");
          }
          const r = spawn(root, args);
          expect({ args, status: r.status }).toEqual({ args, status: 0 });
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
    60000,
  );
});
