#!/usr/bin/env node
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { loadDotEnv } from "../env.js";

// .env.local / .env are loaded before anything else (real env always wins),
// so commands like `crew publish` and `crew checkout` pick up local secrets
// without exporting anything.
loadDotEnv();

// Single source of truth for the version: the package manifest.
const VERSION: string =
  (JSON.parse(fsSync.readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version?: string;
  }).version ?? "0.0.0-dev";
import { InterviewOrchestrator } from "../core/orchestrator.js";
import { capabilityGaps, detectRuntimeCapabilities } from "../core/runtime.js";
import { SessionStore } from "../core/session.js";
import { validateArchitecture } from "../core/validation.js";
import { FrameworkRegistry, isAccAvailable } from "../context/registry.js";
import {
  renderArchitecture,
  renderBanner,
  renderContextResults,
  renderContradictions,
  renderQuestion,
  renderStatus,
  renderValidation,
} from "../output/render.js";
import type { AgentArchitecture, SelfImprovementPolicy } from "../core/types.js";
import type { EffectiveProfile } from "../profiles/types.js";
import { scanRepo } from "../core/repo-scan.js";
import { runAuditCommand } from "./audit.js";
import { runBenchmarkCommand } from "./benchmark.js";
import { runCrewCommand } from "./crew.js";
import { runListInstalledCommand, runDoctorCommand, runRepairCommand } from "./installed.js";
import { runMemoryCommand } from "./memory.js";
import { promptLine, warnIfStandalone } from "./interactive.js";
import {
  printProfilesHelp,
  runCompile,
  runDetect,
  runEquip,
  runInspectProfile,
  runListProfiles,
  runProfileCommand,
  runValidateProfiles,
} from "./profiles.js";
import {
  buildKindSpec,
  runRegistryCompose,
  runRegistryInfo,
  runRegistryInstall,
  runRegistryList,
  runRegistryLock,
  runRegistryRemove,
  runRegistryResolve,
  runRegistrySearch,
  runRegistrySetup,
  runRegistryUpdate,
  runRegistryValidateSpec,
} from "./registry.js";

interface ParsedArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
  /** Every `--flag value` occurrence in order — repeatable flags (e.g. crew
   *  create --role) collapse to last-wins in `flags`, so order-sensitive
   *  commands read from here instead. */
  flagList: Map<string, string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const flagList = new Map<string, string[]>();
  const args: string[] = [];
  const pushValue = (key: string, value: string): void => {
    const list = flagList.get(key);
    if (list) list.push(value);
    else flagList.set(key, [value]);
  };
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] ?? "";
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        pushValue(key, next);
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { command, args, flags, flagList };
}

