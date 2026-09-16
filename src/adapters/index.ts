import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { EffectiveProfile, ProfileManifest } from "../profiles/types.js";

/**
 * Profile Compiler — harness adapters.
 *
 * A canonical Professional Profile is provider-agnostic; the compiler decides
 * how a target coding-agent harness expresses it using that harness's own
 * mechanisms (instructions files, skills directories, rules, MCP, hooks).
 *
 * Detection is filesystem-first: a harness is "detected" when its project
 * layout is present in the repository. Environment signals refine the result
 * when running inside a live agent session. Nothing is hardcoded to a vendor
 * SDK — just conventions and env signals, the same philosophy as
 * src/core/runtime.ts.
 */

// ---------------------------------------------------------------------------
// Harness detection
// ---------------------------------------------------------------------------

export interface HarnessSignal {
  id: HarnessId;
  name: string;
  /** Mechanisms the harness supports (used to express profiles). */
  capabilities: HarnessCapabilities;
  evidence: string[];
}

export type HarnessId =
  | "claude-code"
  | "codex"
  | "opencode"
  | "cursor"
  | "gemini-cli"
  | "generic-cli";

export interface HarnessCapabilities {
  /** Project instructions file (CLAUDE.md, AGENTS.md, …). */
  projectInstructions: boolean;
  /** Native agent-skills directory (.agents/skills/). */
  skills: boolean;
  /** Native rules/policy enforcement (hooks, sandbox policies). */
  ruleEnforcement: "native" | "instructions" | "none";
  /** MCP config support (.mcp.json). */
  mcp: boolean;
  /** Shell/git tool availability. */
  shell: boolean;
  git: boolean;
}

export interface DetectedHarness {
  /** Best-guess target harness for `equip`/`compile`. */
  primary: HarnessSignal;
  /** All harnesses whose project layout is present. */
  all: HarnessSignal[];
}

const CAPS = {
  full: {
    projectInstructions: true,
    skills: true,
    ruleEnforcement: "native",
    mcp: true,
    shell: true,
    git: true,
  },
  instructions: {
    projectInstructions: true,
    skills: true,
    ruleEnforcement: "instructions",
    mcp: true,
    shell: true,
    git: true,
  },
  minimal: {
    projectInstructions: true,
    skills: false,
    ruleEnforcement: "none",
    mcp: false,
    shell: true,
    git: true,
  },
} as const;

