import fs from "node:fs/promises";
import path from "node:path";
import type { CrewDefinition, MarketplaceCatalog, MarketplaceItem } from "./types.js";
import { CrewError } from "./types.js";
import { crewProblems } from "./validate.js";
import { dehydrateCrew, hydrateCrewRemote, loadCrewFile } from "./hydrate.js";

/**
 * Registry — Git-as-database (GitRows pattern).
 *
 * The catalog is a set of JSON files committed to this repository and served
 * by GitHub Pages:
 *
 *   registry/catalog.json            index: lightweight MarketplaceItems
 *   registry/profiles/<id>/…         profile folders (profile.json index)
 *   registry/crews/<id>/crew.json    crew folders (composition index)
 *
 * Reads on the web app are same-origin fetches (static, cached, no backend).
 * Writes are commits via the GitHub Contents API from the dashboard or CLI —
 * the Git history IS the audit log, and every change is a reviewable diff.
 */

export const REGISTRY_DIR = "registry";
export const CATALOG_PATH = `${REGISTRY_DIR}/catalog.json`;

/**
 * Per-repo local item dirs (.proagent/) — where `build --kind`, `profile
 * create` and `crew create` materialize custom items in a CONSUMER repo.
 * `registry/` stays the canonical source of THIS repo's catalog only;
 * a consumer's own creations belong under .proagent/ (session artifacts
 * already live in .proagent/, so the whole local state is one folder).
 */
export const LOCAL_PROFILES_DIR = ".proagent/profiles";
export const LOCAL_CREWS_DIR = ".proagent/crews";
/** Crew items live in crews/<id>/ (folder standard, composition taxonomy). */
export const CREWS_DIR = "crews";
/** Profile items live in profiles/<slug>/ (folder standard). */
export const PROFILES_DIR = "profiles";

const REPO = "EnzoVezzaro/proagents";

export function emptyCatalog(): MarketplaceCatalog {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), items: [] };
}

function asCatalog(json: unknown): MarketplaceCatalog {
  const c = json as MarketplaceCatalog;
  if (!c || c.schemaVersion !== 1 || !Array.isArray(c.items)) {
    throw new CrewError("CREW_REGISTRATION_ERROR", "catalog.json is not a valid MarketplaceCatalog");
  }
  return c;
}

/** Read the catalog from a local repo checkout. */
export async function readCatalogLocal(root: string): Promise<MarketplaceCatalog> {
  try {
    const raw = await fs.readFile(path.join(root, CATALOG_PATH), "utf8");
    return asCatalog(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyCatalog();
    if (err instanceof CrewError) throw err;
    throw new CrewError("CREW_REGISTRATION_ERROR", `cannot read catalog: ${(err as Error).message}`);
  }
}

/**
 * Fetch raw.githubusercontent.com content. If an authenticated request returns
 * 404, retry unauthenticated before giving up: a stale/invalid token makes
 * GitHub answer 404 (not 401) even for public files, which would otherwise
 * mask a working public catalog behind a broken credential.
 */
async function fetchRaw(url: string, token?: string): Promise<Response> {
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (res.status === 404 && token) {
    return fetch(url);
  }
  return res;
}

/** Read the catalog from GitHub raw (works for any branch; defaults to main). */
export async function readCatalogRemote(repo: string = REPO, ref = "main", token?: string): Promise<MarketplaceCatalog> {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${CATALOG_PATH}`;
  const res = await fetchRaw(url, token);
  if (res.status === 404) return emptyCatalog();
  if (!res.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `catalog fetch failed: HTTP ${res.status}`);
  return asCatalog(await res.json());
}

/**
 * Fetch a full crew definition from the remote catalog and hydrate it over
 * HTTP (crews/<id>/crew.json + section files). No legacy fallback: the
 * split layout (profiles/ + crews/) is the only published shape.
 */
export async function fetchCrewDefinition(id: string, repo: string = REPO, ref = "main", token?: string): Promise<CrewDefinition> {
  const base = `https://raw.githubusercontent.com/${repo}/${ref}/${REGISTRY_DIR}/${CREWS_DIR}/${id}`;
  const headers = token ? { authorization: `Bearer ${token}` } : {};

  let manifestRes = await fetch(`${base}/crew.json`, { headers });
  if (manifestRes.status === 404 && token) manifestRes = await fetch(`${base}/crew.json`);
  if (manifestRes.status === 404) throw new CrewError("CREW_NOT_FOUND", `crew not found in registry: ${id}`);
  if (!manifestRes.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `crew fetch failed: HTTP ${manifestRes.status}`);
  const json: unknown = JSON.parse(await manifestRes.text());
  const getRaw = async (rel: string): Promise<string | undefined> => {
    if (rel.includes("..") || rel.startsWith("/")) return undefined;
    let res = await fetch(`${base}/${rel}`, { headers });
    if (res.status === 404 && token) res = await fetch(`${base}/${rel}`);
    if (!res.ok) return undefined;
    return res.text();
  };
  const crew = await hydrateCrewRemote(json, getRaw);
  const problems = crewProblems(crew);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `downloaded crew failed validation: ${problems.join("; ")}`, { problems });
  }
  return crew;
}