function printHelp(): void {
  console.log(`
proagent ${VERSION} — professional profiles for existing coding agents

Usage:
  proagent <command> [options]

Two paths, one registry:
  A) BUILD custom → proagent init → question/answer → build
     (or scaffold directly: profile create / crew create)
  B) EQUIP registry → equip <slug> / crew install <id>

Profile commands:
  detect                    Detect coding-agent harnesses and capabilities
  list                      List available professional profiles
    --kind <k>              …or list registry items of one kind (search/info/install accept kind:id refs)
  inspect <profile>         Inspect a professional profile
  equip <slug> [slug…]      Equip the detected harness with professional profiles
  compile <slug>            Compile a profile for a specific harness (--target)

Agent-building commands:
  init                      Start (or resume) an agent-building session
  status                    Show knowledge state, confidence and readiness
  question                  Show the next high-value questions
  answer <id> "<text>"      Answer a question and advance the interview
  context                   Retrieve scoped context for a task
  context frameworks        List available context frameworks
  spec                      Generate the agent architecture specification
  validate                  Validate the architecture (or --profiles)
  build                     Compile the session into agent skills (default)
    --kind profile          …or materialize it as a custom profile (.proagent/profiles/)
    --kind crew             …or as a custom crew (.proagent/crews/)
    --kind spec             …or emit a proagents.yaml draft from the session
    --all-targets           …also write artifacts for EVERY harness (all agents dirs)
  discover                  Search registries (MCP, npm, skills, GitHub) for tooling
                            matching the session intent; findings are staged and
                            baked into the built profile/crew
  agents                    List agents in the generated architecture
  inspect                   Dump full session state (for agents/humans)
  improve                   Show or configure self-improvement
  benchmark                 Benchmark subcommands (proagent benchmark help)
  memory                    Explicit project memory: add/list/show/rm/compile (proagent memory help)
  crew                      Registry crews: create/list/show/validate/install/build/publish/submit (proagent crew help)
  profile                   Registry profiles: create/list/show/install/validate/publish/submit (proagent profile help)

Registry commands (unified artifact model — kinds: profile, crew, agent, workflow, skill, tool, mcp, …):
  search "<query>"          Federated search (native catalog + allowed sources)
    --type <kind>           Restrict to one artifact kind
  info <kind:id>            Inspect one catalog artifact
  install <kind:id>         Install an artifact (delegates to equip / crew install)
  remove <kind:id>          Remove an installed artifact from this repo
  update                    Re-resolve a stale proagents.lock
  list --kind <k>           List registry items by kind
  resolve                   Capability → implementation graph for proagents.yaml
    --select c=kind:id      Pin a capability's implementation
  lock                      Persist the resolution as proagents.lock
  compose <kind:id>…        Validate a cross-kind composition (PA02x)
  setup                     proagents.yaml → resolve → validate → equip/install
    --harness <id>          Target a specific harness (default: detected)
    --dry-run               Resolve + plan without writing
  validate --spec           End-to-end PA5xx validation of spec (+ lock)
  help                      Show this help

Security:
  audit [<dir>]             Deterministic security scan of a repo (secrets, remote-exec
                            instructions, MCP transports, permission breadth)
    --path <dir>            Audit this directory instead of the cwd
                            Exit: 0 clean · 1 warnings · 2 errors

Install lifecycle:
  list-installed [<dir>]    Show what ProAgents owns in this repo (profiles, crews,
                            instruction blocks, MCP/enforcement state)
    --path <dir>            Scan this directory instead of the cwd
  doctor [<dir>]            Verify installed artifacts vs provenance (manifest.json
                            beside skill, balanced present-once instruction blocks)
    --path <dir>            Check this directory instead of the cwd
                            Exit: 0 healthy · 1 warnings · 2 errors
  repair                    Deterministically recompile single-profile installs from
                            the on-disk canonical manifest (restores SKILL.md, blocks,
                            enforcement). Composed installs are reported as limitations.
    --target <harness>      Recompile for this harness instead of the detected one

Global options:
  --json                    Machine-readable output on stdout
  --quiet                   Suppress decorations
  --target <harness>        Target harness for equip/compile
  --intent "<text>"         Provide intent without the interactive prompt
  --context <path>          Add a context source (repeatable)
  --context-framework <id>  Use a context framework (e.g. agents-code-context)
  --agent <id>              Target a specific agent (build/agents)
  --output <dir>            Build output directory (default .agents/skills)
  --non-interactive         Never prompt; emit questions for the caller
  --improvement-policy <m>  propose | supervised | auto
`);
}

function isJson(flags: Record<string, string | boolean>): boolean {
  return flags.json === true;
}

function parseContextList(flags: Record<string, string | boolean>): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(flags)) {
    if (key === "context") {
      if (typeof value === "string") values.push(value);
    }
  }
  // Repeatable flags are collected naively here; last-wins per key in our parser,
  // so also accept comma-separated values.
  if (typeof flags.context === "string" && flags.context.includes(",")) {
    return flags.context.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return values;
}

