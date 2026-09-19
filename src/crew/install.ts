import path from "node:path";
import fs from "node:fs/promises";
import type {
  CrewDefinition,
  InstallPlan,
  InstallResult,
} from "./types.js";
import { CrewError } from "./types.js";
import { validateCrewOrThrow } from "./validate.js";
import type { ProfileManifest } from "../profiles/types.js";

/**
 * Resolve a worker's profession manifest by slug. Optional: crews without
 * profiles install exactly as before. The resolver is injected so the core
 * stays deterministic and provider-agnostic (the CLI wires it to the
 * profile registry; tests pass stubs).
 */
export type ProfileResolver = (slug: string) => Promise<ProfileManifest | null>;

/**
 * Profile-derived operating model for a worker, as markdown body sections.
 * Deterministic: same manifest → same sections, always.
 */
export function profileSections(manifest: ProfileManifest): string[] {
  const lines: string[] = [];
  const profile = manifest.profile;
  if (profile) lines.push(`**Profession:** ${profile.name} v${manifest.version} (profile: \`${profile.slug}\`)`);
  const identity = manifest.identity;
  if (identity?.summary) {
    lines.push("");
    lines.push(identity.summary.trim());
  }
  const list = (title: string, items: string[] | undefined) => {
    if (items && items.length > 0) {
      lines.push("");
      lines.push(`### ${title}`);
      lines.push("");
      for (const item of items) lines.push(`- ${item}`);
    }
  };
  list("Expertise", manifest.expertise);
  list("Methods", manifest.methods);
  list("Rules (normative)", manifest.rules);
  list("Standards", manifest.standards);
  const verification = manifest.verification?.required;
  if (verification && verification.length > 0) {
    lines.push("");
    lines.push(`### Verification (required before completion)`);
    lines.push("");
    for (const v of verification) lines.push(`- ${v}`);
  }
  return lines;
}

/**
 * Crew installer — writes a crew into a repo root, deterministically:
 *
 *   .agents/crews/<id>/manifest.json             the full definition (source of truth)
 *   .agents/crews/<id>/SKILL.md                  crew-level operating skill
 *   .agents/crews/<id>/workers/<worker>/SKILL.md per-worker skill
 *   .agents/crews/<id>/workers/<worker>/agent.json  machine-readable contract
 *   .mcp.json                                    MCP servers merged (never clobbered)
 *
 * The installed crew is runnable by any agent runtime that reads .agents/
 * skills and .mcp.json — the registry's "pull the crew into my repo" flow.
 */

export function crewSkillMarkdown(crew: CrewDefinition): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: crew-${crew.id}`);
  lines.push(`description: ${crew.description}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Crew: ${crew.name} (v${crew.version})`);
  lines.push("");
  lines.push(crew.description);
  if (crew.mission?.trim()) {
    lines.push("");
    lines.push("## Mission");
    lines.push("");
    lines.push(crew.mission.trim());
  }
  lines.push("");
  lines.push("## Members");
  lines.push("");
  lines.push("| Member | Operates as | Role | Reads | Emits |");
  lines.push("|---|---|---|---|---|");
  for (const w of crew.workers) {
    const reads = w.receivesFrom.length > 0 ? w.receivesFrom.join(", ") : "—";
    const emits = w.emits.length > 0 ? w.emits.join(", ") : "—";
    lines.push(`| ${w.name} (\`${w.id}\`) | ${w.profile ? `\`${w.profile}\`` : "—"} | ${w.role} | ${reads} | ${emits} |`);
  }
  const pushList = (title: string, items: string[] | undefined) => {
    if (items && items.length > 0) {
      lines.push("");
      lines.push(`## ${title}`);
      lines.push("");
      for (const item of items) lines.push(`- ${item.replace(/\s*\n\s*/g, " ")}`);
    }
  };
  pushList("Coordination", crew.coordination);
  pushList("Tasks", crew.tasks);
  pushList("Workflows", crew.workflows);
  lines.push("");
  lines.push("## Pipeline");
  lines.push("");
  for (const ep of crew.entryPoints) {
    lines.push(`- Start at **${ep}**.`);
  }
  for (const h of crew.handoffs) {
    lines.push(`- \`${h.from}\` hands **${h.artifact}** to \`${h.to}\`.`);
  }
  pushList("Rules", crew.rules);
  pushList("Verification", crew.verification);
  lines.push("");
  lines.push("## Rules (normative baseline)");
  lines.push("");
  lines.push("- Handoffs pass named artifacts only — never a shared context pool.");
  lines.push("- Every member stays inside its permission model; approval-gated tools");
  lines.push("  require a recorded human approval before the call.");
  lines.push("");
  return lines.join("\n");
}

