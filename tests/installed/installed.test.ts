import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import type { EffectiveProfile, ProfileManifest } from "../../src/profiles/types.js";
import { compileForHarness, detectHarnesses, HARNESS_SPECS } from "../../src/adapters/index.js";
import type { HarnessId, HarnessSignal } from "../../src/adapters/index.js";
import { runDoctor, runRepair, scanInstalled } from "../../src/installed/index.js";

/**
 * INSTALLED — install lifecycle provenance (Tier 1 #5).
 *
 * list-installed / doctor / repair verify what ProAgents owns in a repo:
 *   - .agents/skills/<dir>/manifest.json = the owner marker of a profile install
 *   - instruction blocks (proagent:profile:start/end markers) = present-once,
 *     balanced, and paired to an installed profile title
 *   - enforcement surfaces (.claude/settings.json, .mcp.json) stay parseable
 *
 * Doctor exit contract mirrors audit: 0 clean · 1 warnings · 2 errors.
 * Repair recompiles single-profile installs from the on-disk canonical
 * manifest and reports composed installs (dir != manifest.profile.slug) as
 * limitations — those cannot be reconstructed from a single stored manifest.
 */

function makeRepo(): Promise<string> {
  return fs.mkdtemp(path.join(import.meta.dirname, "..", "..", "tmp-installed-"));
}

function cleanup(root: string): Promise<void> {
  return fs.rm(root, { recursive: true, force: true });
}

function signal(id: HarnessId): HarnessSignal {
  const spec = HARNESS_SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`no spec for ${id}`);
  return { id, name: spec.name, capabilities: { ...spec.capabilities }, evidence: ["test"] };
}

function profile(slug: string, title: string): { effective: EffectiveProfile; manifest: ProfileManifest } {
  const ruleEnforcement = [
    { rule: "never force-push to main", enforcement: { bash: ["git push --force*"], tools: [], paths: [] } },
  ];
  const effective: EffectiveProfile = {
    slugs: [slug],
    identity: { title, summary: "" },
    expertise: ["root cause"],
    knowledge: [],
    methods: [],
    skills: [],
    skillsDetail: {},
    rules: ["never force-push to main"],
    ruleEnforcement,
    policies: [],
    standards: [],
    references: {},
    tools: { required: ["shell"], optional: [], forbidden: [], mcp: [], packages: [] },
    verification: { required: ["tests pass"], optional: [] },
  };
  const manifest: ProfileManifest = {
    version: "1.0.0",
    profile: { name: title, slug },
    identity: { title, summary: "" },
    expertise: [],
    methods: [],
    rules: [],
    standards: [],
    skills: [],
    tools: { required: [] },
    verification: { required: [], optional: [] },
  };
  return { effective, manifest };
}

async function installProfile(root: string, id: HarnessId, { slug, title } = { slug: "fixture", title: "Fixture" }): Promise<void> {
  const { effective, manifest } = profile(slug, title);
  await compileForHarness(effective, manifest, signal(id), root, {});
}