function parseSelfImprovement(flags: Record<string, string | boolean>): SelfImprovementPolicy | undefined {
  const raw = flags["self-improving"];
  if (typeof raw !== "string") return undefined;
  const allowed = ["daily", "weekly", "monthly", "quarterly", "manual"];
  const frequency = allowed.includes(raw) ? (raw as SelfImprovementPolicy["frequency"]) : "weekly";
  const modeRaw = flags["improvement-policy"];
  const mode = (typeof modeRaw === "string" && ["propose", "supervised", "auto"].includes(modeRaw))
    ? (modeRaw as SelfImprovementPolicy["mode"])
    : "propose";
  return {
    enabled: true,
    frequency,
    mode,
    protected: ["permissions", "secrets", "security constraints", "human approval"],
  };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Resolve the intent for `init`, repo-aware:
 *  - explicit --intent always wins;
 *  - interactive TTY in a repo: show what was detected, propose an intent,
 *    Enter accepts it;
 *  - interactive TTY outside a repo: classic blank prompt;
 *  - non-interactive (piped/CI) in a repo: auto-accept the proposed intent
 *    (noted on stderr) instead of failing — the repo IS the context.
 */
async function resolveIntent(flags: Record<string, string | boolean>, args: string[]): Promise<string> {
  const explicit = typeof flags.intent === "string" && flags.intent ? flags.intent : args.join(" ");
  if (explicit) return explicit;

  const scan = await scanRepo(process.cwd()).catch(() => null);
  const inProject = Boolean(scan?.isProject && scan);

  if (process.stdin.isTTY && !process.env.PROAGENT_NON_INTERACTIVE) {
    if (inProject && scan) {
      process.stdout.write("\n◇ Detected project:");
      for (const d of scan.detected.slice(0, 5)) process.stdout.write(`\n  · ${d}`);
      const text = await promptLine(
        `\n\n◇ What should the agent do in this repo? (Enter to accept the proposal)\n  › ${scan.proposedIntent}\n  › `,
      );
      return text || scan.proposedIntent;
    }
    const text = await promptLine("\n◇ What are you trying to build?\n  › ");
    if (text) return text;
    fail("No intent provided. Use: proagent init --intent \"...\"");
  }

  // Non-interactive: a repo proposal is grounded enough to proceed on.
  if (inProject && scan) {
    console.error(`note: no --intent given; using repo-derived proposal: "${scan.proposedIntent}"`);
    return scan.proposedIntent;
  }
  if (isJson(flags)) {
    // Machine contract (docs/cli/json.md): a JSON caller gets a parseable
    // needs_input instead of failing silently — but the exit stays non-zero
    // and stderr carries the usage guidance, so scripts and humans both see
    // why no session was started.
    printJson({ status: "needs_input", error: "intent_required" });
    fail(`No intent provided. Use: proagent init --intent "..."`);
  }
  fail("No intent provided. Use: proagent init --intent \"...\"");
}

async function cmdInit(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const store = new SessionStore();
  const orchestrator = new InterviewOrchestrator(store);

  const nonInteractive = flags["non-interactive"] === true || process.env.PROAGENT_NON_INTERACTIVE === "1";
  // Repo-aware intent resolution: --intent > interactive prompt (with repo
  // proposal) > non-interactive auto-accept of the repo-derived proposal.
  const intent = await resolveIntent(flags, args);
  const usingProposal =
    !(typeof flags.intent === "string" && flags.intent) &&
    args.length === 0; // proposal path never passes positional args

  const state = await orchestrator.init({
    intent,
    contextPaths: parseContextList(flags),
    framework: typeof flags["context-framework"] === "string" ? flags["context-framework"] : undefined,
    selfImprovement: parseSelfImprovement(flags),
  });

  if (isJson(flags)) {
    printJson({
      status: "ok",
      sessionId: state.sessionId,
      readiness: state.readiness,
      confidence: state.confidence,
      questions: state.questions.filter((q) => q.status === "open").map((q) => ({
        id: q.id,
        question: q.question,
        reason: q.reason,
        impact: q.impact,
      })),
    });
    return;
  }

  console.log(renderBanner());
  console.log(renderStatus(state));
  const open = state.questions.filter((q) => q.status === "open");
  if (open[0]) console.log(renderQuestion(open[0], 1, open.length));
}

async function cmdStatus(flags: Record<string, string | boolean>): Promise<void> {
  const state = await new SessionStore().load();
  if (!state) fail("No active session. Run `proagent init --intent \"...\"` first.");
  if (isJson(flags)) return printJson(state);
  console.log(renderStatus(state, { color: !flags.quiet }));
}

async function cmdQuestion(flags: Record<string, string | boolean>): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const questions = await orchestrator.nextQuestions();
  if (isJson(flags)) {
    const list = flags.all === true ? questions : questions.slice(0, 1);
    return printJson({
      status: "needs_input",
      questions: list.map((q) => ({ id: q.id, question: q.question, reason: q.reason, impact: q.impact, topics: q.topics })),
    });
  }
  if (questions.length === 0) {
    console.log("No open questions. Run `proagent spec` to generate the architecture.");
    return;
  }
  if (flags.all === true) {
    for (const [i, q] of questions.entries()) console.log(renderQuestion(q, i + 1, questions.length));
    return;
  }
  console.log(renderQuestion(questions[0]!, 1, questions.length));
  if (questions.length > 1) {
    console.log(`\n(+${questions.length - 1} more — run \`proagent question --all\`)`);
  }
}

