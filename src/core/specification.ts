import type {
  AgentArchitecture,
  AgentGraphEdge,
  AgentSpec,
  EdgeKind,
  KnowledgeState,
  PermissionSpec,
  Question,
  RuntimeRequirements,
  SelfImprovementPolicy,
} from "./types.js";
import { matchProfessions, roleForProfession } from "./profession-index.js";

// ---------------------------------------------------------------------------
// Role derivation
// ---------------------------------------------------------------------------

type Role = "research" | "implementation" | "review" | "infrastructure" | "operations" | "monitoring" | "documentation" | "generalist";

const ROLE_SIGNALS: Array<{ role: Role; patterns: RegExp[] }> = [
  { role: "research", patterns: [/\b(research|investigat|analy[sz]e|diagnos|triage|hypothes)/i] },
  { role: "implementation", patterns: [/\b(implement|fix|refactor|patch|write code|generat(e|ing) (code|patches))/i] },
  { role: "review", patterns: [/\b(review|audit|verif|check|approve)/i] },
  { role: "infrastructure", patterns: [/\b(kubernetes|k8s|docker|terraform|infra|cluster|deploy)/i] },
  { role: "operations", patterns: [/\b(deploy|release|rollout|rollback|incident)/i] },
  { role: "monitoring", patterns: [/\b(monitor|alert|metric|observ|log|trace)/i] },
  { role: "documentation", patterns: [/\b(document|docs|runbook|changelog)/i] },
];

function detectRole(text: string): Role {
  for (const { role, patterns } of ROLE_SIGNALS) {
    if (patterns.some((p) => p.test(text))) return role;
  }
  return "generalist";
}

const ROLE_NAMES: Record<Role, string> = {
  research: "researcher",
  implementation: "implementer",
  review: "reviewer",
  infrastructure: "infrastructure-analyst",
  operations: "operator",
  monitoring: "monitor",
  documentation: "documenter",
  generalist: "specialist",
};

const ROLE_PURPOSE: Record<Role, string> = {
  research: "Investigate and analyze to establish the facts needed for decisions.",
  implementation: "Produce the change: code, patches, configuration.",
  review: "Independently verify work against the validation criteria before it lands.",
  infrastructure: "Understand and reason about the deployment environment and its configuration.",
  operations: "Execute operational procedures with the required approvals.",
  monitoring: "Watch signals and surface anomalies worth acting on.",
  documentation: "Capture durable knowledge where the project can find it.",
  generalist: "Own the full task end to end within the declared scope.",
};

