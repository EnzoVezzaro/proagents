/**
 * ProAgents Crew — domain types.
 *
 * A CREW is a publishable bundle of specialized workers: per-worker skill,
 * permission model, tool allowlist, MCP servers and context frameworks,
 * plus the handoff graph that connects them. Crews are registry units:
 * build here (GUI or CLI), publish to the Git-backed catalog, install anywhere
 * with one command (`proagent crew install <id>`).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CrewErrorCode =
  | "CREW_CONFIG_ERROR"
  | "CREW_VALIDATION_ERROR"
  | "CREW_NOT_FOUND"
  | "CREW_REGISTRATION_ERROR"
  | "CREW_INSTALL_ERROR";

export class CrewError extends Error {
  readonly code: CrewErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: CrewErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CrewError";
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

/** Permission model for a worker (same vocabulary as generated skills). */
export interface CrewPermissions {
  read: "none" | "repo" | "scoped" | "world";
  write: "none" | "repo" | "scoped";
  production: "none" | "read" | "write";
  secrets: "none" | "named" | "all";
  /** Tools the worker may call. Empty array = no tools. */
  tools: string[];
  /** Tools that additionally require a granted human approval event. */
  approvalGates?: string[];
}

/** MCP server declaration (consumed by .mcp.json on install). */
export interface CrewMcpServer {
  name: string;
  /** Transport: stdio for local servers, http/sse for remote. */
  transport: "stdio" | "http" | "sse";
  /** stdio: executable command. */
  command?: string;
  /** stdio: argument list. */
  args?: string[];
  /** http/sse: endpoint URL. */
  url?: string;
  /** Environment variables for the server process. Values may reference env by name. */
  env?: Record<string, string>;
  /** Tools from this server the crew may use (allowlist; empty = all). */
  allowedTools?: string[];
}

/** Context framework binding for a worker. */
export interface CrewContext {
  /** Built-in ids: filesystem | git | acc — or an external adapter specifier. */
  framework: string;
  /** Natural-language scope used by retrieval (e.g. "src/auth/**"). */
  scope?: string;
  /** Optional provider-specific options. */
  options?: Record<string, unknown>;
}

/** A worker (specialized agent) inside a crew. */
export interface CrewWorker {
  id: string;
  name: string;
  role: string;
  description: string;
  /**
   * Optional profession: the slug of a Professional Profile this worker
   * operates as (registry or built-in). When set, expertise, methods,
   * rules and verification come from the profile and per-worker hand
   * configuration (permissions, instructions) becomes optional — the crew
   * builder composes professions instead of crafting every field.
   */
  profile?: string;
  permissions: CrewPermissions;
  mcpServers: string[]; // names into crew.mcpServers
  context: CrewContext[];
  /** Workflow instructions (markdown body of the generated SKILL.md). Optional when a profile is set. */
  instructions: string;
  /** Upstream workers this one receives named artifacts from. */
  receivesFrom: string[];
  /** Named artifacts this worker emits downstream. */
  emits: string[];
}

/** The handoff graph, derived from worker edges but stored explicitly. */
export interface CrewHandoff {
  from: string;
  to: string;
  artifact: string;
}