describe("installed provenance (INSTALLED)", () => {
  it("INSTALLED-001: fresh repo scans clean (no profiles, no blocks, exit 0)", async () => {
    const root = await makeRepo();
    try {
      const detected = await detectHarnesses(root, {});
      const inv = await scanInstalled(root, detected);
      expect(inv.profiles).toEqual([]);
      expect(inv.blocks).toEqual([]);
      expect(inv.crews).toEqual([]);
      const report = await runDoctor(root, detected);
      expect(report.summary).toEqual({ total: 0, errors: 0, warnings: 0 });
      expect(report.exit).toBe(0);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-002: compiled install lists one profile + one balanced block", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      const detected = await detectHarnesses(root, {});
      const inv = await scanInstalled(root, detected);
      expect(inv.profiles).toHaveLength(1);
      expect(inv.profiles[0]).toMatchObject({ slug: "fixture", hasManifest: true, hasSkill: true });
      expect(inv.blocks).toHaveLength(1);
      expect(inv.blocks[0]).toMatchObject({ file: "AGENTS.md" });

      const report = await runDoctor(root, detected);
      expect(report.exit).toBe(0);
      expect(report.findings).toEqual([]);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-003: missing SKILL.md beside manifest is an error (DG002)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      await fs.rm(path.join(root, ".agents", "skills", "fixture", "SKILL.md"));
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(2);
      expect(report.findings.some((f) => f.code === "DG002")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-004: unreadable manifest.json is an error (DG001)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      await fs.writeFile(path.join(root, ".agents", "skills", "fixture", "manifest.json"), "{broken", "utf8");
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(2);
      expect(report.findings.some((f) => f.code === "DG001")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-005: duplicate instruction block regions are an error (DG004)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      const agents = path.join(root, "AGENTS.md");
      const body = await fs.readFile(agents, "utf8");
      await fs.writeFile(agents, `${body}\n${body}`, "utf8");
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(2);
      expect(report.findings.some((f) => f.code === "DG004")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-006: unbalanced block markers are an error (DG003)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      const agents = path.join(root, "AGENTS.md");
      const body = await fs.readFile(agents, "utf8");
      const stripped = body.replace(/<!-- proagent:profile:end [0-9a-f]+ -->/, "");
      await fs.writeFile(agents, stripped, "utf8");
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(2);
      expect(report.findings.some((f) => f.code === "DG003")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-007: stale instruction block with no installed profile title is a warning (DG005)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      // Remove the skill dir (simulates `remove` leaving the block behind).
      await fs.rm(path.join(root, ".agents", "skills", "fixture"), { recursive: true, force: true });
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(1);
      expect(report.findings.some((f) => f.code === "DG005")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-008: invalid .claude/settings.json is a warning (DG006)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "claude-code");
      await fs.writeFile(path.join(root, ".claude", "settings.json"), "{not-json", "utf8");
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(1);
      expect(report.findings.some((f) => f.code === "DG006")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-009: invalid .mcp.json is a warning (DG007)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      await fs.writeFile(path.join(root, ".mcp.json"), "{oops", "utf8");
      const report = await runDoctor(root, await detectHarnesses(root, {}));
      expect(report.exit).toBe(1);
      expect(report.findings.some((f) => f.code === "DG007")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-010: repair re-creates a deleted SKILL.md and restores doctor to clean", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode");
      await fs.rm(path.join(root, ".agents", "skills", "fixture", "SKILL.md"));
      const injured = await runDoctor(root, await detectHarnesses(root, {}));
      expect(injured.exit).toBe(2);

      const report = await runRepair(root, signal("opencode"));
      expect(report.status).toBe("ok");
      expect(report.target).toBe("opencode");
      expect(report.repaired.some((p) => p.endsWith("SKILL.md"))).toBe(true);

      const healed = await runDoctor(root, await detectHarnesses(root, {}));
      expect(healed.exit).toBe(0);
      expect(healed.findings).toEqual([]);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-011: repair does not touch composed installs (dir != manifest.profile.slug)", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "opencode", { slug: "a", title: "A" });
      // Simulate a composed install dir proving the limitation path.
      const composedDir = path.join(root, ".agents", "skills", "a-b");
      await fs.mkdir(composedDir, { recursive: true });
      await fs.writeFile(path.join(composedDir, "manifest.json"), await fs.readFile(path.join(root, ".agents", "skills", "a", "manifest.json"), "utf8"), "utf8");

      const report = await runRepair(root, signal("opencode"));
      expect(report.limitations.some((l) => l.includes("a-b") || l.includes("composed"))).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("INSTALLED-012: groups and crew installs are inventoried", async () => {
    const root = await makeRepo();
    try {
      await installProfile(root, "codex");
      const crews = path.join(root, ".agents", "crews", "guard");
      await fs.mkdir(crews, { recursive: true });
      await fs.writeFile(path.join(crews, "manifest.json"), JSON.stringify({ schema: "proagents/crew/v1", version: "1.0.0", crew: { name: "Guard", id: "guard" } }, null, 2), "utf8");
      await fs.writeFile(path.join(crews, "SKILL.md"), "# Guard\n", "utf8");

      const detected = await detectHarnesses(root, {});
      const inv = await scanInstalled(root, detected);
      expect(inv.profiles).toHaveLength(1);
      expect(inv.crews).toHaveLength(1);
      expect(inv.crews[0]).toMatchObject({ id: "guard", hasSkill: true });
      // codex writes its instruction block to AGENTS.md
      expect(inv.blocks.some((b) => b.file === "AGENTS.md")).toBe(true);
    } finally {
      await cleanup(root);
    }
  });
});