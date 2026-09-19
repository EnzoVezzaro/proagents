/**
 * build --kind profile|crew — the bridge from the agent-building interview
 * to the registry item kinds.
 *
 * `proagent init` derives an AgentArchitecture; `build` (default) compiles
 * it into agent skills. `--kind profile` and `--kind crew` instead
 * materialize the derived architecture as a custom profile or crew in the
 * local registry checkout (registry/profiles/, registry/crews/)
 * — folder standard, PA-gated, immediately equippable/installable.
 *
 * Deterministic: the mapping from AgentSpec to profile/crew is pure — no
 * model calls, no timestamps beyond the catalog's fixed epoch default.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentArchitecture, AgentSpec, KnowledgeState } from "../core/types.js";
import type { ProfileManifest, ProfileManifestSource } from "../profiles/types.js";
import { profileProblems } from "../profiles/publish.js";
import { LOCAL_PROFILES_DIR } from "../profiles/registry.js";
import { LOCAL_CREWS_DIR } from "../crew/registry.js";
import { loadProfileFile } from "../profiles/registry.js";
import type { CrewDefinition } from "../crew/types.js";
import { crewProblems, crewWarnings } from "../crew/validate.js";
import { writeCrewFolder } from "../crew/hydrate.js";
import { toolingToProfileParts } from "../discovery/session.js";
import { jsonOut } from "./json.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Agent ids are derived from intent prose; crews/profiles need slugs. */
function slugify(raw: string, fallback: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

function permissionSummary(p: AgentSpec["permissions"]): { read: "repo" | "scoped" | "none"; write: "repo" | "scoped" | "none"; production: "none" | "read" | "write"; secrets: "none" | "named" | "all"; tools: string[]; approvalGates: string[] } {
  const level = (list: string[]): "repo" | "scoped" | "none" => (list.length === 0 ? "none" : list.includes("**") || list.includes("*") ? "repo" : "scoped");
  return {
    read: level(p.read),
    write: level(p.write),
    production: p.production,
    secrets: p.secrets.length === 0 ? "none" : "named",
    tools: p.execute.length > 0 ? [...new Set(["read_file", ...p.execute])] : ["read_file", "grep"],
    approvalGates: [...p.humanApproval],
  };
}

/**
 * Map the (single) derived agent to a custom profile. The architecture's
 * purpose becomes the operating summary; responsibilities become the first
 * expertise entries and normative rules; validation/escalation become the
 * verification contract. Discovered tooling (session.tooling) is baked in:
 * MCP servers + packages land in tools/requirements.md, skills become
 * skills/NN-*.md registry-ref entries — the finished profile is complete,
 * not a skeleton awaiting manual wiring.
 */
export async function buildKindProfile(
  arch: AgentArchitecture,
  flags: Record<string, string | boolean>,
  json: boolean,
): Promise<void> {
  const tooling = toolingToProfileParts(await loadSessionTooling());
  const agent: AgentSpec | undefined = arch.agents[0];
  if (!agent) fail("the architecture has no agents — run `proagent init` first");
  const slug = (typeof flags.slug === "string" && flags.slug) || slugify(agent.id, "custom-profile");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    fail(`profile slug \"${slug}\" must be a lowercase slug (a-z, 0-9, dashes) — pass --slug`);
  }
  const dir = path.join(process.cwd(), LOCAL_PROFILES_DIR, slug);
  if (await fs.access(dir).then(() => true, () => false)) {
    fail(`profile folder already exists: ${dir} — pick another --slug or remove it first`);
  }
  const name = agent.name || slug;

  // Source shape (paths); the loader hydrates to the plain manifest.
  const manifest = {
    version: "0.1.0",
    profile: {
      name,
      slug,
      description: agent.purpose,
      tags: ["custom", "from-interview"],
    },
    identity: "identity.json",
    expertise: ["expertise/01-core.json"],
    methods: ["methods/01-method.json"],
    rules: ["rules/01-scope.json", "rules/02-escalation.json"],
    standards: [],
    skills: tooling.skills.map((_, i) => `skills/${String(i + 1).padStart(2, "0")}-skill.json`),
    tools: "tools/requirements.json",
    verification: {
      required: ["verification/required/01-validation.json"],
      optional: [],
    },
  };
  const permTools = permissionSummary(agent.permissions).tools;
  const toolsJson = {
    required: permTools.length > 0 ? permTools : ["filesystem", "shell", "git"],
    ...(tooling.mcp.length > 0
      ? {
          mcp: tooling.mcp.map((s) => ({
            name: s.name,
            transport: "stdio" as const,
            command: s.command,
            args: s.args,
            healthCheck: s.healthCheck,
          })),
        }
      : {}),
    ...(tooling.packages.length > 0 ? { packages: tooling.packages } : {}),
  };

  const files: Record<string, string> = {
    "manifest.json": JSON.stringify(manifest satisfies ProfileManifestSource, null, 2) + "\n",
    "identity.json": JSON.stringify({ title: name, body: `You operate as a ${name.toLowerCase()}. ${agent.purpose}` }, null, 2) + "\n",
    "expertise/01-core.json": JSON.stringify({ title: agent.scope.slice(0, 60) || "core practice", body: agent.scope || `${slug} core practice` }, null, 2) + "\n",
    "methods/01-method.json": JSON.stringify({ title: "working method", body: (agent.responsibilities[0] ?? "Work from evidence over assumptions.").trim() }, null, 2) + "\n",
    "rules/01-scope.json": JSON.stringify({ title: "stay in scope", body: `Work only inside the declared scope: ${agent.scope || "the session intent"}.` }, null, 2) + "\n",
    "rules/02-escalation.json": JSON.stringify({ title: "escalate instead of guessing", body: agent.escalation[0] ?? "Escalate instead of guessing when outside the declared scope." }, null, 2) + "\n",
    "tools/requirements.json": JSON.stringify(toolsJson, null, 2) + "\n",
    "verification/required/01-validation.json": JSON.stringify(
      { title: agent.validation[0]?.slice(0, 60) || "session validation passes", body: agent.validation[0] ?? "The session's validation criteria pass before any output is final." },
      null,
      2,
    ) + "\n",
  };
  // Discovered skills become registry-ref entries (referenced, never copied).
  for (const [i, s] of tooling.skills.entries()) {
    files[`skills/${String(i + 1).padStart(2, "0")}-skill.json`] =
      JSON.stringify({ title: "discovered skill", ref: s.ref, ...(s.note ? { note: s.note } : {}) }, null, 2) + "\n";
  }
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }

  // Gate on the same validator publish uses.
  const hydrated = await loadProfileFile(path.join(dir, "manifest.json"));
  const problems = profileProblems(hydrated);
  if (problems.length > 0) {
    fail(`generated profile does not pass validation (this is a bug): ${problems.join("; ")}`);
  }

  if (json) {
    jsonOut({ status: "ok", kind: "profile", slug, version: manifest.version, dir, files: Object.keys(files).map((f) => `${slug}/${f}`), tooling: { mcp: tooling.mcp.length, packages: tooling.packages.length, skills: tooling.skills.length } });
    return;
  }
  console.log(`✓ Created profile ${slug}@0.1.0 at ${dir}:`);
  for (const f of Object.keys(files)) console.log(`  + ${f}`);
  console.log("");
  console.log("Next:");
  console.log(`  proagent equip ${slug}                       # equip it now (local .proagent wins)`);
  console.log(`  proagent equip ${slug} --all-targets         # write artifacts for every harness`);
  console.log(`  $EDITOR ${dir}                               # deepen it`);
  console.log(`  proagent profile submit ${dir}/manifest.json  # propose it to the registry`);
}

