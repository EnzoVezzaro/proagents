import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../helpers/run-cli.js";

/**
 * INSTALLED-CLI — JSON + exit-contract tests for the install lifecycle
 * commands:
 *   proagent list-installed   inventory of owned artifacts
 *   proagent doctor           verification findings (exit 0/1/2 like audit)
 *   proagent repair           deterministic recompile of single-profile
 *                             installs from on-disk canonical manifests
 *
 * CLI JSON output changes must be additive: these tests pin the shapes.
 */

function makeRepo(files: Record<string, string>): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "installed-cli-")).then(async (root) => {
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

function runFailing(root: string, args: string[]): { status: number; stdout: string } {
  try {
    runCli(root, args, { input: "" });
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "" };
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
}

describe("installed lifecycle CLI (INSTALLED-CLI)", () => {
  it("INSTALLED-CLI-001: list-installed on a fresh repo is an empty inventory", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      const parsed = JSON.parse(run(root, ["list-installed", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profiles).toEqual([]);
      expect(parsed.crews).toEqual([]);
      expect(parsed.blocks).toEqual([]);
      expect(parsed.summary).toEqual({ profiles: 0, crews: 0, blocks: 0 });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INSTALLED-CLI-002: doctor on a fresh repo exits 0 (clean)", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      const parsed = JSON.parse(run(root, ["doctor", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.summary).toEqual({ total: 0, errors: 0, warnings: 0 });
      expect(parsed.exit).toBe(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INSTALLED-CLI-003: equip then list-installed shows the profile; doctor is clean", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      run(root, ["install", "profile:senior-engineer", "--target", "codex", "--json"]);
      const parsed = JSON.parse(run(root, ["list-installed", "--json"]));
      expect(parsed.profiles.length).toBe(1);
      expect(parsed.profiles[0]).toMatchObject({ slug: "senior-engineer", hasSkill: true, hasManifest: true });

      const doctor = JSON.parse(run(root, ["doctor", "--json"]));
      expect(doctor.exit).toBe(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INSTALLED-CLI-004: doctor flags a deleted SKILL.md as an error (exit 2)", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      run(root, ["install", "profile:senior-engineer", "--target", "codex", "--json"]);
      await fs.rm(path.join(root, ".agents", "skills", "senior-engineer", "SKILL.md"));
      const res = runFailing(root, ["doctor", "--json"]);
      expect(res.status).toBe(2);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.findings.some((f: { code: string }) => f.code === "DG002")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INSTALLED-CLI-005: repair restores the missing skill and doctor returns to clean", async () => {
    const root = await makeRepo({ "AGENTS.md": "# app\n" });
    try {
      run(root, ["install", "profile:senior-engineer", "--target", "codex", "--json"]);
      await fs.rm(path.join(root, ".agents", "skills", "senior-engineer", "SKILL.md"));

      const repaired = JSON.parse(run(root, ["repair", "--json"]));
      expect(repaired.status).toBe("ok");
      expect(repaired.repaired.some((p: string) => p.endsWith("SKILL.md"))).toBe(true);

      const doctor = JSON.parse(run(root, ["doctor", "--json"]));
      expect(doctor.exit).toBe(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});