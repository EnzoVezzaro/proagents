import type { ProfileManifest } from "./types.js";

/**
 * Profile-draft logic — the pure, testable core of the profile builder
 * wizard: the client-side PA03x mirror that gates the Ship tab.
 */

const SLUG_OK = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Client-side mirror of the deterministic profile validator (PA03x subset). */
export function validateProfileDraft(p: ProfileManifest): string[] {
  const problems: string[] = [];
  if (!p.profile.slug || !SLUG_OK.test(p.profile.slug)) problems.push("Slug must be a lowercase kebab-case slug (PA031).");
  if (!p.profile.name) problems.push("Name is required (PA030).");
  if (!/^\d+\.\d+\.\d+/.test(p.profile.version)) problems.push("Profile version must be semver (PA032).");
  if (!p.identity.title) problems.push("Identity title is required (PA030).");
  if (!p.expertise || p.expertise.length === 0) problems.push("Add at least one expertise area (PA033).");
  if (!p.tools.required || p.tools.required.length === 0) problems.push("Add at least one required tool (PA034).");
  if (!p.verification.required || p.verification.required.length === 0) problems.push("Add at least one verification requirement (PA035).");
  const forbidden = new Set(p.tools.forbidden ?? []);
  for (const t of p.tools.required) {
    if (forbidden.has(t)) problems.push(`Tool "${t}" is both required and forbidden (PA036).`);
  }
  return problems;
}