/** Load the session's staged tooling (empty on any failure — builders still work). */
async function loadSessionTooling(): Promise<KnowledgeState["tooling"]> {
  try {
    const { SessionStore } = await import("../core/session.js");
    const state = await new SessionStore().load();
    return state?.tooling;
  } catch {
    return undefined;
  }
}

/**
 * Map the derived architecture to a custom crew: one member per agent, the
 * architecture's edges become handoffs (artifacts preserved), permissions
 * come from each agent's permission spec (never inherited from a profile).
 * Single-agent architectures become a one-member "agent"-kind crew — the
 * same shape `test-healer` ships as.
 */
export async function buildKindCrew(
  arch: AgentArchitecture,
  flags: Record<string, string | boolean>,
  json: boolean,
): Promise<void> {
  if (arch.agents.length === 0) fail("the architecture has no agents — run `proagent init` first");
  const tooling = toolingToProfileParts(await loadSessionTooling());
  const id = (typeof flags.id === "string" && flags.id) || slugify(arch.team?.name ?? arch.agents[0]!.id, "custom-crew");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id)) {
    fail(`crew id \"${id}\" must be a lowercase slug (a-z, 0-9, dashes) — pass --id`);
  }
  const dir = path.join(process.cwd(), LOCAL_CREWS_DIR, id);
  if (await fs.access(dir).then(() => true, () => false)) {
    fail(`crew folder already exists: ${dir} — pick another --id or remove it first`);
  }
  const name = arch.team?.name ?? arch.agents.map((a) => a.name).join(" + ");
  const description =
    (typeof flags.description === "string" && flags.description) ||
    `Custom crew derived from the interview: ${arch.agents.map((a) => a.purpose.split(/[.!?]/)[0]?.toLowerCase() ?? "").filter(Boolean).join("; ")}.`.slice(0, 240);

  // Members are profile-less by design: the interview derived each agent's
  // operating model inline (responsibilities, permissions, validation), so a
  // self-referential profile slug would only fail install. Binding a real
  // profession (catalog profile) is a deliberate later edit — the same
  // workflow `crew create` scaffolds toward.
  const members = arch.agents.map((a) => ({
    id: slugify(a.id, a.id),
    role: a.role,
    name: a.name,
    permissions: permissionSummary(a.permissions),
    mcpServers: [] as string[],
    context: [{ framework: a.context.framework, scope: a.context.scopes.join(", ") }],
    receivesFrom: [] as string[],
    emits: a.outputs.length > 0 ? a.outputs.map((o) => slugify(o, o) + ".md") : [`${slugify(a.id, a.id)}-output.md`],
  }));
  const candidates = arch.edges
    .filter((e) => members.some((m) => m.id === slugify(e.from, e.from)) && members.some((m) => m.id === slugify(e.to, e.to)))
    .map((e, i) => ({
      from: slugify(e.from, e.from),
      to: slugify(e.to, e.to),
      artifact: slugify(e.artifacts[0] ?? `${slugify(e.from, e.from)}-output`, "artifact") + ".md",
      _order: i,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ from, to, artifact }) => ({ from, to, artifact }));

  // Crews are acyclic (the DAG check is a PA error), but interview
  // architectures legitimately contain feedback edges (reviewer aggregates
  // back to the coordinator). Build the handoff graph incrementally and skip
  // any edge whose target can already reach its source — verdicts return
  // through humans, which the coordination section records.
  const adj = new Map<string, Set<string>>();
  for (const m of members) adj.set(m.id, new Set());
  const canReach = (start: string, target: string): boolean => {
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }
    return false;
  };
  const droppedFeedback: string[] = [];
  const handoffs: { from: string; to: string; artifact: string }[] = [];
  for (const e of candidates) {
    if (canReach(e.to, e.from)) {
      droppedFeedback.push(`${e.from} → ${e.to} (${e.artifact})`);
      continue;
    }
    adj.get(e.from)!.add(e.to);
    handoffs.push(e);
  }

  // receivesFrom is derived from the kept handoffs only (PA042: receive
  // edges and handoff edges must agree), and a handoff ships its artifact —
  // the source member emits it (validator: artifact must be in emits).
  for (const m of members) {
    m.receivesFrom = [...new Set(handoffs.filter((h) => h.to === m.id).map((h) => h.from))];
  }
  for (const h of handoffs) {
    const from = members.find((m) => m.id === h.from);
    if (from && !from.emits.includes(h.artifact)) from.emits.push(h.artifact);
  }

  const now = "2026-01-01T00:00:00.000Z"; // deterministic default; bump on real publish
  const crew: CrewDefinition = {
    id,
    name,
    version: "0.1.0",
    description,
    author: "local",
    tags: ["custom", "from-interview"],
    workers: members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      description: `Role in this crew: ${m.role}.`,
      // No profile binding: the interview produced a self-contained operating
      // model. Without it, instructions are required by PA-validation.
      instructions: `${m.name} works as the ${m.role} of this crew. Purpose: ${arch.agents.find((a) => slugify(a.id, a.id) === m.id)?.purpose ?? "see crew mission"}.`,
      permissions: m.permissions,
      mcpServers: m.mcpServers,
      context: m.context,
      receivesFrom: m.receivesFrom,
      emits: m.emits,
    })),
    mcpServers: tooling.mcp.map((s) => ({ name: s.name, transport: "stdio" as const, command: s.command, args: s.args })),
    handoffs,
    entryPoints: members.filter((m) => m.receivesFrom.length === 0).map((m) => m.id).length > 0
      ? members.filter((m) => m.receivesFrom.length === 0).map((m) => m.id)
      : [members[0]!.id],
    mission: `${name}: ${arch.agents[0]!.purpose} Members stay inside their permission models; work moves through named-artifact handoffs.`,
    coordination: [
      "Members coordinate exclusively through named-artifact handoffs — never a shared pool.",
      "A member that cannot meet its handoff contract escalates instead of improvising.",
      ...(droppedFeedback.length > 0
        ? [`Feedback returns through humans, not automated handoffs (cycle-closing edges dropped: ${droppedFeedback.join("; ")}).`]
        : []),
      ...(tooling.mcp.length > 0
        ? [`Shared MCP servers (${tooling.mcp.map((s) => s.name).join(", ")}) are declared in mcp/servers.json — transports are placeholders to wire per repo.`]
        : []),
    ],
    tasks: members.map((m) => `${m.id} owns the ${m.role} work for this crew and emits ${m.emits[0]}.`),
    workflows: [
      "Standard run: start at the entry member, follow handoff edges to the last member, humans decide at every approval gate.",
    ],
    rules: [
      "Every member stays inside its permission model.",
      "Handoff artifacts are named and reviewable — no ambient context.",
    ],
    verification: [
      "Each handoff artifact exists and names its producer.",
      "No member exceeded its permission model (checked against the agent.json contracts).",
    ],
    createdAt: now,
    updatedAt: now,
  };

  const problems = crewProblems(crew);
  if (problems.length > 0) {
    fail(`generated crew does not pass validation (this is a bug): ${problems.join("; ")}`);
  }
  const warnings = crewWarnings(crew);

  const written = await writeCrewFolder(crew, dir);

  if (json) {
    jsonOut({ status: "ok", kind: "crew", crewId: id, version: crew.version, dir, files: written, warnings, tooling: { mcp: tooling.mcp.length, packages: tooling.packages.length, skills: tooling.skills.length } });
    return;
  }
  console.log(`✓ Created crew ${id}@${crew.version} at ${dir}:`);
  for (const f of written) console.log(`  + ${f}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
  console.log("Next:");
  console.log(`  proagent crew validate ${dir}        # gate (re-check as you edit)`);
  console.log(`  proagent crew build ${dir}/crew.json # install into this repo`);
  console.log(`  proagent crew submit ${dir}/crew.json # propose it to the registry`);
}
