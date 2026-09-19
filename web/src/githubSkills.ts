/**
 * GitHub skills-repo import — the pure logic behind the registry's
 * "paste a repo URL" flow. Many community skills live as plain agent-skill
 * collections (any nested SKILL.md in a GitHub repo), which the catalog
 * cannot list individually. This module parses repo references and builds
 * the fetch/preview/install commands so the browser can do the rest.
 */

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch or ref when the URL pinned one (…/tree/<ref>/…); undefined = default. */
  ref?: string;
  /** Subpath inside the repo to restrict discovery to (…/tree/<ref>/<path>). */
  subpath?: string;
}

const REPO_PATTERNS: RegExp[] = [
  // https://github.com/owner/repo[/tree/<ref>[/<path>]] (also /blob/)
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)((?:\/[^\s?#]*))?)?/i,
  // owner/repo shorthand
  /^([\w.-]+)\/([\w.-]+)$/,
];

/** Parse a GitHub repo reference from free text (URL or owner/repo). */
export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input.trim().replace(/\.git$/i, "").replace(/[#?].*$/, "");
  if (!trimmed) return null;
  for (const pattern of REPO_PATTERNS) {
    const m = trimmed.match(pattern);
    if (!m) continue;
    const ref: RepoRef = { owner: m[1], repo: m[2] };
    if (m[3]) ref.ref = m[3];
    const sub = m[4]?.replace(/^\//, "").trim();
    if (sub && sub !== "") ref.subpath = sub;
    return ref;
  }
  return null;
}

/** True when the text should trigger the repo-import panel. */
export function looksLikeRepoRef(input: string): boolean {
  return parseRepoRef(input) !== null;
}

export function repoApiUrl(ref: RepoRef): string {
  return `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
}

/** One-call recursive tree; SKILL.md paths are filtered client-side. */
export function repoTreeUrl(ref: RepoRef): string {
  return `${repoApiUrl(ref)}/git/trees/${ref.ref ?? "HEAD"}?recursive=1`;
}

export function rawFileUrl(ref: RepoRef, path: string): string {
  const base = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.ref ?? "HEAD"}`;
  return `${base}/${path.replace(/^\//, "")}`;
}

/** Extract `name` and `description` from SKILL.md YAML frontmatter (flat fields only). */
export function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(name|description):\s*(.+?)\s*$/);
    if (kv) {
      const value = kv[2].replace(/^['"]|['"]$/g, "");
      if (kv[1] === "name") out.name = value;
      else out.description = value;
    }
  }
  return out;
}

export interface DiscoveredSkill {
  /** Skill name = directory containing SKILL.md. */
  name: string;
  /** Repo-relative path of the SKILL.md. */
  path: string;
}

/** Skill dirs from a recursive tree listing (paths ending in /SKILL.md). */
export function skillsFromTree(tree: Array<{ path: string; type: string }>, ref: RepoRef): DiscoveredSkill[] {
  const skills = tree
    .filter((e) => e.type === "blob" && /(^|\/)SKILL\.md$/.test(e.path))
    .filter((e) => !ref.subpath || e.path.startsWith(ref.subpath))
    .map((e) => ({
      path: e.path,
      name: e.path.split("/").slice(-2)[0] ?? e.path,
    }));
  // Deterministic, and dedupe by name (first wins) so nested collections stay stable.
  const seen = new Set<string>();
  return skills.sort((a, b) => a.name.localeCompare(b.name)).filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

/** The one-liner that installs a skill into .agents/skills/ via the skills CLI. */
export function installCommand(ref: RepoRef, skill?: string): string {
  return skill
    ? `npx skills add ${ref.owner}/${ref.repo} --skill ${skill} --yes`
    : `npx skills add ${ref.owner}/${ref.repo}`;
}
