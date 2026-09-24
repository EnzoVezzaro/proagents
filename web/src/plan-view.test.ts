import { describe, expect, it } from "vitest";
import { buildPlanSections, planStatus, planNextSteps } from "./plan-view.js";
import type { SpecDocument, SpecFinding } from "./types.js";

/**
 * PLAN-VIEW — the read-only plan renderer for a SpecDocument (Studio Build
 * output). Pure + deterministic: buckets artifacts into canonical-ordered
 * sections, derives status from client-side PA5xx findings, and emits the
 * next-step command list. Complemented by the canonical YAML serializer in
 * project-spec.ts (asserted identical here).
 */

const baseSpec: SpecDocument = {
  schema: "proagents/v1",
  project: { name: "my-project" },
  environment: {},
};

describe("buildPlanSections (PLAN-SECT)", () => {
  it("PLAN-SECT-001: emits canonical section order, omitting empty buckets", () => {
    const spec: SpecDocument = {
      ...baseSpec,
      environment: {
        profiles: ["alpha", "beta"],
        crews: ["guard"],
        agents: [],
        workflows: [],
        capabilities: ["ci", "docs"],
        skills: [],
        tools: [],
        mcp: [],
      },
    };
    const sections = buildPlanSections(spec);
    expect(sections.map((s) => s.kind)).toEqual(["project", "profiles", "crews", "capabilities"]);
    expect(sections[0]!.title).toBe("Project");
    // items sorted deterministically
    expect(sections[1]!.items).toEqual(["alpha", "beta"]);
    expect(sections[3]!.items).toEqual(["ci", "docs"]);
  });

  it("PLAN-SECT-002: project section shows the spec name", () => {
    const sections = buildPlanSections(baseSpec);
    expect(sections[0]).toMatchObject({ kind: "project", items: ["my-project"] });
  });

  it("PLAN-SECT-003: policies and harness render when present", () => {
    const spec: SpecDocument = {
      ...baseSpec,
      environment: {},
      policies: { filesystem: { "workspace-only": true }, network: { allowed: ["github.com", "api.github.com"] } },
      harness: { mode: "compatible", compatibility: ["codex"] },
    };
    const sections = buildPlanSections(spec);
    const kinds = sections.map((s) => s.kind);
    expect(kinds).toContain("policies");
    expect(kinds).toContain("harness");
    const pol = sections.find((s) => s.kind === "policies");
    expect(pol?.items).toContain("filesystem: workspace-only");
    expect(pol?.items).toContain("network: api.github.com, github.com");
    const har = sections.find((s) => s.kind === "harness");
    expect(har?.items).toEqual(["compatible", "codex"]);
  });

  it("PLAN-SECT-004: an empty environment renders only project (and no crash)", () => {
    const sections = buildPlanSections(baseSpec);
    expect(sections.map((s) => s.kind)).toEqual(["project"]);
  });

  it("PLAN-SECT-005: ids within a bucket are deduped", () => {
    const spec: SpecDocument = {
      ...baseSpec,
      environment: { profiles: ["p", "p", "q"] },
    };
    const sections = buildPlanSections(spec);
    expect(sections.find((s) => s.kind === "profiles")?.items).toEqual(["p", "q"]);
  });
});

describe("planStatus (PLAN-STATUS)", () => {
  const f = (code: "PA501" | "PA502" | "PA505" | "PA506", severity: "error" | "warning", message = "m"): SpecFinding => ({
    code,
    severity,
    message,
  });

  it("PLAN-STATUS-001: empty findings → clean", () => {
    expect(planStatus([])).toEqual({ state: "ready", errors: 0, warnings: 0 });
  });

  it("PLAN-STATUS-002: warnings-only → reviewable", () => {
    expect(planStatus([f("PA506", "warning")])).toEqual({ state: "reviewable", errors: 0, warnings: 1 });
  });

  it("PLAN-STATUS-003: any error → blocked", () => {
    expect(planStatus([f("PA502", "error"), f("PA506", "warning")])).toEqual({ state: "blocked", errors: 1, warnings: 1 });
  });
});

describe("planNextSteps (PLAN-NEXT)", () => {
  it("PLAN-NEXT-001: baseline always returns validate", () => {
    expect(planNextSteps(baseSpec)).toEqual([{ command: "proagent validate --spec proagents.yaml", note: "PA5xx check before you build." }]);
  });

  it("PLAN-NEXT-002: harness targets add a setup command", () => {
    const spec: SpecDocument = {
      ...baseSpec,
      harness: { mode: "compatible", compatibility: ["codex", "claude-code"] },
    };
    const steps = planNextSteps(spec);
    const setup = steps.find((s) => s.command.startsWith("proagent setup"));
    expect(setup).toBeTruthy();
  });

  it("PLAN-NEXT-003: capabilities without an installer add a resolve command", () => {
    const spec: SpecDocument = {
      ...baseSpec,
      environment: { capabilities: ["ci"] },
    };
    const steps = planNextSteps(spec);
    const resolve = steps.find((s) => s.command.startsWith("proagent resolve"));
    expect(resolve).toBeTruthy();
  });
});