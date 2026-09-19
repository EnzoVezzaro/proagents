import fs from "node:fs/promises";
import path from "node:path";
import type { CrewDefinition } from "../crew/types.js";
import { CrewError } from "../crew/types.js";
import { crewProblems, crewWarnings } from "../crew/validate.js";
import { installCrew, planInstall, mergeMcpConfig, crewSkillMarkdown } from "../crew/install.js";
import { readCatalogRemote, fetchCrewDefinition, publishCrew } from "../crew/registry.js";
import { loadCrewFile } from "../crew/hydrate.js";
import type { GitHubCommitTarget } from "../crew/registry.js";
import { jsonOut } from "./json.js";
import { getEnvConfig } from "../env.js";
import { listProfiles, fetchProfileManifest } from "../profiles/registry.js";
import type { ProfileManifest } from "../profiles/types.js";

/**
 * Profile resolver for crew installs: local checkout + packaged marketplace
 * first, then the remote catalog (same precedence as equip). Returns null so
 * installCrew can raise a precise, actionable error.
 */
function crewProfileResolver(): (slug: string) => Promise<ProfileManifest | null> {
  return async (slug) => {
    const local = await listProfiles();
    const hit = local.find((e) => e.manifest.profile?.slug === slug);
    if (hit) return hit.manifest;
    try {
      const env = getEnvConfig();
      return await fetchProfileManifest(slug, env.marketRepo ?? "EnzoVezzaro/proagents", "main");
    } catch {
      return null;
    }
  };
}

// Proposal markers — kept in sync with web/src/proposal.ts and
// .github/workflows/crew-submission.yml (single source of truth is the SPA
// module; CLI duplicates them only to stay dependency-free).
const JSON_BEGIN = "<!-- CREW-JSON-BEGIN -->";
const JSON_END = "<!-- CREW-JSON-END -->";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const DEFAULT_REPO = "EnzoVezzaro/proagents";

/** --repo owner/name, --ref branch, --token gh token (or GITHUB_TOKEN env / .env). */
function remoteOpts(flags: Record<string, string | boolean>): { repo: string; ref: string; token?: string } {
  const env = getEnvConfig();
  const repo =
    (typeof flags.repo === "string" && flags.repo) ||
    (env.marketRepo ?? DEFAULT_REPO);
  const ref = typeof flags.ref === "string" && flags.ref ? flags.ref : "main";
  const token =
    (typeof flags.token === "string" && flags.token) ||
    env.githubToken ||
    undefined;
  return { repo, ref, token };
}

export async function runCrewCommand(
  args: string[],
  flags: Record<string, string | boolean>,
  /** Repeatable flags in order — `crew create --role` is order-sensitive. */
  flagList: Map<string, string[]> = new Map(),
): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  const json = flags.json === true;

  switch (sub) {
    case "list":
      return crewList(flags, json);
    case "validate":
      return crewValidate(rest[0], flags, json);
    case "show":
      return crewShow(rest[0], flags, json);
    case "install":
      return crewInstall(rest[0], flags, json);
    case "build":
      return crewBuild(rest[0], flags, json);
    case "create":
      return crewCreate(rest, flags, json, flagList.get("role") ?? (typeof flags.role === "string" ? [flags.role] : []));
    case "publish":
      return crewPublish(rest[0], flags, json);
    case "submit":
      return crewSubmit(rest[0], flags, json);
    case undefined:
    case "help":
      printCrewHelp();
      return;
    default:
      fail(`Unknown crew command: ${sub}. See: proagent crew help`);
  }
}

/**
 * `proagent crew build <file.json>` — install a crew from a local JSON file
 * (the output of the SPA builder or a hand-written definition). Identical to
 * install except the source is a file path, not a catalog id; `--file` names
 * the definition when the positional arg is the target repo instead.
 */
