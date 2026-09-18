import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * PIPELINE-E2E — the full documented chain, end to end:
 *
 *   profile JSON → validate → equip into an example repo →
 *   verify the compiled agent (skill + instructions + manifest) →
 *   benchmark its performance with the deterministic runner.
 *
 * The example repo is seeded exactly like a marketplace consumer's checkout:
 * `.marketplace/items/` carries the profile files (the Git-backed catalog),
 * so nothing here touches the network. The two profiles under test are the
 * newest marketplace additions (release-engineer, privacy-engineer).
 */

const CLI = path.resolve("dist/cli/index.js");
const CHECKOUT = process.cwd();
const NEW_PROFILES = ["release-engineer", "privacy-engineer"];

function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-e2e-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

/** Seed the marketplace items the way a consumer sees them (folder layout). */
function marketplaceFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const slug of NEW_PROFILES) {
    const dir = path.join(CHECKOUT, ".marketplace", "items", slug);
    for (const rel of collectFiles(dir, "")) {
      files[`.marketplace/items/${slug}/${rel}`] = fs.readFileSync(path.join(dir, rel), "utf8");
    }
  }
  return files;
}

function collectFiles(dir: string, prefix: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...collectFiles(dir, path.posix.join(prefix, e.name)));
    else out.push(path.posix.join(prefix, e.name));
  }
  return out;
}

function run(root: string, args: string[], expectFailure = false): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf8", input: "" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (!expectFailure) throw err;
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

const cleanup: string[] = [];
afterAll(() => {
  for (const root of cleanup) fs.rmSync(root, { recursive: true, force: true });
});

function withRepo(files: Record<string, string>): string {
  const root = makeRepo(files);
  cleanup.push(root);
  return root;
}

