import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectHarnesses, compileForHarness } from "../../src/adapters/index.js";
import { composeProfiles } from "../../src/profiles/composition.js";
import { resolveProfiles } from "../../src/profiles/registry.js";
import type { EffectiveProfile, ProfileManifest } from "../../src/profiles/types.js";

/**
 * ADAPTERS — harness detection and profile compilation.
 *
 * Invariants under test:
 *  - detection is filesystem-driven, deterministic, provider-agnostic
 *  - compilation output is deterministic for identical repo state
 *  - limitations are reported honestly, never papered over
 */

function makeRepo(files: Record<string, string>): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "adapters-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

async function loadEffective(slug: string): Promise<{ effective: EffectiveProfile; manifest: ProfileManifest }> {
  const [entry] = await resolveProfiles([slug]);
  if (!entry) throw new Error(`profile not found: ${slug}`);
  const { effective } = composeProfiles([entry.manifest]);
  return { effective, manifest: entry.manifest };
}

describe("harness detection (ADAPT-DETECT)", () => {
  it("ADAPT-DETECT-001: falls back to generic-cli outside any harness layout", async () => {
    const root = await makeRepo({});
    const detected = await detectHarnesses(root, {});
    expect(detected.primary.id).toBe("generic-cli");
  });

  it("ADAPT-DETECT-002: detects Claude Code from layout evidence", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# instructions\n", ".mcp.json": "{}\n" });
    const detected = await detectHarnesses(root, {});
    expect(detected.all.map((h) => h.id)).toContain("claude-code");
    const cc = detected.all.find((h) => h.id === "claude-code")!;
    expect(cc.evidence).toContain("CLAUDE.md");
  });

  it("ADAPT-DETECT-003: env signals promote a harness to primary", async () => {
    const root = await makeRepo({ "AGENTS.md": "# x\n" });
    const detected = await detectHarnesses(root, { CLAUDE_CODE_ENTRYPOINT: "cli" });
    expect(detected.primary.id).toBe("claude-code");
  });

  it("ADAPT-DETECT-004: detection is deterministic", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# x\n", "opencode.json": "{}" });
    const a = await detectHarnesses(root, {});
    const b = await detectHarnesses(root, {});
    expect(a).toEqual(b);
  });
});

describe("profile compilation (ADAPT-COMPILE)", () => {
  it("ADAPT-COMPILE-001: compiles into skills + instructions for Claude Code layout", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# My project\n" });
    const { effective, manifest } = await loadEffective("security-engineer");
    const detected = await detectHarnesses(root, {});
    const result = await compileForHarness(effective, manifest, detected.primary, root);

    const mechanisms = result.files.map((f) => f.mechanism);
    expect(mechanisms).toContain("agent-skill");
    expect(mechanisms).toContain("project-instructions");
    expect(mechanisms).toContain("rule-enforcement");

    const skill = await fs.readFile(path.join(root, ".agents", "skills", "security-engineer", "SKILL.md"), "utf8");
    expect(skill).toContain("Security Engineer");
    expect(skill).toContain("threat-modeling");

    const claudeMd = await fs.readFile(path.join(root, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("# My project"); // preserved
    expect(claudeMd).toContain("proagent:profile:start");
    expect(claudeMd).toContain("never expose secrets");
  });

  it("ADAPT-COMPILE-002: re-compiling replaces the marked block instead of duplicating it", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    const { effective, manifest } = await loadEffective("senior-engineer");
    const detected = await detectHarnesses(root, {});
    await compileForHarness(effective, manifest, detected.primary, root);
    await compileForHarness(effective, manifest, detected.primary, root);
    const agentsMd = await fs.readFile(path.join(root, "AGENTS.md"), "utf8");
    expect(agentsMd.match(/proagent:profile:start/g)?.length).toBe(1);
  });

  it("ADAPT-COMPILE-003: output is deterministic for identical inputs", async () => {
    const rootA = await makeRepo({ "CLAUDE.md": "# Same\n" });
    const rootB = await makeRepo({ "CLAUDE.md": "# Same\n" });
    const { effective, manifest } = await loadEffective("senior-engineer");
    const detectedA = await detectHarnesses(rootA, {});
    const detectedB = await detectHarnesses(rootB, {});
    const a = await compileForHarness(effective, manifest, detectedA.primary, rootA);
    const b = await compileForHarness(effective, manifest, detectedB.primary, rootB);
    expect(a.files.map((f) => f.path)).toEqual(b.files.map((f) => f.path));
    const skillA = await fs.readFile(path.join(rootA, ".agents", "skills", "senior-engineer", "SKILL.md"), "utf8");
    const skillB = await fs.readFile(path.join(rootB, ".agents", "skills", "senior-engineer", "SKILL.md"), "utf8");
    expect(skillA).toEqual(skillB);
  });

  it("ADAPT-COMPILE-004: generic-cli target reports limitations instead of pretending", async () => {
    const root = await makeRepo({});
    const { effective, manifest } = await loadEffective("security-engineer");
    const detected = await detectHarnesses(root, {});
    const result = await compileForHarness(effective, manifest, detected.primary, root);
    expect(result.target).toBe("generic-cli");
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.join(" ")).toMatch(/skills directory|rule enforcement/i);
  });
});