async function crewBuild(file: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  const target = (typeof flags.file === "string" && flags.file) || file;
  if (!target) fail("Usage: proagent crew build <crew.json> [--file <crew.json>]");
  let crew: CrewDefinition;
  try {
    // loadCrewFile accepts builder output (inline) and folder manifests
    // (hydrates paths), so both sources build identically.
    crew = await loadCrewFile(target);
  } catch (err) {
    fail(`cannot read crew file: ${(err as Error).message}`);
  }
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`crew failed validation: ${problems.join("; ")}`);

  const root = process.cwd();
  if (flags["dry-run"] === true || flags.dryRun === true) {
    const plan = planInstall(crew);
    if (json) return jsonOut({ status: "ok", dryRun: true, plan });
    console.log(`Install plan for ${crew.id}@${crew.version}:`);
    for (const e of plan.entries) console.log(`  + ${e.path} (${e.bytes} bytes)`);
    return;
  }
  const result = await installCrew(crew, root, crewProfileResolver());
  if (json) return jsonOut({ status: "ok", installed: result });
  console.log(`✓ Built ${crew.id}@${crew.version}:`);
  for (const f of result.filesWritten) console.log(`  + ${f}`);
  console.log("  ~ .mcp.json (merged)");
  console.log("");
  console.log("Crew is ready. Point your agent runtime at .agents/crews/ and .mcp.json.");
}

/**
 * `proagent crew create <profile-slug>…` — compose existing profiles into a
 * custom crew. Generates only the crew-specific artifacts (mission, members,
 * coordination, tasks, workflows, handoffs, rules, verification, tools) in
 * .marketplace/crews/<id>/; profiles are referenced, never copied. Members
 * carry explicit permission models (read-only by default); the pipeline is a
 * simple chain in argument order with a named-artifact handoff per edge.
 */
async function crewCreate(
  slugs: string[],
  flags: Record<string, string | boolean>,
  json: boolean,
  roleFlags: string[] = [],
): Promise<void> {
  const unique = [...new Set(slugs.filter((s) => typeof s === "string" && s.trim()))];
  if (unique.length < 2) {
    fail("Usage: proagent crew create <profile-slug> <profile-slug> […]  (at least 2 members)");
  }

  // Resolve every profile first — a crew member without a resolvable
  // profession is a broken composition, never a silent skip.
  const resolve = crewProfileResolver();
  const profiles: Array<{ slug: string; manifest: ProfileManifest }> = [];
  for (const slug of unique) {
    const manifest = await resolve(slug);
    if (!manifest) {
      fail(
        `cannot resolve profile "${slug}" — equip it, place it in .marketplace/profiles/, or check the spelling\n` +
          `  (available: proagent profile list)`,
      );
    }
    profiles.push({ slug, manifest: manifest! });
  }

  // Roles: every --role occurrence applies in order to the members;
  // members beyond the list default to "implementer".
  const name = typeof flags.name === "string" && flags.name ? flags.name : `${profiles.map((p) => p.manifest.profile.name).join(" + ")} Crew`;
  const id =
    (typeof flags.id === "string" && flags.id) ||
    slugifyCrewName(name);
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id)) {
    fail(`crew id "${id}" must be a lowercase slug (a-z, 0-9, dashes)`);
  }
  const description =
    (typeof flags.description === "string" && flags.description) ||
    `Custom ${profiles.length}-member crew composed from profiles: ${profiles.map((p) => p.slug).join(", ")}.`;

  // Default pipeline: chain in argument order. Member 1 starts; each later
  // member receives the previous member's artifact.
  const members = profiles.map((p, i) => ({
    profile: p.slug,
    role: roleFlags[i] ?? "implementer",
    // Explicit permission model — read-only by default; the operator tightens
    // or gates as needed. Composition never inherits trust implicitly.
    permissions: {
      read: "repo" as const,
      write: "none" as const,
      production: "none" as const,
      secrets: "none" as const,
      tools: ["read_file", "grep", "run_tests"],
      approvalGates: [] as string[],
    },
    mcpServers: [],
    context: [],
    receivesFrom: i === 0 ? [] : [profiles[i - 1]!.slug],
    emits: [`handoff-${String(i + 1).padStart(2, "0")}.md`],
  }));
  const handoffs = members.slice(1).map((m, i) => ({
    from: members[i]!.profile,
    to: m.profile,
    artifact: members[i]!.emits[0]!,
  }));

  const now = "2026-01-01T00:00:00.000Z"; // deterministic default; bump on real publish
  const crew: CrewDefinition = {
    id,
    name,
    version: "0.1.0",
    description,
    author: "local",
    tags: ["custom", "profile-backed", "multi-agent"],
    workers: members.map((m, i) => ({
      id: m.profile,
      name: profiles[i]!.manifest.profile.name,
      role: m.role,
      description: `Operates as the ${m.profile} profile; role in this crew: ${m.role}.`,
      profile: m.profile,
      permissions: m.permissions,
      mcpServers: m.mcpServers,
      context: m.context,
      instructions: "",
      receivesFrom: m.receivesFrom,
      emits: m.emits,
    })),
    mcpServers: [],
    handoffs,
    entryPoints: [members[0]!.profile],
    mission: `The ${name} exists to ${description.replace(/^Custom /, "")} Members operate as their bound profiles; work moves through named-artifact handoffs in pipeline order.`,
    coordination: [
      "Members coordinate exclusively through named-artifact handoffs — never a shared pool.",
      "A member that cannot meet its handoff contract escalates instead of improvising.",
    ],
    tasks: members.map((m) => `${m.profile} owns the ${m.role} work for this crew and emits ${m.emits[0]}.`),
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

  const { writeCrewFolder } = await import("../crew/hydrate.js");
  const dir = path.join(process.cwd(), ".marketplace", "crews", id);
  const written = await writeCrewFolder(crew, dir);

  if (json) return jsonOut({ status: "ok", crewId: id, version: crew.version, dir, files: written });
  console.log(`✓ Created crew ${id}@${crew.version} at ${dir}:`);
  for (const f of written) console.log(`  + ${f}`);
  console.log("");
  console.log("Next:");
  console.log(`  proagent crew validate ${dir}        # gate before publishing`);
  console.log(`  proagent crew build ${dir}/crew.json # install into this repo`);
  console.log(`  proagent crew submit ${dir}/crew.json # propose it to the marketplace`);
}

