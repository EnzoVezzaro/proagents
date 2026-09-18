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

/**
 * Section→file index for the profile folder standard. Arrays are ordered the
 * same as the corresponding section arrays in the manifest.
 */
export interface ProfileFilesIndex {
  identity?: string;
  expertise?: string[];
  knowledge?: string[];
  methods?: string[];
  skills?: string[];
  rules?: string[];
  policies?: string[];
  standards?: string[];
  tools?: string;
  verification?: { required?: string[]; optional?: string[] };
}

/** Depth for a named standard, method, certification, or specification. */
export interface ProfileReference {
  /** Authoritative URL for the standard/method/certification. */
  url: string;
  /** Why this profile uses it / what part applies. */
  note?: string;
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
  /** Governing policies of the profession (data handling, disclosure, safety). */
  policies?: string[];
  /** Standards bodies / frameworks the profile follows (OWASP, ISO…). */
  standards?: string[];
  /** Depth for named standards, methods, certifications: authoritative URLs. */
  references?: Record<string, ProfileReference>;
  /**
   * Folder-standard index: every section entry linked to its file inside the
   * profile folder (knowledge entries are paths already and are mirrored).
   * Additive metadata — the engine reads the section arrays; tools and humans
   * use `files` to find the editable source of each item.
   */
  files?: ProfileFilesIndex;
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
  | "PA041"; // reference entry without an https:// URL

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
