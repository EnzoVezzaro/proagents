/**
 * Registry layer — the unified artifact model.
 *
 * NEW_CHANGES.md: "everything is an artifact with a common manifest,
 * versioning, dependencies, compatibility, provenance and metadata."
 * This module holds the shared types for that model:
 *
 *   - ArtifactKind / MarketplaceItem  — re-exported from the crew domain
 *     (the catalog file format lives there; this layer consumes it).
 *   - SourceManifest                  — a federated source declaration
 *     (registry/sources/*.yaml, schema proagents/registry-source/v1).
 *   - RegistryFinding / SourceResult  — normalized search results with
 *     provenance, one per source, mirroring the discovery contract.
 *
 * This layer is deterministic: search functions take an injected fetch, and
 * normalization is a pure mapping. No model calls, no randomness.
 */

// ---------------------------------------------------------------------------
// Artifact model — re-exported from the catalog owner (crew domain)
// ---------------------------------------------------------------------------

export type {
  ArtifactKind,
  ArtifactRequires,
  MarketplaceCatalog,
  MarketplaceItem,
} from "../crew/types.js";

import type { ArtifactKind } from "../crew/types.js";

// ---------------------------------------------------------------------------
// Capability taxonomy (registry/capabilities/index.json)
// ---------------------------------------------------------------------------

/**
 * One capability in the taxonomy: an abstract ability implementations can
 * provide. Aliases let manifests use familiar synonyms; implHints steer
 * federated search when resolving implementations.
 */
export interface CapabilityDefinition {
  /** Canonical id, e.g. "browser-automation" (lowercase kebab-case). */
  id: string;
  /** Human-facing title, e.g. "Browser Automation". */
  title?: string;
  /** What the capability means (shown in pickers and validation output). */
  description?: string;
  /** Alternative ids accepted in specs/manifests, resolved at load. */
  aliases?: string[];
  /** Search hints for finding implementations on federated sources. */
  implHints?: string[];
}

// ---------------------------------------------------------------------------
// Project spec (proagents.yaml) + lock (proagents.lock)
// ---------------------------------------------------------------------------

/** Schema literal of proagents.yaml. */
export const SPEC_SCHEMA = "proagents/v1";
/** Schema literal of proagents.lock. */
export const LOCK_SCHEMA = "proagents/lock/v1";

/** Environment sections of the spec — artifact ids per kind. */
export interface SpecEnvironment {
  profiles?: string[];
  crews?: string[];
  agents?: string[];
  workflows?: string[];
  /** Capability ids the environment must implement. */
  capabilities?: string[];
  skills?: string[];
  tools?: string[];
  mcp?: string[];
}

/** The human-authored portable environment spec — the source of truth. */
export interface SpecDocument {
  schema: "proagents/v1";
  project: { name: string };
  environment: SpecEnvironment;
  /** Policies compiled into harness enforcement where supported (PA506 checks). */
  policies?: {
    filesystem?: { "workspace-only"?: boolean };
    network?: { allowed?: string[] };
  };
  /** Target harnesses. `mode: compatible` = not pinned; adapters decide. */
  harness?: {
    mode?: "compatible";
    compatibility?: string[];
  };
}

/** One resolved implementation of a capability (lock entry). */
export interface ResolvedImplementation {
  /** Source id: "proagents" for the native catalog, else a federated source. */
  source: string;
  /** The implementing artifact as `kind:id`. */
  artifact: string;
  /** The artifact's version. */
  version: string;
  /** "sha256:…" of canonical manifest bytes, or "unverified" when offline. */
  checksum?: string;
  /** Display title from the catalog/finding (informational). */
  title?: string;
}

/** The resolver output: pure function of (requires, catalog, source results). */
export interface ResolutionGraph {
  /** Capability id → chosen implementation (selections/preference applied). */
  resolved: Record<string, ResolvedImplementation>;
  /** Capabilities no allowed source can implement. */
  unresolved: Array<{ capability: string; reason: string }>;
  /** Capabilities with several candidates and no selection (PA503 when non-interactive). */
  ambiguous: Array<{
    capability: string;
    candidates: Array<{ source: string; artifact: string; version: string; title?: string }>;
  }>;
  /** `kind:id` artifact references from the spec/manifests, checked against the catalog. */
  artifactRefs: Array<{ ref: string; ok: boolean; reason?: string }>;
  /** Artifact-ref cycles detected while expanding requires (PA504). */
  cycles: string[][];
}

