import { describe, expect, it } from "vitest";
import {
  installCommand,
  looksLikeRepoRef,
  parseFrontmatter,
  parseRepoRef,
  rawFileUrl,
  repoTreeUrl,
  skillsFromTree,
} from "./githubSkills.js";

/**
 * GH-SKILLS — parsing/discovery for the registry "paste a repo URL" flow.
 * Pins the exact user scenario: wesleyegberto/software-engineering-skills.
 */

describe("parseRepoRef", () => {
  it("GH-SKILLS-001: parses the pasted full URL", () => {
    const ref = parseRepoRef("https://github.com/wesleyegberto/software-engineering-skills#programming-skills");
    expect(ref).toEqual({ owner: "wesleyegberto", repo: "software-engineering-skills" });
  });

  it("GH-SKILLS-002: parses tree URLs with ref and subpath", () => {
    expect(parseRepoRef("https://github.com/o/r/tree/main/plugins/programming-skills")).toEqual({
      owner: "o",
      repo: "r",
      ref: "main",
      subpath: "plugins/programming-skills",
    });
    expect(parseRepoRef("https://github.com/o/r/blob/v1.2/skills/x")).toEqual({
      owner: "o",
      repo: "r",
      ref: "v1.2",
      subpath: "skills/x",
    });
  });

  it("GH-SKILLS-003: parses owner/repo shorthand and rejects non-repos", () => {
    expect(parseRepoRef("wesleyegberto/software-engineering-skills")).toEqual({
      owner: "wesleyegberto",
      repo: "software-engineering-skills",
    });
    expect(parseRepoRef("just some search text")).toBeNull();
    expect(parseRepoRef("")).toBeNull();
  });

  it("GH-SKILLS-004: looksLikeRepoRef gates the import panel, not ordinary search", () => {
    expect(looksLikeRepoRef("https://github.com/wesleyegberto/software-engineering-skills")).toBe(true);
    expect(looksLikeRepoRef("o/r")).toBe(true);
    expect(looksLikeRepoRef("clean code")).toBe(false);
    expect(looksLikeRepoRef("security")).toBe(false);
  });
});

describe("tree discovery", () => {
  const ref = { owner: "wesleyegberto", repo: "software-engineering-skills" };
  const tree = [
    { path: "README.md", type: "blob" },
    { path: "plugins/programming-skills/skills/clean-code/SKILL.md", type: "blob" },
    { path: "plugins/programming-skills/skills/clean-code/references/naming.md", type: "blob" },
    { path: "plugins/programming-skills/skills/api-designer/SKILL.md", type: "blob" },
    { path: "plugins/devops/skills/docker-compose-expert/SKILL.md", type: "blob" },
    { path: "SKILL.md", type: "blob" },
  ];

  it("GH-SKILLS-005: finds every nested SKILL.md dir, sorted, deduped", () => {
    const skills = skillsFromTree(tree, ref);
    expect(skills.map((s) => s.name)).toEqual(["api-designer", "clean-code", "docker-compose-expert", "SKILL.md"]);
    // top-level SKILL.md has no parent dir name; the name degrades gracefully
    const topLevel = skills.find((s) => s.path === "SKILL.md");
    expect(topLevel?.name).toBe("SKILL.md");
  });

  it("GH-SKILLS-006: subpath restricts discovery", () => {
    const skills = skillsFromTree(tree, { ...ref, subpath: "plugins/devops" });
    expect(skills.map((s) => s.name)).toEqual(["docker-compose-expert"]);
  });

  it("GH-SKILLS-007: blob-only (trees ignored), URLs are raw-fetchable", () => {
    const withTree = [...tree, { path: "x/SKILL.md", type: "tree" }];
    expect(skillsFromTree(withTree, ref).some((s) => s.path === "x/SKILL.md")).toBe(false);
    expect(rawFileUrl(ref, "plugins/programming-skills/skills/clean-code/SKILL.md")).toBe(
      "https://raw.githubusercontent.com/wesleyegberto/software-engineering-skills/HEAD/plugins/programming-skills/skills/clean-code/SKILL.md",
    );
    expect(repoTreeUrl(ref)).toBe("https://api.github.com/repos/wesleyegberto/software-engineering-skills/git/trees/HEAD?recursive=1");
  });
});

describe("frontmatter + install commands", () => {
  it("GH-SKILLS-008: extracts name/description, unwraps quotes, tolerates nested YAML", () => {
    const md = [
      "---",
      "name: clean-code",
      "description: 'Write readable code through disciplined naming. Use when the user mentions \"code review\".'",
      "license: MIT",
      "metadata:",
      "  author: wondelai",
      "  version: \"1.0.0\"",
      "---",
      "",
      "# Clean code",
    ].join("\n");
    expect(parseFrontmatter(md)).toEqual({
      name: "clean-code",
      description: 'Write readable code through disciplined naming. Use when the user mentions "code review".',
    });
    expect(parseFrontmatter("no frontmatter")).toEqual({});
  });

  it("GH-SKILLS-009: install commands match the documented skills CLI", () => {
    const ref = { owner: "wesleyegberto", repo: "software-engineering-skills" };
    expect(installCommand(ref)).toBe("npx skills add wesleyegberto/software-engineering-skills");
    expect(installCommand(ref, "clean-code")).toBe("npx skills add wesleyegberto/software-engineering-skills --skill clean-code --yes");
  });
});
