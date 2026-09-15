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

export interface ProfileManifest {
  version: string; // schema version, "1"
  profile: {
    name: string;
    slug: string;
    version: string; // semver of the profile itself
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
  /** Reusable skills the profile composes. */
  skills?: string[];
  /** Normative constraints — enforced by the harness where supported. */
  rules?: string[];
  /** Standards bodies / frameworks the profile follows (OWASP, ISO…). */
  standards?: string[];
  tools: {
    required: string[];
    optional?: string[];
    forbidden?: string[];
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
  rules: string[];
  standards: string[];
  tools: { required: string[]; optional: string[]; forbidden: string[] };
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
  | "PA038"; // duplicate slug in registry

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
