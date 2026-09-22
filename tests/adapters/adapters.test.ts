import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectHarnesses, compileForHarness, HARNESS_SPECS } from "../../src/adapters/index.js";
import { composeProfiles } from "../../src/profiles/composition.js";
import { resolveProfiles } from "../../src/profiles/registry.js";
import type { EffectiveProfile, ProfileManifest, RuleEnforcementEntry } from "../../src/profiles/types.js";

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

    // The canonical manifest is preserved beside the compiled skill
    // (README "What Gets Generated": manifest.json stays inspectable).
    const manifestOut = JSON.parse(
      await fs.readFile(path.join(root, ".agents", "skills", "security-engineer", "manifest.json"), "utf8"),
    ) as ProfileManifest;
    expect(manifestOut.profile.slug).toBe("security-engineer");

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

  it("ADAPT-COMPILE-008: opencode enforcement lands in opencode.json, not .claude/settings.json", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n", "opencode.json": "{\"$schema\":\"https://opencode.ai/config.json\",\"permission\":{\"bash\":{\"*\":\"allow\"}}}" });
    const { effective, manifest } = await loadEffective("security-engineer");
    const detected = await detectHarnesses(root, {});
    const opencode = detected.all.find((h) => h.id === "opencode");
    expect(opencode).toBeDefined();
    const result = await compileForHarness(effective, manifest, opencode!, root);
    expect(result.files.some((f) => f.mechanism === "rule-enforcement" && f.path === "opencode.json")).toBe(true);
    await expect(fs.access(path.join(root, ".claude", "settings.json"))).rejects.toThrow();

    // Deny rules are appended into the existing permission.bash map; the
    // pre-existing catch-all allow survives (last matching rule wins).
    const config = JSON.parse(await fs.readFile(path.join(root, "opencode.json"), "utf8"));
    expect(config.permission.bash["*"]).toBe("allow");
    expect(config.permission.bash["git push --force*"]).toBe("deny");
    expect(config.permission.bash["rm -rf /*"]).toBe("deny");
    expect(config.$schema).toBe("https://opencode.ai/config.json");
  });

  it("ADAPT-COMPILE-009: knowledge files are copied into the skill (self-contained artifact)", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    const [entry] = await resolveProfiles(["security-engineer"]);
    if (!entry) throw new Error("profile not found");
    // Ship a knowledge reference + file with the profile, like registry items do.
    // The fixture file lands beside the shipped manifest (its source dir), so it
    // must be removed afterwards — tests never leave residue in profiles/.
    entry.manifest.knowledge = ["knowledge/brief.md"];
    await fs.mkdir(path.join(entry.dir, "knowledge"), { recursive: true });
    const fixture = path.join(entry.dir, "knowledge", "brief.md");
    await fs.writeFile(fixture, "# Brief\n", "utf8");
    try {
    const { effective } = composeProfiles([entry.manifest]);
    const detected = await detectHarnesses(root, {});
    const result = await compileForHarness(effective, entry.manifest, detected.primary, root, {
      knowledgeDirs: [entry.dir],
    });

    const knowledgeFile = result.files.find((f) => f.mechanism === "knowledge");
    expect(knowledgeFile?.path).toBe(".agents/skills/security-engineer/knowledge/brief.md");
    const copied = await fs.readFile(path.join(root, ".agents/skills/security-engineer/knowledge/brief.md"), "utf8");
    expect(copied).toBe("# Brief\n");
    expect(result.limitations.join(" ")).not.toContain("knowledge");

    // Missing source file → honest limitation, not a broken reference.
    entry.manifest.knowledge = ["knowledge/absent.md"];
    const { effective: eff2 } = composeProfiles([entry.manifest]);
    const result2 = await compileForHarness(eff2, entry.manifest, detected.primary, root, {
      knowledgeDirs: [entry.dir],
    });
    expect(result2.limitations.join(" ")).toContain("knowledge/absent.md");
    } finally {
      await fs.rm(path.join(entry.dir, "knowledge"), { recursive: true, force: true });
    }
  });

  it("ADAPT-COMPILE-010: artifact contract per harness (sweep)", async () => {
    const expectations: Record<string, { skills: boolean; enforcement: string | null; instructions: string }> = {
      "claude-code": { skills: true, enforcement: "rule-enforcement", instructions: "CLAUDE.md" },
      opencode: { skills: true, enforcement: "rule-enforcement", instructions: "AGENTS.md" },
      codex: { skills: true, enforcement: null, instructions: "AGENTS.md" },
      cursor: { skills: true, enforcement: null, instructions: "AGENTS.md" },
      "gemini-cli": { skills: true, enforcement: null, instructions: "GEMINI.md" },
      "generic-cli": { skills: false, enforcement: null, instructions: "AGENTS.md" },
    };
    const { effective, manifest } = await loadEffective("security-engineer");
    const root = await makeRepo({});
    const detected = await detectHarnesses(root, {});
    for (const [target, want] of Object.entries(expectations)) {
      // Explicit targets work regardless of repo layout (equipping is how a
      // repo becomes a <target> repo).
      const signal =
        target === "generic-cli"
          ? detected.primary
          : {
              id: target as never,
              name: target,
              capabilities: (await import("../../src/adapters/index.js")).HARNESS_SPECS.find((s) => s.id === target)!.capabilities,
              evidence: ["--target override"],
            };
      const result = await compileForHarness(effective, manifest, signal, root);
      const mechanisms = result.files.map((f) => f.mechanism);
      const paths = result.files.map((f) => f.path);
      expect(mechanisms, target).toContain("project-instructions");
      if (want.skills) expect(mechanisms, target).toContain("canonical-manifest");
      expect(paths, target).toContain(want.instructions);
      expect(mechanisms.includes("agent-skill"), target).toBe(want.skills);
      expect(mechanisms.includes("rule-enforcement"), target).toBe(want.enforcement !== null);
      if (!want.skills) {
        expect(result.limitations.join(" "), target).toMatch(/skills directory/);
      }
    }
  });

  it("ADAPT-COMPILE-005: profile MCP servers merge into .mcp.json; packages surface as limitations", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# App\n", ".mcp.json": "{\"mcpServers\":{\"existing\":{\"command\":\"keep\"}}}" });
    const { effective, manifest } = await loadEffective("security-engineer");
    manifest.tools.mcp = [
      { name: "context7", transport: "stdio", command: "npx -y context7", args: ["-y", "context7"] },
      { name: "remote", transport: "http", url: "https://mcp.example.com/sse" },
    ];
    manifest.tools.packages = [{ registry: "npm:@org/skill-pack", reason: "skill bundle" }];
    // Recompose so the effective profile carries the new mcp/packages.
    const { effective: eff2 } = composeProfiles([manifest]);
    const detected = await detectHarnesses(root, {});
    const result = await compileForHarness(eff2, manifest, detected.primary, root);

    const mechanisms = result.files.map((f) => f.mechanism);
    expect(mechanisms).toContain("mcp-config");
    const mcp = JSON.parse(await fs.readFile(path.join(root, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command?: string; url?: string }>;
    };
    expect(mcp.mcpServers.existing).toEqual({ command: "keep" }); // preserved
    expect(mcp.mcpServers.context7.command).toContain("context7");
    expect(mcp.mcpServers.remote.url).toBe("https://mcp.example.com/sse");

    // The skill documents the servers and packages.
    const skill = await fs.readFile(path.join(root, ".agents", "skills", "security-engineer", "SKILL.md"), "utf8");
    expect(skill).toContain("MCP servers");
    expect(skill).toContain("context7");
    expect(skill).toContain("Registry packages");
    expect(result.limitations.join(" ")).toContain("npm:@org/skill-pack");
  });

  it("ADAPT-COMPILE-006: written skills (skillBodies) install as standalone skills", async () => {
    const root = await makeRepo({ "CLAUDE.md": "# App\n" });
    const { effective, manifest } = await loadEffective("security-engineer");
    manifest.skillBodies = {
      "threat-model-playbook": {
        description: "Run a STRIDE threat model",
        body: "1. Enumerate components.\n2. Score threats.\n",
      },
    };
    const detected = await detectHarnesses(root, {});
    const result = await compileForHarness(effective, manifest, detected.primary, root);
    const written = result.files.find((f) => f.mechanism === "written-skill");
    expect(written?.path).toBe(".agents/skills/threat-model-playbook/SKILL.md");
    const md = await fs.readFile(path.join(root, written!.path), "utf8");
    expect(md).toContain("name: threat-model-playbook");
    expect(md).toContain("Run a STRIDE threat model");
    expect(md).toContain("1. Enumerate components.");
  });
});

