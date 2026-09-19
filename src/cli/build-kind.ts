/**
 * build --kind profile|crew — the bridge from the agent-building interview
 * to the marketplace item kinds.
 *
 * `proagent init` derives an AgentArchitecture; `build` (default) compiles
 * it into agent skills. `--kind profile` and `--kind crew` instead
 * materialize the derived architecture as a custom profile or crew in the
 * local marketplace checkout (.marketplace/profiles/, .marketplace/crews/)
 * — folder standard, PA-gated, immediately equippable/installable.
 *
 * Deterministic: the mapping from AgentSpec to profile/crew is pure — no
 * model calls, no timestamps beyond the catalog's fixed epoch default.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentArchitecture, AgentSpec } from "../core/types.js";
import type { ProfileManifest, ProfileManifestSource } from "../profiles/types.js";
import { profileProblems, MARKETPLACE_ITEMS_DIR } from "../profiles/marketplace.js";
import { loadProfileFile } from "../profiles/registry.js";
import type { CrewDefinition } from "../crew/types.js";
import { crewProblems, crewWarnings } from "../crew/validate.js";
import { writeCrewFolder } from "../crew/hydrate.js";
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
 * verification contract.
 */
export async function buildKindProfile(
  arch: AgentArchitecture,
  flags: Record<string, string | boolean>,
  json: boolean,
): Promise<void> {
  const agent: AgentSpec | undefined = arch.agents[0];
  if (!agent) fail("the architecture has no agents — run `proagent init` first");
  const slug = (typeof flags.slug === "string" && flags.slug) || slugify(agent.id, "custom-profile");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    fail(`profile slug \"${slug}\" must be a lowercase slug (a-z, 0-9, dashes) — pass --slug`);
  }
  const dir = path.join(process.cwd(), MARKETPLACE_ITEMS_DIR, slug);
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
    identity: "identity/01-identity.md",
    expertise: ["expertise/01-core.md"],
    methods: ["methods/01-method.md"],
    rules: ["rules/01-scope.md", "rules/02-escalation.md"],
    standards: [],
    skills: [],
    tools: "tools/requirements.md",
    verification: {
      required: ["verification/required/01-validation.md"],
      optional: [],
    },
  };
  const files: Record<string, string> = {
    "profile.json": JSON.stringify(manifest satisfies ProfileManifestSource, null, 2) + "\n",
    "identity/01-identity.md": `---\ntitle: ${name}\n---\n\nYou operate as a ${name.toLowerCase()}. ${agent.purpose}\n`,
    "expertise/01-core.md": `---\ntitle: ${agent.scope.slice(0, 60) || "core practice"}\n---\n\n${agent.scope || `${slug} core practice`}\n`,
    "methods/01-method.md": `---\ntitle: working method\n---\n\n${(agent.responsibilities[0] ?? "Work from evidence over assumptions.").trim()}\n`,
    "rules/01-scope.md": `---\ntitle: stay in scope\n---\n\nWork only inside the declared scope: ${agent.scope || "the session intent"}.\n`,
    "rules/02-escalation.md": `---\ntitle: escalate instead of guessing\n---\n\n${agent.escalation[0] ?? "Escalate instead of guessing when outside the declared scope."}\n`,
    "tools/requirements.md": `---\ntitle: Tool requirements\nnote: Source of truth for this profile's tool requirements — edit this file, then re-validate.\nrequired:\n${(permissionSummary(agent.permissions).tools.length > 0 ? permissionSummary(agent.permissions).tools : ["filesystem", "shell", "git"]).map((t) => `  - ${t}`).join("\n")}\noptional: []\n---\n`,
    "verification/required/01-validation.md": `---\ntitle: ${agent.validation[0]?.slice(0, 60) || "session validation passes"}\n---\n\n${agent.validation[0] ?? "The session's validation criteria pass before any output is final."}\n`,
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }

  // Gate on the same validator publish uses.
  const hydrated = await loadProfileFile(path.join(dir, "profile.json"));
  const problems = profileProblems(hydrated);
  if (problems.length > 0) {
    fail(`generated profile does not pass validation (this is a bug): ${problems.join("; ")}`);
  }

  if (json) {
    jsonOut({ status: "ok", kind: "profile", slug, version: manifest.version, dir, files: Object.keys(files).map((f) => `${slug}/${f}`) });
    return;
  }
  console.log(`✓ Created profile ${slug}@0.1.0 at ${dir}:`);
  for (const f of Object.keys(files)) console.log(`  + ${f}`);
  console.log("");
  console.log("Next:");
  console.log(`  proagent equip ${slug}                       # equip it now (checkout wins over packaged)`);
  console.log(`  $EDITOR ${dir}                               # deepen it`);
  console.log(`  proagent profile submit ${dir}/profile.json  # propose it to the marketplace`);
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
  const id = (typeof flags.id === "string" && flags.id) || slugify(arch.team?.name ?? arch.agents[0]!.id, "custom-crew");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id)) {
    fail(`crew id \"${id}\" must be a lowercase slug (a-z, 0-9, dashes) — pass --id`);
  }
  const dir = path.join(process.cwd(), ".marketplace", "crews", id);
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
    receivesFrom: arch.edges.filter((e) => e.to === a.id).map((e) => slugify(e.from, e.from)),
    emits: a.outputs.length > 0 ? a.outputs.map((o) => slugify(o, o) + ".md") : [`${slugify(a.id, a.id)}-output.md`],
  }));
  const handoffs = arch.edges
    .filter((e) => members.some((m) => m.id === slugify(e.from, e.from)) && members.some((m) => m.id === slugify(e.to, e.to)))
    .map((e, i) => ({
      from: slugify(e.from, e.from),
      to: slugify(e.to, e.to),
      artifact: slugify(e.artifacts[0] ?? `${slugify(e.from, e.from)}-output`, "artifact") + ".md",
      _order: i,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ from, to, artifact }) => ({ from, to, artifact }));

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
    mcpServers: [],
    handoffs,
    entryPoints: members.filter((m) => m.receivesFrom.length === 0).map((m) => m.id).length > 0
      ? members.filter((m) => m.receivesFrom.length === 0).map((m) => m.id)
      : [members[0]!.id],
    mission: `${name}: ${arch.agents[0]!.purpose} Members stay inside their permission models; work moves through named-artifact handoffs.`,
    coordination: [
      "Members coordinate exclusively through named-artifact handoffs — never a shared pool.",
      "A member that cannot meet its handoff contract escalates instead of improvising.",
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
    jsonOut({ status: "ok", kind: "crew", crewId: id, version: crew.version, dir, files: written, warnings });
    return;
  }
  console.log(`✓ Created crew ${id}@${crew.version} at ${dir}:`);
  for (const f of written) console.log(`  + ${f}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
  console.log("Next:");
  console.log(`  proagent crew validate ${dir}        # gate (re-check as you edit)`);
  console.log(`  proagent crew build ${dir}/crew.json # install into this repo`);
  console.log(`  proagent crew submit ${dir}/crew.json # propose it to the marketplace`);
}
