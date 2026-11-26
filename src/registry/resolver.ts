/**
 * Resolver — capability → implementation → ResolutionGraph.
 *
 * NEW_CHANGES.md: "Profiles, crews, workflows, and agents declare what they
 * need. ProAgents Registry resolves where those capabilities come from."
 *
 * Pure core: the resolver consumes *results* (the catalog and already-
 * fetched federated findings), never performs IO. Callers search allowed
 * sources (src/registry/sources.ts + source-adapters.ts), hand the findings
 * in, and get a deterministic graph: same inputs → byte-identical lock.
 *
 * Preference order (IMPLEMENTATION_PLAN §3): native catalog → federated
 * sources (policy.allowed) → explicit selection → ambiguous (PA503).
 */

import type { CapabilityDefinition, MarketplaceItem, RegistryFinding, ResolutionGraph, ResolvedImplementation, SpecEnvironment, SpecFinding, SpecDocument } from "./types.js";
import { resolveAlias } from "./capabilities.js";

/** A candidate implementation of one capability. */
export interface Candidate {
  source: string;
  artifact: string; // "kind:id"
  version: string;
  title?: string;
}

/** The resolver's full inputs — everything already materialized, no IO. */
export interface ResolveInput {
  /** Capability ids the environment requires (alias-resolved, deduped). */
  capabilities: string[];
  /** Native catalog entries (all kinds). Provenance source: "proagents". */
  catalog: MarketplaceItem[];
  /** Federated findings per source id (callers searched allowed sources). */
  findings?: RegistryFinding[];
  /** Taxonomy for alias resolution (optional; unknown ids pass through). */
  taxonomy?: CapabilityDefinition[];
  /** Explicit capability → artifact selections (from a picker). */
  selections?: Record<string, string>;
  /** Kind preference when ranking candidates (earlier kinds win ties). */
  kindPreference?: string[];
  /** Spec environment sections, for `kind:id` artifact-ref validation. */
  specEnvironment?: SpecEnvironment;
}

/**
 * Rank a candidate list deterministically: explicit selection first, native
 * catalog before federated sources, then kind preference, then id. The tie
 * order is total, so the same inputs always pick the same winner.
 */
function rankCandidates(candidates: Candidate[], selections: Record<string, string> | undefined, kindPreference: string[] | undefined): Candidate[] {
  const prefIndex = (artifact: string): number => {
    const kind = artifact.split(":")[0] ?? "";
    const i = kindPreference?.indexOf(kind);
    return i === undefined || i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...candidates].sort((a, b) => {
    const aSel = Object.values(selections ?? {}).includes(a.artifact) ? 0 : 1;
    const bSel = Object.values(selections ?? {}).includes(b.artifact) ? 0 : 1;
    if (aSel !== bSel) return aSel - bSel;
    if ((a.source === "proagents") !== (b.source === "proagents")) return a.source === "proagents" ? -1 : 1;
    const pk = prefIndex(a.artifact) - prefIndex(b.artifact);
    if (pk !== 0) return pk;
    if (a.artifact !== b.artifact) return a.artifact.localeCompare(b.artifact);
    return a.source.localeCompare(b.source);
  });
}

/** Collect candidates for one capability from catalog + findings. */
function candidatesFor(capability: string, input: ResolveInput): Candidate[] {
  const candidates: Candidate[] = [];
  for (const item of input.catalog) {
    if ((item.provides ?? []).includes(capability)) {
      candidates.push({ source: "proagents", artifact: `${item.kind}:${item.id}`, version: item.version, ...(item.name ? { title: item.name } : {}) });
    }
  }
  for (const f of input.findings ?? []) {
    if (f.name === capability || f.description.toLowerCase().includes(capability.toLowerCase())) {
      candidates.push({ source: f.source, artifact: `${f.kind}:${f.name}`, version: "0.0.0-unverified", ...(f.sourceLabel ? { title: f.sourceLabel } : {}) });
    }
  }
  return candidates;
}

/**
 * Resolve the spec's capability requirements into a ResolutionGraph.
 * Deterministic and pure: no fetch, no filesystem, no timestamps.
 */
