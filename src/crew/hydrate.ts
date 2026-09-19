/**
 * Crew folder standard — hydration between two shapes, mirroring the profile
 * standard (profiles/registry.ts):
 *
 *   source  (crew.json): crew metadata + paths — members/, mission/,
 *                        coordination/, tasks/, workflows/, handoffs/,
 *                        rules/, verification/, tools/, mcp/
 *   target  (CrewDefinition): plain inline definition the CLI/SPA/installer consume
 *
 * The crew taxonomy answers team questions (why, who, what, how-together) and
 * is deliberately different from the profile taxonomy (who-is-this-agent):
 *
 *   mission/ members/ coordination/ tasks/ workflows/ handoffs/ rules/ verification/ tools/
 *
 * Members are composition units: each binds an existing Professional Profile
 * (its profession) to a pipeline role and an explicit permission model. The
 * profile carries expertise/methods/rules/verification; the crew carries
 * only team-level content.
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
  CrewMemberSource,
  CrewWorker,
} from "./types.js";
import { CrewError } from "./types.js";

/**
 * A path-shaped entry: a bare relative file path ("members/x.json",
 * "handoffs/01-a-to-b.md", "graph.json"). Prose never matches — it contains
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

/** Minimal YAML frontmatter parse (no dependency): `key: value` lines. */
function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: (m[2] ?? "").trim() };
}

/**
 * A handoff contract file: YAML frontmatter carries the structured edge
 * (from/to/artifact); the body is the prose contract. This is the same
 * round-trip trick profile standards use (url/note frontmatter).
 */
function handoffFromFrontmatter(text: string): { handoff?: CrewHandoff; body: string } {
  const { meta, body } = parseFrontmatter(text);
  if (meta.from && meta.to && meta.artifact) {
    return { handoff: { from: meta.from, to: meta.to, artifact: meta.artifact }, body };
  }
  return { body };
}

/** Parse tools/requirements.md YAML frontmatter into required-tool strings. */
function toolsFromFrontmatter(text: string): string[] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return [];
  const meta = parseFrontmatter(`---\n${m[1]}\n---\n`).meta;
  return meta.required ? meta.required.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Member → worker materialization
// ---------------------------------------------------------------------------

/**
 * Deterministic member id: the profile slug, uniquified with -2/-3… on
 * collision (two security engineers in one crew stay two distinct nodes).
 * The id is what handoffs/entryPoints/graph.json reference.
 */