const ROLE_PERMISSIONS: Record<Role, PermissionSpec> = {
  research: {
    read: ["repository", "logs", "metrics"],
    write: [],
    execute: ["read-only diagnostics"],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  implementation: {
    read: ["repository"],
    write: ["working-tree patches (proposal unless approved)"],
    execute: ["tests", "linters"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: ["apply changes outside working tree"],
  },
  review: {
    read: ["repository", "artifacts"],
    write: ["review comments"],
    execute: ["tests"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: [],
  },
  infrastructure: {
    read: ["repository", "infrastructure config"],
    write: [],
    execute: ["read-only infrastructure queries"],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  operations: {
    read: ["repository", "infrastructure config", "logs"],
    write: [],
    execute: ["declared operational procedures"],
    network: [],
    secrets: [],
    production: "write",
    humanApproval: ["every production action"],
  },
  monitoring: {
    read: ["metrics", "logs", "alerts"],
    write: [],
    execute: [],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  documentation: {
    read: ["repository", "artifacts"],
    write: ["documentation files"],
    execute: [],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: [],
  },
  generalist: {
    read: ["repository"],
    write: ["working-tree patches (proposal unless approved)"],
    execute: ["tests"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: ["apply changes outside working tree"],
  },
};

// ---------------------------------------------------------------------------
// Single agent vs team decision
// ---------------------------------------------------------------------------

export interface SplitSignal {
  signal: string;
  detail: string;
}

export function detectSplitSignals(state: KnowledgeState): SplitSignal[] {
  const text = state.facts.map((f) => f.statement).join(" ");
  const signals: SplitSignal[] = [];

  const hasEnv = /\b(kubernetes|k8s|production|infra|cluster)\b/i.test(text);
  const hasCode = /\b(code|repository|repo|codebase|typescript|python|backend)\b/i.test(text);
  const hasReview = /\b(review|approve|verify|validate)\b/i.test(text);
  const hasOps = /\b(deploy|restart|rollback|incident)\b/i.test(text);
  const userAskedMulti = state.questions.some(
    (q) => q.status === "answered" && q.topics.includes("multi-agent"),
  ) || /\b(sub-?agent|multi-?agent|team of agents)\b/i.test(text);

  if (hasEnv && hasCode) {
    signals.push({ signal: "environment-vs-code", detail: "The task spans both source code and a distinct runtime environment (e.g. Kubernetes); these need different tools and read scopes." });
  }
  if (hasCode && hasReview) {
    signals.push({ signal: "build-vs-review", detail: "The agent both produces changes and verifies them; separation enforces the information firewall between making and checking." });
  }
  if (hasOps) {
    signals.push({ signal: "operations-risk", detail: "Operational actions (deploy/restart/rollback) carry blast radius; isolating them behind approval gates is safer." });
  }
  if (userAskedMulti) {
    signals.push({ signal: "explicit-multi-agent", detail: "The requirements explicitly call for multiple agents." });
  }
  return signals;
}

export function decideSingleVsTeam(state: KnowledgeState): {
  singleAgentSufficient: boolean;
  reason: string;
  separatedResponsibilities: string[];
} {
  const signals = detectSplitSignals(state);
  const readOnly = isReadOnlySystem(state);
  const multi = explicitlyMultiAgent(state);
  if (readOnly && !multi) {
    return {
      singleAgentSufficient: true,
      reason: "The captured requirements explicitly describe a read-only system; producing and executing changes is out of scope, so implementation/operations agents would violate the permission model.",
      separatedResponsibilities: [],
    };
  }
  if (signals.length >= 2) {
    return {
      singleAgentSufficient: false,
      reason: readOnly
        ? `Requirements indicate ${signals.length} separable concerns (${signals.map((s) => s.signal).join(", ")}); the team will be restricted to read-only roles.`
        : `Requirements indicate ${signals.length} separable concerns: ${signals.map((s) => s.signal).join(", ")}.`,
      separatedResponsibilities: signals.map((s) => s.signal),
    };
  }
  return {
    singleAgentSufficient: true,
    reason: signals.length === 1
      ? `Only one separable concern (${signals[0]?.signal}); a single well-scoped agent avoids orchestration overhead.`
      : "No separable concerns detected; a single agent keeps the system simple and inspectable.",
    separatedResponsibilities: [],
  };
}

/**
 * True when the captured requirements explicitly declare the system read-only
 * (the write-access interview question establishes this polarity). Positive
 * markers are used instead of write-word matching: a sentence like "posts
 * comments for humans to approve before merge" mentions writes that belong to
 * humans, not to the agent.
 */
export function isReadOnlySystem(state: KnowledgeState): boolean {
  return state.facts.some((fact) => READ_ONLY_MARKERS.test(fact.statement));
}

const READ_ONLY_MARKERS = new RegExp(
  [
    "\\b(read-only|readonly)\\b",
    "\\bnever\\s+(modif|write|touch|deploy|restart|edit)",
    "\\bno\\s+write\\s+access\\b",
    "\\b(reads?|analy[sz]es?|comments?|reviews?)\\s+only\\b",
    "\\bonly\\s+(reads?|analy[sz]es?|comments?|reviews?)\\b",
    "\\bread(s)?\\s+and\\s+analy[sz]e(s)?\\s+only\\b",
    "\\bcomments?\\s+only,?\\s+never\\b",
  ].join("|"),
  "i",
);

/** Roles that are safe for read-only systems (no produce/execute duties). */
const READ_ONLY_SAFE_ROLES = new Set<Role>([
  "research",
  "review",
  "infrastructure",
  "monitoring",
  "documentation",
]);

/** True when the requirements explicitly asked for multiple agents. */
export function explicitlyMultiAgent(state: KnowledgeState): boolean {
  const intentAndFacts = `${state.intent} ${state.facts.map((f) => f.statement).join(" ")}`;
  if (/\b(sub-?agent|multi-?agent|team of agents)\b/i.test(intentAndFacts)) return true;
  return state.questions.some(
    (q) => q.status === "answered" && q.template === "multi-agent-split",
  );
}

// ---------------------------------------------------------------------------
// Agent spec derivation
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "agent";
}

const INTENT_FILLER = new Set([
  "i", "we", "want", "need", "a", "an", "the", "my", "our", "me", "build", "create",
  "make", "agent", "agents", "that", "which", "helps", "help", "to", "for", "with",
  "and", "or", "of", "in", "on", "it", "should", "can", "will", "system", "tool",
]);

/** Extract a short topical slug from the intent, ignoring filler words. */
function intentTopicSlug(state: KnowledgeState): string {
  const words = state.intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !INTENT_FILLER.has(w));
  return words.slice(0, 2).join("-");
}

function deriveName(state: KnowledgeState, role: Role): string {
  const base = ROLE_NAMES[role];
  const topic = intentTopicSlug(state);
  return topic && topic !== base ? `${topic}-${base}` : base;
}

function deriveTools(state: KnowledgeState): string[] {
  const tools = new Set<string>();
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\bkubernetes|k8s\b/i.test(text)) tools.add("kubectl (read-only)");
  if (/\blogs?\b/i.test(text)) tools.add("log search");
  if (/\bmetrics?\b/i.test(text)) tools.add("metrics queries");
  if (/\btraces?\b/i.test(text)) tools.add("distributed tracing");
  if (/\bgithub|git\b/i.test(text)) tools.add("git");
  if (/\btest/i.test(text)) tools.add("test runner");
  if (tools.size === 0) tools.add("filesystem read");
  return [...tools];
}

function deriveValidation(state: KnowledgeState): string[] {
  const validation: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\btest/i.test(text)) validation.push("relevant tests pass before handing off");
  if (/\b(validat|verify|check)\b/i.test(text)) validation.push("declared validation criteria are checked on every output");
  validation.push("outputs conform to the declared input/output contract");
  validation.push("no action outside the declared permissions is attempted");
  return [...new Set(validation)];
}

function deriveEscalation(state: KnowledgeState): string[] {
  const escalation: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\b(production|prod)\b/i.test(text)) escalation.push("any action that would touch production requires explicit human approval");
  if (/\b(secret|credential|token)\b/i.test(text)) escalation.push("requests for secrets not in the allowlist are refused and reported");
  escalation.push("uncertainty about permissions escalates to the orchestrator/human instead of guessing");
  return [...new Set(escalation)];
}

function deriveConstraints(state: KnowledgeState): string[] {
  const constraints: string[] = [];
  for (const fact of state.facts) {
    if (fact.category === "constraint" || fact.category === "permission") {
      constraints.push(fact.statement);
    }
  }
  return [...new Set(constraints)].slice(0, 8);
}

function deriveSkills(role: Role, state: KnowledgeState): string[] {
  const skills: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (role === "research") skills.push("systematic investigation");
  if (role === "implementation") skills.push("test-driven implementation");
  if (role === "review") skills.push("independent review");
  if (role === "infrastructure" || /\bkubernetes|k8s\b/i.test(text)) skills.push("infrastructure analysis");
  return skills;
}

export function buildAgentSpec(
  state: KnowledgeState,
  role: Role,
  opts: { scopeNote?: string; factIds?: string[]; questionIds?: string[]; profile?: string; purpose?: string; name?: string } = {},
): AgentSpec {
  const name = opts.name ?? deriveName(state, role);
  const answered = state.questions.filter((q) => q.status === "answered");
  return {
    id: name,
    name,
    role,
    purpose: opts.purpose ?? ROLE_PURPOSE[role],
    scope: opts.scopeNote ?? `Limited to the responsibilities implied by the captured intent: ${state.intent.slice(0, 120)}`,
    responsibilities: answered
      .flatMap((q) => q.answer?.facts ?? [])
      .slice(0, 6),
    nonGoals: deriveNonGoals(state),
    inputs: deriveInputs(answered),
    outputs: deriveOutputs(answered),
    tools: deriveTools(state),
    skills: deriveSkills(role, state),
    context: { framework: "filesystem", scopes: ["repository"] },
    permissions: structuredClone(ROLE_PERMISSIONS[role]),
    constraints: deriveConstraints(state),
    escalation: deriveEscalation(state),
    validation: deriveValidation(state),
    dependencies: [],
    ...(opts.profile ? { profile: opts.profile } : {}),
    provenance: {
      sessionId: state.sessionId,
      derivedFromFacts: opts.factIds ?? state.facts.map((f) => f.id),
      derivedFromQuestions: opts.questionIds ?? answered.map((q) => q.id),
    },
  };
}

function deriveNonGoals(state: KnowledgeState): string[] {
  const nonGoals: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (!/\b(modify|write|restart|change|fix|apply)\b/i.test(text)) {
    nonGoals.push("no write access assumed: read and analyze only unless explicitly granted");
  }
  if (!/\bproduction\b/i.test(text)) nonGoals.push("no production access");
  nonGoals.push("no expansion of its own permissions at runtime");
  return nonGoals;
}

function deriveInputs(answered: Question[]): string[] {
  const inputs: string[] = [];
  for (const q of answered) {
    if (q.topics.includes("inputs") && q.answer) {
      inputs.push(q.answer.raw);
    }
  }
  if (inputs.length === 0) inputs.push("task descriptions handed off by the orchestrator");
  return inputs;
}

function deriveOutputs(answered: Question[]): string[] {
  const outputs: string[] = [];
  for (const q of answered) {
    if (q.topics.includes("outputs") && q.answer) {
      outputs.push(q.answer.raw);
    }
  }
  if (outputs.length === 0) outputs.push("structured findings/patches as declared artifacts");
  return outputs;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

function edge(
  from: string,
  to: string,
  kind: EdgeKind,
  artifacts: string[],
  contextScopes: string[],
  parallel: boolean,
): AgentGraphEdge {
  return { from, to, kind, artifacts, contextScopes, parallel };
}

export function buildGraph(
  agents: AgentSpec[],
  decision: { singleAgentSufficient: boolean },
): AgentGraphEdge[] {
  const edges: AgentGraphEdge[] = [];
  if (decision.singleAgentSufficient || agents.length <= 1) return edges;

  const byRole = (role: string) => agents.find((a) => a.role === role);
  const researcher = byRole("research");
  const implementer = byRole("implementation");
  const reviewer = byRole("review");
  const infra = byRole("infrastructure");
  const operator = byRole("operations");
  const monitor = byRole("monitoring");
  const documenter = byRole("documentation");
  const coordinator = agents[0]!;

  // Self-edge guard: a coordinator that also fills a role must never be wired
  // to itself (PA004 — the `documenter → coordinator` and `reviewer →
  // coordinator` cases collapse this way).
  const link = (from: string | undefined, to: string | undefined, kind: EdgeKind, artifacts: string[], contextScopes: string[], parallel: boolean) => {
    if (from !== undefined && to !== undefined && from !== to) {
      edges.push(edge(from, to, kind, artifacts, contextScopes, parallel));
    }
  };

  if (researcher && implementer) {
    link(researcher.id, implementer.id, "handoff", ["research-findings"], ["architecture-relevant"], false);
  }
  if (infra && researcher) {
    link(researcher.id, infra.id, "delegates", ["diagnosis-questions"], ["infrastructure-config"], true);
  }
  if (implementer && reviewer) {
    link(implementer.id, reviewer.id, "review", ["patches", "change-description"], ["diff-relevant"], false);
  }
  if (reviewer) {
    link(reviewer.id, coordinator.id, "aggregates", ["review-verdict"], [], false);
  }
  if (operator) {
    const source = reviewer ?? coordinator;
    link(source?.id, operator.id, "handoff", ["approved-change-plan"], ["runbook"], false);
  }
  if (monitor) {
    link(monitor.id, coordinator.id, "escalates", ["anomaly-report"], ["metrics", "logs"], true);
  }
  if (documenter) {
    link(documenter.id, coordinator.id, "aggregates", ["documentation-update"], [], true);
  }

  // Duplicate role matches (PA007): the catalog can legitimately map several
  // professions onto one role, and `byRole` above only wires the first. Give
  // every extra member a peer: reviewers review the implementer, extra
  // operators receive the release handoff, anything else aggregates to the
  // coordinator.
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  for (const agent of agents) {
    if (connected.has(agent.id)) continue;
    let pushed: AgentGraphEdge | null = null;
    if (agent.role === "review") {
      if (implementer && agent.id !== implementer.id) {
        pushed = edge(implementer.id, agent.id, "review", ["patches", "change-description"], ["diff-relevant"], false);
      }
    } else if (agent.role === "operations") {
      const source = reviewer ?? coordinator;
      if (source && agent.id !== source.id) {
        pushed = edge(source.id, agent.id, "handoff", ["approved-change-plan"], ["runbook"], false);
      }
    } else if (coordinator && agent.id !== coordinator.id) {
      pushed = edge(agent.id, coordinator.id, "aggregates", [`${agent.role}-report`], [], true);
    }
    if (pushed) {
      edges.push(pushed);
      connected.add(pushed.from);
      connected.add(pushed.to);
      connected.add(agent.id);
    }
  }

  // The coordinator itself must never be orphaned (PA007): when every would-be
  // edge toward it collapsed into a self-edge, peer it into the first non-self
  // member so it stays a routing hub.
  if (coordinator && agents.length > 1 && !edges.some((e) => e.from === coordinator.id || e.to === coordinator.id)) {
    const peer = agents.find((a) => a.id !== coordinator.id);
    if (peer) {
      edges.push(edge(peer.id, coordinator.id, "aggregates", ["findings-report"], [], true));
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Runtime requirements derivation
// ---------------------------------------------------------------------------

export function deriveRuntimeRequirements(arch: {
  agents: AgentSpec[];
  edges: AgentGraphEdge[];
}): RuntimeRequirements {
  const multiAgent = arch.agents.length > 1;
  const delegation = arch.edges.some((e) => e.kind === "delegates");
  const handoffs = arch.edges.some((e) => e.kind === "handoff");
  const parallel = arch.edges.some((e) => e.parallel);
  return {
    multiAgent,
    subAgents: multiAgent,
    parallelExecution: parallel,
    handoffs,
    delegation,
    toolUse: true,
    persistentAgents: false,
    agentTeams: multiAgent,
  };
}

// ---------------------------------------------------------------------------
// Full architecture
// ---------------------------------------------------------------------------

export function buildArchitecture(
  state: KnowledgeState,
  selfImprovement?: SelfImprovementPolicy,
): AgentArchitecture {
  const decision = decideSingleVsTeam(state);

  if (decision.singleAgentSufficient) {
    const role = detectRole(state.facts.map((f) => f.statement).join(" ") + " " + state.intent);
    const spec = buildAgentSpec(state, role);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      sessionId: state.sessionId,
      decision,
      agents: [spec],
      edges: [],
      runtime: deriveRuntimeRequirements({ agents: [spec], edges: [] }),
      selfImprovement,
    };
  }

  // Multi-agent: the catalog is the matching source. When the intent names   // professions the registry actually ships (by name, slug or tag), the
  // crew is derived as profile-bound members — the deliverable is the crew
  // the project needs, not a research team modeling the interview. The
  // interview process itself is never part of the output.
  const text = state.facts.map((f) => f.statement).join(" ") + " " + state.intent;
  const readOnly = isReadOnlySystem(state);
  const professions = matchProfessions(text, process.cwd());

  const agents: AgentSpec[] = [];
  if (professions.length >= 2) {
    for (const p of professions) {
      const role = roleForProfession(p) as Role;
      if (readOnly && !READ_ONLY_SAFE_ROLES.has(role)) continue;
      agents.push(
        buildAgentSpec(state, role, {
          profile: p.slug,
          name: p.slug,
          purpose: p.description || ROLE_PURPOSE[role],
          scopeNote: `Operates as the ${p.name} profession for: ${state.intent.slice(0, 100)}`,
        }),
      );
    }
  }

  if (agents.length < 2) {
    // Fall back to the generic role derivation when the catalog cannot
    // supply at least two matching professions.
    const roles = new Set<Role>();
    for (const { role, patterns } of ROLE_SIGNALS) {
      if (patterns.some((p) => p.test(text))) roles.add(role);
    }
    if (readOnly) {
      for (const role of [...roles]) {
        if (!READ_ONLY_SAFE_ROLES.has(role)) roles.delete(role);
      }
    }
    if (!roles.has("research")) roles.add("research");
    if (!readOnly && !roles.has("implementation") && (roles.has("research") || roles.has("infrastructure"))) {
      roles.add("implementation");
    }
    if (roles.size >= 2) roles.add("review");
    agents.length = 0;
    for (const role of roles) {
      const spec = buildAgentSpec(state, role, {
        scopeNote: `Owns only the ${role} responsibilities of: ${state.intent.slice(0, 100)}`,
      });
      agents.push(spec);
    }
  }

  // First agent (or a dedicated one) becomes the coordinator.
  const team: AgentTeam_Type = {
    id: "team",
    name: "agent-team",
    coordinator: agents[0]?.id ?? "coordinator",
    members: agents.map((a) => a.id),
    rationale: decision.reason,
  };

  const arch: AgentArchitecture = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionId: state.sessionId,
    decision,
    agents,
    team,
    edges: buildGraph(agents, decision),
    runtime: deriveRuntimeRequirements({ agents, edges: buildGraph(agents, decision) }),
    selfImprovement,
  };
  return arch;
}

type AgentTeam_Type = NonNullable<AgentArchitecture["team"]>;
