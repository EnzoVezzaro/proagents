/**
 * Client-side hydration of path-format profile manifests (folder standard:
 * sections hold "section/NN-x.md" paths, tools is "tools/requirements.md").
 *
 * Mirrors src/profiles/registry.ts hydrateProfileManifest + the remote
 * hydration in fetchProfileManifest, but fetches section files relative to
 * the catalog item URL. Tolerant: a section file that fails to fetch leaves
 * the path in place, so the page still renders.
 */
import type { ProfileManifest, ProfileManifestSource } from "./types.js";
import { isPathEntry } from "./types.js";

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw.trim() };
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

/** Fetch + parse one section file relative to the item base URL. */
async function getSection(itemBase: string, rel: string): Promise<{ meta: Record<string, string>; body: string } | undefined> {
  try {
    const res = await fetch(new URL(rel, itemBase).href);
    if (!res.ok) return undefined;
    return parseFrontmatter(await res.text());
  } catch {
    return undefined;
  }
}

/** Hydrate a profile manifest (path-format or inline) for rendering. */
export async function hydrateProfile(json: ProfileManifestSource, itemBase: string): Promise<ProfileManifest> {
  const out = { ...json } as ProfileManifest;
  const readEntry = async (entry: string): Promise<string> => {
    if (typeof entry !== "string" || !isPathEntry(entry)) return entry;
    const file = await getSection(itemBase, entry);
    return file?.body || file?.meta.title || entry;
  };

  if (typeof json.identity === "string") {
    if (isPathEntry(json.identity)) {
      const file = await getSection(itemBase, json.identity);
      out.identity = { title: file?.meta.title ?? "", summary: file?.body ?? "" };
    } else {
      out.identity = { title: json.identity, summary: "" };
    }
  }

  for (const section of ["expertise", "methods", "rules", "policies", "standards"] as const) {
    const arr = out[section];
    if (Array.isArray(arr)) out[section] = await Promise.all(arr.map(readEntry));
  }

  if (Array.isArray(out.skills)) {
    const skills: string[] = [];
    const skillsDetail: NonNullable<ProfileManifest["skillsDetail"]> = { ...(out.skillsDetail ?? {}) };
    const skillBodies: NonNullable<ProfileManifest["skillBodies"]> = { ...(out.skillBodies ?? {}) };
    for (const entry of out.skills) {
      if (typeof entry !== "string" || !isPathEntry(entry)) {
        skills.push(entry);
        continue;
      }
      const file = await getSection(itemBase, entry);
      if (!file) {
        skills.push(entry);
        continue;
      }
      const { meta, body } = file;
      if (meta.ref) {
        skills.push(meta.ref);
        skillsDetail[meta.ref] = {
          skills: (meta.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          ...(meta.install ? { install: meta.install } : {}),
          ...(meta.note || body ? { note: meta.note || body } : {}),
        };
      } else {
        const name = meta.name ?? entry.replace(/^skills\//, "").replace(/\.md$/, "");
        skills.push(name);
        skillBodies[name] = { description: meta.description ?? "", body };
      }
    }
    out.skills = skills;
    if (Object.keys(skillsDetail).length > 0) out.skillsDetail = skillsDetail;
    if (Object.keys(skillBodies).length > 0) out.skillBodies = skillBodies;
  }

  if (typeof json.tools === "string") {
    if (isPathEntry(json.tools)) {
      const raw = await fetch(new URL(json.tools, itemBase).href)
        .then((r) => (r.ok ? r.text() : undefined))
        .catch(() => undefined);
      if (raw !== undefined) {
        const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        const parsed = m?.[1] ? ((await import("yaml")).parse(m[1]) as Record<string, unknown>) : {};
        const tools = { ...parsed } as { required?: unknown; optional?: unknown; forbidden?: unknown };
        if (!Array.isArray(tools.required)) tools.required = [];
        if (!Array.isArray(tools.optional)) delete tools.optional;
        if (!Array.isArray(tools.forbidden)) delete tools.forbidden;
        out.tools = tools as ProfileManifest["tools"];
      } else {
        out.tools = { required: [] };
      }
    } else {
      out.tools = { required: [] };
    }
  }

  if (out.verification) {
    out.verification = {
      required: await Promise.all((out.verification.required ?? []).map(readEntry)),
      optional: await Promise.all((out.verification.optional ?? []).map(readEntry)),
    };
  }

  if (Array.isArray(json.standards)) {
    const references: NonNullable<ProfileManifest["references"]> = {};
    for (const [i, entry] of json.standards.entries()) {
      if (typeof entry !== "string" || !isPathEntry(entry)) continue;
      const file = await getSection(itemBase, entry);
      if (file?.meta.url) {
        const name = out.standards?.[i] ?? file.meta.title ?? "unknown";
        references[name] = { url: file.meta.url, ...(file.meta.note ? { note: file.meta.note } : {}) };
      }
    }
    if (Object.keys(references).length > 0) out.references = references;
  }

  return out;
}