async function cmdAnswer(idArg: string | undefined, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  if (!idArg) fail("Usage: proagent answer <question-id> \"<answer>\"");
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const raw = rest.join(" ") || (typeof flags.answer === "string" ? flags.answer : "");
  if (!raw) fail("Provide an answer: proagent answer <question-id> \"<answer>\"");
  const { state } = await orchestrator.answer(idArg, raw);

  if (isJson(flags)) {
    return printJson({
      status: "ok",
      answered: idArg,
      readiness: state.readiness,
      confidence: state.confidence,
      contradictions: state.contradictions.filter((c) => c.status === "open"),
      nextQuestions: (await orchestrator.nextQuestions()).map((q) => ({ id: q.id, question: q.question, reason: q.reason, impact: q.impact })),
    });
  }
  console.log(`✓ Answer recorded: ${idArg}`);
  const contradictions = state.contradictions.filter((c) => c.status === "open");
  if (contradictions.length > 0) console.log(renderContradictions(state));
  console.log(`Confidence: ${Math.round(state.confidence * 100)}%  Readiness: ${state.readiness}`);
  const next = await orchestrator.nextQuestions();
  if (next[0]) console.log(renderQuestion(next[0], 1, next.length));
}

async function cmdContext(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  if (args[0] === "frameworks") {
    const registry = new FrameworkRegistry();
    const list = await registry.list(process.cwd());
    if (isJson(flags)) return printJson(list);
    console.log("Available Context Frameworks\n");
    for (const fw of list) {
      console.log(`  ✓ ${fw.name.padEnd(22)} ${fw.description}`);
    }
    const acc = await isAccAvailable();
    if (!acc) console.log(`  ○ agents-code-context   install with: npm i -g acc-code-context (optional)`);
    return;
  }

  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const task = args.join(" ") || (typeof flags.task === "string" ? flags.task : "overall objective");
  const results = await orchestrator.context({
    task,
    framework: typeof flags["context-framework"] === "string" ? flags["context-framework"] : undefined,
    scopes: typeof flags.scope === "string" ? [flags.scope] : undefined,
    maxBytes: typeof flags["max-bytes"] === "string" ? Number(flags["max-bytes"]) : undefined,
    depth: typeof flags.depth === "string" ? Number(flags.depth) : undefined,
  });
  if (isJson(flags)) return printJson(results);
  console.log(renderContextResults(results));
}

async function cmdSpec(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();

  const outFile = typeof flags.output === "string" ? flags.output : (args[0] ?? null);
  if (outFile && outFile !== "stdout") {
    await fs.writeFile(outFile, JSON.stringify(arch, null, 2) + "\n", "utf8");
    console.error(`Architecture written to ${outFile}`);
    if (isJson(flags)) printJson(arch);
    return;
  }
  if (isJson(flags)) return printJson(arch);
  console.log(renderArchitecture(arch));
}

async function cmdValidate(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  let arch: AgentArchitecture;
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const file = args[0] ?? (typeof flags.file === "string" ? flags.file : null);
  if (file) {
    // An explicit file always wins over the session — silent fallback would
    // validate the wrong artifact while reporting "ok".
    arch = JSON.parse(await fs.readFile(file, "utf8")) as AgentArchitecture;
  } else {
    try {
      arch = await orchestrator.spec();
    } catch {
      fail("No session found. Run `proagent init` first, or pass an architecture file: proagent validate arch.json");
    }
  }
  const report = validateArchitecture(arch);
  // Non-zero on errors in BOTH modes — the JSON contract is CI-friendly
  // (docs/cli/json.md: "validate exits non-zero when errors exist").
  if (!report.ok) process.exitCode = 1;
  if (isJson(flags)) return printJson(report);
  console.log(renderValidation(report));
}

