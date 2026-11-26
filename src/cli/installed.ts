import path from "node:path";
import { detectHarnesses, HARNESS_SPECS } from "../adapters/index.js";
import type { HarnessId, HarnessSignal } from "../adapters/index.js";
import { runDoctor, runRepair, scanInstalled } from "../installed/index.js";
import { jsonOut } from "./json.js";
import { warnIfStandalone } from "./interactive.js";

/**
 * Install lifecycle commands:
 *   proagent list-installed   inventory of owned artifacts (hero marker)
 *   proagent doctor           verification findings, exit 0/1/2 like audit
 *   proagent repair           deterministic recompile of single-profile
 *                             installs from on-disk canonical manifests
 */

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function resolveRoot(args: string[], flags: Record<string, string | boolean>): string {
  const target =
    typeof flags.path === "string" && flags.path.length > 0
      ? flags.path
      : typeof args[0] === "string" && args[0].length > 0
        ? args[0]
        : ".";
  return path.resolve(target);
}

/** Resolve a `--target <harness>` flag to a harness signal (shared helpers). */
export function resolveTargetFlag(flags: Record<string, string | boolean>): HarnessSignal | undefined {
  const explicit = typeof flags.target === "string" && flags.target.length > 0 ? flags.target : undefined;
  if (!explicit) return undefined;
  const spec = HARNESS_SPECS.find((s) => s.id === explicit);
  if (!spec && explicit !== "generic-cli") {
    fail(`unknown --target ${explicit} (available: ${[...HARNESS_SPECS.map((s) => s.id), "generic-cli"].join(", ")})`);
  }
  return {
    id: (explicit === "generic-cli" ? "generic-cli" : spec!.id) as HarnessId,
    name: explicit === "generic-cli" ? "Generic CLI" : spec!.name,
    capabilities: explicit === "generic-cli"
      ? { projectInstructions: true, skills: false, ruleEnforcement: "none", mcp: false, shell: true, git: true }
      : { ...spec!.capabilities },
    evidence: [`--target override`],
  };
}

export async function runListInstalledCommand(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("list-installed", flags.json === true);
  const root = resolveRoot(args, flags);
  const inv = await scanInstalled(root);
  if (flags.json === true) {
    return jsonOut({
      status: "ok",
      root,
      profiles: inv.profiles,
      crews: inv.crews,
      blocks: inv.blocks,
      summary: inv.summary,
    });
  }
  const { profiles, crews, blocks } = inv.summary;
  console.log(`\nInstalled in ${root}: ${profiles} profile(s), ${crews} crew(s), ${blocks} block(s)\n`);
  for (const p of inv.profiles) {
    console.log(`  ◈ profile ${p.slug} v${p.version} — ${p.hasSkill ? "skill ok" : "SKILL.md missing"}${p.hasManifest ? "" : " (manifest broken)"}`);
  }
  for (const c of inv.crews) {
    console.log(`  ⚑ crew ${c.id} v${c.version} — ${c.hasSkill ? "skill ok" : "SKILL.md missing"}`);
  }
  for (const b of inv.blocks) {
    console.log(`  📎 block ${b.marker} (${b.file}${b.closed ? "" : " · unclosed"})`);
  }
  if (inv.profiles.length + inv.crews.length + inv.blocks.length === 0) console.log("  (nothing installed yet — try: proagent equip <profile>)");
  console.log("");
}

export async function runDoctorCommand(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("doctor", flags.json === true);
  const root = resolveRoot([], flags);
  const report = await runDoctor(root);

  if (flags.json === true) {
    jsonOut(report);
    if (report.exit > 0) process.exitCode = report.exit;
    return;
  }

  if (report.findings.length === 0) {
    console.log(`\nDoctor: ${root} — healthy (${report.summary.total} findings)\n`);
    return;
  }
  const icon = (severity: string): string => (severity === "error" ? "✗" : "⚠");
  console.log(`\nDoctor: ${root}\n`);
  for (const f of report.findings) {
    console.log(`  ${icon(f.severity)} [${f.code}] ${f.file}:${f.line}`);
    console.log(`      ${f.message}`);
    console.log(`      → ${f.suggestion}`);
  }
  const { total, errors, warnings } = report.summary;
  console.log(`\n${total} finding(s): ${errors} error(s), ${warnings} warning(s) — exit ${report.exit}`);
  console.log("");
  if (report.exit > 0) process.exitCode = report.exit;
}

export async function runRepairCommand(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("repair", flags.json === true);
  const root = resolveRoot([], flags);
  const target = resolveTargetFlag(flags) ?? (await detectHarnesses(root, {})).primary;
  const report = await runRepair(root, target);

  if (flags.json === true) {
    jsonOut(report);
    return;
  }

  console.log(`\nRepair: ${root} (target ${report.target})\n`);
  if (report.repaired.length === 0 && report.limitations.length === 0) {
    console.log("  nothing to repair\n");
    return;
  }
  for (const rel of report.repaired) console.log(`  ✓ ${rel}`);
  for (const lim of report.limitations) console.log(`  ⚠ ${lim}`);
  console.log("");
}