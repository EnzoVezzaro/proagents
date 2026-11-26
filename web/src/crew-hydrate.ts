/**
 * Client-side hydration of unified-registry crew manifests (manifest.json is
 * a composition index: members/, coordination/, tasks/, workflows/,
 * handoffs/, rules/, verification/, mcp/). Mirrors
 * src/crew/hydrate.ts hydrateCrewRemote, but fetches relative to the catalog
 * item URL like profile-hydrate.ts. Tolerant: a file that fails to fetch is
 * skipped so the page still renders.
 */
import type {
  CrewDefinition,
  CrewDefinitionSource,
  CrewHandoff,
  CrewMcpServer,
  CrewMemberSource,
  CrewWorker,
} from "./types.js";

const CREW_PATH_RE = /^[A-Za-z0-9][\w./-]*\.json$/;

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

/** Deterministic member ids from profile slugs (-2/-3… on collision). */
function memberIds(members: Array<{ profile: string }>): string[] {
  const used = new Map<string, number>();
  return members.map((m) => {
    const n = (used.get(m.profile) ?? 0) + 1;
    used.set(m.profile, n);
    return n === 1 ? m.profile : `${m.profile}-${n}`;
  });
}

function memberToWorker(member: CrewMemberSource, id: string): CrewWorker {
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

function memberEntries(source: CrewDefinitionSource): Array<string | CrewMemberSource | CrewWorker> {
  if (Array.isArray(source.members)) return source.members as Array<string | CrewMemberSource>;
  if (Array.isArray(source.workers)) return source.workers as Array<string | CrewWorker>;
  return [];
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

  const readMd = async (rel: unknown): Promise<string | undefined> => {
    if (typeof rel !== "string" || !isCrewPathEntry(rel)) return undefined;
    const parsed = (await getJson(itemBase, rel)) as Record<string, unknown> | undefined;
    if (parsed === undefined) return undefined;
    const { body } = parsed as { body?: unknown };
    return typeof body === "string" ? body.trim() : undefined;
  };
  const readList = async (rels: unknown): Promise<string[]> => {
    if (!Array.isArray(rels)) return [];
    const list: string[] = [];
    for (const rel of rels) {
      if (typeof rel !== "string" || rel.trim() === "") continue;
      if (isCrewPathEntry(rel)) {
        const body = await readMd(rel);
        if (body !== undefined) list.push(body);
      } else {
        list.push(rel.trim());
      }
    }
    return list;
  };

  // Members (profile bindings) or legacy workers, in file order.
  const entries = memberEntries(json);
  const profileSeen: Array<{ profile: string }> = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      const e = entry as CrewMemberSource & CrewWorker;
      if ("profile" in e && typeof e.profile === "string" && e.profile && e.permissions) {
        const id = e.id ?? memberIds([...profileSeen, e]).pop()!;
        profileSeen.push({ profile: e.profile });
        out.workers.push(memberToWorker(e, id));
      } else {
        out.workers.push(e as CrewWorker);
      }
      continue;
    }
    if (!isCrewPathEntry(entry)) continue;
    const parsed = (await getJson(itemBase, entry)) as CrewMemberSource & CrewWorker | undefined;
    if (!parsed || typeof parsed !== "object") continue;
    if ("profile" in parsed && typeof parsed.profile === "string" && parsed.profile && parsed.permissions) {
      const id = parsed.id ?? memberIds([...profileSeen, parsed]).pop()!;
      profileSeen.push({ profile: parsed.profile });
      out.workers.push(memberToWorker(parsed, id));
    } else {
      // Worker-shaped member (no profile binding — dehydrated from a
      // profile-less crew) or a legacy worker.json: hydrate the instructions
      // path to prose when it is one.
      const worker = parsed as unknown as CrewWorker;
      const instr = worker.instructions;
      if (typeof instr === "string" && isCrewPathEntry(instr)) {
        const workerBase = new URL(entry, itemBase).href.replace(/[^/]*$/, "");
        const raw = await getText(workerBase, instr);
        if (raw !== undefined) worker.instructions = raw.trim();
      }
      if (!worker.description) worker.description = `Role in this crew: ${worker.role}.`;
      out.workers.push(worker);
    }
  }

  const mission = await readMd(json.mission);
  if (mission !== undefined) out.mission = mission;
  out.coordination = await readList(json.coordination);
  out.tasks = await readList(json.tasks);
  out.workflows = await readList(json.workflows);
  out.rules = await readList(json.rules);
  out.verification = await readList(json.verification);

  // Handoffs: inline objects, frontmatter contract files, or graph.json.
  const handoffList: CrewHandoff[] = [];
  if (Array.isArray(json.handoffs)) {
    for (const h of json.handoffs as Array<string | CrewHandoff>) {
      if (typeof h !== "string") {
        handoffList.push(h);
        continue;
      }
      if (!isCrewPathEntry(h)) continue;
      const parsed = (await getJson(itemBase, h)) as Partial<CrewHandoff> | undefined;
      if (parsed?.from && parsed.to && parsed.artifact) {
        handoffList.push({ from: parsed.from, to: parsed.to, artifact: parsed.artifact });
      }
    }
  } else if (typeof json.graph === "string" && isCrewPathEntry(json.graph)) {
    const g = (await getJson(itemBase, json.graph)) as { handoffs?: CrewHandoff[]; entryPoints?: string[] } | undefined;
    handoffList.push(...(g?.handoffs ?? []));
    out.entryPoints = (g?.entryPoints ?? []).map(String);
  }
  out.handoffs = handoffList;
  // Handoff docs stay out of `workflows`: their contracts already live in
  // out.handoffs (parsed from the same files' frontmatter). Appending the
  // prose to out.workflows here would re-duplicate it on every round trip
  // (mirrors src/crew/hydrate.ts).

  if (typeof json.mcp === "string" && isCrewPathEntry(json.mcp)) {
    const parsed = await getJson(itemBase, json.mcp);
    if (Array.isArray(parsed)) out.mcpServers = parsed as CrewMcpServer[];
  } else if (Array.isArray(json.mcpServers)) {
    out.mcpServers = json.mcpServers;
  }

  if (Array.isArray(json.entryPoints) && json.entryPoints.length > 0) {
    out.entryPoints = json.entryPoints.map(String);
  } else if (out.entryPoints.length === 0) {
    out.entryPoints = out.workers.filter((w) => (w.receivesFrom ?? []).length === 0).map((w) => w.id);
  }

  return out;
}
