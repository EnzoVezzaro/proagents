import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listProfiles, resolveProfiles, validateAllProfiles } from "../../src/profiles/registry.js";
import { composeProfiles } from "../../src/profiles/composition.js";
import { validateProfile } from "../../src/profiles/validation.js";
import { profileProblems } from "../../src/profiles/marketplace.js";
import type { ProfileManifest } from "../../src/profiles/types.js";

/**
 * PROFILES — deterministic core for Professional Agent Profiles.
 *
 * Invariants under test:
 *  - registry discovery is deterministic and sorted by slug
 *  - built-in profiles all pass validation
 *  - composition is deterministic and never silently ignores conflicts
 *  - validation codes follow the PA03x scheme
 */

function manifest(slug: string, overrides: Partial<ProfileManifest> = {}): ProfileManifest {
  return {
    version: "1",
    profile: { name: slug, slug, version: "1.0.0", ...(overrides.profile ?? {}) },
    identity: overrides.identity ?? { title: slug },
    expertise: overrides.expertise ?? ["software"],
    methods: overrides.methods ?? [],
    skills: overrides.skills ?? [],
    rules: overrides.rules ?? [],
    standards: overrides.standards ?? [],
    tools: overrides.tools ?? { required: ["filesystem", "shell", "git"] },
    verification: overrides.verification ?? { required: ["tests"] },
  };
}

describe("profile registry (PROFILES-REG)", () => {
  it("PROFILES-REG-001: discovers built-in profiles, sorted by slug", async () => {
    const entries = await listProfiles();
    expect(entries.length).toBeGreaterThanOrEqual(13);
    const slugs = entries.map((e) => e.manifest.profile.slug);
    expect([...slugs].sort((a, b) => a.localeCompare(b))).toEqual(slugs);
    expect(slugs).toContain("security-engineer");
    expect(slugs).toContain("senior-engineer");
  });

  it("PROFILES-REG-002: is deterministic — two calls return identical slugs", async () => {
    const a = (await listProfiles()).map((e) => e.manifest.profile.slug);
    const b = (await listProfiles()).map((e) => e.manifest.profile.slug);
    expect(a).toEqual(b);
  });

  it("PROFILES-REG-003: resolves a known slug and rejects an unknown one", async () => {
    const [entry] = await resolveProfiles(["security-engineer"]);
    expect(entry?.manifest.identity.title).toBe("Security Engineer");
    await expect(resolveProfiles(["no-such-profile"])).rejects.toThrow(/unknown profile/);
  });

  it("PROFILES-REG-004: a marketplace checkout wins over the packaged snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "profiles-reg-"));
    try {
      // A checkout copy of a packaged slug wins (it is what the repo manages).
      const checkoutCopy = manifest("senior-engineer");
      await fs.mkdir(path.join(root, ".marketplace", "items", "senior-engineer"), { recursive: true });
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "senior-engineer", "profile.json"),
        JSON.stringify(checkoutCopy),
      );
      // A marketplace-only profile must appear from the checkout.
      await fs.mkdir(path.join(root, ".marketplace", "items", "marketplace-only"), { recursive: true });
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "marketplace-only", "profile.json"),
        JSON.stringify(manifest("marketplace-only")),
      );
      const entries = await listProfiles(root);
      const senior = entries.find((e) => e.manifest.profile.slug === "senior-engineer");
      expect(senior?.origin).toBe("marketplace");
      const only = entries.find((e) => e.manifest.profile.slug === "marketplace-only");
      expect(only?.origin).toBe("marketplace");
      // The packaged snapshot still fills gaps for slugs the checkout lacks.
      const builtin = entries.find((e) => e.manifest.profile.slug === "security-engineer");
      expect(builtin?.origin).toBe("builtin");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("profile validation (PROFILES-VAL)", () => {
  it("PROFILES-VAL-001: every shipped built-in passes validation", async () => {
    const reports = await validateAllProfiles();
    for (const r of reports) {
      const errors = r.findings.filter((f) => f.severity === "error");
      expect(errors, `${r.profile} has errors: ${JSON.stringify(errors)}`).toEqual([]);
    }
  });

  it("PROFILES-VAL-002: PA030 fires for missing identity.title", () => {
    const m = manifest("broken-one");
    delete (m.identity as { title?: string }).title;
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("PA030");
  });

  it("PROFILES-VAL-002b: PA030 fires when profile.name is missing", () => {
    const m = manifest("nameless");
    delete (m.profile as { name?: string }).name;
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.map((f) => f.code)).toContain("PA030");
  });

  it("PROFILES-VAL-007: profileProblems gates marketplace publishing (CI contract)", async () => {
    const entries = await listProfiles();
    const good = entries.find((e) => e.manifest.profile.slug === "security-engineer");
    expect(profileProblems(good!.manifest)).toEqual([]);
    const bad = manifest("Bad Slug");
    bad.verification = { required: [] };
    const problems = profileProblems(bad);
    expect(problems.some((p) => p.includes("PA031"))).toBe(true);
    expect(problems.some((p) => p.includes("PA035"))).toBe(true);
  });

  it("PROFILES-VAL-003: PA031 rejects non-kebab-case slugs", () => {
    const m = manifest("Not_Kebab");
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.map((f) => f.code)).toContain("PA031");
  });

  it("PROFILES-VAL-004: PA032 rejects non-semver versions", () => {
    const m = manifest("some-profile");
    m.version = "v1";
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.map((f) => f.code)).toContain("PA032");
  });

  it("PROFILES-VAL-005: PA035 rejects profiles without verification requirements", () => {
    const m = manifest("unverified");
    m.verification = { required: [] };
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.map((f) => f.code)).toContain("PA035");
  });

  it("PROFILES-VAL-006: PA036 rejects a tool that is both required and forbidden", () => {
    const m = manifest("conflicted-tools");
    m.tools = { required: ["shell"], forbidden: ["shell"] };
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.map((f) => f.code)).toContain("PA036");
  });

  it("PROFILES-VAL-008: PA039 rejects malformed MCP server entries", () => {
    const m = manifest("mcp-bad");
    m.tools.mcp = [
      { name: "Bad Name", transport: "stdio" }, // invalid name + missing command
      { name: "no-url", transport: "http" }, // missing url
      { name: "dup", transport: "stdio", command: "x" },
      { name: "dup", transport: "http", url: "https://x" }, // duplicate name
    ];
    const report = validateProfile(m, { checkKnowledge: false });
    const codes = report.findings.filter((f) => f.code === "PA039");
    expect(codes.length).toBeGreaterThanOrEqual(4);
    expect(codes.every((f) => f.severity === "error")).toBe(true);
  });

  it("PROFILES-VAL-009: PA039 accepts well-formed MCP servers", () => {
    const m = manifest("mcp-good");
    m.tools.mcp = [
      { name: "context7", transport: "stdio", command: "npx -y context7" },
      { name: "remote-sse", transport: "sse", url: "https://mcp.example.com/sse", healthCheck: "/health" },
    ];
    const report = validateProfile(m, { checkKnowledge: false });
    expect(report.findings.filter((f) => f.code === "PA039")).toEqual([]);
  });

  it("PROFILES-VAL-010: PA040 rejects non-registry package and skill refs", () => {
    const m = manifest("pkg-bad");
    m.tools.packages = [{ registry: "just-a-package-name" }];
    m.skills = ["npm:@org/good", "http://not-a-registry"];
    const report = validateProfile(m, { checkKnowledge: false });
    const codes = report.findings.filter((f) => f.code === "PA040");
    expect(codes.length).toBe(2);
  });

  it("PROFILES-VAL-011: PA038 — duplicate slug warning still fires alongside the new codes", () => {
    const m = manifest("shadowed");
    const report = validateProfile(m, { checkKnowledge: false, duplicateSlugs: new Set(["shadowed"]) });
    expect(report.findings.map((f) => f.code)).toContain("PA038");
  });
});

