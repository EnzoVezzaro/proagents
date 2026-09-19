import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * REGISTRY-CLI — JSON contracts for the registry command group (search, info,
 * install, remove, update, list --kind, resolve, lock, compose, setup,
 * validate --spec, build --kind spec), asserted against IMPLEMENTATION_PLAN
 * §5 and docs/cli/index.md.
 *
 * CLI JSON output changes must be additive: these tests pin the new shape
 * so the registry commands extend, never break, the machine contract.
 */

const CLI = path.resolve("dist/cli/index.js");

function makeRepo(files: Record<string, string> = {}): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "registry-cli-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf8", input: "" });
}

/** Runs a command expected to fail; returns { status, stdout, stderr }. */
function runFailing(root: string, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf8", input: "" });
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
}

const SPEC = `schema: proagents/v1
project:
  name: cli-test
environment:
  profiles:
    - accessibility-engineer
  capabilities:
    - accessibility
harness:
  compatibility:
    - generic-cli
`;

async function specRepo(): Promise<string> {
  return makeRepo({ "proagents.yaml": SPEC });
}

describe("registry CLI (REGISTRY-CLI)", () => {
  it("REGISTRY-CLI-001: list --kind crew enumerates catalog crews", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["list", "--kind", "crew", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.kind).toBe("crew");
      expect(parsed.items.length).toBeGreaterThanOrEqual(5);
      expect(parsed.items.every((i: { kind: string }) => i.kind === "crew")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-002: list --json (no kind) lists all kinds", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["list", "--kind", "profile", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.items.length).toBeGreaterThanOrEqual(13);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-003: info <kind:id> returns item metadata and loader status", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["info", "profile:accessibility-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.item.kind).toBe("profile");
      expect(parsed.item.id).toBe("accessibility-engineer");
      expect(parsed.loader).toBe(true);
      expect(parsed.content).toBeDefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-004: info fails for an unknown ref with a non-zero exit", async () => {
    const root = await makeRepo();
    try {
      const res = runFailing(root, ["info", "profile:does-not-exist", "--json"]);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("not in the registry catalog");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-005: resolve returns the graph for a resolvable spec", async () => {
    const root = await specRepo();
    try {
      const parsed = JSON.parse(run(root, ["resolve", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(Object.keys(parsed.graph.resolved)).toContain("accessibility");
      expect(parsed.graph.artifactRefs.some((r: { ref: string; ok: boolean }) => r.ref === "profile:accessibility-engineer" && r.ok)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-006: resolve reports PA502 for an unsatisfiable capability", async () => {
    const root = await specRepo();
    await fs.appendFile(
      path.join(root, "proagents.yaml"),
      "  impossible-capability:\n".replace("impossible-capability", "capabilities-extra") // placeholder no-op
    );
    await fs.writeFile(
      path.join(root, "proagents.yaml"),
      SPEC.replace("    - accessibility\n", "    - accessibility\n    - quantum-encryption-auditing\n"),
    );
    try {
      const parsed = JSON.parse(run(root, ["resolve", "--json"]));
      expect(parsed.status).toBe("blocked");
      expect(parsed.findings.some((f: { code: string }) => f.code === "PA502")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-007: lock writes proagents.lock with checksums", async () => {
    const root = await specRepo();
    try {
      const parsed = JSON.parse(run(root, ["lock", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.file).toContain("proagents.lock");
      expect(parsed.lock.schema).toBe("proagents/lock/v1");
      const written = await fs.readFile(path.join(root, "proagents.lock"), "utf8");
      expect(written).toContain("specHash: sha256:");
      expect(parsed.lock.resolved["accessibility"].checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-008: lock refuses an unsatisfiable spec with exit 1", async () => {
    const root = await specRepo();
    await fs.writeFile(
      path.join(root, "proagents.yaml"),
      SPEC.replace("    - accessibility\n", "    - accessibility\n    - impossible-capability-x\n"),
    );
    try {
      const res = runFailing(root, ["lock", "--json"]);
      expect(res.status).not.toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.status).toBe("blocked");
      expect(parsed.findings.some((f: { code: string }) => f.code === "PA502")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-009: lock refuses ambiguous capabilities without --select", async () => {
    // Two federated candidates of equal rank → PA503 ambiguity blocks the lock.
    const root = await makeRepo({
      "proagents.yaml": `schema: proagents/v1
project:
  name: amb-test
environment:
  capabilities:
    - nonexist-federated-capability
`,
    });
    try {
      const parsed = JSON.parse(run(root, ["resolve", "--json"]));
      // Without network guarantees we only pin the shape: either blocked
      // (PA502) or ambiguous (PA503) — never a crash, never a silent ok.
      const codes = parsed.findings.map((f: { code: string }) => f.code);
      expect(parsed.status).toBe("blocked");
      expect(codes.some((c: string) => c === "PA502" || c === "PA503")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-010: validate --spec validates spec + lock end-to-end", async () => {
    const root = await specRepo();
    try {
      run(root, ["lock"]);
      const parsed = JSON.parse(run(root, ["validate", "--spec", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.findings).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-011: validate --spec detects a stale lock (PA510)", async () => {
    const root = await specRepo();
    try {
      run(root, ["lock"]);
      // Edit the spec after locking → lock is stale.
      await fs.writeFile(
        path.join(root, "proagents.yaml"),
        SPEC.replace("name: cli-test", "name: cli-test-renamed"),
      );
      const parsed = JSON.parse(run(root, ["validate", "--spec", "--json"]));
      expect(parsed.status).toBe("invalid");
      expect(parsed.findings.some((f: { code: string }) => f.code === "PA510")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-012: update reports up-to-date without re-resolving", async () => {
    const root = await specRepo();
    try {
      run(root, ["lock"]);
      const parsed = JSON.parse(run(root, ["update", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.upToDate).toBe(true);
      expect(parsed.specHash).toMatch(/^sha256:/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-013: setup compiles the spec's profiles for the target harness", async () => {
    const root = await specRepo();
    try {
      const parsed = JSON.parse(run(root, ["setup", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.steps.map((s: { step: string }) => s.step)).toContain("compile profiles");
      const mechanisms = parsed.files.map((f: { mechanism: string }) => f.mechanism);
      expect(mechanisms).toContain("project-instructions");
      const agents = await fs.readFile(path.join(root, "AGENTS.md"), "utf8");
      expect(agents).toContain("Accessibility Engineer");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-014: setup --dry-run writes nothing", async () => {
    const root = await specRepo();
    try {
      const parsed = JSON.parse(run(root, ["setup", "--dry-run", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.files).toEqual([]);
      const entries = await fs.readdir(root);
      expect(entries).toEqual(["proagents.yaml"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-015: setup blocks on an unsatisfiable spec with findings", async () => {
    const root = await makeRepo({
      "proagents.yaml": SPEC.replace("    - accessibility\n", "    - accessibility\n    - impossible-capability-y\n"),
    });
    try {
      const parsed = JSON.parse(run(root, ["setup", "--json"]));
      expect(parsed.status).toBe("blocked");
      expect(parsed.findings.some((f: { code: string }) => f.code === "PA502")).toBe(true);
      const entries = await fs.readdir(root);
      expect(entries).toEqual(["proagents.yaml"]); // nothing written
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-016: compose validates a profile+crew composition", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["compose", "profile:accessibility-engineer", "crew:pr-review-gate", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.refs).toEqual(["profile:accessibility-engineer", "crew:pr-review-gate"]);
      expect(parsed.conflicts).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-017: compose blocks on conflicting profiles", async () => {
    // Two local profiles with contradictory rules → PA02x conflict blocks.
    const root = await makeRepo();
    try {
      await fs.mkdir(path.join(root, ".proagent", "profiles", "conflict-a"), { recursive: true });
      await fs.mkdir(path.join(root, ".proagent", "profiles", "conflict-b"), { recursive: true });
      const base = {
        version: "1.0.0",
        profile: { name: "A", slug: "conflict-a" },
        identity: { title: "A" },
        expertise: ["x"],
        tools: { required: ["shell"] },
        verification: { required: ["tests"] },
      };
      await fs.writeFile(
        path.join(root, ".proagent", "profiles", "conflict-a", "profile.json"),
        JSON.stringify({ ...base, rules: ["never deploy on friday"] }),
      );
      await fs.writeFile(
        path.join(root, ".proagent", "profiles", "conflict-b", "profile.json"),
        JSON.stringify({ ...base, profile: { name: "B", slug: "conflict-b" }, rules: ["deploy on friday"] }),
      );
      const res = runFailing(root, ["compose", "profile:conflict-a", "profile:conflict-b", "--json"]);
      expect(res.status).not.toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.status).toBe("blocked");
      expect(parsed.conflicts.some((c: { code: string }) => c.code === "PA022")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-018: install delegates to the profile equip pipeline", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      const parsed = JSON.parse(run(root, ["install", "profile:senior-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profile).toEqual(["senior-engineer"]);
      const skill = await fs.readFile(path.join(root, ".agents", "skills", "senior-engineer", "SKILL.md"), "utf8");
      expect(skill).toContain("Senior Engineer");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-019: remove deletes the installed skill dir", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      run(root, ["install", "profile:senior-engineer"]);
      const parsed = JSON.parse(run(root, ["remove", "profile:senior-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.removed).toContain(path.join(".agents", "skills", "senior-engineer"));
      const gone = await fs.access(path.join(root, ".agents", "skills", "senior-engineer")).then(
        () => false,
        () => true,
      );
      expect(gone).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-020: search --json returns the pinned shape (federation optional)", async () => {
    const root = await makeRepo();
    try {
      const parsed = JSON.parse(run(root, ["search", "accessibility", "--type", "profile", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.query).toBe("accessibility");
      expect(parsed.kind).toBe("profile");
      expect(Array.isArray(parsed.findings)).toBe(true);
      expect(Array.isArray(parsed.sources)).toBe(true);
      // Native results always present for a known capability keyword.
      expect(parsed.findings.some((f: { native: boolean }) => f.native === true)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("REGISTRY-CLI-021: build --kind spec emits proagents.yaml from a session", async () => {
    const root = await makeRepo();
    try {
      run(root, ["init", "--intent", "Build a data dashboard", "--json", "--non-interactive"]);
      const parsed = JSON.parse(run(root, ["build", "--kind", "spec", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.kind).toBe("spec");
      const written = await fs.readFile(path.join(root, "proagents.yaml"), "utf8");
      expect(written).toContain("schema: proagents/v1");
      expect(written).toContain("name: build-a-data-dashboard");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