export function memberIds(members: CrewMemberSource[]): string[] {
  const used = new Map<string, number>();
  return members.map((m) => {
    const base = m.profile;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/**
 * Materialize a member (profile binding) into a full worker node. The
 * profile's expertise/methods/rules/verification compile in at install time
 * (install.ts profileSections); here we produce the structural contract.
 */
export function memberToWorker(member: CrewMemberSource, id: string): CrewWorker {
  return {
    id,
    name: member.name ?? member.profile,
    role: member.role,
    description: `Operates as the ${member.profile} profile; role in this crew: ${member.role}.`,
    profile: member.profile,
    permissions: member.permissions,
    mcpServers: member.mcpServers ?? [],
    context: member.context ?? [],
    instructions: "",
    receivesFrom: member.receivesFrom ?? [],
    emits: member.emits ?? [],
  };
}

/** Shared extraction: accept both member arrays and legacy worker arrays. */
function memberEntries(source: CrewDefinitionSource): Array<string | CrewMemberSource | CrewWorker> {
  if (Array.isArray(source.members)) return source.members as Array<string | CrewMemberSource>;
  if (Array.isArray(source.workers)) return source.workers as Array<string | CrewWorker>;
  return [];
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
  const readMd = async (rel: unknown): Promise<string | undefined> => {
    if (typeof rel !== "string" || !isCrewPathEntry(rel)) return undefined;
    const raw = await readFile(rel);
    return raw === undefined ? undefined : raw.trim();
  };
  const readList = async (entries: unknown): Promise<string[]> => {
    if (!Array.isArray(entries)) return [];
    const out: string[] = [];
    for (const entry of entries) {
      if (typeof entry !== "string" || entry.trim() === "") continue;
      if (isCrewPathEntry(entry)) {
        const body = await readMd(entry);
        out.push(body ?? `[missing section file: ${entry}]`);
      } else {
        out.push(entry.trim()); // builder-provided inline prose
      }
    }
    return out;
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

  // Members: path entries to member files (profile bindings), legacy inline
  // worker objects pass through, legacy worker.json paths hydrate as before.
  const entries = memberEntries(source);
  for (const entry of entries) {
    if (typeof entry !== "string") {
      // Inline member (builder output — profile + permissions) or inline
      // worker (legacy). An explicit id wins over the derived slug.
      const e = entry as CrewMemberSource & CrewWorker;
      if ("profile" in e && typeof e.profile === "string" && e.profile && e.permissions) {
        const id = e.id ?? memberIds([...(out.workers.map((w) => ({ profile: w.profile ?? w.id })) as CrewMemberSource[]), e]).pop()!;
        out.workers.push(memberToWorker(e, id));
      } else {
        out.workers.push(e as CrewWorker);
      }
      continue;
    }
    if (!isCrewPathEntry(entry)) continue;
    const raw = await readFile(entry);
    if (raw === undefined) {
      // Tolerant: report via a placeholder worker so validation surfaces it.
      const slug = path.basename(entry, path.extname(entry));
      out.workers.push({
        id: slug.replace(/^\d+-/, ""),
        name: slug.replace(/^\d+-/, ""),
        role: "unknown",
        description: `missing member file: ${entry}`,
        permissions: { read: "none", write: "none", production: "none", secrets: "none", tools: [] },
        mcpServers: [],
        context: [],
        instructions: entry,
        receivesFrom: [],
        emits: [],
      });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      continue; // malformed member: remote/local validation reports the gap
    }
    const member = json as CrewMemberSource;
    if (!member || !member.permissions) continue;
    // Worker-shaped member (no profile binding): instructions carry the
    // operating model — dehydrated from a profile-less crew by build --kind
    // crew. Hydrated back as a plain worker, not a profile binding.
    if (typeof member.profile !== "string") {
      if (typeof (member as { instructions?: unknown }).instructions !== "string") continue;
      const wstem = path.basename(entry, path.extname(entry)).replace(/^\d+-/, "");
      out.workers.push({
        ...(member as unknown as CrewWorker),
        id: member.id ?? wstem,
        description: (member as { description?: string }).description ?? `Role in this crew: ${member.role}.`,
      });
      continue;
    }
    // Id precedence: explicit id field → filename stem (members/02-pipelines.json
    // → "pipelines") → profile slug, uniquified on collision.
    const stem = path.basename(entry, path.extname(entry)).replace(/^\d+-/, "");
    const id = member.id ?? (stem && stem !== member.profile ? stem : undefined) ??
      memberIds([...(out.workers.map((w) => ({ profile: w.profile ?? w.id })) as CrewMemberSource[]), member]).pop()!;
    out.workers.push(memberToWorker(member, id));
  }

  // Mission: path to mission/01-mission.md → prose.
  const mission = await readMd(source.mission);
  if (mission !== undefined) out.mission = mission;

  // Team-level doc sections.
  out.coordination = await readList(source.coordination);
  out.tasks = await readList(source.tasks);
  out.workflows = await readList(source.workflows);
  out.rules = await readList(source.rules);
  out.verification = await readList(source.verification);

  // Handoffs: three accepted shapes —
  //   1. legacy/inline objects ({ from, to, artifact })
  //   2. path entries to handoff contract files (frontmatter + prose)
  //   3. graph.json ({ handoffs, entryPoints }) — legacy layout
  const handoffList: CrewHandoff[] = [];
  if (Array.isArray(source.handoffs)) {
    for (const h of source.handoffs as Array<string | CrewHandoff>) {
      if (typeof h !== "string") {
        handoffList.push(h);
        continue;
      }
      if (!isCrewPathEntry(h)) continue;
      const raw = await readFile(h);
      if (raw === undefined) continue;
      const { handoff } = handoffFromFrontmatter(raw);
      if (handoff) handoffList.push(handoff);
    }
  } else if (typeof source.graph === "string" && isCrewPathEntry(source.graph)) {
    const json = (await parseJsonEntry(readFile, source.graph)) as { handoffs?: CrewHandoff[]; entryPoints?: string[] } | undefined;
    handoffList.push(...(json?.handoffs ?? []));
    out.entryPoints = asStringArray(json?.entryPoints);
  }
  out.handoffs = handoffList;
  // Handoff docs stay out of `workflows`: their contracts already live in
  // out.handoffs (parsed from the same files' frontmatter). Appending the
  // prose to out.workflows here would be re-serialized into workflows/ files
  // by dehydrateCrew and re-hydrated — duplicating it every round trip.

  // Crew-level tools: tools/requirements.md frontmatter (required list).
  if (typeof source.tools === "string" && isCrewPathEntry(source.tools)) {
    const raw = await readFile(source.tools);
    if (raw !== undefined) {
      const required = toolsFromFrontmatter(raw);
      if (required.length > 0) {
        out.rules = [...(out.rules ?? []), `Crew-level required tools: ${required.join(", ")}.`];
      }
    }
  }

  // MCP servers: path to mcp/servers.json, or inline list.
  if (typeof source.mcp === "string" && isCrewPathEntry(source.mcp)) {
    const json = await parseJsonEntry(readFile, source.mcp);
    if (Array.isArray(json)) out.mcpServers = json as CrewMcpServer[];
  } else if (Array.isArray(source.mcpServers)) {
    out.mcpServers = source.mcpServers;
  }

  // Entry points: explicit, or derived (members with no upstream).
  if (Array.isArray(source.entryPoints) && source.entryPoints.length > 0) {
    out.entryPoints = source.entryPoints;
  } else if (out.entryPoints.length === 0) {
    out.entryPoints = out.workers.filter((w) => (w.receivesFrom ?? []).length === 0).map((w) => w.id);
  }

  return out;
}

/** Inline source → definition (builder output, legacy flat items). */
function finalizeInline(source: CrewDefinitionSource): CrewDefinition {
  const entries = memberEntries(source);
  const inlineMembers = entries.filter(
    (e) => typeof e !== "string" && "profile" in (e as CrewMemberSource) && (e as CrewMemberSource).permissions,
  ) as CrewMemberSource[];
  const ids = memberIds(inlineMembers);
  let memberIdx = 0;
  const workers: CrewWorker[] = entries.map((e) => {
    if (typeof e === "string") return e as unknown as CrewWorker;
    const cand = e as CrewMemberSource & CrewWorker;
    if ("profile" in cand && typeof cand.profile === "string" && cand.profile && cand.permissions) {
      const id = cand.id ?? ids[memberIdx++] ?? cand.profile;
      return memberToWorker(cand, id);
    }
    return cand as CrewWorker;
  });
  const handoffs = (source.handoffs ?? []).filter((h): h is CrewHandoff => typeof h !== "string");
  return {
    id: source.crew.id,
    name: source.crew.name,
    version: source.version,
    description: source.crew.description,
    author: source.crew.author,
    tags: source.crew.tags,
    workers,
    mcpServers: source.mcpServers ?? [],
    handoffs,
    entryPoints: source.entryPoints ?? [],
    mission: typeof source.mission === "string" && !isCrewPathEntry(source.mission) ? source.mission : undefined,
    coordination: source.coordination,
    tasks: source.tasks,
    workflows: source.workflows,
    rules: source.rules,
    verification: source.verification,
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
    memberEntries(source).some((e) => typeof e === "string" && isCrewPathEntry(e)) ||
    typeof source.mission === "string" ||
    typeof source.tools === "string" ||
    typeof source.mcp === "string" ||
    typeof source.graph === "string" ||
    [source.coordination, source.tasks, source.workflows, source.rules, source.verification].some(
      (v) => Array.isArray(v) && v.some((e) => typeof e === "string" && isCrewPathEntry(e)),
    ) ||
    (Array.isArray(source.handoffs) && source.handoffs.some((h) => typeof h === "string" && isCrewPathEntry(h)));
  return hydrateCrewDefinition(source, hasPaths ? path.dirname(file) : undefined);
}

/** Shape-check + normalize any accepted crew source shape. */
export function asCrewSource(json: unknown, file?: string): CrewDefinitionSource {
  const j = json as Partial<CrewDefinition> & Partial<CrewDefinitionSource>;
  // Folder standard: { version, crew: {...}, members|workers: [...] }.
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
      mission: def.mission,
      coordination: def.coordination,
      tasks: def.tasks,
      workflows: def.workflows,
      rules: def.rules,
      verification: def.verification,
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

  // Members first: ids derive in file order.
  const entries = memberEntries(source);
  for (const entry of entries) {
    if (typeof entry !== "string") {
      const e = entry as CrewMemberSource & CrewWorker;
      if ("profile" in e && typeof e.profile === "string" && e.profile && e.permissions) {
        const id = e.id ?? memberIds([...(out.workers.map((w) => ({ profile: w.profile ?? w.id })) as CrewMemberSource[]), e]).pop()!;
        out.workers.push(memberToWorker(e, id));
      } else {
        out.workers.push(e as CrewWorker);
      }
      continue;
    }
    const raw = await readFile(entry);
    if (raw === undefined) continue;
    try {
      const jsonParsed = JSON.parse(raw) as CrewMemberSource & CrewWorker;
      if ("profile" in jsonParsed && typeof jsonParsed.profile === "string" && jsonParsed.profile && jsonParsed.permissions) {
        const stem = path.posix.basename(entry, path.posix.extname(entry)).replace(/^\d+-/, "");
        const id =
          jsonParsed.id ?? (stem && stem !== jsonParsed.profile ? stem : undefined) ??
          memberIds([...(out.workers.map((w) => ({ profile: w.profile ?? w.id })) as CrewMemberSource[]), jsonParsed]).pop()!;
        out.workers.push(memberToWorker(jsonParsed, id));
      } else {
        // Legacy worker.json: hydrate its instructions path to prose.
        const worker = jsonParsed as unknown as CrewWorker;
        const workerDir = path.posix.dirname(entry);
        const instr = worker.instructions;
        if (typeof instr === "string" && isCrewPathEntry(instr)) {
          const instrRaw = await readFile(path.posix.join(workerDir, instr));
          if (instrRaw !== undefined) worker.instructions = instrRaw.trim();
        }
        out.workers.push(worker);
      }
    } catch {
      // Malformed member/worker manifest: skip (remote validation reports missing).
    }
  }

  const readMd = async (rel: unknown): Promise<string | undefined> => {
    if (typeof rel !== "string" || !isCrewPathEntry(rel)) return undefined;
    const raw = await readFile(rel);
    return raw === undefined ? undefined : raw.trim();
  };
  const readList = async (rels: unknown): Promise<string[]> => {
    if (!Array.isArray(rels)) return [];
    const outList: string[] = [];
    for (const rel of rels) {
      if (typeof rel !== "string" || rel.trim() === "") continue;
      if (isCrewPathEntry(rel)) {
        const body = await readMd(rel);
        if (body !== undefined) outList.push(body);
      } else {
        outList.push(rel.trim()); // builder-provided inline prose
      }
    }
    return outList;
  };

  const mission = await readMd(source.mission);
  if (mission !== undefined) out.mission = mission;
  out.coordination = await readList(source.coordination);
  out.tasks = await readList(source.tasks);
  out.workflows = await readList(source.workflows);
  out.rules = await readList(source.rules);
  out.verification = await readList(source.verification);

  const handoffList: CrewHandoff[] = [];
  if (Array.isArray(source.handoffs)) {
    for (const h of source.handoffs as Array<string | CrewHandoff>) {
      if (typeof h !== "string") {
        handoffList.push(h);
        continue;
      }
      const raw = await readFile(h);
      if (raw === undefined) continue;
      const { handoff } = handoffFromFrontmatter(raw);
      if (handoff) handoffList.push(handoff);
    }
  } else if (typeof source.graph === "string" && isCrewPathEntry(source.graph)) {
    const raw = await readFile(source.graph);
    if (raw !== undefined) {
      try {
        const g = JSON.parse(raw) as { handoffs?: CrewHandoff[]; entryPoints?: string[] };
        handoffList.push(...(g.handoffs ?? []));
        out.entryPoints = asStringArray(g.entryPoints);
      } catch {
        /* tolerant */
      }
    }
  }
  out.handoffs = handoffList;
  // Handoff docs stay out of `workflows`: their contracts already live in
  // out.handoffs (parsed from the same files' frontmatter). Appending the
  // prose to out.workflows here would be re-serialized into workflows/ files
  // by dehydrateCrew and re-hydrated — duplicating it every round trip.

  if (typeof source.tools === "string" && isCrewPathEntry(source.tools)) {
    const raw = await readFile(source.tools);
    if (raw !== undefined) {
      const required = toolsFromFrontmatter(raw);
      if (required.length > 0) {
        out.rules = [...(out.rules ?? []), `Crew-level required tools: ${required.join(", ")}.`];
      }
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

  if (Array.isArray(source.entryPoints) && source.entryPoints.length > 0) {
    out.entryPoints = source.entryPoints;
  } else if (out.entryPoints.length === 0) {
    out.entryPoints = out.workers.filter((w) => (w.receivesFrom ?? []).length === 0).map((w) => w.id);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Dehydration: definition → folder files (used by publish + the sync script)
// ---------------------------------------------------------------------------

export interface CrewFolderFiles {
  "crew.json": string;
  "mcp/servers.json": string;
  [file: string]: string;
}

/**
 * Dehydrate a definition into the folder standard's file set — the
 * composition taxonomy:
 *
 *   crew.json, mcp/servers.json, mission/01-mission.md,
 *   members/NN-<id>.json, coordination/NN-*.md, tasks/NN-*.md,
 *   workflows/NN-*.md, handoffs/NN-*.md (frontmatter + prose),
 *   rules/NN-*.md, verification/NN-*.md
 *
 * Deterministic (key order = member order; stable JSON, 2-space indent).
 */
export function dehydrateCrew(crew: CrewDefinition): CrewFolderFiles {
  const files: CrewFolderFiles = {
    "crew.json": "",
    "mcp/servers.json": "",
  };
  files["mcp/servers.json"] = JSON.stringify(crew.mcpServers ?? [], null, 2) + "\n";

  const memberPaths: string[] = [];
  (crew.workers ?? []).forEach((w, i) => {
    const n = String(i + 1).padStart(2, "0");
    // Profile-backed workers dehydrate to member bindings (profile +
    // permissions, no instructions — the profile is the operating model).
    // Profile-less workers dehydrate to worker-shaped members (instructions
    // + permissions): a self-referential profile slug would fail install,
    // and the folder standard must round-trip both crew shapes.
    type WorkerShapedMember = Omit<CrewMemberSource, "profile"> & {
      profile?: string;
      instructions: string;
      description?: string;
    };
    const member: CrewMemberSource | WorkerShapedMember = w.profile
      ? {
          id: w.id,
          profile: w.profile,
          role: w.role,
          name: w.name,
          permissions: w.permissions,
          mcpServers: w.mcpServers,
          context: w.context,
          receivesFrom: w.receivesFrom,
          emits: w.emits,
        }
      : ({
          id: w.id,
          role: w.role,
          name: w.name,
          instructions: w.instructions || w.description,
          permissions: w.permissions,
          mcpServers: w.mcpServers,
          context: w.context,
          receivesFrom: w.receivesFrom,
          emits: w.emits,
        } satisfies WorkerShapedMember);
    const clean = JSON.parse(JSON.stringify(member)) as Record<string, unknown>; // drop undefined
    files[`members/${n}-${w.id}.json`] = JSON.stringify(clean, null, 2) + "\n";
    memberPaths.push(`members/${n}-${w.id}.json`);
  });

  const writeList = (dir: string, items: string[] | undefined) => {
    (items ?? []).forEach((body, i) => {
      const n = String(i + 1).padStart(2, "0");
      const slug = slugify(titleOf(body) || `${dir}-item`);
      files[`${dir}/${n}-${slug}.md`] = body.trim() + "\n";
    });
  };

  if (crew.mission?.trim()) files["mission/01-mission.md"] = crew.mission.trim() + "\n";
  writeList("coordination", crew.coordination);
  writeList("tasks", crew.tasks);
  writeList("workflows", crew.workflows);
  writeList("rules", crew.rules);
  writeList("verification", crew.verification);

  // Handoffs → frontmatter contract files.
  (crew.handoffs ?? []).forEach((h, i) => {
    const n = String(i + 1).padStart(2, "0");
    const lines = [
      "---",
      `from: ${h.from}`,
      `to: ${h.to}`,
      `artifact: ${h.artifact}`,
      "---",
      "",
      `\`${h.from}\` hands **${h.artifact}** to \`${h.to}\`.`,
      "",
    ];
    files[`handoffs/${n}-${h.from}-to-${h.to}.md`] = lines.join("\n");
  });

  files["crew.json"] =
    JSON.stringify(
      {
        version: crew.version,
        crew: { id: crew.id, name: crew.name, description: crew.description, author: crew.author, tags: crew.tags },
        ...(crew.mission?.trim() ? { mission: "mission/01-mission.md" } : {}),
        members: memberPaths,
        ...(listPaths("coordination", files).length > 0 ? { coordination: listPaths("coordination", files) } : {}),
        ...(listPaths("tasks", files).length > 0 ? { tasks: listPaths("tasks", files) } : {}),
        ...(listPaths("workflows", files).length > 0 ? { workflows: listPaths("workflows", files) } : {}),
        ...(Object.keys(files).some((f) => f.startsWith("handoffs/")) ? { handoffs: listPaths("handoffs", files) } : {}),
        ...(listPaths("rules", files).length > 0 ? { rules: listPaths("rules", files) } : {}),
        ...(listPaths("verification", files).length > 0 ? { verification: listPaths("verification", files) } : {}),
        mcp: "mcp/servers.json",
        createdAt: crew.createdAt,
        updatedAt: crew.updatedAt,
      },
      null,
      2,
    ) + "\n";
  return files;
}

/** Collect the already-written section files for a directory, in order. */
function listPaths(dir: string, files: CrewFolderFiles): string[] {
  return Object.keys(files)
    .filter((f) => f.startsWith(`${dir}/`) && f.endsWith(".md"))
    .sort();
}

function titleOf(body: string): string {
  const first = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("|"));
  const clean = (first ?? "").replace(/[*_`]/g, "");
  return clean.length > 48 ? clean.slice(0, 45) + "…" : clean;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "item"
  );
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