/** A complete crew definition — the registry unit. */
export interface CrewDefinition {
  /** Registry id, e.g. "incidere-incident-response". Stable, slug-like. */
  id: string;
  name: string;
  version: string; // semver
  description: string;
  author: string;
  tags: string[];
  workers: CrewWorker[];
  mcpServers: CrewMcpServer[];
  handoffs: CrewHandoff[];
  /** Entry point worker(s) — where work starts. */
  entryPoints: string[];
  /** Why the team exists (hydrated from mission/ files). */
  mission?: string;
  /** How members coordinate and decide (hydrated from coordination/ files). */
  coordination?: string[];
  /** The units of work each member owns (hydrated from tasks/ files). */
  tasks?: string[];
  /** End-to-end team workflows (hydrated from workflows/ files). */
  workflows?: string[];
  /** Team-level normative rules (hydrated from rules/ files). */
  rules?: string[];
  /** How the crew verifies its own output (hydrated from verification/ files). */
  verification?: string[];
  /** ISO date. */
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Folder standard (source shape): crew.json is an index of paths
// ---------------------------------------------------------------------------

/** Crew identity/metadata block in crew.json (mirror of profile.meta). */
export interface CrewMeta {
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
}

/**
 * worker.json shape: the structured contract plus a path to the prose.
 * `instructions` holds a path ("instructions.md") in the folder standard and
 * the prose itself in inline (builder/legacy) manifests.
 */
export type CrewWorkerSource = Omit<CrewWorker, "instructions"> & {
  instructions?: string;
};

/**
 * A crew member — the composition unit. A member binds an existing
 * Professional Profile (its profession) to a pipeline role and an explicit
 * permission model; expertise/methods/rules/verification come from the
 * profile, never from the crew. Permissions are required: composition never
 * inherits trust implicitly.
 */
export interface CrewMemberSource {
  /** Profile slug this member operates as (registry or built-in). */
  profile: string;
  /** Pipeline role inside the crew, e.g. "schema-owner". */
  role: string;
  /** Optional explicit worker id; defaults to the profile slug (uniquified). */
  id?: string;
  /** Optional display name; defaults to the profile's name at install time. */
  name?: string;
  /** Explicit permission model — required, never inherited from the profile. */
  permissions: CrewPermissions;
  /** Names into crew.mcpServers. */
  mcpServers?: string[];
  /** Context frameworks scoped for this member. */
  context?: CrewContext[];
  /** Upstream members this one receives named artifacts from. */
  receivesFrom?: string[];
  /** Named artifacts this member emits downstream. */
  emits?: string[];
}

/**
 * Source shape of the folder-standard crew.json — the composition index.
 * Every content field is a path into the crew folder; hydration
 * (crew/hydrate.ts) turns it into a plain CrewDefinition:
 *
 *   crews/<id>/crew.json                     this index
 *   crews/<id>/mission/01-mission.md         why the team exists
 *   crews/<id>/members/NN-<slug>.json        profile bindings (CrewMemberSource)
 *   crews/<id>/coordination/NN-*.md          how the team coordinates/decides
 *   crews/<id>/tasks/NN-*.md                 the units of work each member owns
 *   crews/<id>/workflows/NN-*.md             end-to-end team workflows
 *   crews/<id>/handoffs/NN-*.md              per-edge handoff contracts
 *   crews/<id>/rules/NN-*.md                 team-level normative rules
 *   crews/<id>/verification/NN-*.md          how the crew verifies its output
 *   crews/<id>/tools/requirements.md         crew-level tool requirements
 *
 * Inline shapes (full CrewDefinition, or CrewDefinitionSource with inline
 * workers/mcpServers/handoffs) are accepted everywhere a source is read, so
 * builder output and legacy flat items keep working.
 */
export interface CrewDefinitionSource {
  version: string;
  crew: CrewMeta;
  /** Paths to member files (composition) or inline worker objects (legacy). */
  members?: string[] | CrewMemberSource[];
  /** Legacy/builders: paths to worker.json manifests, or inline workers. */
  workers?: string[] | CrewWorkerSource[];
  /** Path to the mission file (mission/01-mission.md). */
  mission?: string;
  /** Paths to coordination docs, or hydrated strings (builders). */
  coordination?: string[];
  /** Paths to task docs, or hydrated strings (builders). */
  tasks?: string[];
  /** Paths to workflow docs, or hydrated strings (builders). */
  workflows?: string[];
  /** Paths to handoff contracts, or inline handoff objects (legacy). */
  handoffs?: string[] | CrewHandoff[];
  /** Paths to team rules, or hydrated strings (builders). */
  rules?: string[];
  /** Paths to verification docs, or hydrated strings (builders). */
  verification?: string[];
  /** Path to the crew-level tool requirements (tools/requirements.md). */
  tools?: string;
  /** Path to the crew-level MCP server list (mcp/servers.json). */
  mcp?: string;
  /** Inline MCP servers (builder/legacy). */
  mcpServers?: CrewMcpServer[];
  /** Path to graph.json ({ handoffs, entryPoints }) — legacy layout. */
  graph?: string;
  entryPoints?: string[];
  /** ISO dates (deterministic default: epoch, never "now"). */
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Catalog (Git-backed database)
// ---------------------------------------------------------------------------

/** The Git-as-database catalog file. Lives at registry/catalog.json. */
export interface MarketplaceCatalog {
  schemaVersion: 1;
  updatedAt: string;
  items: MarketplaceItem[];
}

/**
 * Every artifact kind the registry models. Schema-complete from day one
 * (NEW_CHANGES.md artifact model); loaders/installers land per kind as
 * content arrives — unknown kinds are indexed and listed, and `info`
 * reports "no loader yet" rather than failing.
 */
export type ArtifactKind =
  | "profile"
  | "crew"
  | "agent"
  | "workflow"
  | "capability"
  | "skill"
  | "tool"
  | "mcp"
  | "prompt"
  | "hook"
  | "adapter"
  | "policy"
  | "template"
  | "extension";

/** Abstract abilities an artifact provides or needs (capability model). */
export interface ArtifactRequires {
  /** Capability ids the artifact needs at runtime. */
  capabilities?: string[];
  /** Other artifacts, as `kind:id` references. */
  artifacts?: string[];
}

/**
 * Lightweight catalog entry (full definition lives in crews/<id>/crew.json).
 * Historical name kept for compatibility (crew/registry.ts, web mirrors);
 * the catalog IS the registry catalog — see NEW_CHANGES.md terminology.
 *
 * Additive schema (NEW_CHANGES.md): `kind` widens to ArtifactKind, and
 * `provides` / `requires` / `compatibility` / `source` are optional. Old
 * readers ignore the new fields; new readers tolerate their absence.
 */
export interface MarketplaceItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  /** Legacy writers emit "profile" | "crew" | "agent"; the schema accepts all kinds. */
  kind: ArtifactKind;
  downloads: number;
  createdAt: string;
  updatedAt: string;
  /** Capability ids this artifact satisfies (capability resolution input). */
  provides?: string[];
  /** What the artifact needs: capabilities and/or `kind:id` artifact refs. */
  requires?: ArtifactRequires;
  /** Harness ids this artifact is known to compile for (informational). */
  compatibility?: string[];
  /** Provenance: "proagents" (native) or a federated source id (sources/*.yaml). */
  source?: string;
}

// ---------------------------------------------------------------------------
// Install plan
// ---------------------------------------------------------------------------

export interface InstallPlanEntry {
  path: string;
  action: "create" | "update";
  bytes: number;
}

export interface InstallPlan {
  crewId: string;
  version: string;
  entries: InstallPlanEntry[];
  mcpConfigPath: string;
}

/** Result of installing a crew into a repo root. */
export interface InstallResult {
  crewId: string;
  version: string;
  filesWritten: string[];
  mcpConfigPath: string;
  plan: InstallPlan;
}