export function workerSkillMarkdown(
  crew: CrewDefinition,
  worker: CrewDefinition["workers"][number],
  profile?: ProfileManifest | null,
): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${crew.id}-${worker.id}`);
  lines.push(`description: ${worker.description}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${worker.name}`);
  lines.push("");
  lines.push(`**Role:** ${worker.role}`);
  lines.push("");
  lines.push(worker.description);
  if (profile) {
    lines.push(...profileSections(profile));
  }
  lines.push("");
  if (worker.instructions && worker.instructions.trim()) {
    lines.push("## Instructions");
    lines.push("");
    lines.push(worker.instructions.trim());
    lines.push("");
  } else if (profile) {
    lines.push("## Instructions");
    lines.push("");
    lines.push(
      `Operate as a ${profile.profile.name} (\`${profile.profile.slug}\`): follow the profession's rules and standards above, work within the permission model below, and satisfy the verification requirements before reporting completion.`,
    );
    lines.push("");
  } else {
    // Validation requires instructions for profile-less workers, so this is
    // only reachable for hand-built crews that skip validation.
    lines.push("## Instructions");
    lines.push("");
    lines.push("");
  }
  lines.push("## Permissions (normative)");
  lines.push("");
  lines.push("| Boundary | Value |");
  lines.push("|---|---|");
  lines.push(`| read | ${worker.permissions.read} |`);
  lines.push(`| write | ${worker.permissions.write} |`);
  lines.push(`| production | ${worker.permissions.production} |`);
  lines.push(`| secrets | ${worker.permissions.secrets} |`);
  lines.push(`| tools | ${worker.permissions.tools.length > 0 ? worker.permissions.tools.join(", ") : "none"} |`);
  if (worker.permissions.approvalGates && worker.permissions.approvalGates.length > 0) {
    lines.push(`| approval gates | ${worker.permissions.approvalGates.join(", ")} |`);
  }
  lines.push("");
  if (worker.context.length > 0) {
    lines.push("## Context");
    lines.push("");
    for (const c of worker.context) {
      lines.push(`- framework \`${c.framework}\`${c.scope ? ` scoped to \`${c.scope}\`` : ""}`);
    }
    lines.push("");
  }
  if (worker.receivesFrom.length > 0) {
    lines.push("## Inputs");
    lines.push("");
    lines.push(`Receives work from: ${worker.receivesFrom.join(", ")}.`);
    lines.push("");
  }
  if (worker.emits.length > 0) {
    lines.push("## Outputs");
    lines.push("");
    lines.push(`Emits: ${worker.emits.join(", ")}.`);
    lines.push("");
  }
  return lines.join("\n");
}

export function workerAgentJson(crew: CrewDefinition, worker: CrewDefinition["workers"][number]): string {
  return JSON.stringify(
    {
      id: `${crew.id}-${worker.id}`,
      crew: crew.id,
      role: worker.role,
      permissions: worker.permissions,
      mcpServers: worker.mcpServers,
      context: worker.context,
      receivesFrom: worker.receivesFrom,
      emits: worker.emits,
      version: crew.version,
    },
    null,
    2,
  ) + "\n";
}

/** Build the install plan (paths + sizes) without writing anything. */
export function planInstall(crew: CrewDefinition): InstallPlan {
  const entries: InstallPlan["entries"] = [];
  const push = (rel: string, content: string) => {
    entries.push({ path: rel, action: "create", bytes: Buffer.byteLength(content, "utf8") });
  };

  const base = path.join(".agents", "crews", crew.id);
  push(path.join(base, "manifest.json"), JSON.stringify(crew, null, 2) + "\n");
  push(path.join(base, "SKILL.md"), crewSkillMarkdown(crew));
  for (const w of crew.workers) {
    const wdir = path.join(base, "workers", w.id);
    push(path.join(wdir, "SKILL.md"), workerSkillMarkdown(crew, w));
    push(path.join(wdir, "agent.json"), workerAgentJson(crew, w));
  }

  return {
    crewId: crew.id,
    version: crew.version,
    entries,
    mcpConfigPath: ".mcp.json",
  };
}

/**
 * Merge crew MCP servers into an existing .mcp.json content (JSON string).
 * Existing servers with the same name are overwritten by the crew's version;
 * everything else is preserved. Pure: returns the new file content.
 */
export function mergeMcpConfig(existingJson: string | null, crew: CrewDefinition): string {
  let existing: Record<string, unknown> = {};
  if (existingJson) {
    try {
      existing = JSON.parse(existingJson) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  for (const m of crew.mcpServers) {
    servers[m.name] = {
      ...(m.transport === "stdio" ? { command: m.command, args: m.args ?? [] } : { url: m.url }),
      ...(m.env && Object.keys(m.env).length > 0 ? { env: m.env } : {}),
      ...(m.allowedTools && m.allowedTools.length > 0 ? { allowedTools: m.allowedTools } : {}),
    };
  }
  return JSON.stringify({ ...existing, mcpServers: servers }, null, 2) + "\n";
}

/**
 * Install a crew into `root` on the local filesystem. Deterministic: same
 * crew + same root state → same result. Never clobbers unrelated .mcp.json
 * entries.
 */
/**
 * Install a crew into `root` on the local filesystem. Deterministic: same
 * crew + same root state → same result. Never clobbers unrelated .mcp.json
 * entries. Workers declaring a `profile` slug get the profession's
 * expertise/methods/rules/verification compiled into their SKILL.md; the
 * resolver maps slugs → manifests (missing profiles fail the install with a
 * clear error — never silently skipped).
 */
export async function installCrew(
  crew: CrewDefinition,
  root: string,
  resolveProfile?: ProfileResolver,
): Promise<InstallResult> {
  validateCrewOrThrow(crew);

  // Resolve worker profiles once (deterministic order = worker order).
  const profiles = new Map<string, ProfileManifest>();
  if (resolveProfile) {
    for (const w of crew.workers) {
      const slug = w.profile;
      if (!slug) continue;
      const manifest = await resolveProfile(slug);
      if (!manifest) {
        throw new CrewError(
          "CREW_INSTALL_ERROR",
          `worker "${w.id}" references profile "${slug}" which could not be resolved ` +
            `(equip it first: proagent equip ${slug}, or reference a built-in/registry profile)`,
        );
      }
      profiles.set(w.id, manifest);
    }
  }

  const plan = planInstall(crew);
  const filesWritten: string[] = [];

  for (const entry of plan.entries) {
    const abs = path.join(root, entry.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    let content: string;
    if (entry.path.endsWith("manifest.json")) {
      content = JSON.stringify(crew, null, 2) + "\n";
    } else if (entry.path.endsWith("SKILL.md") && entry.path.endsWith(path.join(".agents", "crews", crew.id, "SKILL.md"))) {
      content = crewSkillMarkdown(crew);
    } else if (entry.path.endsWith("SKILL.md")) {
      const workerId = path.basename(path.dirname(entry.path));
      const worker = crew.workers.find((w) => w.id === workerId);
      if (!worker) throw new CrewError("CREW_INSTALL_ERROR", `worker not found for ${entry.path}`);
      content = workerSkillMarkdown(crew, worker, profiles.get(workerId) ?? null);
    } else {
      const workerId = path.basename(path.dirname(entry.path));
      const worker = crew.workers.find((w) => w.id === workerId);
      if (!worker) throw new CrewError("CREW_INSTALL_ERROR", `worker not found for ${entry.path}`);
      content = workerAgentJson(crew, worker);
    }
    await fs.writeFile(abs, content, "utf8");
    filesWritten.push(entry.path);
  }

  // .mcp.json merge — read existing, merge, write.
  const mcpPath = path.join(root, ".mcp.json");
  let existing: string | null = null;
  try {
    existing = await fs.readFile(mcpPath, "utf8");
  } catch {
    existing = null;
  }
  const mcpContent = mergeMcpConfig(existing, crew);
  await fs.writeFile(mcpPath, mcpContent, "utf8");

  return {
    crewId: crew.id,
    version: crew.version,
    filesWritten,
    mcpConfigPath: ".mcp.json",
    plan,
  };
}
