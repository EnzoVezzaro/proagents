/**
 * Profession index — the catalog AS the matching source.
 *
 * `catalog.json` is the lightweight index of every registry item,
 * rebuilt automatically by every publish path (profile/crew publish,
 * /publish on proposal issues, PR merges, the SPA builder PR flow). Crew
 * derivation matches the user's intent against THIS index, so a newly
 * published community profession is immediately derivable into crews —
 * no engine changes, no hardcoded profession lists to go stale.
 *
 * Resolution order (mirrors equip): the repo's own `registry/`
 * checkout wins, the npm package's shipped snapshot fills the gap. A
 * repo can also point PROAGENT_CATALOG at a custom index file.
 *
 * Deterministic: same catalog + same text → same ranked matches. No
 * model calls; the only IO is one JSON read.
 */
import fs from "node:fs";
import path from "node:path";

/** Cap on crew members derived from catalog matches (PA046-adjacent). */
const MAX_MEMBERS = 6;

/** Tokens too generic to discriminate professions on their own. */
const GENERIC_TOKENS = new Set([
  "engineer", "specialist", "senior", "staff", "principal", "profile", "professional", "the", "and", "for",
]);

export interface ProfessionEntry {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  /** Search tokens derived from slug/name/tags (generic tokens dropped). */
  keywords: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

function toEntry(item: { id: string; name?: string; description?: string; tags?: string[] }): ProfessionEntry {
  const keywords = [...new Set([...tokenize(item.id), ...tokenize(item.name ?? ""), ...(item.tags ?? []).flatMap((t) => tokenize(t))])];
  return {
    slug: item.id,
    name: item.name ?? item.id,
    description: item.description ?? "",
    tags: item.tags ?? [],
    keywords,
  };
}

/** Locate the catalog: repo checkout first, then the packaged snapshot. */
function catalogCandidates(cwd: string): string[] {
  const candidates = [
    process.env.PROAGENT_CATALOG,
    path.join(cwd, "registry", "catalog.json"),
    // dist/core/profession-index.js → <pkgroot>/registry/catalog.json
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../../registry/catalog.json"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  return [...new Set(candidates)];
}

/**
 * Load the profile slice of the catalog index. Tolerant: a missing or
 * malformed index yields an empty list and derivation falls back to the
 * generic role path — never a crash, never a silent wrong match.
 */
export function loadProfessionIndex(cwd: string = process.cwd()): ProfessionEntry[] {
  for (const file of catalogCandidates(cwd)) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const catalog = JSON.parse(raw) as { items?: Array<{ id?: string; kind?: string; name?: string; description?: string; tags?: string[] }> };
      const items = (catalog.items ?? []).filter((i) => i.kind === "profile" && typeof i.id === "string");
      if (items.length > 0) return items.map((i) => toEntry(i as { id: string; name?: string; description?: string; tags?: string[] }));
    } catch {
      continue; // try the next candidate
    }
  }
  return [];
}

/**
 * Match intent text against the catalog. Scoring: a full profession-name
 * phrase in the text is the strongest signal; keyword and tag token hits
 * add one each. Ties break by slug for determinism.
 */
export function matchProfessions(text: string, cwd: string = process.cwd()): ProfessionEntry[] {
  const index = loadProfessionIndex(cwd);
  if (index.length === 0) return [];
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const words = new Set(hay.split(" ").filter(Boolean));

  const scored: Array<{ entry: ProfessionEntry; score: number }> = [];
  for (const entry of index) {
    let score = 0;
    const phrase = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (phrase && hay.includes(` ${phrase} `)) score += 3;
    for (const kw of entry.keywords) {
      if (words.has(kw)) score += 1;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug));
  return scored.slice(0, MAX_MEMBERS).map((s) => s.entry);
}

/** Map catalog tags to an architecture role (drives the permission model). */
export function roleForProfession(entry: ProfessionEntry): string {
  const tags = new Set(entry.tags.map((t) => t.toLowerCase()));
  const kws = new Set(entry.keywords);
  const has = (...t: string[]): boolean => t.some((x) => tags.has(x) || kws.has(x));
  if (has("qa", "test", "testing", "review", "security", "privacy", "a11y", "accessibility", "wcag")) return "review";
  if (has("devops", "release", "sre", "incident", "deploy", "deployment", "ci", "cd")) return "operations";
  if (has("platform", "dx", "infrastructure", "architecture", "cloud")) return "infrastructure";
  if (has("docs", "documentation", "writer", "diataxis")) return "documentation";
  if (has("slo", "observability", "monitoring", "error-budgets")) return "monitoring";
  if (has("api", "backend", "frontend", "mobile", "ml", "data", "database", "performance", "legacy", "schema")) return "implementation";
  return "generalist";
}