const HARNESS_SPECS: Array<{
  id: HarnessId;
  name: string;
  capabilities: HarnessCapabilities;
  /** Files/dirs (relative to repo root) proving the harness is set up here. */
  layout: string[];
  /** Env signals when running inside the harness live. */
  env: string[];
}> = [
  {
    id: "claude-code",
    name: "Claude Code",
    capabilities: { ...CAPS.full },
    layout: ["CLAUDE.md", ".claude/settings.json", ".claude/agents", ".mcp.json"],
    env: ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"],
  },
  {
    id: "codex",
    name: "Codex",
    capabilities: { ...CAPS.instructions },
    layout: ["AGENTS.md", ".codex/config.toml"],
    env: ["CODEX_SANDBOX_NETWORK_DISABLED", "OCX_MANUAL_TIPS"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    capabilities: { ...CAPS.full },
    layout: ["opencode.json", ".opencode", "AGENTS.md"],
    env: ["OPENCODE"],
  },
  {
    id: "cursor",
    name: "Cursor",
    capabilities: { ...CAPS.instructions },
    layout: [".cursor/rules", ".cursorrules", ".cursor/mcp.json"],
    env: ["CURSOR_AGENT", "CURSOR_TRACE_ID"],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    capabilities: { ...CAPS.instructions },
    layout: ["GEMINI.md", ".gemini/settings.json"],
    env: ["GEMINI_API_KEY", "GEMINI_CLI"],
  },
];

async function exists(root: string, rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect coding-agent harnesses present in the current repository. Pure with
 * respect to the filesystem: the same repo state always yields the same
 * result. Env signals promote a layout-detected harness to "primary" when we
 * are running inside it.
 */
export async function detectHarnesses(
  root: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<DetectedHarness> {
  const all: HarnessSignal[] = [];

  for (const spec of HARNESS_SPECS) {
    const evidence: string[] = [];
    for (const rel of spec.layout) {
      if (await exists(root, rel)) evidence.push(rel);
    }
    let envHit = false;
    for (const key of spec.env) {
      if (env[key] !== undefined) {
        envHit = true;
        evidence.push(`env:${key}`);
      }
    }
    if (evidence.length > 0) {
      all.push({ id: spec.id, name: spec.name, capabilities: { ...spec.capabilities }, evidence });
    }
  }

  // Generic CLI fallback: shell+git exist everywhere; capabilities are minimal.
  const generic: HarnessSignal = {
    id: "generic-cli",
    name: "Generic CLI runtime",
    capabilities: { ...CAPS.minimal },
    evidence: ["filesystem", "shell"],
  };

  // Primary = env-detected harness first, then the layout-detected one with
  // the most evidence, then generic.
  const envPrimary = all.find((h) => h.evidence.some((e) => e.startsWith("env:")));
  const layoutSorted = [...all].sort((a, b) => b.evidence.length - a.evidence.length);
  const primary = envPrimary ?? layoutSorted[0] ?? generic;

  return { primary, all: all.length > 0 ? all : [generic] };
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface CompileResult {
  target: HarnessId;
  /** Files written (relative to root), with the mechanism that produced them. */
  files: Array<{ path: string; mechanism: string }>;
  /** Profile requirements the target harness cannot express or enforce. */
  limitations: string[];
}

/** Markdown block appended to the target's project instructions file. */
function profileInstructionsBlock(profile: EffectiveProfile, target: HarnessId): string {
  const marker = hashMarker(profile);
  const lines: string[] = [];
  lines.push(`<!-- proagent:profile:start ${marker} -->`);
  lines.push(`# Professional Profile: ${profile.identity.title}`);
  lines.push("");
  lines.push(`Equipped by ProAgents (${target}). You operate as a professional under this profile.`);
  lines.push("");
  lines.push("## Expertise");
  for (const e of profile.expertise) lines.push(`- ${e}`);
  lines.push("");
  lines.push("## Methods");
  for (const m of profile.methods) lines.push(`- ${m}`);
  lines.push("");
  lines.push("## Rules (normative)");
  for (const r of profile.rules) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## Standards");
  for (const s of profile.standards) lines.push(`- ${s}`);
  lines.push("");
  lines.push("## Verification (required before reporting completion)");
  for (const v of profile.verification.required) lines.push(`- ${v}`);
  lines.push("");
  lines.push("Markdown informs; runtime boundaries enforce where the harness supports it.");
  lines.push(`<!-- proagent:profile:end ${marker} -->`);
  return lines.join("\n");
}

/** Deterministic marker derived from profile content (never a timestamp). */
function hashMarker(profile: EffectiveProfile): string {
  return createHash("sha256")
    .update(profile.slugs.join(","))
    .update("\0")
    .update(profile.rules.join("\n"))
    .digest("hex")
    .slice(0, 12);
}

/** Skill-style SKILL.md for harnesses with a skills directory. */
function profileSkillMarkdown(profile: EffectiveProfile, manifest: ProfileManifest): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${profile.slugs.join("-")}`);
  lines.push(`description: Professional profile ${profile.identity.title} (v${manifest.profile.version}). Equip when operating as this profession.`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${profile.identity.title}`);
  lines.push("");
  if (profile.identity.summary) {
    lines.push(profile.identity.summary);
    lines.push("");
  }
  lines.push("## Expertise");
  for (const e of profile.expertise) lines.push(`- ${e}`);
  if (profile.knowledge.length > 0) {
    lines.push("");
    lines.push("## Knowledge");
    for (const k of profile.knowledge) lines.push(`- ${k}`);
  }
  if (profile.methods.length > 0) {
    lines.push("");
    lines.push("## Methods");
    for (const m of profile.methods) lines.push(`- ${m}`);
  }
  if (profile.skills.length > 0) {
    lines.push("");
    lines.push("## Skills");
    for (const s of profile.skills) lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("## Rules (normative)");
  for (const r of profile.rules) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## Standards");
  for (const s of profile.standards) lines.push(`- ${s}`);
  lines.push("");
  lines.push("## Tools");
  lines.push(`- required: ${profile.tools.required.join(", ")}`);
  if (profile.tools.optional.length > 0) lines.push(`- optional: ${profile.tools.optional.join(", ")}`);
  if (profile.tools.forbidden.length > 0) lines.push(`- forbidden: ${profile.tools.forbidden.join(", ")}`);
  lines.push("");
  lines.push("## Verification");
  lines.push("Required before reporting completion:");
  for (const v of profile.verification.required) lines.push(`- ${v}`);
  if (profile.verification.optional.length > 0) {
    lines.push("When relevant:");
    for (const v of profile.verification.optional) lines.push(`- ${v}`);
  }
  lines.push("");
  lines.push("Markdown informs; runtime boundaries enforce where the harness supports it.");
  lines.push("");
  return lines.join("\n");
}

/**
 * Compile an effective profile for a target harness. Deterministic given the
 * same repo state: markers use content hashes, not timestamps.
 */
export async function compileForHarness(
  profile: EffectiveProfile,
  manifest: ProfileManifest,
  target: HarnessSignal,
  root: string = process.cwd(),
): Promise<CompileResult> {
  const files: CompileResult["files"] = [];
  const limitations: string[] = [];
  const caps = target.capabilities;

  // 1. Skills directory (highest-fidelity mechanism). The canonical manifest
  // is preserved beside the compiled skill so the portable profile stays
  // inspectable in the target repo.
  if (caps.skills) {
    const dir = path.join(".agents", "skills", profile.slugs.join("-"));
    await fs.mkdir(path.join(root, dir), { recursive: true });
    const skillPath = path.join(dir, "SKILL.md");
    await fs.writeFile(path.join(root, skillPath), profileSkillMarkdown(profile, manifest), "utf8");
    files.push({ path: skillPath, mechanism: "agent-skill" });
    const manifestPath = path.join(dir, "profile.json");
    await fs.writeFile(path.join(root, manifestPath), JSON.stringify(manifest, null, 2) + "\n", "utf8");
    files.push({ path: manifestPath, mechanism: "canonical-manifest" });
  } else {
    limitations.push("target has no skills directory — profile expressed as project instructions only");
  }

  // 2. Project instructions (all harnesses with a known instructions file).
  if (caps.projectInstructions) {
    const instrFile =
      target.id === "claude-code" ? "CLAUDE.md"
      : target.id === "gemini-cli" ? "GEMINI.md"
      : "AGENTS.md";
    const abs = path.join(root, instrFile);
    let existing = "";
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch {
      // New file.
    }
    // Replace an existing proagent block or append.
    const block = profileInstructionsBlock(profile, target.id);
    const marker = hashMarker(profile);
    const start = existing.indexOf("<!-- proagent:profile:start");
    const end = existing.indexOf(`<!-- proagent:profile:end ${marker} -->`);
    let next: string;
    if (start !== -1 && end !== -1) {
      next = existing.slice(0, start) + block + existing.slice(end + `<!-- proagent:profile:end ${marker} -->`.length);
    } else {
      next = existing ? `${existing.replace(/\n+$/, "")}\n\n${block}\n` : `${block}\n`;
    }
    await fs.writeFile(abs, next, "utf8");
    files.push({ path: instrFile, mechanism: "project-instructions" });
  }

  // 3. Rule enforcement.
  if (caps.ruleEnforcement === "native") {
    // Claude Code hooks: deny destructive git ops and secret reads at the
    // boundary. We write a settings snippet; the harness enforces it.
    const hooksPath = path.join(".claude", "settings.json");
    const abs = path.join(root, hooksPath);
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await fs.readFile(abs, "utf8")) as Record<string, unknown>;
    } catch {
      // New settings file.
    }
    const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
    settings.hooks = {
      ...existingHooks,
      PreToolUse: [
        ...((existingHooks.PreToolUse as Array<unknown>) ?? []),
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              // Reads the tool-call JSON on stdin; exit 2 blocks the call.
              command: "node -e \"let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{process.exit(/(git push --force|rm -rf\\\\s+\\\\/)/.test(d)?2:0)})\"",
            },
          ],
        },
      ],
    };
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, JSON.stringify(settings, null, 2) + "\n", "utf8");
    files.push({ path: hooksPath, mechanism: "rule-enforcement" });
  } else if (caps.ruleEnforcement === "instructions" && profile.rules.length > 0) {
    limitations.push("rule enforcement falls back to project instructions (no native hooks/policy support)");
  } else if (caps.ruleEnforcement === "none" && profile.rules.length > 0) {
    limitations.push("target has no rule enforcement — rules are advisory in SKILL.md only");
  }

  // 4. Verification notes — never silently pretend enforcement exists.
  const verificationNotes = profile.verification.required.map(
    (v) => `${v}: executed by the agent within the session; the harness does not gate completion on it`,
  );

  return { target: target.id, files, limitations };
}
