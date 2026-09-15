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

  it("PROFILES-REG-004: local profiles shadow built-ins and are flagged during validation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "profiles-reg-"));
    try {
      const local = manifest("senior-engineer");
      await fs.mkdir(path.join(root, "profiles"), { recursive: true });
      await fs.writeFile(path.join(root, "profiles", "senior-engineer.json"), JSON.stringify(local));
      const entries = await listProfiles(root);
      const shadowed = entries.find((e) => e.manifest.profile.slug === "senior-engineer");
      expect(shadowed?.origin).toBe("local");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("PROFILES-REG-005: marketplace items fill gaps but never shadow built-ins", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "profiles-reg-"));
    try {
      await fs.mkdir(path.join(root, ".marketplace", "items"), { recursive: true });
      // A marketplace copy of a built-in slug must NOT win…
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "senior-engineer.json"),
        JSON.stringify(manifest("senior-engineer")),
      );
      // …and a marketplace-only profile must appear.
      await fs.writeFile(
        path.join(root, ".marketplace", "items", "marketplace-only.json"),
        JSON.stringify(manifest("marketplace-only")),
      );
      const entries = await listProfiles(root);
      const senior = entries.find((e) => e.manifest.profile.slug === "senior-engineer");
      expect(senior?.origin).toBe("builtin");
      const only = entries.find((e) => e.manifest.profile.slug === "marketplace-only");
      expect(only?.origin).toBe("marketplace");
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
    m.profile.version = "v1";
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

  it("PROFILES-COMP-006: composition is deterministic", () => {
    const a = manifest("profile-a", { rules: ["never expose secrets"] });
    const b = manifest("profile-b", { rules: ["require tests"] });
    const r1 = composeProfiles([a, b]);
    const r2 = composeProfiles([a, b]);
    expect(r1).toEqual(r2);
  });
});
