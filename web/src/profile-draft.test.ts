import { describe, expect, it } from "vitest";
import { validateProfileDraft } from "./profile-draft.js";
import { emptyProfile } from "./types.js";

/**
 * PROFILE-DRAFT — regression tests for the profile builder wizard's
 * client-side PA03x mirror that gates the Ship tab.
 */

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
    p.profile.slug = "x";
    p.profile.name = "X";
    p.identity.title = "X";
    p.expertise = ["e"];
    p.tools.required = ["shell"];
    p.tools.forbidden = ["shell"];
    expect(validateProfileDraft(p).join(" ")).toContain('Tool "shell" is both required and forbidden');
  });
});
