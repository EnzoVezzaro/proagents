import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Explicit project memory — the `proagent memory` engine.
 *
 * JSON-only records stored one-per-file under `.proagent/memory/<key>.json`.
 * Every record is scope- and provenance-tagged by design, and the compiled
 * instruction block carries a content hash (never a timestamp), so compiling
 * the same store always yields byte-identical output — memory is part of the
 * deterministic core (AGENTS.md invariant 1).
 *
 * Memory is explicit: records are only ever written by `proagent memory add`
 * (or a human editing JSON). There is no raw-session learning path.
 */

export interface MemoryRecord {
  key: string;
  value: string;
  scope?: string;
  tags: string[];
  provenance?: string;
  version: number;
}

export interface MemoryInput {
  key: string;
  value: string;
  scope?: string;
  tags?: string[];
  provenance?: string;
}

export interface MemoryFinding {
  code: string;
  severity: "error" | "warning";
  key: string;
  message: string;
  suggestion: string;
}

/** Directory the record store lives in, relative to the repo root. */
export const MEMORY_DIR = path.join(".proagent", "memory");

/** Keys are portable, path-safe, kebab identifiers. */
export const KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Memory section marker preface for instruction surfaces. */
const BLOCK_START = "<!-- proagent:memory:start ";
const BLOCK_END = "<!-- proagent:memory:end ";

function recordPath(root: string, key: string): string {
  return path.join(root, MEMORY_DIR, `${key}.json`);
}

