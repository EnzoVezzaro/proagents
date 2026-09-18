/**
 * Crew folder standard — hydration between two shapes, mirroring the profile
 * standard (profiles/registry.ts):
 *
 *   source  (crew.json): crew metadata + paths — workers: ["workers/x/worker.json"],
 *                        mcp: "mcp/servers.json", graph: "graph.json"
 *   target  (CrewDefinition): plain inline definition the CLI/SPA/installer consume
 *
 * Tolerant by design: a missing section file leaves the path in place so
 * validation reports it instead of crashing. Deterministic: same folder →
 * same hydrated definition, always.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CrewDefinition,
  CrewDefinitionSource,
  CrewHandoff,
  CrewMcpServer,
  CrewWorker,
} from "./types.js";
import { CrewError } from "./types.js";

/**
 * A path-shaped entry: a bare relative file path ("workers/x/worker.json",
 * "graph.json", "instructions.md"). Prose never matches — it contains
 * spaces or lacks a .json/.md extension; URLs and absolutes are excluded.
 */
const CREW_PATH_RE = /^[A-Za-z0-9][\w./-]*\.(?:json|md)$/;

export function isCrewPathEntry(entry: string): boolean {
  return (
    typeof entry === "string" &&
    CREW_PATH_RE.test(entry) &&
    !entry.includes("..") &&
    !entry.startsWith("/") &&
    !/^[a-z]+:$/i.test(entry.split("/")[0] ?? "")
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

async function parseJsonEntry(readFile: (rel: string) => Promise<string | undefined>, rel: string): Promise<unknown> {
  const raw = await readFile(rel);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Local hydration
// ---------------------------------------------------------------------------

/**
 * Hydrate a crew source (folder-standard or inline) from a directory into a
 * plain CrewDefinition. `dir` omitted → inline passthrough (no hydration).
 */
export async function hydrateCrewDefinition(source: CrewDefinitionSource, dir?: string): Promise<CrewDefinition> {
  if (!dir) {
    // Inline shape: workers/mcpServers/handoffs already carry content.
    return finalizeInline(source);
  }

  const readFile = async (rel: string): Promise<string | undefined> => {
    if (!isCrewPathEntry(rel)) return undefined;
    try {
      return await fs.readFile(path.join(dir, rel), "utf8");
    } catch {
      return undefined;
    }
  };

  const out: CrewDefinition = {
    id: source.crew.id,
    name: source.crew.name,
    version: source.version,
    description: source.crew.description,
    author: source.crew.author,
    tags: source.crew.tags,
    workers: [],
    mcpServers: [],
    handoffs: [],
    entryPoints: [],
    createdAt: source.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: source.updatedAt ?? source.createdAt ?? "1970-01-01T00:00:00.000Z",
  };

  // Workers: path entries hydrate from workers/<id>/worker.json; the worker
  // manifest's instructions path hydrates to the prose file's body.
  const workerEntries = Array.isArray(source.workers) ? source.workers : [];
  for (const entry of workerEntries) {
    if (typeof entry !== "string" || !isCrewPathEntry(entry)) {
      out.workers.push(entry as CrewWorker);
      continue;
    }
    const json = (await parseJsonEntry(readFile, entry)) as CrewWorker | undefined;
    if (!json) {
      // Tolerant: keep the path so validation reports the missing manifest.
      out.workers.push({
        id: path.basename(path.dirname(entry)),
        name: path.basename(path.dirname(entry)),
        role: "unknown",
        description: `missing worker manifest: ${entry}`,
        permissions: { read: "none", write: "none", production: "none", secrets: "none", tools: [] },
        mcpServers: [],
        context: [],
        instructions: entry,
        receivesFrom: [],
        emits: [],
      });
      continue;
    }
    out.workers.push(await hydrateWorker(json, path.dirname(entry), readFile));
  }

  // MCP servers: path to mcp/servers.json, or inline list.
  if (typeof source.mcp === "string" && isCrewPathEntry(source.mcp)) {
    const json = await parseJsonEntry(readFile, source.mcp);
    if (Array.isArray(json)) out.mcpServers = json as CrewMcpServer[];
  } else if (Array.isArray(source.mcpServers)) {
    out.mcpServers = source.mcpServers;
  }

  // Graph: path to graph.json, or inline handoffs/entryPoints.
  if (typeof source.graph === "string" && isCrewPathEntry(source.graph)) {
    const json = (await parseJsonEntry(readFile, source.graph)) as { handoffs?: CrewHandoff[]; entryPoints?: string[] } | undefined;
    out.handoffs = json?.handoffs ?? [];
    out.entryPoints = asStringArray(json?.entryPoints);
  } else {
    out.handoffs = source.handoffs ?? [];
    out.entryPoints = source.entryPoints ?? [];
  }

  return out;
}

/** Hydrate one worker manifest: its instructions path → prose body. */
async function hydrateWorker(
  worker: CrewWorker,
  workerDir: string,
  readFile: (rel: string) => Promise<string | undefined>,
): Promise<CrewWorker> {
  const instr = worker.instructions;
  if (typeof instr === "string" && isCrewPathEntry(instr)) {
    const raw = await readFile(path.join(workerDir, instr));
    return { ...worker, instructions: raw !== undefined ? raw.trim() : instr };
  }
  return worker;
}

/** Inline source → definition (builder output, legacy flat items). */
function finalizeInline(source: CrewDefinitionSource): CrewDefinition {
  return {
    id: source.crew.id,
    name: source.crew.name,
    version: source.version,
    description: source.crew.description,
    author: source.crew.author,
    tags: source.crew.tags,
    workers: (Array.isArray(source.workers) ? source.workers : []).map((w) =>
      typeof w === "string" ? (w as unknown as CrewWorker) : (w as CrewWorker),
    ),
    mcpServers: source.mcpServers ?? [],
    handoffs: source.handoffs ?? [],
    entryPoints: source.entryPoints ?? [],
    createdAt: source.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: source.updatedAt ?? source.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

/**
 * Load a crew definition from a local crew.json (folder standard) or a flat
 * inline definition file. Deterministic; throws CREW_NOT_FOUND when missing.
 */
export async function loadCrewFile(file: string): Promise<CrewDefinition> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    throw new CrewError("CREW_NOT_FOUND", `crew manifest not found: ${file}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new CrewError("CREW_CONFIG_ERROR", `not valid JSON: ${file} (${(err as Error).message})`);
  }
  const source = asCrewSource(json, file);
  const hasPaths =
    source.workers.some((w) => typeof w === "string" && isCrewPathEntry(w)) ||
    typeof source.mcp === "string" ||
    typeof source.graph === "string";
  return hydrateCrewDefinition(source, hasPaths ? path.dirname(file) : undefined);
}

/** Shape-check + normalize any accepted crew source shape. */
export function asCrewSource(json: unknown, file?: string): CrewDefinitionSource {
  const j = json as Partial<CrewDefinition> & Partial<CrewDefinitionSource>;
  // Folder standard: { version, crew: {...}, workers: [...] }.
  if (j && typeof j === "object" && typeof j.crew === "object" && j.crew !== null) {
    return j as CrewDefinitionSource;
  }
  // Legacy flat: a full CrewDefinition. Wrap it so hydration passes through.
  if (j && typeof j === "object" && typeof j.id === "string" && Array.isArray(j.workers)) {
    const def = j as CrewDefinition;
    return {
      version: def.version,
      crew: { id: def.id, name: def.name, description: def.description, author: def.author, tags: def.tags },
      workers: def.workers,
      mcpServers: def.mcpServers,
      handoffs: def.handoffs,
      entryPoints: def.entryPoints,
      createdAt: def.createdAt,
      updatedAt: def.updatedAt,
    };
  }
  throw new CrewError("CREW_CONFIG_ERROR", `not a crew manifest${file ? `: ${file}` : ""}`);
}

// ---------------------------------------------------------------------------
// Remote hydration (raw.githubusercontent.com), mirroring fetchProfileManifest
// ---------------------------------------------------------------------------

/**
 * Hydrate a crew source over an injected reader (remote catalog, tests).
 * Path entries resolve through `getRaw`; unreadable entries are skipped
 * (remote-side validation reports the gaps).
 */
export async function hydrateCrewRemote(
  json: unknown,
  getRaw: (rel: string) => Promise<string | undefined>,
): Promise<CrewDefinition> {
  const source = asCrewSource(json);
  const readFile = async (rel: string): Promise<string | undefined> => {
    if (!isCrewPathEntry(rel)) return undefined;
    return getRaw(rel);
  };

  const out: CrewDefinition = {
    id: source.crew.id,
    name: source.crew.name,
    version: source.version,
    description: source.crew.description,
    author: source.crew.author,
    tags: source.crew.tags,
    workers: [],
    mcpServers: [],
    handoffs: [],
    entryPoints: [],
    createdAt: source.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: source.updatedAt ?? source.createdAt ?? "1970-01-01T00:00:00.000Z",
  };

  for (const entry of Array.isArray(source.workers) ? source.workers : []) {
    if (typeof entry !== "string" || !isCrewPathEntry(entry)) {
      out.workers.push(entry as CrewWorker);
      continue;
    }
    const raw = await readFile(entry);
    if (raw === undefined) continue;
    try {
      const worker = JSON.parse(raw) as CrewWorker;
      const workerDir = path.posix.dirname(entry);
      const instr = worker.instructions;
      if (typeof instr === "string" && isCrewPathEntry(instr)) {
        const instrRaw = await readFile(path.posix.join(workerDir, instr));
        if (instrRaw !== undefined) worker.instructions = instrRaw.trim();
      }
      out.workers.push(worker);
    } catch {
      // Malformed worker manifest: skip (remote validation reports missing).
    }
  }

  if (typeof source.mcp === "string" && isCrewPathEntry(source.mcp)) {
    const raw = await readFile(source.mcp);
    if (raw !== undefined) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) out.mcpServers = parsed as CrewMcpServer[];
      } catch {
        /* tolerant */
      }
    }
  } else if (Array.isArray(source.mcpServers)) {
    out.mcpServers = source.mcpServers;
  }

  if (typeof source.graph === "string" && isCrewPathEntry(source.graph)) {
    const raw = await readFile(source.graph);
    if (raw !== undefined) {
      try {
        const g = JSON.parse(raw) as { handoffs?: CrewHandoff[]; entryPoints?: string[] };
        out.handoffs = g.handoffs ?? [];
        out.entryPoints = asStringArray(g.entryPoints);
      } catch {
        /* tolerant */
      }
    }
  } else {
    out.handoffs = source.handoffs ?? [];
    out.entryPoints = source.entryPoints ?? [];
  }

  return out;
}

// ---------------------------------------------------------------------------
// Dehydration: definition → folder files (used by publish + the sync script)
// ---------------------------------------------------------------------------

export interface CrewFolderFiles {
  "crew.json": string;
  "graph.json": string;
  "mcp/servers.json": string;
  [workerFile: string]: string;
}

/**
 * Dehydrate a definition into the folder standard's file set. Deterministic
 * (key order = worker order; stable JSON, 2-space indent).
 */
export function dehydrateCrew(crew: CrewDefinition): CrewFolderFiles {
  const files: CrewFolderFiles = {
    "crew.json": "",
    "graph.json": "",
    "mcp/servers.json": "",
  };
  files["graph.json"] = JSON.stringify({ handoffs: crew.handoffs, entryPoints: crew.entryPoints }, null, 2) + "\n";
  files["mcp/servers.json"] = JSON.stringify(crew.mcpServers, null, 2) + "\n";
  const workerPaths: string[] = [];
  for (const w of crew.workers) {
    const dir = `workers/${w.id}`;
    const instrFile = w.instructions && w.instructions.trim() ? `${dir}/instructions.md` : undefined;
    const workerJson: Record<string, unknown> = {
      id: w.id,
      name: w.name,
      role: w.role,
      description: w.description,
      ...(w.profile ? { profile: w.profile } : {}),
      permissions: w.permissions,
      mcpServers: w.mcpServers,
      context: w.context,
      ...(instrFile ? { instructions: instrFile } : {}),
      receivesFrom: w.receivesFrom,
      emits: w.emits,
    };
    files[`${dir}/worker.json`] = JSON.stringify(workerJson, null, 2) + "\n";
    if (instrFile) files[instrFile] = w.instructions.trim() + "\n";
    workerPaths.push(`${dir}/worker.json`);
  }
  files["crew.json"] =
    JSON.stringify(
      {
        version: crew.version,
        crew: { id: crew.id, name: crew.name, description: crew.description, author: crew.author, tags: crew.tags },
        workers: workerPaths,
        mcp: "mcp/servers.json",
        graph: "graph.json",
        createdAt: crew.createdAt,
        updatedAt: crew.updatedAt,
      },
      null,
      2,
    ) + "\n";
  return files;
}

/** Write a dehydrated crew folder to disk (publish/local materialization). */
export async function writeCrewFolder(crew: CrewDefinition, dir: string): Promise<string[]> {
  const files = dehydrateCrew(crew);
  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    written.push(rel);
  }
  return written;
}