async function cmdBuild(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();
  const report = validateArchitecture(arch);
  if (!report.ok) {
    console.error("Architecture has validation errors — fix them before building:");
    console.error(renderValidation(report));
    process.exitCode = 1;
    return;
  }

  // `build --kind profile|crew` materializes the derived architecture as a
  // custom registry item instead of agent skills (the default).
  if (flags.kind === "profile" || flags.kind === "crew") {
    const { buildKindProfile, buildKindCrew } = await import("./build-kind.js");
    if (flags.kind === "profile") return buildKindProfile(arch, flags, isJson(flags));
    return buildKindCrew(arch, flags, isJson(flags));
  }

  const runtime = detectRuntimeCapabilities();
  const gaps = capabilityGaps(arch.runtime, runtime).filter((g) => g.required && !g.available);
  const outDir = typeof flags.output === "string" ? flags.output : path.join(".agents", "skills");
  const agentFilter = typeof flags.agent === "string" ? flags.agent : args[0] ?? null;
  const agents = agentFilter ? arch.agents.filter((a) => a.id === agentFilter) : arch.agents;
  if (agents.length === 0) fail(`No agent matching: ${agentFilter}`);

  // --all-targets: after generating the canonical skills, compile the
  // profile-shaped output for EVERY known harness so the repo is ready for
  // any coding agent that opens it (AGENTS.md + CLAUDE.md +
  // copilot-instructions + GEMINI.md + opencode.json + .openclaude/skills + …).
  const writtenAll: string[] = [];

  const written: string[] = [];
  for (const agent of agents) {
    const dir = path.join(outDir, agent.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "references"), { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), skillMarkdown(agent, arch, runtime), "utf8");
    await fs.writeFile(path.join(dir, "references", "permissions.md"), permissionsMarkdown(agent), "utf8");
    await fs.writeFile(path.join(dir, "references", "escalation.md"), escalationMarkdown(agent), "utf8");
    await fs.writeFile(path.join(dir, "agent.json"), JSON.stringify(agent, null, 2) + "\n", "utf8");
    written.push(path.join(dir, "SKILL.md"));
  }
  await fs.writeFile(path.join(outDir, "agent-architecture.json"), JSON.stringify(arch, null, 2) + "\n", "utf8");

  if (isJson(flags)) {
    return printJson({
      status: report.ok ? "ok" : "blocked",
      runtime: { id: runtime.runtimeId, gaps },
      agents: written,
      architecture: path.join(outDir, "agent-architecture.json"),
    });
  }

  console.log(`✓ ${written.length} agent skill(s) generated in ${outDir}`);
  for (const file of written) console.log(`  • ${file}`);
  console.log(`  • ${path.join(outDir, "agent-architecture.json")}`);
  if (gaps.length > 0) {
    console.log(`\n⚠ Runtime capability gaps (${runtime.runtimeId}):`);
    for (const gap of gaps) console.log(`  ✗ ${gap.capability} — required but not available`);
    console.log("  → the generated skills include a deterministic CLI fallback for each gap");
  }

  // --all-targets: additionally compile profile-shaped artifacts for EVERY
  // known harness so the repo is ready for any coding agent (AGENTS.md +
  // CLAUDE.md + copilot-instructions + GEMINI.md + opencode.json +
  // .openclaude/skills …), not just the detected one.
  if (flags["all-targets"] === true) {
    const { compileForAllHarnesses } = await import("../adapters/index.js");
    const effective: EffectiveProfile = {
      name: arch.team?.name ?? agents[0]!.name,
      slugs: agents.map((a) => a.id),
      identity: { title: arch.team?.name ?? agents[0]!.name, summary: agents[0]!.purpose },
      expertise: agents.flatMap((a) => a.responsibilities),
      methods: [],
      rules: agents.flatMap((a) => a.constraints),
      policies: [],
      standards: [],
      skills: agents.flatMap((a) => a.skills),
      skillsDetail: {},
      knowledge: [],
      references: {},
      ruleEnforcement: [],
      tools: { required: [...new Set(agents.flatMap((a) => a.tools))], optional: [], forbidden: [], mcp: [], packages: [] },
      verification: { required: agents.flatMap((a) => a.validation), optional: [] },
    };
    const manifest = {
      version: "0.1.0",
      profile: { name: arch.team?.name ?? agents[0]!.name, slug: agents[0]!.id },
      identity: { title: arch.team?.name ?? agents[0]!.name, summary: agents[0]!.purpose },
      expertise: [],
      methods: [],
      rules: [],
      standards: [],
      skills: [],
      tools: { required: [] },
      verification: { required: [], optional: [] },
    } as never;
    const allFiles: Array<{ path: string; mechanism: string }> = [];
    for (const result of await compileForAllHarnesses(effective, manifest, process.cwd())) {
      allFiles.push(...result.files);
    }
    console.log(`\n✓ All-targets artifacts for every harness:`);
    const seen = new Set<string>();
    for (const f of allFiles) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      console.log(`  • ${f.path}  (${f.mechanism})`);
    }
  }
}

