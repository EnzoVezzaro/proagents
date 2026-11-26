/**
 * Professional Agent Profile types — the core primitive of the profiles
 * product. Provider-agnostic and harness-agnostic by design: a profile
 * describes HOW an agent should operate within a profession; the compiler
 * (src/adapters) decides how a target harness expresses it.
 *
 * These types live beside the agent-building types (src/core/types.ts) and
 * speak the same engineering vocabulary: structured, versioned, inspectable.
 */

// ---------------------------------------------------------------------------
// Profile definition
// ---------------------------------------------------------------------------

/** A named MCP server a profile requires, verbatim for .mcp.json merge. */
export interface ProfileMcpServer {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  allowedTools?: string[];
  /** Health endpoint (relative or absolute URL) checked before publish/use. */
  healthCheck?: string;
  /** True when the last health probe succeeded (never persisted to specs). */
  healthy?: boolean;
}

/** A registry package the profile's skills/tools come from (npm or GitHub). */
export interface ProfilePackage {
  /** Registry id: "npm:<pkg>[@version]" or "github:owner/repo[@ref]". */
  registry: string;
  /** Why the profile needs it — shown in reviews and install plans. */
  reason?: string;
}

/** Depth for a named standard, method, certification, or specification. */
export interface ProfileReference {
  /** Authoritative URL for the standard/method/certification. */
  url: string;
  /** Why this profile uses it / what part applies. */
  note?: string;
}

/**
 * Machine-readable enforcement attached to a normative rule — the bridge
 * between "rules are prose" and "runtime boundaries enforce" (invariant 6).
 * Harness-agnostic by design: only src/adapters knows how each target
 * compiles these into its own mechanisms.
 */
export interface RuleEnforcement {
  /**
   * Shell command patterns the rule forbids. Glob syntax: `*` any run of
   * characters, `?` exactly one (e.g. "git push --force*"). Matched against
   * the command string; adapters translate per target.
   */
  bash?: string[];
  /**
   * Semantic tool names the rule forbids — the profile tools vocabulary
   * ("shell", "filesystem", "git", "web", "network"), never a harness's own
   * tool id. Adapters map them; unmappable names surface as limitations.
   */
  tools?: string[];
  /**
   * File path globs the rule forbids modifying. A leading double-star acts
   * like a directory wildcard: it matches any number of directories,
   * including none. A single `*` stays within one path segment, `?` is one
   * character (e.g. root-or-nested ".env" protection).
   */
  paths?: string[];
}

/** One rule's hydrated prose paired with its machine-readable enforcement. */
export interface RuleEnforcementEntry {
  /** The rule's prose — matches an entry of `rules` after hydration. */
  rule: string;
  /** Raw as authored; PA043 validates the shape (tolerant loading). */
  enforcement: RuleEnforcement;
}

/**
 * Which skills inside a referenced skills repository/package this profile
 * composes. Keys mirror entries of `skills` (the registry ref); the named
 * skills stay in their repo — referenced, never duplicated.
 */
export interface ProfileSkillsDetail {
  /** Skill names inside the referenced repo/package. */
  skills: string[];
  /** How to install the referenced skills (e.g. the npx skills add command). */
  install?: string;
  note?: string;
}

