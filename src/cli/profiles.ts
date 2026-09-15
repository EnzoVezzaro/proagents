import {
  fetchProfileManifest,
  listProfiles,
  resolveProfiles,
  validateAllProfiles,
} from "../profiles/registry.js";
import { composeProfiles } from "../profiles/composition.js";
import {
  compileForHarness,
  detectHarnesses,
} from "../adapters/index.js";
import type { HarnessId } from "../adapters/index.js";
import { validateProfile } from "../profiles/validation.js";
import type { ProfileManifest } from "../profiles/types.js";
import { jsonOut } from "./json.js";
import { warnIfStandalone } from "./interactive.js";
import { getEnvConfig } from "../env.js";

export function printProfilesHelp(): void {
  console.log(`
proagent profiles — professional profiles for existing coding agents

Usage:
  proagent detect                        Detect coding-agent harnesses and capabilities
  proagent list                          List available professional profiles
  proagent inspect <profile>             Inspect a profile (expertise, methods, rules, verification)
  proagent equip <slug> [slug…]          Equip the detected harness with one or more profiles
    --target <harness>                   Override harness detection (claude-code, codex, opencode, cursor, gemini-cli, generic-cli)
    --dry-run                            Show the compile plan without writing
  proagent compile <slug> --target <id>  Compile a profile for a specific harness (like equip, explicit)
    --output <dir>                       Output directory override
  proagent validate --profiles           Validate all discoverable profiles

All commands support --json.
`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function requireSlugs(args: string[], usage: string): string[] {
  if (args.length === 0) fail(usage);
  return args;
}

async function targetHarness(flags: Record<string, string | boolean>) {
  const detected = await detectHarnesses();
  if (typeof flags.target === "string" && flags.target) {
    const found = detected.all.find((h) => h.id === flags.target);
    if (!found) {
      const known = [...detected.all.map((h) => h.id), "generic-cli"].join(", ");
      fail(`unknown --target ${flags.target} (available: ${known})`);
    }
    return found;
  }
  return detected.primary;
}

/** `proagent detect` — what harnesses exist here and what they can do. */
export async function runDetect(json: boolean, quiet: boolean): Promise<void> {
  warnIfStandalone("detect", json);
  const detected = await detectHarnesses();
  if (json) {
    return jsonOut({
      status: "ok",
      command: "detect",
      primary: detected.primary,
      harnesses: detected.all,
    });
  }
  if (!quiet) console.log("");
  console.log("Detected coding agents:\n");
  for (const h of detected.all) {
    console.log(`  ✓ ${h.name}${h.id === detected.primary.id ? "  (primary)" : ""}`);
    console.log(`      ${h.evidence.join(", ")}`);
  }
  console.log("\nDetected capabilities:\n");
  const c = detected.primary.capabilities;
  console.log(`  ${c.projectInstructions ? "✓" : "✗"} Project instructions`);
  console.log(`  ${c.skills ? "✓" : "✗"} Skills`);
  console.log(`  ${c.mcp ? "✓" : "✗"} MCP`);
  console.log(`  ${c.shell ? "✓" : "✗"} Shell`);
  console.log(`  ${c.git ? "✓" : "✗"} Git`);
  console.log(`\nEquip with: proagent equip <profile>   Browse with: proagent list`);
}

/** `proagent list` — the profile catalog. */
export async function runListProfiles(json: boolean): Promise<void> {
  warnIfStandalone("list", json);
  const entries = await listProfiles();
  if (json) {
    return jsonOut({
      status: "ok",
      command: "list",
      profiles: entries.map((e) => ({
        slug: e.manifest.profile.slug,
        name: e.manifest.profile.name,
        version: e.manifest.profile.version,
        description: e.manifest.profile.description ?? "",
        origin: e.origin,
        tags: e.manifest.profile.tags ?? [],
      })),
    });
  }
  console.log("\nProfessional profiles:\n");
  for (const e of entries) {
    const origin = e.origin === "local" ? "  [local]" : "";
    console.log(`  ${e.manifest.profile.slug.padEnd(26)} ${e.manifest.profile.description ?? e.manifest.identity.title}${origin}`);
  }
  console.log(`\n${entries.length} profile(s). Equip with: proagent equip <slug>`);
}

/** `proagent inspect <slug>` — deep view of one profile. */
export async function runInspectProfile(slug: string, json: boolean): Promise<void> {
  warnIfStandalone("inspect", json);
  const [entry] = await resolveProfiles([slug]);
  if (!entry) fail(`unknown profile: ${slug}`);
  const manifest = entry.manifest;
  if (json) {
    return jsonOut({ status: "ok", command: "inspect", profile: manifest, origin: entry.origin });
  }
  console.log(`\n${manifest.identity.title} (${manifest.profile.slug} v${manifest.profile.version})\n`);
  if (manifest.identity.summary) console.log(`  ${manifest.identity.summary}\n`);
  const section = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    console.log(`  ${title}`);
    for (const i of items) console.log(`    - ${i}`);
    console.log("");
  };
  section("Expertise", manifest.expertise);
  section("Methods", manifest.methods ?? []);
  section("Skills", manifest.skills ?? []);
  section("Rules (normative)", manifest.rules ?? []);
  section("Standards", manifest.standards ?? []);
  section("Tools required", manifest.tools.required);
  section("Verification required", manifest.verification.required);
}

/**
 * Resolve a slug for equip: registry first (builtin/local/marketplace dir);
 * if unknown, fetch it from the remote Git-backed marketplace catalog.
 * Returns the resolved manifests plus any remote origins for reporting.
 */
async function resolveEquipManifests(
  slugs: string[],
  flags: Record<string, string | boolean>,
): Promise<{ manifests: ProfileManifest[]; remote: string[] }> {
  const remote: string[] = [];
  const manifests: ProfileManifest[] = [];
  let registry: Awaited<ReturnType<typeof listProfiles>> = [];
  for (const slug of slugs) {
    registry = await listProfiles();
    const found = registry.find((e) => e.manifest.profile.slug === slug);
    if (found) {
      manifests.push(found.manifest);
      continue;
    }
    const env = getEnvConfig();
    const repo = (typeof flags.repo === "string" && flags.repo) || env.marketRepo || "EnzoVezzaro/proagents";
    const ref = typeof flags.ref === "string" && flags.ref ? flags.ref : "main";
    const token = (typeof flags.token === "string" && flags.token) || env.githubToken || undefined;
    manifests.push(await fetchProfileManifest(slug, repo, ref, token));
    remote.push(slug);
  }
  return { manifests, remote };
}

/**
 * Shared equip/compile pipeline: resolve → validate → compose → compile.
 * Serious conflicts block; warnings are reported, never silently dropped.
 */
async function equipPipeline(
  slugs: string[],
  flags: Record<string, string | boolean>,
  explicitCompile: boolean,
): Promise<void> {
  const json = flags.json === true;
  const dryRun = flags["dry-run"] === true;
  const harness = await targetHarness(flags);

  const { manifests, remote } = await resolveEquipManifests(slugs, flags);

  // Validate each profile first (PA03x errors block). Remote profiles have no
  // local directory, so knowledge-reference checks are skipped for them.
  const registry = await listProfiles();
  const slugSet = new Set(registry.map((e) => e.manifest.profile.slug));
  const validationReports = manifests.map((m) =>
    validateProfile(m, { registrySlugs: slugSet }),
  );
  const invalid = validationReports.filter((r) => !r.ok);
  if (invalid.length > 0) {
    process.exitCode = 1;
    if (json) {
      return jsonOut({ status: "blocked", command: explicitCompile ? "compile" : "equip", validation: invalid });
    }
    for (const r of invalid) {
      for (const f of r.findings.filter((f) => f.severity === "error")) {
        console.error(`error: [${f.code}] ${f.message}`);
      }
    }
    return;
  }

  if (remote.length > 0) {
    if (json) {
      // jsonOut below reports remote origins; nothing to print here.
    } else {
      console.log(`  fetched from marketplace: ${remote.join(", ")}`);
    }
  }

  const { effective, conflicts } = composeProfiles(manifests);
  const errors = conflicts.filter((c) => c.severity === "error");
  if (errors.length > 0) {
    process.exitCode = 1;
    if (json) {
      return jsonOut({ status: "blocked", command: explicitCompile ? "compile" : "equip", conflicts });
    }
    console.error("Composition conflicts — fix before equipping:");
    for (const c of errors) console.error(`  [${c.code}] ${c.message}`);
    return;
  }

  if (dryRun) {
    if (json) {
      return jsonOut({ status: "ok", command: "compile", dryRun: true, target: harness.id, profile: effective.slugs, effective });
    }
    console.log(`\nWould equip ${effective.slugs.join(" + ")} on ${harness.name}:`);
    console.log("  • .agents/skills/<profile>/SKILL.md (skills mechanism)");
    console.log("  • project instructions block (rules, verification)");
    if (harness.capabilities.ruleEnforcement === "native") console.log("  • native rule enforcement (hooks)");
    if (harness.capabilities.ruleEnforcement !== "native" && effective.rules.length > 0) {
      console.log(`  ⚠ rules fall back to instructions (no native enforcement)`);
    }
    return;
  }

  const result = await compileForHarness(effective, manifests[0]!, harness);
  if (json) {
    return jsonOut({
      status: "ok",
      command: explicitCompile ? "compile" : "equip",
      target: result.target,
      profile: effective.slugs,
      files: result.files,
      limitations: result.limitations,
    });
  }

  console.log(`\n✓ Equipped ${effective.identity.title} → ${harness.name}`);
  for (const f of result.files) console.log(`  • ${f.path}  (${f.mechanism})`);
  if (conflicts.length > 0) {
    console.log("\nWarnings:");
    for (const c of conflicts) console.log(`  ⚠ [${c.code}] ${c.message}`);
  }
  if (result.limitations.length > 0) {
    console.log("\nLimitations:");
    for (const l of result.limitations) console.log(`  ⚠ ${l}`);
  }
  console.log(`\nVerify: proagent validate --profiles`);
}

/** `proagent equip <slug>…` */
export async function runEquip(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("equip", flags.json === true);
  return equipPipeline(requireSlugs(args, "Usage: proagent equip <slug> [slug…]"), flags, false);
}

/** `proagent compile <slug> --target <id>` */
export async function runCompile(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("compile", flags.json === true);
  if (typeof flags.target !== "string" || !flags.target) {
    fail("Usage: proagent compile <slug> --target <harness-id>");
  }
  return equipPipeline(requireSlugs(args, "Usage: proagent compile <slug> --target <harness-id>"), flags, true);
}

/** `proagent validate --profiles` — validate every discoverable profile. */
export async function runValidateProfiles(json: boolean): Promise<void> {
  warnIfStandalone("validate", json);
  const reports = await validateAllProfiles();
  const ok = reports.every((r) => r.ok);
  if (json) {
    return jsonOut({ status: ok ? "ok" : "failed", command: "validate", reports });
  }
  console.log("\nProfile validation:\n");
  for (const r of reports) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.profile}${r.findings.length > 0 ? `  (${r.findings.length} finding(s))` : ""}`);
    for (const f of r.findings) {
      console.log(`      [${f.code}] ${f.message}`);
      if (f.suggestion) console.log(`        → ${f.suggestion}`);
    }
  }
  console.log("");
  if (!ok) process.exitCode = 1;
}