function slugifyCrewName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\s+crew$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "custom-crew"
  );
}

function printCrewHelp(): void {
  console.log(`
proagent crew — build, publish and install agent crews

Usage:
  proagent crew <subcommand> [options]

Subcommands:
  list                      List marketplace crews (Git-backed catalog)
    --repo owner/name       Catalog repository (default ${DEFAULT_REPO})
    --ref branch            Catalog branch (default main)
    --token <gh-token>      Token for private catalogs (or GITHUB_TOKEN env)
  show <id>                 Print a crew definition (workers, permissions, MCP)
  validate <id|crew.json|dir> — Validate a crew (folder standard hydrated) —
                            subagent standards PA043–PA048 are enforced
  install <id>              Install a crew from the catalog into the current repo
  build <crew.json>         Install a crew from a local manifest (builder output
                            or folder-standard crew.json)
    --file <crew.json>      Explicit manifest path
    --dry-run               Show the plan without writing
    --repo / --ref / --token
  create <profile-slug>…    Compose existing profiles into a custom crew: generates
                            the crew folder (crew.json + mission/ + members/ +
                            coordination/ + tasks/ + handoffs/ + rules/ +
                            verification/ + tools/) in the current repo's
                            .marketplace/crews/. Every member binds a profile —
                            the crew never duplicates profession content.
    --name <Crew Name>      Crew name (default: derived from the slugs)
    --id <crew-slug>        Crew id (default: derived from the name)
    --description <text>    One-line description
    --role <member-role>    Role for the next member in pipeline order (one per
                            member, applied in argument order)
  publish <crew.json>       Commit a crew to the catalog (folder-standard layout:
                            crew.json + members/ + mission/ + … + mcp/)
    --repo / --ref / --token (required token with contents:write)
  submit <crew.json>        File a marketplace proposal issue (recommended)
    --repo owner/name       Target repo (default: the marketplace repo)
    --token <gh-token>      Or GITHUB_TOKEN; needs issues:write

The one-liner: install a crew and everything it needs into the repo you run:

  proagent crew install <crew-id>
`);
}

async function resolveCrew(idOrFile: string, flags: Record<string, string | boolean>): Promise<CrewDefinition> {
  // Explicit path: a crew.json manifest (folder standard — hydrated) or a
  // flat inline definition file.
  if (idOrFile.endsWith(".json")) {
    try {
      return await loadCrewFile(idOrFile);
    } catch (err) {
      fail(`cannot read crew file: ${(err as Error).message}`);
    }
  }
  // A directory holding crew.json (folder standard).
  try {
    return await loadCrewFile(path.join(idOrFile, "crew.json"));
  } catch {
    // fall through
  }
  // Local marketplace checkout: crews/<id>/crew.json (folder standard).
  try {
    return await loadCrewFile(path.join(process.cwd(), ".marketplace", "crews", idOrFile, "crew.json"));
  } catch {
    // fall through to remote
  }
  const { repo, ref, token } = remoteOpts(flags);
  return fetchCrewDefinition(idOrFile, repo, ref, token);
}