describe("shipped marketplace catalog (PROFILES-CATALOG)", () => {
  it("PROFILES-CATALOG-001: every kind:\"profile\" catalog item passes the profile validator", async () => {
    // The catalog is data, not code — a bad manifest can be committed without
    // any type error. Gate the shipped items here so CI catches it.
    const catalog = JSON.parse(await fs.readFile(path.resolve(".marketplace", "catalog.json"), "utf8")) as {
      items: Array<{ id: string; kind: string }>;
    };
    const profileIds = catalog.items.filter((i) => i.kind === "profile").map((i) => i.id);
    expect(profileIds.length).toBeGreaterThanOrEqual(13);
    for (const id of profileIds) {
      // Folder layout (items/<id>/profile.json) with flat legacy fallback.
      const folderPath = path.resolve(".marketplace", "items", id, "profile.json");
      const flatPath = path.resolve(".marketplace", "items", `${id}.json`);
      const filePath = await fs
        .access(folderPath)
        .then(() => folderPath)
        .catch(() => flatPath);
      // Load through the registry so path-format sections hydrate first.
      const { loadProfileFile } = await import("../../src/profiles/registry.js");
      const manifest = await loadProfileFile(filePath);
      const problems = profileProblems(manifest);
      expect(problems, `catalog item ${id} has problems: ${JSON.stringify(problems)}`).toEqual([]);
    }
  });

  it("PROFILES-CATALOG-002: every catalog index entry has the identity fields the SPA renders", async () => {
    const catalog = JSON.parse(await fs.readFile(path.resolve(".marketplace", "catalog.json"), "utf8")) as {
      items: Array<{ id: string; name?: string; version?: string; description?: string; author?: string; tags?: string[]; kind: string }>;
    };
    expect(catalog.items.length).toBeGreaterThan(0);
    for (const item of catalog.items) {
      expect(item.name, `item ${item.id} missing name`).toBeTruthy();
      expect(item.version, `item ${item.id} missing version`).toBeTruthy();
      expect(item.description, `item ${item.id} missing description`).toBeTruthy();
      expect(item.author, `item ${item.id} missing author`).toBeTruthy();
      expect(Array.isArray(item.tags) && item.tags.length > 0, `item ${item.id} missing tags`).toBe(true);
    }
  });
});

