/**
 * Client-side hydration of folder-standard crew manifests (crew.json is an
 * index of paths: workers/<id>/worker.json + instructions.md, mcp/servers.json,
 * graph.json). Mirrors src/crew/hydrate.ts hydrateCrewRemote, but fetches
 * relative to the catalog item URL like profile-hydrate.ts. Tolerant: a file
 * that fails to fetch is skipped so the page still renders.
 */
import type { CrewDefinition, CrewDefinitionSource, CrewHandoff, CrewMcpServer, CrewWorker } from "./types.js";

const CREW_PATH_RE = /^[A-Za-z0-9][\w./-]*\.(?:json|md)$/;

function isCrewPathEntry(entry: string): boolean {
  return typeof entry === "string" && CREW_PATH_RE.test(entry) && !entry.includes("..") && !entry.startsWith("/");
}

async function getJson(itemBase: string, rel: string): Promise<unknown> {
  try {
    const res = await fetch(new URL(rel, itemBase).href);
    if (!res.ok) return undefined;
    return (await res.json()) as unknown;
  } catch {
    return undefined;
  }
}

async function getText(itemBase: string, rel: string): Promise<string | undefined> {
  try {
    const res = await fetch(new URL(rel, itemBase).href);
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

/**
 * Hydrate a crew source (folder-standard or inline) for rendering. Inline
 * shapes (legacy flat items, builder previews) pass through unchanged.
 */
export async function hydrateCrew(json: CrewDefinitionSource, itemBase: string): Promise<CrewDefinition> {
  const crew = json.crew;
  const out: CrewDefinition = {
    id: crew.id,
    name: crew.name,
    version: json.version,
    description: crew.description,
    author: crew.author,
    tags: crew.tags,
    workers: [],
    mcpServers: [],
    handoffs: [],
    entryPoints: [],
    createdAt: json.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: json.updatedAt ?? json.createdAt ?? "1970-01-01T00:00:00.000Z",
  };

  const workers = Array.isArray(json.workers) ? json.workers : [];
  for (const entry of workers) {
    if (typeof entry !== "string" || !isCrewPathEntry(entry)) {
      out.workers.push(entry as CrewWorker);
      continue;
    }
    const worker = (await getJson(itemBase, entry)) as CrewWorker | undefined;
    if (!worker) continue;
    const instr = worker.instructions;
    if (typeof instr === "string" && isCrewPathEntry(instr)) {
      const workerDir = entry.replace(/\/[^/]*$/, "");
      const body = await getText(itemBase, `${workerDir}/${instr}`);
      if (body !== undefined) worker.instructions = body.trim();
    }
    out.workers.push(worker);
  }

  if (typeof json.mcp === "string" && isCrewPathEntry(json.mcp)) {
    const servers = await getJson(itemBase, json.mcp);
    if (Array.isArray(servers)) out.mcpServers = servers as CrewMcpServer[];
  } else if (Array.isArray(json.mcpServers)) {
    out.mcpServers = json.mcpServers;
  }

  if (typeof json.graph === "string" && isCrewPathEntry(json.graph)) {
    const graph = (await getJson(itemBase, json.graph)) as { handoffs?: CrewHandoff[]; entryPoints?: string[] } | undefined;
    out.handoffs = graph?.handoffs ?? [];
    out.entryPoints = graph?.entryPoints ?? [];
  } else {
    out.handoffs = json.handoffs ?? [];
    out.entryPoints = json.entryPoints ?? [];
  }

  return out;
}