/** Load a crew definition from the local registry dir (tests/CLI dev). */
export async function readCrewDefinitionLocal(root: string, id: string): Promise<CrewDefinition> {
  const file = path.join(root, REGISTRY_DIR, CREWS_DIR, id, "crew.json");
  return loadCrewFile(file);
}

/** Load a crew definition from the consumer repo's local dir (.proagent/crews). */
export async function readCrewDefinitionLocalDir(root: string, id: string): Promise<CrewDefinition> {
  return loadCrewFile(path.join(root, LOCAL_CREWS_DIR, id, "crew.json"));
}

// ---------------------------------------------------------------------------
// Writes — commits through the GitHub Contents API (GitRows-style)
// ---------------------------------------------------------------------------

export interface GitHubCommitTarget {
  repo: string; // owner/name
  branch: string;
  token: string; // OAuth/PAT with contents:write
  /** Optional commit author override. */
  authorName?: string;
  authorEmail?: string;
}

/** Low-level Contents-API helper, shared with the profile publisher. */
export async function getRemoteFile(target: GitHubCommitTarget, filePath: string): Promise<{ sha: string | null; content: string | null }> {
  const url = `https://api.github.com/repos/${target.repo}/contents/${filePath}?ref=${encodeURIComponent(target.branch)}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "proagent-cli",
    },
  });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `GitHub contents GET failed: HTTP ${res.status}`);
  const body = (await res.json()) as { sha: string; content: string; encoding: string };
  const content = body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("utf8") : body.content;
  return { sha: body.sha, content };
}

/** Low-level Contents-API helpers, shared with the profile publisher. */
export async function putRemoteFile(target: GitHubCommitTarget, filePath: string, content: string, sha: string | null, message: string): Promise<void> {
  const url = `https://api.github.com/repos/${target.repo}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "proagent-cli",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      branch: target.branch,
      sha: sha ?? undefined,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(target.authorName ? { committer: { name: target.authorName, email: target.authorEmail ?? "noreply@github.com" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new CrewError("CREW_REGISTRATION_ERROR", `GitHub contents PUT failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
}

/**
 * Publish (create or update) a crew in the Git-backed catalog. The crew is
 * dehydrated into the folder standard (composition taxonomy: crew.json,
 * mission/, members/, coordination/, tasks/, workflows/, handoffs/, rules/,
 * verification/, mcp/servers.json) and committed file by file, then the
 * lightweight index entry is upserted in catalog.json. Each commit is
 * reviewable in Git history.
 */
export async function publishCrew(crew: CrewDefinition, target: GitHubCommitTarget): Promise<{ itemPath: string; catalogPath: string; files: string[] }> {
  const problems = crewProblems(crew);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `refusing to publish invalid crew: ${problems.join("; ")}`, { problems });
  }

  // 1. Upsert the folder-standard item files.
  const itemDir = `${REGISTRY_DIR}/${CREWS_DIR}/${crew.id}`;
  const folderFiles = dehydrateCrew(crew);
  for (const [rel, content] of Object.entries(folderFiles)) {
    const filePath = `${itemDir}/${rel}`;
    const existing = await getRemoteFile(target, filePath);
    await putRemoteFile(target, filePath, content, existing.sha, `crew: publish ${crew.id}@${crew.version} (${rel})`);
  }

  // 2. Update the catalog index.
  const catalogFile = await getRemoteFile(target, CATALOG_PATH);
  const catalog = catalogFile.content ? asCatalog(JSON.parse(catalogFile.content)) : emptyCatalog();
  const item: MarketplaceItem = {
    id: crew.id,
    name: crew.name,
    version: crew.version,
    description: crew.description,
    author: crew.author,
    tags: crew.tags,
    kind: crew.workers.length > 1 ? "crew" : "agent",
    downloads: catalog.items.find((i) => i.id === crew.id)?.downloads ?? 0,
    createdAt: catalog.items.find((i) => i.id === crew.id)?.createdAt ?? crew.createdAt,
    updatedAt: crew.updatedAt,
  };
  // Registry envelope (additive): provenance + declared capabilities.
  // Existing items keep their fields; republishing fills what the manifest can declare.
  item.source = catalog.items.find((i) => i.id === crew.id)?.source ?? "proagents";
  const items = [...catalog.items.filter((i) => i.id !== crew.id), item].sort((a, b) => a.id.localeCompare(b.id));
  const updated: MarketplaceCatalog = { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
  await putRemoteFile(target, CATALOG_PATH, JSON.stringify(updated, null, 2) + "\n", catalogFile.sha, `crew: update catalog index for ${crew.id}`);

  return { itemPath: `${itemDir}/crew.json`, catalogPath: CATALOG_PATH, files: Object.keys(folderFiles) };
}

/** Increment the download counter for a crew (one commit). */
export async function recordDownload(id: string, target: GitHubCommitTarget): Promise<void> {
  const catalogFile = await getRemoteFile(target, CATALOG_PATH);
  if (!catalogFile.content) return;
  const catalog = asCatalog(JSON.parse(catalogFile.content));
  const items = catalog.items.map((i) => (i.id === id ? { ...i, downloads: i.downloads + 1 } : i));
  const updated: MarketplaceCatalog = { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
  await putRemoteFile(target, CATALOG_PATH, JSON.stringify(updated, null, 2) + "\n", catalogFile.sha, `crew: record download of ${id}`);
}
