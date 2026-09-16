import type { CrewContext, CrewDefinition, CrewMcpServer, CrewWorker } from "./types.js";

/**
 * Crew-draft logic — the pure, testable core of the crew builder wizard.
 * Extracted from BuilderPage so the regression suite can pin the behaviors
 * the dogfood run exposed (validation gating, MCP rename propagation,
 * empty-context stripping) without a browser.
 */

const SLUG_OK = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const BUILTIN_FRAMEWORKS = ["filesystem", "git", "acc"];

export function newWorker(index: number, profile?: string): CrewWorker {
  const base: CrewWorker = {
    id: `worker-${index + 1}`,
    name: `Worker ${index + 1}`,
    role: "researcher",
    description: "",
    permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: [], approvalGates: [] },
    mcpServers: [],
    // Start with no context rows: an empty placeholder row ships as silent
    // garbage (a filesystem binding with no scope). Add rows deliberately.
    context: [],
    instructions: "",
    receivesFrom: [],
    emits: [],
  };
  return profile ? { ...base, profile } : base;
}

/** Client-side mirror of crewProblems (src/crew/validate.ts). */
export function validateCrewDraft(crew: CrewDefinition): string[] {
  const problems: string[] = [];
  if (!crew.id || !SLUG_OK.test(crew.id)) problems.push("Crew id must be a lowercase slug (a-z, 0-9, dashes).");
  if (!crew.name) problems.push("Crew name is required.");
  if (!/^\d+\.\d+\.\d+/.test(crew.version)) problems.push("Version must be semver.");
  if (!crew.description) problems.push("Description is required.");
  if (!crew.author) problems.push("Author is required (your GitHub handle).");
  if (crew.workers.length === 0) problems.push("Add at least one worker.");
  const nameCount = new Map<string, number>();
  for (const s of crew.mcpServers) nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
  for (const [n, c] of nameCount) if (c > 1) problems.push(`Duplicate MCP server name: "${n}".`);
  const ids = new Set<string>();
  for (const w of crew.workers) {
    if (!w.id || !SLUG_OK.test(w.id)) problems.push(`Worker "${w.id}": id must be a lowercase slug.`);
    if (ids.has(w.id)) problems.push(`Duplicate worker id: ${w.id}`);
    ids.add(w.id);
    if (w.profile) {
      // Profile-backed worker: profession supplies the operating model;
      // instructions are optional extras.
    } else if (!w.instructions.trim()) {
      problems.push(`Worker "${w.id}": instructions are required (or assign a profile).`);
    }
    for (const m of w.mcpServers) {
      if (!crew.mcpServers.some((s) => s.name === m)) problems.push(`Worker "${w.id}" references unknown MCP server "${m}".`);
    }
    for (const c of w.context) {
      if (c.framework && !BUILTIN_FRAMEWORKS.includes(c.framework)) {
        problems.push(`Worker "${w.id}": context framework "${c.framework}" is not a builtin (filesystem | git | acc). Did you mean an artifact or a scope? Frameworks name the retrieval adapter.`);
      }
    }
  }
  for (const w of crew.workers) {
    for (const up of w.receivesFrom) {
      if (!ids.has(up)) problems.push(`Worker "${w.id}" receives from unknown worker "${up}".`);
      if (up === w.id) problems.push(`Worker "${w.id}" cannot receive from itself.`);
    }
  }
  const emits = new Map(crew.workers.map((w) => [w.id, new Set(w.emits)]));
  for (const h of crew.handoffs) {
    if (!ids.has(h.from) || !ids.has(h.to)) problems.push(`Handoff ${h.from}->${h.to} references unknown workers.`);
    if (h.from === h.to) problems.push(`Handoff ${h.from}->${h.to} is a self-handoff.`);
    if (!emits.get(h.from)?.has(h.artifact)) problems.push(`Handoff ${h.from}->${h.to}: "${h.artifact}" is not emitted by ${h.from}.`);
  }
  if (crew.entryPoints.length === 0) problems.push("Pick at least one entry point.");
  else for (const ep of crew.entryPoints) if (!ids.has(ep)) problems.push(`Entry point "${ep}" is not a worker.`);
  return problems;
}

/** Rename an MCP server, moving every worker binding with it (the name IS the key). */
export function renameMcpServer(crew: CrewDefinition, oldName: string, raw: string): Partial<CrewDefinition> {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name || name === oldName) return {};
  return {
    mcpServers: crew.mcpServers.map((m: CrewMcpServer) => (m.name === oldName ? { ...m, name } : m)),
    workers: crew.workers.map((w) => ({ ...w, mcpServers: w.mcpServers.map((s) => (s === oldName ? name : s)) })),
  };
}

/**
 * Drop context bindings with no scope — an empty placeholder row would ship a
 * meaningless binding (and pre-existing drafts still carry one).
 */
export function stripEmptyContexts(crew: CrewDefinition): CrewDefinition {
  return {
    ...crew,
    workers: crew.workers.map((w) => ({ ...w, context: w.context.filter((c: CrewContext) => (c.scope ?? "").trim() !== "") })),
  };
}