async function crewList(flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  const { repo, ref, token } = remoteOpts(flags);
  const catalog = await readCatalogRemote(repo, ref, token);
  if (json) return jsonOut({ status: "ok", repo, ref, catalog });
  const crews = catalog.items.filter((i) => i.kind !== "profile");
  if (crews.length === 0) {
    console.log("Marketplace catalog is empty.");
    return;
  }
  console.log(`Marketplace crews (${repo}@${ref}):`);
  for (const item of crews) {
    console.log(`  • ${item.id.padEnd(34)} ${item.kind.padEnd(5)} v${item.version.padEnd(8)} ${item.description.slice(0, 54)}`);
  }
  const profileCount = catalog.items.length - crews.length;
  if (profileCount > 0) console.log(`  (…and ${profileCount} profile(s) — see: proagent profile list)`);
}

async function crewValidate(target: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!target) fail("Usage: proagent crew validate <id | crew.json | crew-folder>");
  // Resolve like show/install: a catalog id (local checkout, then remote), a
  // folder holding crew.json, or a manifest/inline definition file.
  let crew: CrewDefinition;
  if (!target.endsWith(".json") && !target.endsWith(".yaml")) {
    try {
      crew = await resolveCrew(target, flags);
      return reportCrewValidation(crew, target, json);
    } catch {
      // fall through to file handling below
    }
  }
  // Folder standard (a crew.json manifest or a folder containing one) is
  // hydrated — path entries load their content — then validated.
  const manifestPath = target.endsWith("crew.json") ? target : path.join(target, "crew.json");
  try {
    crew = await loadCrewFile(manifestPath);
  } catch {
    // Flat inline definition fallback.
    try {
      crew = JSON.parse(await fs.readFile(target, "utf8")) as CrewDefinition;
    } catch (err) {
      if (json) return jsonOut({ status: "invalid", file: target, problems: [(err as Error).message] });
      fail(`cannot read crew manifest: ${(err as Error).message}`);
    }
  }
  reportCrewValidation(crew, target, json);
}