/** The machine-resolved lock — reproducibility, no timestamps. */
export interface LockFile {
  schema: "proagents/lock/v1";
  /** Hash of the canonical spec serialization this lock was resolved from. */
  specHash: string;
  /** Capability id → resolved implementation. */
  resolved: Record<string, ResolvedImplementation>;
}

// ---------------------------------------------------------------------------
// Validation findings (PA5xx series — spec/registry layer)
// ---------------------------------------------------------------------------

/** Finding codes for the spec/resolution/lock pipeline (see docs/cli/json.md). */
export type SpecFindingCode =
  | "PA500" // unknown artifact kind in spec
  | "PA501" // invalid proagents.yaml schema
  | "PA502" // unsatisfiable capability (no implementation on any allowed source)
  | "PA503" // ambiguous capability, non-interactive, no selection
  | "PA504" // capability/artifact circular dependency
  | "PA505" // harness incompatibility (artifact vs harness.compatibility)
  | "PA506" // policy violation (e.g. MCP URL outside network allowlist)
  | "PA510" // lock stale (specHash mismatch)
  | "PA511" // lock checksum mismatch
  | "PA512"; // invalid lock schema

/** A validation finding from the registry layer. Same discipline as PA0xx. */
export interface SpecFinding {
  code: SpecFindingCode;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  entities?: string[];
}

// ---------------------------------------------------------------------------
// Source declarations (registry/sources/*.yaml)
// ---------------------------------------------------------------------------

/** Which registry operations a source supports (NEW_CHANGES.md sources/*.yaml). */
export interface SourceCapabilities {
  search: boolean;
  metadata: boolean;
  resolve: boolean;
  install: boolean;
}

/**
 * A federated source declaration — `registry/sources/<id>.yaml` with schema
 * `proagents/registry-source/v1`. Sources are DATA, not code: adapters are
 * selected by `adapter` id, and an unknown adapter is skipped with a surfaced
 * note, never a crash.
 */
export interface SourceManifest {
  /** Literal "proagents/registry-source/v1" — validated on load. */
  schema: "proagents/registry-source/v1";
  /** Stable source id, e.g. "skillsmp" — referenced by artifact provenance. */
  id: string;
  /** Human-facing name, e.g. "SkillsMP". */
  name: string;
  /** Source class: "marketplace" | "git" | "package-registry" | "custom". */
  type: string;
  /** Operations the source supports. */
  capabilities: SourceCapabilities;
  /** Artifact kinds this source can provide. */
  artifact_types: ArtifactKind[];
  /** Governance: disallowed sources are skipped with a note, never queried. */
  policy: { allowed: boolean };
  /**
   * Adapter id implementing this source (defaults to a mapping from known
   * source ids). Unknown adapters degrade to "no results" with a note.
   */
  adapter?: string;
}

// ---------------------------------------------------------------------------
// Normalized search results
// ---------------------------------------------------------------------------

/**
 * A tooling/artifact finding normalized from any source. Mirrors the shape
 * staged in interview sessions (discovery), extended with the registry
 * envelope: the source id that produced it and the artifact kind it maps to.
 */
export interface RegistryFinding {
  kind: ArtifactKind;
  /** Canonical display name (package name, MCP server id, skill name, repo). */
  name: string;
  description: string;
  /** Provenance: the SourceManifest id that produced this finding. */
  source: string;
  /** Human-facing source label (e.g. "skills.sh", "npm"). */
  sourceLabel: string;
  /** Stable reference: registry detail URL, package spec, or repo slug. */
  reference: string;
  /** Registry-provided relevance score (0 when not provided). */
  score: number;
}

/** Result of one source lookup, including the failure mode when degraded. */
export interface SourceResult {
  source: string;
  results: RegistryFinding[];
  /** Present when the source was unreachable/disallowed — surfaced, never swallowed. */
  error?: string;
}

/** Options for a registry search: query, per-source cap, injected fetch. */
export interface RegistrySearchInput {
  query: string;
  /** Cap per source (default 5). */
  limit?: number;
  /** Restrict to one artifact kind (filters the normalized results). */
  kind?: ArtifactKind;
  /** Injected fetch (tests); defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/** The search contract every source adapter implements. */
export type SourceAdapter = (input: RegistrySearchInput) => Promise<SourceResult>;
