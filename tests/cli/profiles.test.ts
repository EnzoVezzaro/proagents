import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * PROFILES-CLI — JSON contracts for the profile commands (end-to-end).
 *
 * CLI JSON output changes must be additive: these tests pin the new shape
 * so the profile commands extend, never break, the machine contract.
 */

const CLI = path.resolve("dist/cli/index.js");

function makeRepo(files: Record<string, string>): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "profiles-cli-")).then(async (root) => {
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

describe("profile CLI (PROFILES-CLI)", () => {
  it("PROFILES-CLI-001: detect --json reports the detected harnesses", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# x\n" });
    try {
      const parsed = JSON.parse(run(root, ["detect", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.primary.id).toBe("claude-code");
      expect(parsed.harnesses.length).toBeGreaterThan(0);
      expect(parsed.primary.capabilities).toHaveProperty("projectInstructions");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-002: list --json enumerates profiles with slugs", async () => {
    const root = await makeRepo({});
    try {
      const parsed = JSON.parse(run(root, ["list", "--json"]));
      expect(parsed.status).toBe("ok");
      const slugs = parsed.profiles.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain("security-engineer");
      expect(slugs.length).toBeGreaterThanOrEqual(13);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-003: inspect <profile> --json returns the manifest", async () => {
    const root = await makeRepo({});
    try {
      const parsed = JSON.parse(run(root, ["inspect", "security-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profile.profile.slug).toBe("security-engineer");
      expect(parsed.profile.verification.required).toContain("security-scan");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-004: equip writes skill + instructions and reports files", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    try {
      const parsed = JSON.parse(run(root, ["equip", "senior-engineer", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profile).toEqual(["senior-engineer"]);
      const mechanisms = parsed.files.map((f: { mechanism: string }) => f.mechanism);
      expect(mechanisms).toContain("agent-skill");
      expect(mechanisms).toContain("project-instructions");

      const skill = await fs.readFile(path.join(root, ".agents", "skills", "senior-engineer", "SKILL.md"), "utf8");
      expect(skill).toContain("Senior Engineer");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-005: compile --target codex compiles explicitly", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    try {
      const parsed = JSON.parse(run(root, ["compile", "senior-engineer", "--target", "codex", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.target).toBe("codex");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-006: equip blocks with non-zero exit on a conflicting composition", async () => {
    const root = await makeRepo({});
    try {
      // Two marketplace profiles with contradictory rules → composition must block.
      await fs.mkdir(path.join(root, ".marketplace", "items", "conflict-a"), { recursive: true });
      await fs.mkdir(path.join(root, ".marketplace", "items", "conflict-b"), { recursive: true });
      const base = {
        version: "1.0.0",
        profile: { name: "A", slug: "conflict-a" },
        identity: { title: "A" },
        expertise: ["x"],
        tools: { required: ["shell"] },
        verification: { required: ["tests"] },
      };
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "conflict-a", "profile.json"),
        JSON.stringify({ ...base, rules: ["never deploy on friday"] }),
      );
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "conflict-b", "profile.json"),
        JSON.stringify({ ...base, profile: { name: "B", slug: "conflict-b" }, rules: ["deploy on friday"] }),
      );
      let failed = false;
      try {
        run(root, ["equip", "conflict-a", "conflict-b", "--json"]);
      } catch (err) {
        failed = true;
        const e = err as { status?: number; stdout?: string };
        expect(e.status).not.toBe(0);
        const parsed = JSON.parse(e.stdout ?? "{}");
        expect(parsed.status).toBe("blocked");
        expect(parsed.conflicts[0].code).toBe("PA022");
      }
      expect(failed).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-007: validate --profiles validates every profile", async () => {
    const root = await makeRepo({});
    try {
      const parsed = JSON.parse(run(root, ["validate", "--profiles", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.reports.length).toBeGreaterThanOrEqual(13);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-008: equip --dry-run writes nothing", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    try {
      const before = await fs.readdir(root);
      const parsed = JSON.parse(run(root, ["equip", "senior-engineer", "--dry-run", "--json"]));
      expect(parsed.dryRun).toBe(true);
      const after = await fs.readdir(root);
      expect(after.sort()).toEqual(before.sort());
      expect(await fs.readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("# App\n");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-009: profile validate gates a manifest file (CREW-CLI parity)", async () => {
    const root = await makeRepo({});
    try {
      await fs.mkdir(path.join(root, "profiles"), { recursive: true });
      const good = {
        version: "1.0.0",
        profile: { name: "G", slug: "good-profile" },
        identity: { title: "G" },
        expertise: ["x"],
        tools: { required: ["shell"] },
        verification: { required: ["tests"] },
      };
      await fs.writeFile(path.join(root, "profiles", "good.json"), JSON.stringify(good));
      const ok = JSON.parse(run(root, ["profile", "validate", path.join(root, "profiles", "good.json"), "--json"]));
      expect(ok.status).toBe("ok");
      expect(ok.slug).toBe("good-profile");

      const bad = { ...good, verification: { required: [] } };
      await fs.writeFile(path.join(root, "profiles", "bad.json"), JSON.stringify(bad));
      let failed = false;
      try {
        run(root, ["profile", "validate", path.join(root, "profiles", "bad.json"), "--json"]);
      } catch (err) {
        failed = true;
        const e = err as { status?: number; stdout?: string };
        expect(e.status).not.toBe(0);
        const parsed = JSON.parse(e.stdout ?? "{}");
        expect(parsed.status).toBe("invalid");
        expect(parsed.problems[0]).toContain("PA035");
      }
      expect(failed).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-CLI-010: profile install <id> equips from a local catalog item", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# x\n" });
    try {
      await fs.mkdir(path.join(root, ".marketplace", "items"), { recursive: true });
      const item = {
        version: "1.0.0",
        profile: { name: "Local M", slug: "marketplace-local" },
        identity: { title: "Local M" },
        expertise: ["x"],
        tools: { required: ["filesystem", "shell", "git"] },
        verification: { required: ["tests"] },
      };
      await fs.writeFile(path.join(root, ".marketplace", "items", "marketplace-local.json"), JSON.stringify(item));
      const parsed = JSON.parse(run(root, ["profile", "install", "marketplace-local", "--json"]));
      expect(parsed.status).toBe("ok");
      expect(parsed.profile).toEqual(["marketplace-local"]);
      expect(await fs.readFile(path.join(root, "CLAUDE.md"), "utf8")).toContain("Local M");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