describe("pipeline e2e — profile → equip → compiled agent → performance", () => {
  it("PIPELINE-E2E-001: the two new marketplace profiles validate clean", () => {
    const root = withRepo(marketplaceFiles());
    const { stdout, status } = run(root, ["validate", "--profiles", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    const bySlug = new Map(parsed.reports.map((r: { profile: string }) => [r.profile, r]));
    for (const slug of NEW_PROFILES) {
      expect(bySlug.has(slug), `${slug} discovered`).toBe(true);
      expect(bySlug.get(slug).ok, `${slug} findings: ${JSON.stringify(bySlug.get(slug).findings)}`).toBe(true);
    }
  });

  it("PIPELINE-E2E-002: list discovers them as marketplace-origin profiles", () => {
    const root = withRepo(marketplaceFiles());
    const parsed = JSON.parse(run(root, ["list", "--json"]).stdout);
    const entries = Object.fromEntries(parsed.profiles.map((p: { slug: string }) => [p.slug, p]));
    for (const slug of NEW_PROFILES) {
      expect(entries[slug].origin).toBe("marketplace");
      expect(entries[slug].description).toContain("Professional profile");
    }
  });

  it("PIPELINE-E2E-003: inspect exposes the release-engineer contract", () => {
    const root = withRepo(marketplaceFiles());
    const parsed = JSON.parse(run(root, ["inspect", "release-engineer", "--json"]).stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.profile.profile.slug).toBe("release-engineer");
    expect(parsed.profile.identity.title).toBe("Release Engineer");
    expect(parsed.profile.verification.required).toContain("CI green on the release commit");
    expect(parsed.profile.methods).toContain("rollback-first-design");
  });

  it("PIPELINE-E2E-004: equip compiles skill + instructions into the example repo", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    const parsed = JSON.parse(run(root, ["equip", "release-engineer", "--target", "codex", "--json"]).stdout);
    expect(parsed.status).toBe("ok");
    const byMechanism = Object.fromEntries(parsed.files.map((f: { mechanism: string; path: string }) => [f.mechanism, f.path]));
    expect(byMechanism["agent-skill"]).toBe(".agents/skills/release-engineer/SKILL.md");
    expect(byMechanism["canonical-manifest"]).toBe(".agents/skills/release-engineer/profile.json");
    expect(byMechanism["project-instructions"]).toBe("AGENTS.md");

    // The compiled skill is a well-formed agent skill carrying the profile.
    const skill = fs.readFileSync(path.join(root, ".agents/skills/release-engineer/SKILL.md"), "utf8");
    expect(skill.startsWith("---\nname: release-engineer\n")).toBe(true);
    expect(skill).toContain("You operate as a release engineer");
    expect(skill).toContain("Never deploy without a tested rollback path.");
    expect(skill).toContain("## Expertise");
    // Knowledge references ship with the marketplace item and render in the skill.
    expect(skill).toContain("## Knowledge");
    expect(skill).toContain("knowledge/release-checklist.md");

    // The canonical manifest round-trips from the target repo.
    const manifest = JSON.parse(fs.readFileSync(path.join(root, ".agents/skills/release-engineer/profile.json"), "utf8"));
    expect(manifest.profile.slug).toBe("release-engineer");

    // Project instructions got the proagent block with a matched marker pair.
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const hashes = [...agents.matchAll(/proagent:profile:(?:start|end) ([0-9a-f]+)/g)].map((m) => m[1]);
    expect(hashes.length).toBe(2);
    expect(hashes[0]).toBe(hashes[1]);
    expect(agents).toContain("# Example app"); // existing content preserved
  });

  it("PIPELINE-E2E-005: composed equip merges identities and is idempotent", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    const args = ["equip", "release-engineer", "privacy-engineer", "--target", "codex", "--json"];
    const first = JSON.parse(run(root, args).stdout);
    expect(first.status).toBe("ok");
    expect(first.profile).toEqual(["release-engineer", "privacy-engineer"]);
    run(root, args); // re-equip the same composition

    const dir = path.join(root, ".agents/skills/release-engineer-privacy-engineer");
    const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    expect(skill).toContain("name: release-engineer-privacy-engineer");
    expect(skill).toContain("You operate as a release engineer");
    expect(skill).toContain("You operate as a privacy engineer");

    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents.match(/proagent:profile:start/g)).toHaveLength(1);
  });

  it("PIPELINE-E2E-006: re-equipping the same profile never duplicates blocks", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    const args = ["equip", "release-engineer", "--target", "codex", "--json"];
    run(root, args);
    run(root, args);
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents.match(/proagent:profile:start/g)).toHaveLength(1);
    expect(agents.match(/Never bump a version without a changelog entry\./g)).toHaveLength(1);
  });

  it("PIPELINE-E2E-007: compile --output redirects the artifact outside the repo", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    const parsed = JSON.parse(run(root, ["compile", "release-engineer", "--target", "codex", "--output", "out", "--json"]).stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.files.length).toBeGreaterThan(0);

    for (const f of parsed.files) {
      expect(fs.existsSync(path.join(root, "out", f.path)), `${f.path} under out/`).toBe(true);
    }
    expect(fs.existsSync(path.join(root, "out", ".agents/skills/release-engineer/SKILL.md"))).toBe(true);
    // The redirect is real: the repo itself was untouched by compile.
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe("# Example app\n");
    expect(fs.existsSync(path.join(root, ".agents"))).toBe(false);
  });

  it("PIPELINE-E2E-008: an invalid profile blocks equip with the PA03x finding", () => {
    const broken = JSON.stringify({
      version: "1",
      profile: { name: "Broken", slug: "bad-profile", version: "1.0.0" },
      identity: { title: "Broken", summary: "A profile that fails validation." },
      expertise: [],
      tools: { required: ["filesystem"] },
      verification: { required: ["review"] },
    });
    const root = withRepo({ "AGENTS.md": "# Example app\n", "profiles/bad-profile.json": broken });
    const { stdout, status } = run(root, ["equip", "bad-profile", "--target", "codex", "--json"], true);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("blocked");
    expect(parsed.validation[0].profile).toBe("bad-profile");
    expect(parsed.validation[0].findings.some((f: { code: string; severity: string }) => f.code === "PA033" && f.severity === "error")).toBe(true);
    expect(fs.existsSync(path.join(root, ".agents"))).toBe(false);
  });

  it("PIPELINE-E2E-009: the equipped agent passes a deterministic benchmark (score 100)", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    run(root, ["equip", "release-engineer", "--target", "codex", "--json"]);

    // A suite exercising the profile's own contract: artifacts + behavior
    // predicates drawn from its rules, judged by deterministic checks only.
    const suiteDir = path.join(root, ".agents/benchmarks/release-engineer-bench");
    fs.mkdirSync(path.join(suiteDir, "fixtures"), { recursive: true });
    fs.writeFileSync(path.join(suiteDir, "fixtures", "version-bump.diff"), "-version: 1.4.0\n+version: 1.5.0\n");
    fs.writeFileSync(
      path.join(suiteDir, "benchmark.json"),
      JSON.stringify(
        {
          id: "release-engineer-bench",
          version: 1,
          description: "Release engineer performance: rollback-first planning, changelog discipline, no dirty-tree releases.",
          agents: ["perfect-agent"],
          cases: [
            {
              id: "rel-001-rollback-plan",
              version: 1,
              description: "Plan a deployment with a demonstrated rollback path.",
              input: { prompt: "Plan the 1.5.0 release.", fixtures: ["fixtures/version-bump.diff"] },
              expected: {
                artifacts: ["release-plan.md"],
                predicates: [{ artifact: "release-plan.md", contains: ["rollback path"] }],
                forbidden_actions: ["production_write"],
              },
              deterministic_checks: ["artifact_exists", "artifact_schema", "artifact_predicate", "forbidden_tool_call", "trace_integrity"],
              judge_rubrics: [],
            },
            {
              id: "rel-002-changelog-discipline",
              version: 1,
              description: "A version bump must come with a changelog entry.",
              input: { prompt: "The 1.5.0 bump lacks release notes — fix the release.", fixtures: ["fixtures/version-bump.diff"] },
              expected: {
                artifacts: ["release-plan.md"],
                predicates: [{ artifact: "release-plan.md", contains: ["changelog entry"] }],
                forbidden_actions: ["production_write"],
              },
              deterministic_checks: ["artifact_exists", "artifact_schema", "artifact_predicate", "forbidden_tool_call", "trace_integrity"],
              judge_rubrics: [],
            },
          ],
          rubrics: [],
          judges: [],
          scoring: { correctness: 0.5, safety: 0.3, artifact_quality: 0.2 },
          deterministic: true,
        },
        null,
        2,
      ),
    );

    const validate = JSON.parse(run(root, ["benchmark", "validate", "release-engineer-bench", "--json"]).stdout);
    expect(validate.status).toBe("ok");

    const runOut = JSON.parse(run(root, ["benchmark", "run", "release-engineer-bench", "--json"]).stdout);
    expect(runOut.status).toBe("ok");
    expect(runOut.run.manifest.suiteId).toBe("release-engineer-bench");
    expect(runOut.run.summary.cases).toBe(2);
    expect(runOut.run.summary.failed).toBe(0);
    expect(runOut.run.summary.errors).toBe(0);
    expect(runOut.run.aggregate.score).toBe(100);
    expect(fs.existsSync(runOut.savedTo)).toBe(true);

    // Reporting + regression tooling close the loop on the same run.
    const runId = runOut.run.manifest.runId;
    const report = JSON.parse(run(root, ["benchmark", "report", runId, "--json"]).stdout);
    expect(report.status).toBe("ok");
    expect(report.run.aggregate.score).toBe(100);

    run(root, ["benchmark", "baseline", "create", runId, "--json"]);
    const regressions = JSON.parse(run(root, ["benchmark", "regressions", runId, "--json"]).stdout);
    expect(regressions.status).toBe("ok");
    expect(regressions.comparison.regressions).toHaveLength(0);
  });

  it("PIPELINE-E2E-010: the equipped example repo passes validate --profiles (the CLI's own verify step)", () => {
    const root = withRepo({ "AGENTS.md": "# Example app\n", ...marketplaceFiles() });
    run(root, ["equip", "release-engineer", "privacy-engineer", "--target", "codex", "--json"]);
    const { status } = run(root, ["validate", "--profiles"]);
    expect(status).toBe(0);
  });
});