describe("profile composition (PROFILES-COMP)", () => {
  it("PROFILES-COMP-001: composing two profiles merges and dedupes deterministically", () => {
    const a = manifest("senior-engineer", { rules: ["require tests after source changes"], skills: ["code-review"] });
    const b = manifest("security-engineer", {
      rules: ["never expose secrets"],
      skills: ["code-review", "security-audit"],
      expertise: ["application security"],
    });
    const { effective, conflicts } = composeProfiles([a, b]);
    expect(effective.slugs).toEqual(["senior-engineer", "security-engineer"]);
    expect(effective.skills).toEqual(["code-review", "security-audit"]);
    expect(effective.rules).toEqual(["require tests after source changes", "never expose secrets"]);
    expect(conflicts).toEqual([]);
  });

  it("PROFILES-COMP-002: PA022 — conflicting rules block composition", () => {
    const a = manifest("profile-a", { rules: ["never modify production without approval"] });
    const b = manifest("profile-b", { rules: ["modify production without approval"] });
    const { conflicts } = composeProfiles([a, b]);
    expect(conflicts.map((c) => c.code)).toContain("PA022");
    expect(conflicts.find((c) => c.code === "PA022")?.severity).toBe("error");
  });

  it("PROFILES-COMP-003: PA023 — a tool both required and forbidden across profiles blocks", () => {
    const a = manifest("profile-a", { tools: { required: ["network"] } });
    const b = manifest("profile-b", { tools: { required: ["shell"], forbidden: ["network"] } });
    const { conflicts } = composeProfiles([a, b]);
    expect(conflicts.map((c) => c.code)).toContain("PA023");
  });

  it("PROFILES-COMP-004: PA026 warns on duplicate slugs but still composes", () => {
    const a = manifest("profile-a");
    const { conflicts } = composeProfiles([a, a]);
    expect(conflicts.map((c) => c.code)).toContain("PA026");
    expect(conflicts.find((c) => c.code === "PA026")?.severity).toBe("warning");
  });

  it("PROFILES-COMP-005: PA025 warns when verification exceeds declared tools", () => {
    const a = manifest("profile-a", {
      tools: { required: ["filesystem"] },
      verification: { required: ["tests"] },
    });
    const { conflicts } = composeProfiles([a]);
    expect(conflicts.map((c) => c.code)).toContain("PA025");
  });

  it("PROFILES-COMP-007: PA025 never fires on prose outcomes — only named capabilities", () => {
    // Prose verification (what marketplace profiles ship) is agent-executed
    // within the session and cannot be matched to tools — no warning.
    const prose = manifest("prose-profile", {
      tools: { required: ["filesystem"] },
      verification: { required: ["new-contributor setup under 15 minutes", "CI green on the release commit"] },
    });
    const proseResult = composeProfiles([prose]);
    expect(proseResult.conflicts.filter((c) => c.code === "PA025")).toHaveLength(0);

    // A named capability with no matching tool is still a real gap.
    const keyword = manifest("keyword-profile", {
      tools: { required: ["filesystem"] },
      verification: { required: ["typecheck"] },
    });
    const keywordResult = composeProfiles([keyword]);
    expect(keywordResult.conflicts.some((c) => c.code === "PA025" && c.message.includes("typecheck"))).toBe(true);
  });

  it("PROFILES-COMP-006: composition is deterministic", () => {
    const a = manifest("profile-a", { rules: ["never expose secrets"] });
    const b = manifest("profile-b", { rules: ["require tests"] });
    const r1 = composeProfiles([a, b]);
    const r2 = composeProfiles([a, b]);
    expect(r1).toEqual(r2);
  });

  it("PROFILES-COMP-007: MCP servers and packages merge and dedupe by name/registry", () => {
    const a = manifest("profile-a", {
      tools: { required: ["shell"], mcp: [{ name: "context7", transport: "stdio", command: "npx -y context7" }] },
    });
    const b = manifest("profile-b", {
      tools: {
        required: ["git"],
        mcp: [
          { name: "context7", transport: "stdio", command: "npx -y context7" }, // same → deduped
          { name: "github", transport: "http", url: "https://mcp.github.com" },
        ],
        packages: [{ registry: "npm:@org/skills" }, { registry: "npm:@org/skills" }],
      },
    });
    const { effective } = composeProfiles([a, b]);
    expect(effective.tools.mcp.map((s) => s.name)).toEqual(["context7", "github"]);
    expect(effective.tools.packages).toEqual([{ registry: "npm:@org/skills" }]);
  });
});