export function resolveCapabilities(input: ResolveInput): ResolutionGraph {
  const taxonomy = input.taxonomy ?? [];
  const selections = input.selections ?? {};
  const kindPreference = input.kindPreference ?? ["profile", "skill", "mcp", "tool", "crew", "agent"];

  // Alias-normalize + dedupe the requirement set, in first-seen order.
  const required: string[] = [];
  for (const raw of input.capabilities) {
    const id = resolveAlias(raw, taxonomy);
    if (!required.includes(id)) required.push(id);
  }

  const resolved: Record<string, ResolvedImplementation> = {};
  const unresolved: ResolutionGraph["unresolved"] = [];
  const ambiguous: ResolutionGraph["ambiguous"] = [];

  for (const capability of required) {
    // An explicit selection always wins, whatever the candidate pool says.
    const selected = Object.entries(selections).find(([, artifact]) => artifact === capability || artifact.split(":").slice(1).join(":") === capability);
    const candidates = candidatesFor(capability, input);
    if (selected) {
      const [kind, ...rest] = selected[1].split(":");
      const id = rest.join(":");
      const fromCatalog = input.catalog.find((i) => i.kind === kind && i.id === id);
      resolved[capability] = {
        source: fromCatalog ? "proagents" : "selection",
        artifact: selected[1],
        version: fromCatalog?.version ?? "0.0.0-unverified",
        ...(fromCatalog?.name ? { title: fromCatalog.name } : {}),
      };
      continue;
    }
    const ranked = rankCandidates(candidates, selections, kindPreference);
    if (ranked.length === 0) {
      unresolved.push({ capability, reason: `no implementation on any allowed source provides "${capability}"` });
      continue;
    }
    const [top] = ranked;
    const tieGroup = ranked.filter((c) => c.source === top!.source);
    if (ranked.length > 1 && !selections[top!.artifact] && tieGroup.length === ranked.length && top!.source !== "proagents") {
      // Multiple federated candidates of equal rank and no explicit choice.
      ambiguous.push({ capability, candidates: ranked });
      continue;
    }
    resolved[capability] = {
      source: top!.source,
      artifact: top!.artifact,
      version: top!.version,
      ...(top!.title ? { title: top!.title } : {}),
    };
  }

  // Artifact references (kind:id) from the spec: check against the catalog.
  // `capabilities` is skipped — capabilities are abstract requirements the
  // resolver fulfills, not catalog artifacts. Plural env keys map to their
  // singular artifact kind (profiles→profile, crews→crew, mcp→mcp, …).
  const artifactRefs: ResolutionGraph["artifactRefs"] = [];
  for (const [kindPlural, ids] of Object.entries(input.specEnvironment ?? {})) {
    if (kindPlural === "capabilities") continue;
    const kind = kindPlural === "crews" ? "crew" : kindPlural === "mcp" ? "mcp" : kindPlural.replace(/s$/, "");
    for (const id of ids ?? []) {
      const hit = input.catalog.find((i) => i.kind === kind && i.id === id);
      artifactRefs.push(
        hit
          ? { ref: `${kind}:${id}`, ok: true }
          : { ref: `${kind}:${id}`, ok: false, reason: `not in the registry catalog (run \`proagent search ${id}\` or publish it)` },
      );
    }
  }

  // PA504 — cycles across requires.artifacts. Only catalog items participate
  // (federated findings have no declared requires yet).
  const cycles = findArtifactCycles(input.catalog);

  return { resolved, unresolved, ambiguous, artifactRefs, cycles };
}

/** Find cycles in the catalog's requires.artifacts graph (PA504). */
function findArtifactCycles(catalog: MarketplaceItem[]): string[][] {
  const requires = new Map<string, string[]>();
  for (const item of catalog) {
    const deps = (item.requires?.artifacts ?? []).filter((a) => a.includes(":"));
    if (deps.length > 0) requires.set(`${item.kind}:${item.id}`, deps);
  }
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const visit = (node: string, stack: string[]): void => {
    const s = state.get(node) ?? 0;
    if (s === 1) {
      const start = stack.indexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node].sort());
      return;
    }
    if (s === 2) return;
    state.set(node, 1);
    for (const dep of requires.get(node) ?? []) {
      if (requires.has(dep)) visit(dep, [...stack, node]);
    }
    state.set(node, 2);
  };
  for (const node of [...requires.keys()].sort()) visit(node, []);
  return cycles.sort((a, b) => a.join("|").localeCompare(b.join("|")));
}

// ---------------------------------------------------------------------------
// Spec-driven entry point (what `proagent resolve` calls)
// ---------------------------------------------------------------------------

/**
 * Resolve a full SpecDocument: capabilities from `environment.capabilities`
 * plus capabilities declared by referenced catalog artifacts. Returns the
 * graph plus PA502/PA503/PA504 findings for downstream reporting.
 */
export function resolveSpec(spec: SpecDocument, input: Omit<ResolveInput, "capabilities" | "specEnvironment">): { graph: ResolutionGraph; findings: SpecFinding[] } {
  const graph = resolveCapabilities({
    ...input,
    capabilities: spec.environment.capabilities ?? [],
    specEnvironment: spec.environment,
  });
  const findings: SpecFinding[] = [];
  for (const u of graph.unresolved) {
    findings.push({
      code: "PA502",
      severity: "error",
      message: `capability "${u.capability}" is unsatisfiable: ${u.reason}`,
      suggestion: "Enable more sources (registry/sources/*.yaml), pick an implementation, or remove the capability.",
      entities: [u.capability],
    });
  }
  for (const a of graph.ambiguous) {
    findings.push({
      code: "PA503",
      severity: "warning",
      message: `capability "${a.capability}" has ${a.candidates.length} candidates and no selection: ${a.candidates.map((c) => c.artifact).join(", ")}`,
      suggestion: "Pass --select capability=kind:id, or set the selection in the Studio builder.",
      entities: [a.capability],
    });
  }
  for (const cycle of graph.cycles) {
    findings.push({
      code: "PA504",
      severity: "error",
      message: `circular artifact dependency: ${cycle.join(" → ")}`,
      suggestion: "Break the cycle by removing a requires.artifacts edge or splitting the artifact.",
      entities: cycle,
    });
  }
  return { graph, findings };
}
