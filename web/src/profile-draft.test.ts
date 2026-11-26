import { describe, expect, it } from "vitest";
import { validateProfileDraft } from "./profile-draft.js";
import { emptyProfile } from "./types.js";
import { DEFAULT_SETTINGS, githubTokenNeedsRefresh, githubRefreshExpired } from "./settings.js";

/**
 * PROFILE-DRAFT — regression tests for the profile builder wizard's
 * client-side PA03x mirror that gates the Ship tab.
 */

describe("GitHub session helpers (GH-SESSION)", () => {
  it("GH-SESSION-001: a token without expiry never needs refresh (PAT or legacy)", () => {
    const s = { ...DEFAULT_SETTINGS, githubToken: "tok", githubTokenExpiresAt: 0 };
    expect(githubTokenNeedsRefresh(s)).toBe(false);
  });

  it("GH-SESSION-002: expiry within the slack window triggers refresh", () => {
    const now = Date.now();
    const s = { ...DEFAULT_SETTINGS, githubToken: "tok", githubTokenExpiresAt: now + 2 * 60 * 1000 };
    expect(githubTokenNeedsRefresh(s, 5 * 60 * 1000)).toBe(true);
    const far = { ...DEFAULT_SETTINGS, githubToken: "tok", githubTokenExpiresAt: now + 60 * 60 * 1000 };
    expect(githubTokenNeedsRefresh(far, 5 * 60 * 1000)).toBe(false);
  });

  it("GH-SESSION-003: refresh expiry forces re-auth; missing refresh token too", () => {
    expect(githubRefreshExpired({ ...DEFAULT_SETTINGS })).toBe(true);
    const dead = {
      ...DEFAULT_SETTINGS,
      githubRefreshToken: "r",
      githubRefreshExpiresAt: Date.now() - 1000,
    };
    expect(githubRefreshExpired(dead)).toBe(true);
    const alive = {
      ...DEFAULT_SETTINGS,
      githubRefreshToken: "r",
      githubRefreshExpiresAt: Date.now() + 1000 * 60 * 60,
    };
    expect(githubRefreshExpired(alive)).toBe(false);
  });
});

describe("validateProfileDraft (PROFILE-DRAFT-VAL)", () => {
  it("PROFILE-DRAFT-VAL-001: a minimal complete draft passes", () => {
    const p = emptyProfile();
    p.profile.name = "Technical Writer";
    p.profile.slug = "technical-writer";
    p.identity.title = "Technical Writer";
    p.expertise = ["developer documentation"];
    expect(validateProfileDraft(p)).toEqual([]);
  });

  it("PROFILE-DRAFT-VAL-002: a draft with cleared defaults reports every gap with its PA code", () => {
    // emptyProfile() pre-fills tools/verification with sensible defaults; a
    // user who blanks them must be caught on Ship.
    const p = emptyProfile();
    p.tools.required = [];
    p.verification.required = [];
    const problems = validateProfileDraft(p).join(" ");
    expect(problems).toContain("PA030"); // name + identity title
    expect(problems).toContain("PA031"); // slug
    expect(problems).toContain("PA033"); // expertise
    expect(problems).toContain("PA034"); // required tools
    expect(problems).toContain("PA035"); // verification
  });

  it("PROFILE-DRAFT-VAL-003: bad slug shapes are rejected (PA031)", () => {
    const p = emptyProfile();
    p.profile.slug = "Technical Writer";
    expect(validateProfileDraft(p).join(" ")).toContain("PA031");
  });

  it("PROFILE-DRAFT-VAL-004: a tool both required and forbidden is rejected (PA036)", () => {
    const p = emptyProfile();
    p.profile.slug = "x-profiler";
    p.profile.name = "X";
    p.identity.title = "X";
    p.expertise = ["e"];
    p.tools.required = ["shell"];
    p.tools.forbidden = ["shell"];
    expect(validateProfileDraft(p).join(" ")).toContain('Tool "shell" is both required and forbidden');
  });

  it("PROFILE-DRAFT-VAL-005: a slug that already exists in the registry is blocked (PA038)", () => {
    const p = emptyProfile();
    p.profile.name = "Security Engineer";
    p.profile.slug = "security-engineer";
    p.identity.title = "Security Engineer";
    p.expertise = ["e"];
    const taken = new Set(["security-engineer"]);
    expect(validateProfileDraft(p, taken).join(" ")).toContain("already exists in the registry");
    expect(validateProfileDraft(p, new Set())).toEqual([]);
  });

  it("PROFILE-DRAFT-VAL-006: malformed MCP servers are flagged client-side (PA039)", () => {
    const p = emptyProfile();
    p.profile.slug = "x-profiler";
    p.profile.name = "X";
    p.identity.title = "X";
    p.expertise = ["e"];
    p.tools.mcp = [
      { name: "Bad Name", transport: "stdio" },
      { name: "no-url", transport: "http" },
    ];
    const joined = validateProfileDraft(p).join(" ");
    expect(joined).toContain("PA039");
    expect((joined.match(/PA039/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("PROFILE-DRAFT-VAL-007: valid MCP servers pass; registry refs validated (PA040)", () => {
    const p = emptyProfile();
    p.profile.slug = "x-profiler";
    p.profile.name = "X";
    p.identity.title = "X";
    p.expertise = ["e"];
    p.tools.mcp = [{ name: "context7", transport: "stdio", command: "npx -y context7" }];
    p.tools.packages = [{ registry: "npm:@org/skills" }];
    p.skills = ["npm:@org/skills", "github:owner/repo"];
    expect(validateProfileDraft(p)).toEqual([]);
    p.tools.packages = [{ registry: "not-a-registry-ref" }];
    expect(validateProfileDraft(p).join(" ")).toContain("PA040");
  });
});
