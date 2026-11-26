import type { SpecDocument, SpecFinding } from "./types.js";

/**
 * Plan view — the read-only plan surface for a project spec (Studio Build
 * output, `proagents.yaml`). Pure + deterministic: buckets the environment
 * into canonical-ordered sections the way the registry serializer does,
 * derives a status from PA5xx findings, and lists the next CLI steps.
 * Complements serializeSpecYaml in project-spec.ts (single source of the
 * canonical YAML bytes).
 */

export type PlanSectionKind =
  | "project"
  | "profiles"
  | "crews"
  | "agents"
  | "workflows"
  | "capabilities"
  | "skills"
  | "tools"
  | "mcp"
  | "policies"
  | "harness";

export interface PlanSection {
  kind: PlanSectionKind;
  title: string;
  items: string[];
}

/** Canonical environment section order (mirror of src/registry/spec.ts). */
const ENV_ORDER: Array<PlanSectionKind> = [
  "profiles",
  "crews",
  "agents",
  "workflows",
  "capabilities",
  "skills",
  "tools",
  "mcp",
];

const TITLES: Record<PlanSectionKind, string> = {
  project: "Project",
  profiles: "Profiles",
  crews: "Crews",
  agents: "Agents",
  workflows: "Workflows",
  capabilities: "Capabilities",
  skills: "Skills",
  tools: "Tools",
  mcp: "MCP servers",
  policies: "Policies",
  harness: "Harness",
};

/** Deterministic, deduped, sorted — same ordering the registry serializer uses. */
function bucketItems(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])].sort();
}

export function buildPlanSections(spec: SpecDocument): PlanSection[] {
  const sections: PlanSection[] = [];

  sections.push({ kind: "project", title: TITLES.project, items: [spec.project.name] });

  for (const kind of ENV_ORDER) {
    const ids = (spec.environment as Record<string, string[] | undefined>)[kind];
    const items = bucketItems(ids);
    if (items.length === 0) continue;
    sections.push({ kind, title: TITLES[kind], items });
  }

  const policies = spec.policies;
  if (policies && (policies.filesystem?.["workspace-only"] === true || (policies.network?.allowed?.length ?? 0) > 0)) {
    const items: string[] = [];
    if (policies.filesystem?.["workspace-only"] === true) items.push("filesystem: workspace-only");
    if (policies.network?.allowed?.length) items.push(`network: ${bucketItems(policies.network.allowed).join(", ")}`);
    sections.push({ kind: "policies", title: TITLES.policies, items });
  }

  const harness = spec.harness;
  if (harness && (harness.mode || (harness.compatibility?.length ?? 0) > 0)) {
    const items: string[] = [];
    if (harness.mode) items.push(harness.mode);
    items.push(...bucketItems(harness.compatibility));
    sections.push({ kind: "harness", title: TITLES.harness, items });
  }

  return sections;
}

export interface PlanStatus {
  state: "ready" | "reviewable" | "blocked";
  errors: number;
  warnings: number;
}

/** PA5xx-derived buildability state. */
export function planStatus(findings: SpecFinding[]): PlanStatus {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const state: PlanStatus["state"] = errors > 0 ? "blocked" : warnings > 0 ? "reviewable" : "ready";
  return { state, errors, warnings };
}

export interface PlanStep {
  command: string;
  note: string;
}

/** Deterministic next steps — validate is always first; setup/resolve adapt to the spec. */
export function planNextSteps(spec: SpecDocument): PlanStep[] {
  const steps: PlanStep[] = [
    { command: "proagent validate --spec proagents.yaml", note: "PA5xx check before you build." },
  ];
  const env = spec.environment;
  const hasArtifacts = (env.profiles?.length ?? 0) > 0 || (env.crews?.length ?? 0) > 0 || (env.agents?.length ?? 0) > 0;
  const hasUnresolvedCaps = (env.capabilities?.length ?? 0) > 0 && !hasArtifacts;
  const targets = bucketItems(spec.harness?.compatibility);
  if (targets.length > 0) {
    steps.push({
      command: `proagent setup --harness ${targets.join(",")}`,
      note: "Resolve, compile and install into your repo for the targeted harness.",
    });
  }
  if (hasUnresolvedCaps) {
    steps.push({
      command: "proagent resolve --capabilities",
      note: "Fetch implementations for capability-only picks before installing.",
    });
  }
  return steps;
}