describe("profile-driven rule enforcement (ADAPT-ENF)", () => {
  /** Explicit harness signal — equipping is how a repo becomes a <target> repo. */
  function signal(id: "opencode" | "claude-code") {
    const spec = HARNESS_SPECS.find((s) => s.id === id)!;
    return { id, name: spec.name, capabilities: { ...spec.capabilities }, evidence: ["--target"] };
  }

  function enforcedProfile(): { effective: EffectiveProfile; manifest: ProfileManifest } {
    const ruleEnforcement: RuleEnforcementEntry[] = [
      { rule: "never publish straight from the shell", enforcement: { bash: ["npm publish*"] } },
      { rule: "protect the env file", enforcement: { paths: ["**/.env"] } },
      { rule: "no unsupervised web access", enforcement: { tools: ["web"] } },
    ];
    const effective: EffectiveProfile = {
      name: "Enforced",
      slugs: ["enforced"],
      identity: { title: "Enforced", summary: "" },
      expertise: ["secrets"],
      knowledge: [],
      methods: [],
      skills: [],
      skillsDetail: {},
      rules: [...ruleEnforcement.map((e) => e.rule), "be careful out there"],
      ruleEnforcement,
      policies: [],
      standards: [],
      references: {},
      tools: { required: ["shell"], optional: [], forbidden: [], mcp: [], packages: [] },
      verification: { required: ["tests pass"], optional: [] },
    };
    const manifest: ProfileManifest = {
      version: "1.0.0",
      profile: { name: "Enforced", slug: "enforced" },
      identity: { title: "Enforced", summary: "" },
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

  it("ADAPT-ENF-001: rule enforcement compiles into OpenCode permission pattern maps", async () => {
    const root = await makeRepo({
      "AGENTS.md": "# App\n",
      "opencode.json": JSON.stringify({ permission: { bash: { "*": "allow" }, edit: { "*": "allow" } } }),
    });
    const { effective, manifest } = enforcedProfile();
    const result = await compileForHarness(effective, manifest, signal("opencode"), root);

    const config = JSON.parse(await fs.readFile(path.join(root, "opencode.json"), "utf8"));
    // Rule bash patterns + the compiler baseline floor; the user's catch-all
    // allow survives (deny entries are appended — last match wins, deny only).
    expect(config.permission.bash["*"]).toBe("allow");
    expect(config.permission.bash["npm publish*"]).toBe("deny");
    expect(config.permission.bash["git push --force*"]).toBe("deny");
    expect(config.permission.bash["rm -rf /*"]).toBe("deny");
    // `**/.env` expands to the root and nested forms of the edit pattern.
    expect(config.permission.edit["*"]).toBe("allow");
    expect(config.permission.edit[".env"]).toBe("deny");
    expect(config.permission.edit["*/.env"]).toBe("deny");
    // The semantic "web" tool maps to OpenCode's own tool keys.
    expect(config.permission.webfetch).toBe("deny");
    expect(config.permission.websearch).toBe("deny");

    // Honesty contract: enforced vs advisory is reported, prose-only rules say so.
    expect(result.enforcement.enforced).toEqual([
      "never publish straight from the shell",
      "protect the env file",
      "no unsupervised web access",
    ]);
    expect(result.enforcement.advisory).toEqual(["be careful out there"]);
    expect(result.enforcement.baseline).toEqual(["git push --force*", "rm -rf /*"]);
    expect(result.limitations.join(" ")).toMatch(/1 rule\(s\) carry no machine-readable enforcement/);
  });

  it("ADAPT-ENF-002: rule enforcement compiles into Claude Code PreToolUse hooks, idempotently", async () => {
    const userHook = { matcher: "Bash", hooks: [{ type: "command", command: "echo user-hook" }] };
    const legacyProagentHook = {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: "node -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.exit(/(git push --force|rm -rf\\\\s+\\\\/)/.test(d)?2:0)})\"",
        },
      ],
    };
    const root = await makeRepo({
      "CLAUDE.md": "# App\n",
      ".claude/settings.json": JSON.stringify({ hooks: { PreToolUse: [userHook, legacyProagentHook] } }),
    });
    const { effective, manifest } = enforcedProfile();
    await compileForHarness(effective, manifest, signal("claude-code"), root);
    // Re-equip: generated hooks are replaced by marker, never accumulated.
    const result = await compileForHarness(effective, manifest, signal("claude-code"), root);

    const settings = JSON.parse(await fs.readFile(path.join(root, ".claude", "settings.json"), "utf8"));
    const pre = settings.hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ command: string }> }>;
    // The user's hook and exactly one proagent entry per enforcement kind
    // survive (baseline folds into the Bash hook's regex).
    expect(pre).toHaveLength(4);
    expect(pre[0]).toEqual(userHook);
    const proagentEntries = pre.slice(1);
    expect(proagentEntries).toHaveLength(3);
    expect(proagentEntries.every((e) => e.hooks.every((h) => h.command.includes("proagent:rule-enforcement")))).toBe(true);
    expect(proagentEntries.some((e) => e.matcher === "Bash" && e.hooks.some((h) => h.command.includes("npm\\s+publish.*")))).toBe(true);
    expect(
      proagentEntries.some((e) => e.matcher === "Edit|Write|NotebookEdit" && e.hooks.some((h) => h.command.includes("(?:.*\\/)?\\.env"))),
    ).toBe(true);
    expect(proagentEntries.some((e) => e.matcher === "WebFetch|WebSearch" && e.hooks.some((h) => h.command.includes("forbidden tool")))).toBe(true);
    // The legacy pre-marker hook is gone (upgrades clean up after themselves).
    expect(pre.some((e) => e.hooks.some((h) => h.command.includes("git push --force|rm -rf")))).toBe(false);
    expect(result.enforcement.baseline).toEqual(["git push --force*", "rm -rf /*"]);
  });

  it("ADAPT-ENF-003: unmappable tools and prose-only rules surface as limitations, never silently drop", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n", "opencode.json": "{}" });
    const ruleEnforcement: RuleEnforcementEntry[] = [
      { rule: "always use the enterprise scanner", enforcement: { tools: ["security-scanner"] } },
    ];
    const effective: EffectiveProfile = {
      name: "Scanner", slugs: ["scanner"], identity: { title: "Scanner", summary: "" },
      expertise: ["x"], knowledge: [], methods: [], skills: [], skillsDetail: {},
      rules: ["always use the enterprise scanner"], ruleEnforcement,
      policies: [], standards: [], references: {},
      tools: { required: ["shell"], optional: [], forbidden: [], mcp: [], packages: [] },
      verification: { required: ["tests pass"], optional: [] },
    };
    const manifest: ProfileManifest = {
      version: "1.0.0", profile: { name: "Scanner", slug: "scanner" }, identity: { title: "Scanner", summary: "" },
      expertise: [], methods: [], rules: [], standards: [], skills: [], tools: { required: [] }, verification: { required: [], optional: [] },
    };
    const result = await compileForHarness(effective, manifest, signal("opencode"), root);
    expect(result.limitations.join(" ")).toContain('forbidden tool "security-scanner" has no verified OpenCode enforcement mapping');
    expect(result.enforcement.enforced).toEqual([]);
    expect(result.enforcement.advisory).toEqual(["always use the enterprise scanner"]);
  });

  it("ADAPT-ENF-004: the shipped security-engineer profile compiles its secrets rule end to end", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n", "opencode.json": "{}" });
    const { effective, manifest } = await loadEffective("security-engineer");
    const result = await compileForHarness(effective, manifest, signal("opencode"), root);
    const config = JSON.parse(await fs.readFile(path.join(root, "opencode.json"), "utf8"));
    expect(config.permission.bash["cat .env*"]).toBe("deny");
    expect(config.permission.edit[".env"]).toBe("deny");
    expect(config.permission.edit["*.pem"]).toBe("deny");
    expect(result.enforcement.enforced).toEqual(["never expose secrets in logs, errors, or committed files"]);
    expect(result.enforcement.advisory.length).toBe(4);
  });

  it("ADAPT-ENF-005: forbidden tools (manifest-level) compile into boundaries too", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n", "opencode.json": "{}" });
    const { effective, manifest } = enforcedProfile();
    effective.tools.forbidden = ["git"];
    const result = await compileForHarness(effective, manifest, signal("opencode"), root);
    const config = JSON.parse(await fs.readFile(path.join(root, "opencode.json"), "utf8"));
    expect(config.permission.bash["git *"]).toBe("deny");
    // A shell-denying tool rule collapses the whole bash surface.
    effective.tools.forbidden = ["shell"];
    const result2 = await compileForHarness(effective, manifest, signal("opencode"), root);
    const config2 = JSON.parse(await fs.readFile(path.join(root, "opencode.json"), "utf8"));
    expect(config2.permission.bash["*"]).toBe("deny");
    expect(result2.limitations.join(" ")).not.toContain("shell");
  });

  it("ADAPT-ENF-006: non-native targets report rules as advisory with no baseline applied", async () => {
    const root = await makeRepo({ "AGENTS.md": "# App\n" });
    const { effective, manifest } = enforcedProfile();
    const spec = HARNESS_SPECS.find((s) => s.id === "codex")!;
    const result = await compileForHarness(
      effective,
      manifest,
      { id: "codex", name: spec.name, capabilities: { ...spec.capabilities }, evidence: ["--target"] },
      root,
    );
    expect(result.enforcement).toEqual({ enforced: [], advisory: effective.rules, baseline: [] });
    expect(result.limitations.join(" ")).toMatch(/3 rule\(s\) had machine-readable enforcement that could not compile/);
  });
});