function reportCrewValidation(crew: CrewDefinition, source: string, json: boolean): void {
  const problems = crewProblems(crew);
  const warnings = crewWarnings(crew);
  if (problems.length > 0) process.exitCode = 1; // non-zero even in --json mode
  if (json) {
    jsonOut({ status: problems.length === 0 ? "ok" : "invalid", crew: crew.id, version: crew.version, problems, warnings });
    return;
  }
  if (problems.length === 0) {
    console.log(`✓ Crew "${crew.id}" v${crew.version} is valid (${crew.workers.length} workers, ${crew.mcpServers.length} MCP servers).`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    return;
  }
  console.error(`✗ Crew "${crew.id}" is invalid:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

async function crewShow(id: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!id) fail("Usage: proagent crew show <id>");
  const crew = await resolveCrew(id, flags);
  if (json) return jsonOut({ status: "ok", crew });
  console.log(crewSkillMarkdown(crew));
  console.log(`MCP servers: ${crew.mcpServers.map((m) => m.name).join(", ") || "none"}`);
}

async function crewInstall(id: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!id) fail("Usage: proagent crew install <id>");
  const crew = await resolveCrew(id, flags);
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`crew failed validation: ${problems.join("; ")}`);

  const root = process.cwd();
  if (flags["dry-run"] === true || flags.dryRun === true) {
    const plan = planInstall(crew);
    const mcpExists = await fs.access(path.join(root, ".mcp.json")).then(() => true, () => false);
    const merged = mergeMcpConfig(mcpExists ? await fs.readFile(path.join(root, ".mcp.json"), "utf8") : null, crew);
    if (json) return jsonOut({ status: "ok", dryRun: true, plan, mcpServersMerged: Object.keys((JSON.parse(merged) as { mcpServers: Record<string, unknown> }).mcpServers) });
    console.log(`Install plan for ${crew.id}@${crew.version}:`);
    for (const e of plan.entries) console.log(`  + ${e.path} (${e.bytes} bytes)`);
    console.log(`  ~ .mcp.json (merge: ${Object.keys((JSON.parse(merged) as { mcpServers: Record<string, unknown> }).mcpServers).join(", ")})`);
    return;
  }

  const result = await installCrew(crew, root, crewProfileResolver());
  if (json) return jsonOut({ status: "ok", installed: result });
  console.log(`✓ Installed ${crew.id}@${crew.version}:`);
  for (const f of result.filesWritten) console.log(`  + ${f}`);
  console.log(`  ~ .mcp.json (merged)`);
  console.log("");
  console.log("Crew is ready. Point your agent runtime at .agents/crews/ and .mcp.json.");
}

async function crewPublish(file: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!file) fail("Usage: proagent crew publish <file.json>");
  let crew: CrewDefinition;
  try {
    // Hydrates folder-standard manifests (crew.json + members/ + …); inline
    // definitions pass through — publish accepts both shapes.
    crew = await loadCrewFile(file);
  } catch (err) {
    fail(`cannot read crew file: ${(err as Error).message}`);
  }
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`refusing to publish invalid crew: ${problems.join("; ")}`);

  const { repo, ref } = remoteOpts(flags);
  const token = (typeof flags.token === "string" && flags.token) || getEnvConfig().githubToken;
  if (!token) fail("publish requires a token with contents:write (--token, GITHUB_TOKEN, or a .env file)");

  const target: GitHubCommitTarget = { repo, branch: ref, token };
  const paths = await publishCrew(crew, target);
  if (json) return jsonOut({ status: "ok", crewId: crew.id, version: crew.version, repo, ref, ...paths });
  console.log(`✓ Published ${crew.id}@${crew.version} to ${repo}@${ref}`);
  console.log(`  + ${paths.itemPath}`);
  console.log(`  ~ ${paths.catalogPath}`);
  console.log("  (GitHub Pages serves the catalog after the next Pages build)");
}

/**
 * Submit a crew to the marketplace by filing a proposal issue. CI validates
 * it instantly; a maintainer `/publish` commits it to the catalog. This is
 * the recommended path — direct `publish` bypasses review.
 */
async function crewSubmit(file: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!file) fail("Usage: proagent crew submit <file.json>");
  let crew: CrewDefinition;
  try {
    // Hydrates folder-standard manifests; inline definitions pass through.
    crew = await loadCrewFile(file);
  } catch {
    // Flat inline definition fallback.
    try {
      crew = JSON.parse(await fs.readFile(file, "utf8")) as CrewDefinition;
    } catch (err) {
      fail(`cannot read crew file: ${(err as Error).message}`);
    }
  }
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`refusing to submit an invalid crew: ${problems.join("; ")}`);

  const env = getEnvConfig();
  const repo = (typeof flags.repo === "string" && flags.repo) || (env.marketRepo ?? DEFAULT_REPO);
  const token = (typeof flags.token === "string" && flags.token) || env.githubToken;
  if (!token) fail("submit requires a GitHub token (--token, GITHUB_TOKEN, or .env) with issues:write");

  const workerLines = crew.workers.map(
    (w) => `- **${w.name}** (\`${w.id}\`, ${w.role}) — reads: ${w.receivesFrom.join(", ") || "—"} → emits: ${w.emits.join(", ") || "—"} · write: ${w.permissions.write} · prod: ${w.permissions.production} · secrets: ${w.permissions.secrets}`,
  );
  const body = [
    `## Marketplace proposal: ${crew.name}`,
    "",
    crew.description,
    "",
    "### Worker summary",
    "",
    ...workerLines,
    "",
    "### Crew JSON",
    "",
    JSON_BEGIN,
    "```json",
    JSON.stringify(crew, null, 2),
    "```",
    JSON_END,
    "",
    "---",
    "",
    "Maintainers: CI validates this proposal automatically. If the check is green and the design is sound, comment `/publish` to commit it to the marketplace catalog.",
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "proagent-cli",
    },
    body: JSON.stringify({
      title: `[crew-proposal] ${crew.id} v${crew.version}`,
      body,
      labels: ["crew-proposal"],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`issue creation failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const issue = (await res.json()) as { number: number; html_url: string };
  if (json) return jsonOut({ status: "ok", crewId: crew.id, version: crew.version, repo, issue: issue.number, url: issue.html_url });
  console.log(`✓ Proposal filed: ${issue.html_url}`);
  console.log("  CI validates it within seconds; a maintainer /publish commits it to the marketplace.");
}
