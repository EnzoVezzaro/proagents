/**
 * Registry CLI — `proagent search|info|install|remove|update|list|resolve|lock|
 * compose|setup|validate --spec` per IMPLEMENTATION_PLAN §5 and NEW_CHANGES.md.
 *
 * Thin consumer of the registry layer (src/registry/*): the CLI resolves
 * flags, gathers catalog/findings/taxonomy once, and delegates. All --json
 * outputs are additive to the machine contract (docs/cli/json.md).
 *
 * IO boundary: the resolver/lock stay pure — this module performs the fetches
 * (allowed sources via searchSources) and checksum computation, then hands
 * results in. Federation failures degrade to surfaced notes, never crashes.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  ALL_KINDS,
  getItem,
  hasLoader,
  listItems,
  loadItem,
} from "../registry/catalog.js";
import type { ArtifactKind, MarketplaceItem, SpecFinding } from "../registry/types.js";
import { loadSources, allowedSources } from "../registry/sources.js";
import { searchSources, findingsOfSources } from "../registry/source-adapters.js";
import { loadTaxonomy } from "../registry/capabilities.js";
import { parseSpec, serializeSpec, specHash, SPEC_FILE, loadSpec } from "../registry/spec.js";
import { buildLock, saveLock, serializeLock, LOCK_FILE, loadLockRaw, verifyLock } from "../registry/lock.js";
import { resolveSpec, type ResolveInput } from "../registry/resolver.js";
import { validateRegistry } from "../registry/validate.js";
import type { SpecDocument, RegistryFinding, ResolutionGraph } from "../registry/types.js";
import type { ProfileManifest } from "../profiles/types.js";
import { jsonOut } from "./json.js";
import { warnIfStandalone } from "./interactive.js";
import { getEnvConfig } from "../env.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Parse "kind:id" (or bare id → kind "profile") into its parts. */
function parseRef(ref: string): { kind: ArtifactKind; id: string } {
  const [kindRaw, ...rest] = ref.split(":");
  const id = rest.join(":");
  const kind = (id ? kindRaw : "profile") as ArtifactKind;
  if (!id) fail(`artifact reference "${ref}" must be <kind>:<id> (e.g. profile:frontend-developer) or a profile id`);
  if (!ALL_KINDS.includes(kind)) {
    fail(`unknown artifact kind "${kind}" (known: ${ALL_KINDS.join(", ")})`);
  }
  return { kind, id };
}

/** Shared remote-catalog option resolution (--repo/--ref/--token + env). */
function remoteOpts(flags: Record<string, string | boolean>): { repo?: string; ref?: string; token?: string } {
  const env = getEnvConfig();
  return {
    ...(typeof flags.repo === "string" && flags.repo ? { repo: flags.repo } : {}),
    ...(typeof flags.ref === "string" && flags.ref ? { ref: flags.ref } : {}),
    ...(typeof flags.token === "string" && flags.token ? { token: flags.token } : env.githubToken ? { token: env.githubToken } : {}),
  };
}

/** Load the taxonomy (native-only; missing file = empty taxonomy, tolerated). */
async function taxonomyFor(root: string = process.cwd()) {
  try {
    return await loadTaxonomy(root);
  } catch {
    return [];
  }
}

/** Gather the resolver inputs: catalog + allowed-source findings + taxonomy. */
async function gatherResolverInputs(
  flags: Record<string, string | boolean>,
  query: string,
  kind?: ArtifactKind,
): Promise<Omit<ResolveInput, "capabilities" | "specEnvironment"> & { sourceResults: Awaited<ReturnType<typeof searchSources>> }> {
  const catalog = await listItems(remoteOpts(flags));
  const sources = allowedSources(await loadSources());
  const queryText = query.trim().length > 0 ? query : [...new Set(catalog.flatMap((i) => i.provides ?? []))].join(" ");
  const sourceResults = await searchSources(sources, { query: queryText, kind, limit: 8 });
  return {
    catalog,
    findings: findingsOfSources(sourceResults),
    taxonomy: await taxonomyFor(),
    sourceResults,
  };
}