async function exists(root: string, rel: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

function validate(record: MemoryInput): MemoryFinding[] {
  const findings: MemoryFinding[] = [];
  const push = (code: string, key: string, message: string, suggestion: string): void => {
    findings.push({ code, severity: "error", key, message, suggestion });
  };
  if (!KEY_PATTERN.test(record.key)) {
    push(
      "ME001",
      record.key,
      `invalid memory key "${record.key}"`,
      "keys must match [a-z][a-z0-9-]{0,63} (path-safe, kebab-case)",
    );
  }
  const value = record.value.trim();
  if (!value) {
    push("ME002", record.key, "memory value must not be empty", "pass a non-empty value string");
  }
  if (value.length > 2000) {
    push(
      "ME002",
      record.key,
      `memory value too long (${value.length} chars, max 2000)`,
      "keep a single memory record scoped and under 2000 chars",
    );
  }
  if (record.scope !== undefined && record.scope.length > 64) {
    push("ME003", record.key, `memory scope too long (${record.scope.length} chars, max 64)`, "use a short scope label like \"release\" or \"api\"");
  }
  for (const tag of record.tags ?? []) {
    if (!/^[a-z0-9-]{1,32}$/.test(tag)) {
      push("ME003", record.key, `invalid memory tag "${tag}"`, "tags must match [a-z0-9-]{1,32}");
      break;
    }
  }
  return findings;
}

/**
 * Add or update a memory record. Writes elevated to version N+1 on update;
 * a fresh record starts at version 1. Returns the persisted record.
 * Rejects invalid input with findings (ME001–ME003) — never silently mangles.
 */
export async function addRecord(root: string, input: MemoryInput): Promise<{ record: MemoryRecord; updated: boolean; findings: MemoryFinding[] }> {
  const findings = validate(input);
  if (findings.length > 0) return { record: { ...input, tags: input.tags ?? [], version: 0 }, updated: false, findings };

  const file = recordPath(root, input.key);
  let updated = false;
  let version = 1;
  try {
    const existing = JSON.parse(await fs.readFile(file, "utf8")) as Partial<MemoryRecord>;
    if (existing.key === input.key && typeof existing.version === "number") {
      version = existing.version + 1;
      updated = true;
    }
  } catch {
    // New record.
  }

  const record: MemoryRecord = {
    key: input.key,
    value: input.value,
    scope: input.scope,
    tags: input.tags ?? [],
    provenance: input.provenance,
    version,
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(record, null, 2) + "\n", "utf8");
  return { record, updated, findings };
}

/** Load one record; null when absent or unreadable. */
export async function getRecord(root: string, key: string): Promise<MemoryRecord | null> {
  try {
    const raw = JSON.parse(await fs.readFile(recordPath(root, key), "utf8")) as Partial<MemoryRecord>;
    if (raw.key !== key) return null;
    return {
      key,
      value: raw.value ?? "",
      scope: raw.scope,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      provenance: raw.provenance,
      version: typeof raw.version === "number" ? raw.version : 1,
    };
  } catch {
    return null;
  }
}

/** List all records, sorted by key — deterministic regardless of fs order. */
export async function listRecords(root: string): Promise<MemoryRecord[]> {
  const dir = path.join(root, MEMORY_DIR);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const records: MemoryRecord[] = [];
  for (const name of entries.sort()) {
    const key = name.slice(0, -".json".length);
    const record = await getRecord(root, key);
    if (record) records.push(record);
  }
  return records;
}

/** Delete a record; true when a file was removed. */
export async function removeRecord(root: string, key: string): Promise<boolean> {
  const file = recordPath(root, key);
  try {
    await fs.rm(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic content hash over a record set (sorted), used as the
 * instruction-block marker. Content-addressed — editing a record changes the
 * marker, so a stale compiled block is detectable without extra metadata.
 */
function hashRecords(records: MemoryRecord[]): string {
  const hash = createHash("sha256");
  for (const r of records) {
    hash.update(r.key).update("\0");
    hash.update(r.value).update("\0");
    hash.update(r.scope ?? "").update("\0");
    hash.update(r.tags.join(",")).update("\0");
    hash.update(`v${r.version}`);
    hash.update("\uffff");
  }
  return hash.digest("hex").slice(0, 12);
}

/**
 * Render the compiled memory block for an instructions file. Deterministic:
 * records are sorted by key and the marker is a content hash. Keys with no
 * scope are rendered without a scope tag; provenance is never compiled into
 * the block (it is a store concern, not agent context).
 */
export function compileMemoryBlock(records: MemoryRecord[]): string {
  const ordered = [...records].sort((a, b) => a.key.localeCompare(b.key));
  const marker = hashRecords(ordered);
  const lines: string[] = [];
  lines.push(`${BLOCK_START}${marker} -->`);
  lines.push(`# Project Memory (ProAgents)`);
  lines.push("");
  lines.push(`Explicit project knowledge recorded with \`proagent memory\`. Consult it before changing the areas it covers.`);
  lines.push("");
  for (const r of ordered) {
    const scope = r.scope ? ` (${r.scope})` : "";
    lines.push(`- **${r.key}**${scope} — ${r.value}`);
  }
  lines.push("");
  lines.push(`Memory is explicit knowledge — recorded, not inferred.`);
  lines.push(`${BLOCK_END}${marker} -->`);
  return lines.join("\n");
}

/**
 * Apply a compiled block to an instructions file: replace the existing memory
 * region between its markers, or append. Returns the new file content.
 */
export function applyBlock(existing: string, block: string): string {
  const start = existing.indexOf(BLOCK_START.trimEnd());
  if (start === -1) {
    return existing ? `${existing.replace(/\n+$/, "")}\n\n${block}\n` : `${block}\n`;
  }
  const endMark = `${BLOCK_END.trimEnd()}`;
  const end = existing.indexOf(endMark, start);
  const close = end !== -1 ? existing.indexOf("-->", end) : -1;
  const cut = close !== -1 ? close + 3 : existing.length;
  let head = existing.slice(0, start).replace(/\s+$/, "");
  return `${head}\n\n${block}\n${existing.slice(cut).replace(/^\s+/, "")}`;
}

/** For tests/docs only: does this file contain a memory block? */
export function hasBlock(content: string): boolean {
  return content.includes(BLOCK_START.trimEnd()) && content.includes(BLOCK_END.trimEnd());
}