export interface ProfileManifest {
  /** The profile's own semver — the single, outer version. */
  version: string;
  profile: {
    name: string;
    slug: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
  identity: {
    title: string;
    summary?: string;
  };
  expertise: string[];
  /** Knowledge references: paths within the profile, resolved at equip time. */
  knowledge?: string[];
  /** Named professional methods this profile applies. */
  methods?: string[];
  /** Reusable skills the profile composes: "npm:<pkg>[@v]", "github:o/r", or a written skill's kebab-case name. */
  skills?: string[];
  /** Per-ref detail: which skills inside the referenced repo this profile uses. */
  skillsDetail?: Record<string, ProfileSkillsDetail>;
  /** Written skill bodies for skills entries that are not registry refs. */
  skillBodies?: Record<string, { description: string; body: string }>;
  /** Normative constraints — enforced by the harness where supported. */
  rules?: string[];
  /**
   * Machine-readable enforcement paired with the rules above, collected from
   * `enforcement` blocks inside rule section files (or authored inline).
   * The compiler turns these into runtime boundaries where the target
   * harness supports them; PA043 validates the shape.
   */
  ruleEnforcement?: RuleEnforcementEntry[];
  /** Governing policies of the profession (data handling, disclosure, safety). */
  policies?: string[];
  /** Standards bodies / frameworks the profile follows (OWASP, ISO…). */
  standards?: string[];
  /** Depth for named standards, methods, certifications: authoritative URLs. */
  references?: Record<string, ProfileReference>;
  tools: {
    required: string[];
    optional?: string[];
    forbidden?: string[];
    /** MCP servers the profession needs, merged into the harness .mcp.json. */
    mcp?: ProfileMcpServer[];
    /** Registry packages (npm/GitHub) providing skills or tooling. */
    packages?: ProfilePackage[];
  };
  verification: {
    required: string[];
    optional?: string[];
  };
}

/**
 * On-disk manifest in the folder standard: every section holds a path to its
 * file inside the profile folder (`identity/01-x.md`, `rules/01-y.md`, …);
 * `skills` entries are `skills/NN-*.md` paths and `tools` is the
 * `tools/requirements.md` path. The loader hydrates every path to content at
 * read time, producing a plain {@link ProfileManifest}. Inline manifests
 * (web builder drafts, legacy files) are the same type with content instead
 * of paths — both validate and load identically.
 */
export type ProfileManifestSource = Omit<ProfileManifest, "identity" | "tools"> & {
  identity?: ProfileManifest["identity"] | string;
  tools?: ProfileManifest["tools"] | string;
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** A conflict found while composing two or more profiles. */
export interface ProfileConflict {
  code: ProfileConflictCode;
  severity: "error" | "warning";
  message: string;
  profiles: string[];
  suggestion?: string;
}

export type ProfileConflictCode =
  | "PA021" // duplicate skill with conflicting definitions
  | "PA022" // conflicting rules
  | "PA023" // incompatible tools (required by one, forbidden by another)
  | "PA024" // circular method dependencies
  | "PA025" // capability gap (verification impossible with declared tools)
  | "PA026"; // duplicate profile in composition

export interface CompositionResult {
  ok: boolean;
  errors: number;
  warnings: number;
  /** Ordered, deduplicated effective profile after composition. */
  effective: EffectiveProfile;
  conflicts: ProfileConflict[];
}

/** The single professional operating model produced by composition. */
export interface EffectiveProfile {
  name: string;
  slugs: string[]; // composition order matters
  identity: { title: string; summary: string };
  expertise: string[];
  knowledge: string[];
  methods: string[];
  skills: string[];
  skillsDetail: Record<string, ProfileSkillsDetail>;
  rules: string[];
  /** Merged rule enforcement entries (deny-only, so the union is always safe). */
  ruleEnforcement?: RuleEnforcementEntry[];
  policies: string[];
  standards: string[];
  references: Record<string, ProfileReference>;
  tools: {
    required: string[];
    optional: string[];
    forbidden: string[];
    mcp: ProfileMcpServer[];
    packages: ProfilePackage[];
  };
  verification: { required: string[]; optional: string[] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ProfileValidationFinding {
  code: ProfileValidationCode;
  severity: "error" | "warning";
  message: string;
  entities: string[];
  suggestion?: string;
}

export type ProfileValidationCode =
  | "PA030" // missing required field (name/slug/version/identity/…)
  | "PA031" // invalid slug (not kebab-case)
  | "PA032" // invalid semver
  | "PA033" // empty expertise
  | "PA034" // no required tools
  | "PA035" // no verification requirements
  | "PA036" // forbidden tool also required
  | "PA037" // knowledge reference missing from profile directory
  | "PA038" // duplicate slug in registry
  | "PA039" // invalid MCP server entry (name/transport/url/command)
  | "PA040" // invalid package registry ref (not npm:/github:)
  | "PA041" // reference entry without an https:// URL
  | "PA042" // section path entry missing from the profile directory
  | "PA043"; // malformed or dangling rule enforcement block

export interface ProfileValidationReport {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: ProfileValidationFinding[];
  profile: string;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Equip
// ---------------------------------------------------------------------------

export interface EquipResult {
  status: "ok" | "blocked";
  target: string; // harness id
  profile: string | string[];
  composed: EffectiveProfile;
  /** Files written by the adapter, relative to cwd. */
  written: string[];
  /** Findings from composition/validation that did not block. */
  warnings: string[];
  /** Harness mechanisms the adapter could not express. */
  limitations: string[];
  /** Optional verification paths the target harness cannot enforce. */
  verificationNotes: string[];
}
