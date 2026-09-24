/**
 * ADAPTERS — all-harness coverage: every harness compiles somewhere.
 *
 * Invariants under test:
 *  - the harness catalog covers every documented harness id
 *  - compileForAllHarnesses writes a complete per-harness artifact matrix
 *  - per-harness destinations are correct (copilot-instructions.md,
 *    .openclaude/skills, CLAUDE.md/AGENTS.md, .agents/skills)
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HARNESS_SPECS, compileForAllHarnesses } from "../../src/adapters/index.js";
import type { EffectiveProfile, ProfileManifest } from "../../src/profiles/types.js";

const ALL_IDS = ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "copilot", "openclaude", "freebuff", "generic-cli"];

function effectiveProfile(): EffectiveProfile {
  return {
    slugs: ["test-engineer"],
    identity: { title: "Test Engineer", summary: "Verify behavior with evidence." },
    expertise: ["test design"],
    methods: ["root-cause analysis"],
    rules: ["never weaken an assertion"],
    policies: [],
    standards: [],
    skills: [],
    knowledge: [],
    references: {},
    tools: { required: ["shell", "git"], optional: [], forbidden: [], mcp: [], packages: [] },
    verification: { required: ["tests pass"], optional: [] },
  };
}

function manifest(): ProfileManifest {
  return {
    version: "1.0.0",
    profile: { name: "Test Engineer", slug: "test-engineer" },
    identity: { title: "Test Engineer", summary: "Verify behavior with evidence." },
    expertise: [],
    methods: [],
    rules: [],
    standards: [],
    skills: [],
    tools: { required: [] },
    verification: { required: [], optional: [] },
  } as ProfileManifest;
}

describe("harness catalog coverage (ADAPT-ALL)", () => {
  it("ADAPT-ALL-001: the spec list covers every documented harness id", () => {
    const ids = HARNESS_SPECS.map((s) => s.id);
    for (const id of ALL_IDS) {
      if (id === "generic-cli") continue; // fallback, not a spec
      expect(ids).toContain(id);
    }
  });

  it("ADAPT-ALL-002: copilot targets .github/copilot-instructions.md, openclaude targets .openclaude/skills", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "adapters-all-"));
    try {
      const results = await compileForAllHarnesses(effectiveProfile(), manifest(), root);
      const byTarget = new Map(results.map((r) => [r.target, r]));
      expect(results).toHaveLength(HARNESS_SPECS.length);

      const copilot = byTarget.get("copilot")!;
      expect(copilot.files.map((f) => f.path)).toContain(path.join(".github", "copilot-instructions.md"));

      const openclaude = byTarget.get("openclaude")!;
      expect(openclaude.files.map((f) => f.path)).toContain(path.join(".openclaude", "skills", "test-engineer", "SKILL.md"));

      const claude = byTarget.get("claude-code")!;
      expect(claude.files.map((f) => f.path)).toContain("CLAUDE.md");
      expect(claude.files.map((f) => f.path)).toContain(path.join(".agents", "skills", "test-engineer", "SKILL.md"));

      const codex = byTarget.get("codex")!;
      expect(codex.files.map((f) => f.path)).toContain("AGENTS.md");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("ADAPT-ALL-003: skills without skillsDetail compile instead of crashing", async () => {
    // Regression for the build --all-targets crash: the CLI's synthetic
    // effective profile carries skills but no skillsDetail map.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "adapters-all-"));
    try {
      const profile: EffectiveProfile = {
        ...effectiveProfile(),
        skills: ["apt-frenzy", "patch-parading"],
      };
      const results = await compileForAllHarnesses(profile, manifest(), root);
      expect(results.length).toBeGreaterThan(0);
      const skill = await fs.readFile(path.join(root, ".agents", "skills", "test-engineer", "SKILL.md"), "utf8");
      expect(skill).toContain("apt-frenzy");
      expect(skill).toContain("patch-parading");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