function skillMarkdown(agent: AgentArchitecture["agents"][number], arch: AgentArchitecture, runtime: ReturnType<typeof detectRuntimeCapabilities>): string {
  const upstream = arch.edges.filter((e) => e.to === agent.id);
  const downstream = arch.edges.filter((e) => e.from === agent.id);
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${agent.id}`);
  lines.push(`description: ${agent.purpose} Use when working on: ${agent.scope.slice(0, 140)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${agent.name}`);
  lines.push("");
  lines.push(`**Role:** ${agent.role} · **Team:** ${arch.team ? arch.team.name : "solo"} · **Runtime:** ${runtime.runtimeId}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(agent.purpose);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(agent.scope);
  lines.push("");
  lines.push("## Responsibilities");
  lines.push("");
  for (const r of agent.responsibilities.length > 0 ? agent.responsibilities : ["(derived from interview — see agent.json)"]) {
    lines.push(`- ${r}`);
  }
  lines.push("");
  lines.push("## Non-goals");
  lines.push("");
  for (const g of agent.nonGoals) lines.push(`- ${g}`);
  lines.push("");
  lines.push("## Workflow");
  lines.push("");
  lines.push("1. Read `agent.json` — it is the authoritative machine-readable contract.");
  lines.push("2. Request only the context scopes declared below; never request more.");
  lines.push("3. Do the work within the declared tools and permissions.");
  lines.push("4. Validate against the criteria before producing outputs.");
  lines.push("5. Produce the declared artifacts and hand them off (do not share raw context).");
  lines.push("");
  lines.push("## Context (information firewall)");
  lines.push("");
  lines.push(`- framework: \`${agent.context.framework}\``);
  lines.push(`- scopes: ${agent.context.scopes.join(", ")}`);
  lines.push("");
  lines.push("## Interfaces");
  lines.push("");
  lines.push(`- inputs: ${agent.inputs.join("; ")}`);
  lines.push(`- outputs: ${agent.outputs.join("; ")}`);
  if (upstream.length > 0) {
    lines.push("");
    lines.push("### Receives from");
    for (const e of upstream) lines.push(`- ${e.from} (${e.kind}): ${e.artifacts.join(", ") || "—"}`);
  }
  if (downstream.length > 0) {
    lines.push("");
    lines.push("### Sends to");
    for (const e of downstream) lines.push(`- ${e.to} (${e.kind}): ${e.artifacts.join(", ") || "—"}`);
  }
  lines.push("");
  lines.push("## Permissions");
  lines.push("");
  lines.push("- See `references/permissions.md` — it is normative. Markdown here is NOT enforcement.");
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  for (const v of agent.validation) lines.push(`- ${v}`);
  lines.push("");
  lines.push("## Escalation");
  lines.push("");
  for (const e of agent.escalation) lines.push(`- ${e}`);
  if (arch.selfImprovement?.enabled) {
    lines.push("");
    lines.push("## Self-improvement");
    lines.push("");
    lines.push(`- cadence: ${arch.selfImprovement.frequency}, policy: ${arch.selfImprovement.mode}`);
    lines.push("- improvements are proposals first; permissions/secrets/constraints are immutable");
    lines.push("- see `references/escalation.md`");
  }
  lines.push("");
  return lines.join("\n");
}

function permissionsMarkdown(agent: AgentArchitecture["agents"][number]): string {
  const p = agent.permissions;
  return `# Permissions — ${agent.name}

Normative reference. Runtime/tool boundaries must enforce these; SKILL.md prose is not enforcement.

| Kind | Allowed |
|---|---|
| read | ${p.read.join(", ") || "—"} |
| write | ${p.write.join(", ") || "—"} |
| execute | ${p.execute.join(", ") || "—"} |
| network | ${p.network.join(", ") || "—"} |
| secrets | ${p.secrets.join(", ") || "—"} |
| production | ${p.production} |

## Human approval required for

${p.humanApproval.length > 0 ? p.humanApproval.map((a) => `- ${a}`).join("\n") : "- (nothing: this agent has no gated actions)"}

## Immutable constraints

- never expand its own permissions at runtime
- never access secrets outside the allowlist
- never disable validation or approval gates
`;
}

function escalationMarkdown(agent: AgentArchitecture["agents"][number]): string {
  return `# Escalation — ${agent.name}

Escalate instead of guessing when:

${agent.escalation.map((e) => `- ${e}`).join("\n")}

Escalate to the coordinator (${agent.dependencies[0] ?? "orchestrator"}) or the human operator.
`;
}

async function cmdAgents(flags: Record<string, string | boolean>): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();
  if (isJson(flags)) return printJson(arch.agents);
  console.log(renderArchitecture(arch));
}

