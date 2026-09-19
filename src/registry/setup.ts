/**
 * Setup — the end-to-end pipeline from proagents.yaml to an equipped repo.
 *
 * NEW_CHANGES.md §8: read spec → resolve → check compatibility → install
 * dependencies → configure harness → report. Chains the existing layers
 * (resolver → composition → adapters compile / crew install) — it never
 * re-implements them.
 *
 * Layer discipline: this module performs the IO the individual steps need
 * (catalog reads, source search, file writes through the same installers)
 * and returns a structured outcome; output rendering stays in the CLI.
 * Errors are findings, not exceptions, wherever the evidence is a PA5xx.
 */

import path from "node:path";
import type { SpecDocument, SpecFinding, ResolutionGraph } from "./types.js";
import { loadSpec, SPEC_FILE } from "./spec.js";
import { listItems, loadItem } from "./catalog.js";
import { loadSources, allowedSources } from "./sources.js";
import { searchSources, findingsOfSources } from "./source-adapters.js";
import { loadTaxonomy } from "./capabilities.js";
import { resolveSpec } from "./resolver.js";
import { resolveProfiles } from "../profiles/registry.js";
import { composeProfiles } from "../profiles/composition.js";
import type { EffectiveProfile, ProfileConflict } from "../profiles/types.js";
import { detectHarnesses, compileForHarness, HARNESS_SPECS } from "../adapters/index.js";
import type { HarnessId, HarnessSignal } from "../adapters/index.js";
import { installCrew } from "../crew/install.js";
import { loadCrewFile } from "../crew/hydrate.js";
import type { CrewDefinition } from "../crew/types.js";

export interface SetupOutcome {
  status: "ok" | "blocked";
  /** The validated spec (undefined when parsing failed). */
  spec?: SpecDocument;
  /** Every PA5xx finding from parse/validate/resolve. */
  findings: SpecFinding[];
  /** PA02x composition conflicts from composing the spec's profiles. */
  conflicts: ProfileConflict[];
  /** Harness the environment was compiled for (when installation ran). */
  harness?: HarnessId;
  /** Files written, as repo-relative paths with the producing mechanism. */
  files: Array<{ path: string; mechanism: string }>;
  /** Harness limitations surfaced by the compilers (markdown-is-not-enforcement). */
  limitations: string[];
  /** High-level steps executed, in order (reporting). */
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
}

export interface SetupOptions {
  root?: string;
  /** Explicit --harness override (defaults to the detected primary). */
  harness?: string;
  /** Show the plan without writing anything. */
  dryRun?: boolean;
}

/** Tolerant taxonomy load (missing file = empty). */
async function taxonomyFor(root: string): Promise<Awaited<ReturnType<typeof loadTaxonomy>>> {
  try {
    return await loadTaxonomy(root);
  } catch {
    return [];
  }
}

/** Resolve the target harness: explicit --harness first, detection second. */
async function harnessFor(root: string, explicit?: string): Promise<HarnessSignal> {
  const detected = await detectHarnesses(root);
  if (!explicit) return detected.primary;
  if (explicit === "generic-cli") {
    const evidence = detected.all.find((h) => h.id === "generic-cli")?.evidence ?? ["--harness override"];
    return {
      id: "generic-cli" as HarnessId,
      name: "Generic CLI",
      capabilities: { projectInstructions: true, skills: false, ruleEnforcement: "none" as const, mcp: false, shell: true, git: true },
      evidence,
    };
  }
  const spec = HARNESS_SPECS.find((s) => s.id === explicit);
  if (!spec) {
    throw new Error(`unknown --harness "${explicit}" (available: ${[...HARNESS_SPECS.map((s) => s.id), "generic-cli"].join(", ")})`);
  }
  const evidence = detected.all.find((h) => h.id === spec.id)?.evidence ?? ["--harness override"];
  return { id: spec.id, name: spec.name, capabilities: { ...spec.capabilities }, evidence };
}

/** Resolve a crew definition by id: local .proagent/crews, then the registry checkout. */
async function resolveCrewById(id: string, root: string): Promise<CrewDefinition | undefined> {
  for (const dir of [path.join(root, ".proagent", "crews", id), path.join(root, "registry", "crews", id)]) {
    try {
      return await loadCrewFile(path.join(dir, "crew.json"));
    } catch {
      // try the next location
    }
  }
  return undefined;
}

/**
 * The setup pipeline. Deterministic in ordering; IO is bounded to catalog
 * reads, allowed-source search (degrading), and the underlying installers.
 */