/** Print findings in the shared human format (list/info share it). */
function printFindings(findings: SpecFinding[]): void {
  for (const f of findings) {
    console.log(`  ${f.severity === "error" ? "✗" : "⚠"} [${f.code}] ${f.message}`);
    if (f.suggestion) console.log(`    → ${f.suggestion}`);
  }
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export async function runRegistrySearch(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("search", flags.json === true);
  const query = args.join(" ").trim();
  if (!query) fail('Usage: proagent search "<query>" [--type <kind>]');
  const kind = typeof flags.type === "string" && flags.type ? (flags.type as ArtifactKind) : undefined;
  if (kind && !ALL_KINDS.includes(kind)) fail(`unknown --type "${kind}" (known: ${ALL_KINDS.join(", ")})`);

  const inputs = await gatherResolverInputs(flags, query, kind);
  const all: Array<RegistryFinding & { native?: boolean }> = [
    ...inputs.catalog
      .filter((i) => (kind ? i.kind === kind : true))
      .map((i) => matchItem(i, query))
      .filter((m): m is { item: MarketplaceItem; score: number } => m !== null)
      .map(({ item, score }) => ({
        kind: item.kind,
        name: item.name,
        description: item.description,
        source: "proagents",
        sourceLabel: "registry",
        reference: `proagents:${item.kind}:${item.id}`,
        score,
        native: true,
      })),
    ...inputs.sourceResults.flatMap((r) => (r.error ? [] : r.results)),
  ];
  all.sort((a, b) => (b.native ? 1 : 0) - (a.native ? 1 : 0) || b.score - a.score || a.name.localeCompare(b.name));
  const limit = typeof flags.limit === "string" ? Number(flags.limit) || 20 : 20;
  const top = all.slice(0, limit);

  const degraded = inputs.sourceResults.filter((r) => r.error);
  if (flags.json === true) {
    return jsonOut({
      status: "ok",
      command: "search",
      query,
      ...(kind ? { kind } : {}),
      findings: top,
      sources: inputs.sourceResults.map((r) => ({ source: r.source, count: r.results.length, ...(r.error ? { error: r.error } : {}) })),
    });
  }
  console.log(`\nSearch "${query}"${kind ? ` (kind: ${kind})` : ""} — ${top.length} result(s):\n`);
  for (const f of top) {
    console.log(`  ${f.native ? "◆" : "○"} [${f.kind}] ${f.name}  (${f.sourceLabel})`);
    if (f.description) console.log(`      ${f.description.slice(0, 90)}`);
  }
  for (const d of degraded) console.log(`\n⚠ ${d.source}: ${d.error}`);
  console.log(`\nInspect with: proagent info <kind:id>`);
}

/** Substring match over id/name/description/tags/provides — pure. Dashes,
 *  underscores and spaces are normalized so "browser automation" matches
 *  "browser-automation". */
function matchItem(item: MarketplaceItem, query: string): { item: MarketplaceItem; score: number } | null {
  const norm = (s: string): string => s.toLowerCase().replace(/[-_]+/g, " ");
  const q = norm(query);
  const hay = norm([item.id, item.name, item.description, ...(item.tags ?? []), ...(item.provides ?? [])].join(" "));
  if (!hay.includes(q)) return null;
  return { item, score: (norm(item.id) === q ? 100 : 0) + (norm(item.name).includes(q) ? 40 : 0) };
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

export async function runRegistryInfo(ref: string | undefined, flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("info", flags.json === true);
  if (!ref) fail("Usage: proagent info <kind:id>");
  const { kind, id } = parseRef(ref);
  const artifact = await loadItem(kind, id, remoteOpts(flags));
  if (!artifact) fail(`not in the registry catalog: ${kind}:${id}`);
  const { item, content } = artifact;

  if (flags.json === true) {
    return jsonOut({
      status: "ok",
      command: "info",
      item,
      ...(content ? { content } : {}),
      loader: hasLoader(kind),
    });
  }
  console.log(`\n${item.name} (${kind}:${item.id} v${item.version})`);
  console.log(`  ${item.description}`);
  if ((item.provides ?? []).length > 0) console.log(`\n  provides:  ${(item.provides ?? []).join(", ")}`);
  if (item.requires?.capabilities?.length) console.log(`  requires:  ${item.requires.capabilities.join(", ")}`);
  if (item.requires?.artifacts?.length) console.log(`  artifacts: ${item.requires.artifacts.join(", ")}`);
  if (item.compatibility?.length) console.log(`  harnesses: ${item.compatibility.join(", ")}`);
  if (!hasLoader(kind)) console.log(`\n  ⚠ no loader for kind "${kind}" yet — catalog metadata only`);
  if (content) {
    console.log(`\n  Content loaded (${kind}).`);
  }
  console.log(`\nInstall with: proagent install ${kind}:${id}`);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export async function runRegistryList(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("registry list", flags.json === true);
  const kindArg = typeof flags.kind === "string" && flags.kind ? (flags.kind as ArtifactKind) : undefined;
  if (kindArg && !ALL_KINDS.includes(kindArg)) fail(`unknown --kind "${kindArg}" (known: ${ALL_KINDS.join(", ")})`);
  const items = await listItems({ ...remoteOpts(flags), ...(kindArg ? { kind: kindArg } : {}) });

  if (flags.json === true) {
    return jsonOut({ status: "ok", command: "list", kind: kindArg ?? "all", items });
  }
  console.log(`\nRegistry items${kindArg ? ` (${kindArg})` : ""}: ${items.length}\n`);
  const byKind = new Map<string, MarketplaceItem[]>();
  for (const i of items) {
    const list = byKind.get(i.kind) ?? [];
    list.push(i);
    byKind.set(i.kind, list);
  }
  for (const [kind, list] of [...byKind.entries()].sort()) {
    console.log(`  ${kind} (${list.length})`);
    for (const i of list) console.log(`    • ${i.id.padEnd(26)} v${i.version.padEnd(8)} ${i.description.slice(0, 58)}`);
  }
  console.log(`\nInspect with: proagent info <kind:id>`);
}

// ---------------------------------------------------------------------------
// install / remove / update
// ---------------------------------------------------------------------------

/** `proagent install <kind:id>` — resolve the item, then delegate to equip/install. */
export async function runRegistryInstall(ref: string | undefined, flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("install", flags.json === true);
  if (!ref) fail("Usage: proagent install <kind:id> [--target <harness>] [--dry-run]");
  const { kind, id } = parseRef(ref);
  const item = await getItem(kind, id, remoteOpts(flags));
  if (!item) fail(`not in the registry catalog: ${kind}:${id}`);

  if (!hasLoader(kind)) {
    fail(`kind "${kind}" has no installer yet — catalog metadata only (loaders land with content)`);
  }
  if (kind === "profile") {
    const { runProfileInstall } = await import("./profiles.js");
    return runProfileInstall([id], flags);
  }
  if (kind === "crew" || kind === "agent") {
    const { runCrewCommand } = await import("./crew.js");
    return runCrewCommand(["install", id], flags, new Map());
  }
  fail(`kind "${kind}" has no installer yet — catalog metadata only (loaders land with content)`);
}

/** `proagent remove <kind:id>` — uninstall from this repo (equip/crew uninstall). */
export async function runRegistryRemove(ref: string | undefined, flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("remove", flags.json === true);
  if (!ref) fail("Usage: proagent remove <kind:id>");
  const { kind, id } = parseRef(ref);
  const root = process.cwd();
  if (kind !== "profile") fail(`remove currently supports profile artifacts only (got ${kind})`);

  // Mirror the equip output layout; delete only this profile's skill dir.
  const skillDir = path.join(root, ".agents", "skills", id);
  const removed: string[] = [];
  if (await fs.access(skillDir).then(
    () => true,
    () => false,
  )) {
    await fs.rm(skillDir, { recursive: true, force: true });
    removed.push(path.relative(root, skillDir));
  }
  if (removed.length === 0) {
    if (flags.json === true) return jsonOut({ status: "ok", command: "remove", ref, removed: [], note: "no installed artifacts found for this id" });
    console.log(`Nothing installed for ${kind}:${id}.`);
    return;
  }
  if (flags.json === true) return jsonOut({ status: "ok", command: "remove", ref, removed });
  console.log(`✓ Removed ${kind}:${id}:`);
  for (const r of removed) console.log(`  - ${r}`);
}

/** `proagent update` — re-resolve the lockfile implementations. */
export async function runRegistryUpdate(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("update", flags.json === true);
  const { spec } = await loadSpecOrFail(flags);
  const root = process.cwd();
  const lockRaw = await loadLockRaw(root);
  if (!lockRaw) fail(`no ${LOCK_FILE} — run \`proagent resolve\` and \`proagent lock\` first`);
  const parsedLock = parseSpec(serializeSpec(spec)); // re-serialize for stable hash base
  const { findings } = await verifyLock(lockRaw, parsedLock.spec!, {});
  const stale = findings.filter((f) => f.code === "PA510" || f.code === "PA511").length > 0;
  if (!stale) {
    if (flags.json === true) return jsonOut({ status: "ok", command: "update", upToDate: true, specHash: specHash(spec) });
    console.log(`✓ ${LOCK_FILE} is up to date.`);
    return;
  }
  if (flags.json === true) return jsonOut({ status: "ok", command: "update", upToDate: false, message: "lock is stale — re-resolving" });
  console.log("Lock is stale — re-resolving…");
  return runRegistryResolve(flags, { write: true });
}

// ---------------------------------------------------------------------------
// resolve / lock
// ---------------------------------------------------------------------------

/** Load proagents.yaml or fail with the parse findings. */
async function loadSpecOrFail(flags: Record<string, string | boolean>): Promise<{ spec: SpecDocument; raw: string }> {
  const file = typeof flags.file === "string" && flags.file ? flags.file : SPEC_FILE;
  const root = process.cwd();
  const raw = await fs.readFile(path.resolve(root, file), "utf8").catch(() => fail(`no ${file} here — run \`proagent build --kind spec\` or create it first`));
  const parsed = parseSpec(raw);
  if (!parsed.spec) {
    for (const f of parsed.findings) console.error(`  ✗ [${f.code}] ${f.message}`);
    fail(`${file} is invalid — fix the findings above`);
  }
  return { spec: parsed.spec, raw };
}

/** Compute checksums for resolved catalog artifacts (sha256 of canonical bytes). */
async function checksumsFor(resolved: ResolutionGraph["resolved"], catalog: MarketplaceItem[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of Object.values(resolved)) {
    const [kindRaw, ...rest] = r.artifact.split(":");
    const id = rest.join(":");
    const item = catalog.find((i) => i.kind === kindRaw && i.id === id);
    if (!item) continue;
    // Canonical bytes = the item's stable serialization (deterministic core).
    out[r.artifact] = `sha256:${(await import("node:crypto")).createHash("sha256").update(JSON.stringify(item), "utf8").digest("hex")}`;
  }
  return out;
}

/**
 * `proagent resolve` — capability → implementation graph for proagents.yaml.
 * Pure at the core: searches allowed sources (IO), then delegates to the
 * deterministic resolver. `--select capability=kind:id` overrides ranking.
 */
export async function runRegistryResolve(
  flags: Record<string, string | boolean>,
  opts: { write?: boolean } = {},
): Promise<void> {
  warnIfStandalone("resolve", flags.json === true);
  const { spec } = await loadSpecOrFail(flags);
  const inputs = await gatherResolverInputs(flags, (spec.environment.capabilities ?? []).join(" "));

  const selections: Record<string, string> = {};
  if (typeof flags.select === "string" && flags.select) {
    for (const pair of flags.select.split(",")) {
      const [capability, artifact] = pair.split("=");
      if (!capability || !artifact) fail(`--select entries must be capability=kind:id (got "${pair}")`);
      selections[capability.trim()] = artifact.trim();
    }
  }
  const { graph, findings } = resolveSpec(spec, { ...inputs, selections });
  const json = flags.json === true;

  if (opts.write || flags.write === true) {
    // The resolver's job ends at the graph; the lock is a separate command.
    // `resolve --write` persists nothing — it only validates resolvability.
    if (json) return jsonOut({ status: findings.some((f) => f.severity === "error") ? "blocked" : "ok", command: "resolve", graph, findings, note: "resolve does not write; use `proagent lock`" });
    console.log("resolve does not write files — use `proagent lock` to persist the resolution.");
    if (findings.some((f) => f.severity === "error")) process.exitCode = 1;
    return;
  }

  if (json) {
    return jsonOut({ status: findings.some((f) => f.severity === "error") ? "blocked" : "ok", command: "resolve", graph, findings });
  }
  console.log(`\nResolution for ${spec.project.name}:\n`);
  for (const [capability, r] of Object.entries(graph.resolved)) {
    console.log(`  ✓ ${capability.padEnd(24)} → ${r.artifact} (${r.source}${r.version ? ` v${r.version}` : ""})`);
  }
  for (const a of graph.ambiguous) {
    console.log(`  ? ${a.capability.padEnd(24)} → ambiguous: ${a.candidates.map((c) => c.artifact).join(", ")}`);
  }
  for (const u of graph.unresolved) {
    console.log(`  ✗ ${u.capability.padEnd(24)} → ${u.reason}`);
  }
  for (const ref of graph.artifactRefs) {
    if (!ref.ok) console.log(`  ✗ ${ref.ref} → ${ref.reason}`);
  }
  if (findings.length > 0) {
    console.log("");
    printFindings(findings);
  }
  if (findings.some((f) => f.severity === "error")) process.exitCode = 1;
}

/** `proagent lock` — persist the resolution as proagents.lock. */
export async function runRegistryLock(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("lock", flags.json === true);
  const { spec } = await loadSpecOrFail(flags);
  const inputs = await gatherResolverInputs(flags, (spec.environment.capabilities ?? []).join(" "));

  const selections: Record<string, string> = {};
  if (typeof flags.select === "string" && flags.select) {
    for (const pair of flags.select.split(",")) {
      const [capability, artifact] = pair.split("=");
      if (!capability || !artifact) fail(`--select entries must be capability=kind:id (got "${pair}")`);
      selections[capability.trim()] = artifact.trim();
    }
  }
  const { graph, findings } = resolveSpec(spec, { ...inputs, selections });
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    // Non-zero exit in BOTH modes — the JSON contract is CI-friendly.
    process.exitCode = 1;
    if (flags.json === true) return jsonOut({ status: "blocked", command: "lock", findings });
    console.error("Refusing to lock — resolution errors:");
    printFindings(errors);
    return;
  }
  if (graph.ambiguous.length > 0) {
    process.exitCode = 1;
    if (flags.json === true) return jsonOut({ status: "ambiguous", command: "lock", graph, findings });
    console.error("Refusing to lock — ambiguous capabilities (pass --select):");
    for (const a of graph.ambiguous) console.error(`  ? ${a.capability}: ${a.candidates.map((c) => c.artifact).join(", ")}`);
    return;
  }
  const checksums = await checksumsFor(graph.resolved, inputs.catalog);
  const lock = buildLock(spec, graph.resolved, checksums);
  const written = await saveLock(lock);
  if (flags.json === true) return jsonOut({ status: "ok", command: "lock", file: written, lock });
  console.log(`✓ ${path.relative(process.cwd(), written) || LOCK_FILE}`);
  for (const [capability, r] of Object.entries(lock.resolved)) {
    console.log(`  ✓ ${capability.padEnd(24)} → ${r.artifact} (${r.source}${r.checksum && r.checksum !== "unverified" ? ", checksummed" : ""})`);
  }
}

// ---------------------------------------------------------------------------
// compose
// ---------------------------------------------------------------------------

/** `proagent compose <kind:id>…` — validate a cross-kind composition. */
export async function runRegistryCompose(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("compose", flags.json === true);
  if (args.length === 0) fail("Usage: proagent compose profile:frontend-developer skill:security-audit …");
  const refs = args.map(parseRef);
  const items: MarketplaceItem[] = [];
  const profileIds: string[] = [];
  for (const { kind, id } of refs) {
    const item = await getItem(kind, id, remoteOpts(flags));
    if (item) {
      items.push(item);
    } else if (kind === "profile") {
      // Catalog-missing profiles may still be locally equippable
      // (.proagent/profiles, packaged) — resolveProfiles decides below.
      profileIds.push(id);
    } else {
      fail(`not in the registry catalog: ${kind}:${id}`);
    }
  }

  // Profile slices go through the real composition engine (PA02x conflicts);
  // non-profile kinds are checked for duplicate ids and cross-refs here.
  const profileManifests: ProfileManifest[] = [];
  const catalogProfiles = items.filter((i) => i.kind === "profile");
  const allProfileIds = [...catalogProfiles.map((i) => i.id), ...profileIds];
  if (allProfileIds.length > 0) {
    const { resolveProfiles } = await import("../profiles/registry.js");
    const entries = await resolveProfiles(allProfileIds);
    for (const id of allProfileIds) {
      const entry = entries.find((e) => e.manifest.profile.slug === id);
      if (!entry) fail(`profile not resolvable: ${id} (not in the catalog, .proagent/profiles or the packaged registry)`);
      profileManifests.push(entry.manifest);
    }
  }
  const conflicts: Array<{ code: string; severity: string; message: string }> = [];
  if (profileManifests.length > 0) {
    const { composeProfiles } = await import("../profiles/composition.js");
    conflicts.push(...composeProfiles(profileManifests).conflicts);
  }
  const ids = refs.map((r) => `${r.kind}:${r.id}`);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length > 0) conflicts.push({ code: "PA026", severity: "warning", message: `duplicate artifact refs: ${dupes.join(", ")}` });

  const errors = conflicts.filter((c) => c.severity === "error");
  // Non-zero exit in BOTH modes (CI-friendly JSON contract).
  if (errors.length > 0) process.exitCode = 1;
  if (flags.json === true) {
    return jsonOut({ status: errors.length === 0 ? "ok" : "blocked", command: "compose", refs: ids, conflicts, items });
  }
  console.log(`\nComposition of ${ids.join(" + ")}:`);
  if (conflicts.length === 0) {
    console.log("  ✓ no conflicts");
  } else {
    printFindings(
      conflicts.map((c) => ({ code: c.code, severity: c.severity as "error" | "warning", message: c.message }) as SpecFinding),
    );
  }
  if (errors.length > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

/** `proagent setup [--harness X]` — the end-to-end spec → equipped-repo pipeline. */
export async function runRegistrySetup(_args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("setup", flags.json === true);
  const { runSetupPipeline } = await import("../registry/setup.js");
  const dryRun = flags["dry-run"] === true;
  const harness = typeof flags.harness === "string" && flags.harness ? flags.harness : undefined;
  let outcome: Awaited<ReturnType<typeof runSetupPipeline>>;
  try {
    outcome = await runSetupPipeline(typeof flags.file === "string" ? flags.file : undefined, {
      ...(harness ? { harness } : {}),
      ...(dryRun ? { dryRun: true } : {}),
    });
  } catch (err) {
    fail((err as Error).message);
  }

  if (flags.json === true) {
    return jsonOut({ command: "setup", ...outcome });
  }
  for (const s of outcome.steps) {
    console.log(`  ${s.ok ? "✓" : "✗"} ${s.step}${s.detail ? ` — ${s.detail}` : ""}`);
  }
  if (outcome.findings.length > 0) {
    console.log("");
    printFindings(outcome.findings);
  }
  if (outcome.files.length > 0) {
    console.log(`\n✓ Environment ready${outcome.harness ? ` (${outcome.harness})` : ""}:`);
    const seen = new Set<string>();
    for (const f of outcome.files) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      console.log(`  • ${f.path}  (${f.mechanism})`);
    }
  }
  if (outcome.limitations.length > 0) {
    console.log("\nLimitations:");
    for (const l of outcome.limitations) console.log(`  ⚠ ${l}`);
  }
  if (outcome.status !== "ok") process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// validate --spec
// ---------------------------------------------------------------------------

/** `proagent validate --spec` — end-to-end PA5xx validation of spec + lock. */
export async function runRegistryValidateSpec(flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("validate --spec", flags.json === true);
  const file = typeof flags.file === "string" && flags.file ? flags.file : SPEC_FILE;
  const root = process.cwd();
  const specRaw = await fs.readFile(path.resolve(root, file), "utf8").catch(() => fail(`no ${file} here — nothing to validate`));
  const lockRaw = await loadLockRaw(root);
  const inputs = await gatherResolverInputs(flags, "");
  const result = await validateRegistry({
    specRaw,
    ...(lockRaw !== undefined ? { lockRaw } : {}),
    catalog: inputs.catalog,
    findings: inputs.findings,
    taxonomy: inputs.taxonomy,
  });
  const json = flags.json === true;
  if (json) return jsonOut({ status: result.ok ? "ok" : "invalid", command: "validate", spec: result.spec, findings: result.findings });
  console.log(`\nSpec validation (${file}${lockRaw ? ` + ${LOCK_FILE}` : ""}): ${result.ok ? "✓ ok" : "✗ invalid"}\n`);
  if (result.findings.length === 0) console.log("  no findings");
  else printFindings(result.findings);
  if (!result.ok) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// build --kind spec (session → proagents.yaml)
// ---------------------------------------------------------------------------

/**
 * `proagent build --kind spec` — emit a proagents.yaml draft from the
 * interview session: the intent names the project; staged discovery findings
 * and answered facts map to environment sections. Deterministic mapping from
 * session state; the draft is a starting point the user edits.
 */
export async function buildKindSpec(flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  const { SessionStore } = await import("../core/session.js");
  const state = await new SessionStore().load();
  if (!state) fail("No active session. Run `proagent init` first.");

  const slug =
    (typeof flags.slug === "string" && flags.slug) ||
    state.intent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") ||
    "my-project";

  const tooling = state.tooling?.findings ?? [];
  const environment: SpecDocument["environment"] = {};
  if (tooling.some((t) => t.kind === "mcp")) environment.mcp = [...new Set(tooling.filter((t) => t.kind === "mcp").map((t) => t.name.toLowerCase()))];
  if (tooling.some((t) => t.kind === "skill")) environment.skills = [...new Set(tooling.filter((t) => t.kind === "skill").map((t) => t.name.toLowerCase()))];
  if (tooling.some((t) => t.kind === "npm" || t.kind === "github")) environment.tools = [...new Set(tooling.filter((t) => t.kind === "npm" || t.kind === "github").map((t) => t.name.toLowerCase()))];
  const spec: SpecDocument = {
    schema: "proagents/v1",
    project: { name: slug },
    environment,
  };
  const raw = serializeSpec(spec);
  const file = path.resolve(process.cwd(), typeof flags.output === "string" && flags.output ? flags.output : SPEC_FILE);
  await fs.writeFile(file, raw, "utf8");

  if (json) return jsonOut({ status: "ok", kind: "spec", file, spec });
  console.log(`✓ Spec draft written to ${file}`);
  console.log("  Edit it to add capabilities, policies and harness targets, then:");
  console.log("    proagent resolve   # capability → implementation graph");
  console.log("    proagent lock      # persist the resolution");
  console.log("    proagent setup     # install the environment for your harness");
}