async function cmdInspect(flags: Record<string, string | boolean>): Promise<void> {
  const store = new SessionStore();
  const state = await store.load();
  if (!state) fail("No active session.");
  const orchestrator = new InterviewOrchestrator(store);
  const arch = await orchestrator.spec();
  const runtime = detectRuntimeCapabilities();
  if (isJson(flags)) {
    return printJson({ state, architecture: arch, runtime });
  }
  console.log(renderStatus(state));
  console.log("");
  console.log(renderArchitecture(arch));
}

async function cmdDiscover(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const store = new SessionStore();
  const state = await store.load();
  const query = args.join(" ").trim();
  if (!state && !query) {
    fail("No session found. Run `proagent init` first, or pass a query: proagent discover \"<what the agent needs>\"");
  }
  const { stageTooling, deriveQueries } = await import("../discovery/session.js");
  const { renderFindings } = await import("../discovery/registry.js");

  if (state && !query) {
    // Session mode: derive queries from the interview and stage findings.
    const queries = state.tooling?.queries.length ? state.tooling.queries : deriveQueries(state);
    if (queries.length === 0) fail("Nothing to search — answer a few questions or pass a query: proagent discover \"<query>\"");
    state.tooling = { ...(state.tooling ?? { findings: [] }), queries };
    const results = await stageTooling(state);
    await store.save(state);
    const total = state.tooling?.findings.length ?? 0;
    if (isJson(flags)) {
      return printJson({ status: "ok", command: "discover", queries, staged: total, findings: state.tooling?.findings ?? [], registries: results });
    }
    console.log(`Discovery queries: ${queries.map((q) => `"${q}"`).join(", ")}`);
    console.log(renderFindings(results, queries.join(" | ")));
    console.log(`Staged ${total} finding(s) in .proagent/session.json — baked into build by default.`);
    return;
  }

  // Ad-hoc query mode: search, render, and stage into the session when one exists.
  const { discoverTooling } = await import("../discovery/registry.js");
  const results = await discoverTooling({ query });
  if (state) {
    state.tooling = {
      queries: [...new Set([...(state.tooling?.queries ?? []), query.toLowerCase()])],
      findings: [
        ...(state.tooling?.findings ?? []),
        ...results.flatMap((r) => r.results.map((f) => ({ kind: f.kind, name: f.name, description: f.description, source: f.source, reference: f.reference, query }))),
      ].filter((f, i, arr) => arr.findIndex((o) => `${o.kind}:${o.name}` === `${f.kind}:${f.name}`) === i).slice(0, 48),
      discoveredAt: new Date().toISOString(),
    };
    await store.save(state);
  }
  if (isJson(flags)) {
    return printJson({ status: "ok", command: "discover", query, findings: results.flatMap((r) => r.results), registries: results, staged: state ? true : false });
  }
  console.log(renderFindings(results, query));
  if (state) console.log("Staged into .proagent/session.json — `proagent build` bakes these into the profile.");
}

async function cmdImprove(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const store = new SessionStore();
  const state = await store.load();
  if (!state) fail("No active session. Self-improvement configures an agent-building session — run `proagent init` first.");

  const sub = args[0] ?? "status";
  if (sub === "schedule" && typeof args[1] === "string") {
    const allowed = ["daily", "weekly", "monthly", "quarterly", "manual"];
    const freq = allowed.includes(args[1]) ? args[1] : "weekly";
    state.selfImprovement = {
      enabled: freq !== "manual",
      frequency: freq as SelfImprovementPolicy["frequency"],
      mode: (typeof flags["improvement-policy"] === "string"
        ? flags["improvement-policy"] as SelfImprovementPolicy["mode"]
        : state.selfImprovement?.mode ?? "propose"),
      protected: ["permissions", "secrets", "security constraints", "human approval"],
    };
    await store.save(state);
    console.log(`✓ Self-improvement scheduled: ${freq}`);
    return;
  }

  if (isJson(flags)) {
    return printJson({
      enabled: state.selfImprovement?.enabled ?? false,
      frequency: state.selfImprovement?.frequency ?? "manual",
      mode: state.selfImprovement?.mode ?? "propose",
      protected: state.selfImprovement?.protected ?? [],
      note: "Improvement execution runs as a specialized improvement agent (see docs/self-improvement.md).",
    });
  }
  console.log("Self Improvement\n");
  console.log(`  enabled:   ${state.selfImprovement?.enabled ?? false}`);
  console.log(`  frequency: ${state.selfImprovement?.frequency ?? "manual"}`);
  console.log(`  mode:      ${state.selfImprovement?.mode ?? "propose"}`);
  console.log(`  protected: ${(state.selfImprovement?.protected ?? []).join(", ")}`);
}

