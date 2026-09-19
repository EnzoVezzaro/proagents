import type {
  EffectiveProfile,
  ProfileConflict,
  ProfileManifest,
} from "./types.js";
import { mapToCapabilities } from "../registry/capabilities.js";

/**
 * Composition engine — merge one or more professional profiles into a single
 * effective professional operating model.
 *
 * Deterministic: same inputs, same output, same conflict set. Serious
 * conflicts (severity "error") must never be silently ignored — the caller
 * (CLI equip/compile) blocks on them.
 */

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Case-insensitive conceptual match for rules where phrasing may differ. */
function conceptualKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** A rule is negative when it *starts* with a negation word (declarative rules). */
function isNegative(rule: string): boolean {
  return /^(never|no|without|do not|don't|dont)\b/i.test(rule.trim());
}

/** Normalize a rule for comparison, stripping any leading negation. */
function ruleBase(rule: string): string {
  return conceptualKey(rule.trim().replace(/^(never|no|without|do not|don't|dont)\s+/i, ""));
}

/** A rule's polarity key: negated rules key differently from required ones. */
function ruleKey(rule: string): string {
  return isNegative(rule) ? `!${ruleBase(rule)}` : ruleBase(rule);
}

export function composeProfiles(manifests: ProfileManifest[]): {
  effective: EffectiveProfile;
  conflicts: ProfileConflict[];
} {
  const conflicts: ProfileConflict[] = [];
  const slugs = manifests.map((m) => m.profile.slug);

  // PA026 — the same profile listed twice in one composition.
  const seenSlugs = new Set<string>();
  for (const slug of slugs) {
    if (seenSlugs.has(slug)) {
      conflicts.push({
        code: "PA026",
        severity: "warning",
        message: `profile ${slug} listed more than once in the composition`,
        profiles: [slug],
        suggestion: "List each profile once.",
      });
    }
    seenSlugs.add(slug);
  }

  const unique = dedupeBySlug(manifests);

  const effective: EffectiveProfile = {
    name: unique.map((m) => m.identity.title).join(" + "),
    slugs: unique.map((m) => m.profile.slug),
    identity: {
      title: unique.map((m) => m.identity.title).join(" + "),
      summary: unique
        .map((m) => m.identity.summary ?? m.identity.title)
        .join(" Combined with: "),
    },
    expertise: dedupe(unique.flatMap((m) => m.expertise)),
    knowledge: dedupe(unique.flatMap((m) => m.knowledge ?? [])),
    methods: dedupe(unique.flatMap((m) => m.methods ?? [])),
    skills: dedupe(unique.flatMap((m) => m.skills ?? [])),
    skillsDetail: Object.fromEntries(unique.flatMap((m) => Object.entries(m.skillsDetail ?? {}))),
    rules: dedupe(unique.flatMap((m) => m.rules ?? [])),
    policies: dedupe(unique.flatMap((m) => m.policies ?? [])),
    standards: dedupe(unique.flatMap((m) => m.standards ?? [])),
    references: Object.fromEntries(unique.flatMap((m) => Object.entries(m.references ?? {}))),
    tools: {
      required: dedupe(unique.flatMap((m) => m.tools.required)),
      optional: dedupe(unique.flatMap((m) => m.tools.optional ?? [])),
      forbidden: dedupe(unique.flatMap((m) => m.tools.forbidden ?? [])),
      mcp: dedupeBy((unique.flatMap((m) => m.tools.mcp ?? [])), (s) => s.name),
      packages: dedupeBy(unique.flatMap((m) => m.tools.packages ?? []), (p) => p.registry),
    },
    verification: {
      required: dedupe(unique.flatMap((m) => m.verification.required)),
      optional: dedupe(unique.flatMap((m) => m.verification.optional ?? [])),
    },
  };

  // PA022 — conflicting rules: the same conceptual rule stated with opposite
  // polarity across profiles (one requires it, one forbids it).
  const ruleOwners = new Map<string, string[]>();
  for (const m of unique) {
    for (const rule of m.rules ?? []) {
      const key = ruleKey(rule);
      const base = key.replace(/^!/, "");
      const opposite = key.startsWith("!") ? base : `!${base}`;
      const others = ruleOwners.get(opposite) ?? [];
      if (others.length > 0) {
        conflicts.push({
          code: "PA022",
          severity: "error",
          message: `conflicting rules between ${others.join(", ")} and ${m.profile.slug}: "${rule}"`,
          profiles: dedupe([...others, m.profile.slug]),
          suggestion: "Resolve the rule conflict explicitly before equipping — never silently drop one side.",
        });
      }
      ruleOwners.set(key, dedupe([...(ruleOwners.get(key) ?? []), m.profile.slug]));
    }
  }

  // PA023 — a tool required by one profile is forbidden by another.
  const forbidden = new Set(effective.tools.forbidden.map(conceptualKey));
  for (const tool of effective.tools.required) {
    if (forbidden.has(conceptualKey(tool))) {
      conflicts.push({
        code: "PA023",
        severity: "error",
        message: `tool "${tool}" is required by one profile and forbidden by another`,
        profiles: slugs,
        suggestion: "Remove the tool from forbidden, or drop the profile that requires it.",
      });
    }
  }

  // PA024 — method dependency declarations (community profiles may declare
  // `depends:<method>` entries); flag them so cycles get human attention.
  for (const m of unique) {
    for (const method of m.methods ?? []) {
      if (/^depends:/i.test(method)) {
        conflicts.push({
          code: "PA024",
          severity: "warning",
          message: `method "${method}" declares a dependency — verify no cycle exists across ${effective.slugs.join(", ")}`,
          profiles: effective.slugs,
        });
      }
    }
  }

  // PA025 — capability gap: verification names a concrete capability that
  // none of the required tools provide. Two satisfiability paths, ORed:
  //   1. capability model (registry mapper): the verification keyword maps to
  //      a taxonomy capability ("tests" → testing) and some required tool
  //      implies that capability;
  //   2. legacy keyword table below (lint/build/typecheck/… have no taxonomy
  //      capability but map to known tool keywords).
  // Prose outcomes ("CI green on the release commit") are not capability
  // names — they are executed by the agent within the session and never warn.
  const toolKeys = new Set(effective.tools.required.map(conceptualKey));
  const verificationSatisfiers: Record<string, string[]> = {
    tests: ["test-runner", "tests", "shell"],
    "security-scan": ["security-scanner", "security-scan", "shell"],
    lint: ["linter", "lint", "shell"],
    build: ["build-tool", "build", "shell"],
    typecheck: ["typechecker", "typecheck", "shell"],
    "runtime-validation": ["runtime", "shell"],
  };
  /** Verification keyword → taxonomy capability (registry capability model). */
  const verificationNeeds: Record<string, string> = {
    tests: "testing",
    test: "testing",
    "security-scan": "security-review",
  };
  const impliesCapability = (tool: string, capability: string): boolean =>
    mapToCapabilities({ tools: [tool], mcp: [], packages: [], expertise: [] }).includes(capability);
  for (const req of effective.verification.required) {
    const key = conceptualKey(req);
    const need = verificationNeeds[key];
    const satisfiers = verificationSatisfiers[key];
    if (!need && !satisfiers) continue; // prose outcome, not a tool capability
    const viaLegacy = satisfiers?.some((s) => toolKeys.has(s)) ?? false;
    const viaCapability = need !== undefined && effective.tools.required.some((t) => impliesCapability(t, need));
    if (!viaLegacy && !viaCapability) {
      conflicts.push({
        code: "PA025",
        severity: "warning",
        message: `verification "${req}" needs a capability none of the required tools provide`,
        profiles: effective.slugs,
        suggestion: "Add the matching tool to tools.required, or make the verification optional.",
      });
    }
  }

  const errors = conflicts.filter((c) => c.severity === "error").length;
  const warnings = conflicts.filter((c) => c.severity === "warning").length;
  return { effective, conflicts };
}

/** Drop later duplicates of the same slug (first occurrence wins). */
function dedupeBySlug(manifests: ProfileManifest[]): ProfileManifest[] {
  const seen = new Set<string>();
  return manifests.filter((m) => {
    if (seen.has(m.profile.slug)) return false;
    seen.add(m.profile.slug);
    return true;
  });
}

/** Dedupe structured objects by a key (first occurrence wins). */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