export async function runSetupPipeline(
  specFile: string = SPEC_FILE,
  opts: SetupOptions = {},
): Promise<SetupOutcome> {
  const root = opts.root ?? process.cwd();
  const steps: SetupOutcome["steps"] = [];
  const files: SetupOutcome["files"] = [];
  const limitations: string[] = [];
  const base: SetupOutcome = { status: "blocked", findings: [], conflicts: [], files, limitations, steps };

  // 1. Read the spec.
  const parsed = await loadSpec(root, specFile);
  if (!parsed.spec) {
    steps.push({ step: `read ${specFile}`, ok: false, detail: parsed.findings.map((f) => f.message).join("; ") });
    return { ...base, findings: parsed.findings, steps };
  }
  const spec = parsed.spec;
  steps.push({ step: `read ${specFile}`, ok: true, detail: `project "${spec.project.name}"` });

  // 2. Gather resolver inputs (catalog, taxonomy, allowed federated sources).
  const catalog = await listItems({ root });
  const taxonomy = await taxonomyFor(root);
  const sources = allowedSources(await loadSources(root));
  const query = (spec.environment.capabilities ?? []).join(" ") || spec.project.name;
  const sourceResults = await searchSources(sources, { query, limit: 8 });
  const degraded = sourceResults.filter((r) => r.error);
  steps.push({
    step: "search sources",
    ok: true,
    detail: `${sources.length} allowed source(s)${degraded.length > 0 ? `, ${degraded.length} degraded` : ""}`,
  });

  // 3. Resolve capability → implementation.
  const { graph, findings } = resolveSpec(spec, {
    catalog,
    findings: findingsOfSources(sourceResults),
    taxonomy,
  });
  const allFindings: SpecFinding[] = [...parsed.findings, ...findings];
  const errors = allFindings.filter((f) => f.severity === "error");
  steps.push({
    step: "resolve capabilities",
    ok: errors.length === 0,
    detail: `${Object.keys(graph.resolved).length} resolved, ${graph.unresolved.length} unsatisfiable, ${graph.ambiguous.length} ambiguous`,
  });
  if (errors.length > 0) return { ...base, spec, findings: allFindings, steps };

  // 4. Dry-run stops after resolution: the plan is the outcome.
  if (opts.dryRun) {
    steps.push({ step: "install (dry-run)", ok: true, detail: "no files written" });
    return { status: "ok", spec, findings: allFindings, conflicts: [], files, limitations, steps, harness: undefined };
  }

  // 5. Compile profiles for the target harness.
  const harness = await harnessFor(root, opts.harness);
  steps.push({ step: "select harness", ok: true, detail: harness.id });

  let outcomeConflicts: ProfileConflict[] = [];
  const profileIds = spec.environment.profiles ?? [];
  if (profileIds.length > 0) {
    const entries = await resolveProfiles(profileIds, root);
    const missing = profileIds.filter((id) => !entries.some((e) => e.manifest.profile.slug === id));
    if (missing.length > 0 || entries.length === 0) {
      const finding: SpecFinding = {
        code: "PA502",
        severity: "error",
        message: `profiles not resolvable: ${missing.join(", ") || "(none)"}`,
        suggestion: "Check the ids against `proagent list`, or publish them to the registry catalog.",
        entities: missing,
      };
      return { ...base, spec, findings: [...allFindings, finding], steps };
    }
    const manifests = entries.map((e) => e.manifest);
    const { effective, conflicts } = composeProfiles(manifests);
    const conflictErrors = conflicts.filter((c) => c.severity === "error");
    if (conflictErrors.length > 0) {
      return { ...base, spec, findings: allFindings, conflicts, steps };
    }
    const compiled = await compileForHarness(effective as EffectiveProfile, manifests[0]!, harness, root);
    files.push(...compiled.files);
    limitations.push(...compiled.limitations);
    steps.push({ step: "compile profiles", ok: true, detail: `${effective.slugs.join(" + ")} → ${compiled.files.length} file(s)` });
    outcomeConflicts = conflicts;
  }

  // 6. Install crews (members bound to profiles resolve through the same registry).
  const crewIds = spec.environment.crews ?? [];
  const profileResolver = async (slug: string) => {
    const entries = await resolveProfiles([slug], root);
    return entries[0]?.manifest ?? null;
  };
  for (const id of crewIds) {
    const crew = await resolveCrewById(id, root);
    if (!crew) {
      return {
        ...base,
        spec,
        findings: [
          ...allFindings,
          { code: "PA502", severity: "error", message: `crew "${id}" not found in .proagent/crews or registry/crews`, suggestion: "Install it first: `proagent install crew:" + id + "`, or fix the spec.", entities: [id] },
        ],
        steps,
      };
    }
    const result = await installCrew(crew, root, profileResolver);
    files.push(...result.filesWritten.map((p) => ({ path: p, mechanism: "crew-install" })));
    steps.push({ step: `install crew ${id}`, ok: true, detail: `${result.filesWritten.length} file(s), .mcp.json merged` });
  }

  return { status: "ok", spec, findings: allFindings, conflicts: outcomeConflicts, harness: harness.id, files, limitations, steps };
}

/** Exposed for CLI reporting: the resolution graph shape (re-resolved cheaply). */
export type { ResolutionGraph };