async function main(): Promise<void> {
  const { command, args, flags, flagList } = parseArgs(process.argv.slice(2));
  warnIfStandalone(command, isJson(flags));

  switch (command) {
    case "detect": return runDetect(isJson(flags), flags.quiet === true);
    case "list":
      // `list --kind <k>` is the registry listing; bare `list` stays the
      // profile listing (additive contract — old commands unchanged).
      if (typeof flags.kind === "string" && flags.kind) return runRegistryList(flags);
      return runListProfiles(isJson(flags));
    case "equip": return runEquip(args, flags);
    case "compile": return runCompile(args, flags);
    case "profile": return runProfileCommand(args, flags);
    case "init": return cmdInit(flags, args);
    case "status": return cmdStatus(flags);
    case "question": return cmdQuestion(flags);
    case "answer": return cmdAnswer(args[0], args.slice(1), flags);
    case "context": return cmdContext(args, flags);
    case "spec": return cmdSpec(flags, args);
    case "validate":
      if (flags.spec === true) return runRegistryValidateSpec(flags);
      if (flags.profiles === true) return runValidateProfiles(isJson(flags));
      // An explicit architecture file always wins (documented: `proagent
      // validate arch.json` validates that file, session or not).
      const vFile = args[0] ?? (typeof flags.file === "string" ? flags.file : null);
      if (vFile) return cmdValidate(flags, args);
      // No agent-building session → fall back to profile validation, so the
      // equip quickstart (`detect → equip → validate`) works as documented.
      if (!(await new SessionStore().load())) return runValidateProfiles(isJson(flags));
      return cmdValidate(flags, args);
    case "build":
      if (flags.kind === "spec") return buildKindSpec(flags, isJson(flags));
      return cmdBuild(flags, args);
    case "discover": return cmdDiscover(args, flags);
    // Registry command group (additive; legacy commands unchanged).
    case "search": return runRegistrySearch(args, flags);
    case "info": return runRegistryInfo(args[0], flags);
    case "install": return runRegistryInstall(args[0], flags);
    case "remove":
      return runRegistryRemove(args[0], flags);
    case "update":
      return runRegistryUpdate(flags);
    case "resolve": return runRegistryResolve(flags);
    case "lock": return runRegistryLock(flags);
    case "compose":
      return runRegistryCompose(args, flags);
    case "setup": return runRegistrySetup(args, flags);
    case "audit": return runAuditCommand(args, flags);
    case "list-installed": return runListInstalledCommand(args, flags);
    case "doctor": return runDoctorCommand(flags);
    case "repair": return runRepairCommand(flags);
    case "agents": return cmdAgents(flags);
    case "inspect":
      if (args[0]) return runInspectProfile(args[0], isJson(flags));
      return cmdInspect(flags);
    case "improve": return cmdImprove(args, flags);
    case "self-improve": {
      // README alias: proagent self-improve --schedule weekly
      const improveArgs = typeof flags.schedule === "string" && flags.schedule ? ["schedule", flags.schedule] : args;
      return cmdImprove(improveArgs, flags);
    }
    case "benchmark": return runBenchmarkCommand(args, flags);
    case "memory": return runMemoryCommand(args, flags);
    case "crew": return runCrewCommand(args, flags, flagList);
    case "--version":
    case "-v":
    case "version":
      console.log(VERSION);
      return;
    case "help":
    case "--help":
    case "-h":
    default: {
      if (command !== "help" && command !== "--help" && command !== "-h") {
        console.error(`unknown command: ${command}`);
      }
      printHelp();
      if (command !== "help" && command !== "--help" && command !== "-h") process.exitCode = 1;
      return;
    }
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
