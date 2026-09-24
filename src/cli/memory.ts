import fs from "node:fs/promises";
import path from "node:path";
import { detectHarnesses, instructionsFileFor } from "../adapters/index.js";
import type { HarnessSignal } from "../adapters/index.js";
import {
  addRecord,
  applyBlock,
  compileMemoryBlock,
  getRecord,
  listRecords,
  removeRecord,
  type MemoryRecord,
} from "../memory/index.js";
import { jsonOut } from "./json.js";
import { warnIfStandalone } from "./interactive.js";
import { resolveTargetFlag } from "./installed.js";

/**
 * ProAgents memory:
 *   proagent memory add <key> "<value>" [--scope <s>] [--tags a,b] [--provenance <p>]
 *   proagent memory list
 *   proagent memory show <key>
 *   proagent memory rm <key>
 *   proagent memory compile [--target <harness>]
 *
 * Explicit, JSON-only project memory (.proagent/memory/<key>.json) compiled
 * into the target harness's instructions file as a content-hashed block.
 */

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export async function runMemoryCommand(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  const json = flags.json === true;

  switch (sub) {
    case "add":
      return memoryAdd(rest, flags, json);
    case "list":
      return memoryList(json);
    case "show":
      return memoryShow(rest[0] ?? "", json);
    case "rm":
      return memoryRm(rest[0] ?? "", json);
    case "compile":
      return memoryCompile(flags, json);
    case "help":
    case undefined:
      console.log(`proagent memory — explicit project memory
  add <key> "<value>"    Record or update a memory entry
    --scope <s>          Scope label (e.g. "release", "api")
    --tags a,b           Comma-separated tags
    --provenance <p>     Who/what recorded it
  list                   List recorded entries (sorted by key)
  show <key>             Show one entry
  rm <key>               Delete an entry
  compile                Compile memory into the harness instructions file
    --target <harness>   Target harness instead of the detected one`);
      return;
    default:
      fail(`unknown memory subcommand "${sub}" (memory add|list|show|rm|compile)`);
  }
}

async function memoryAdd(args: string[], flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  warnIfStandalone("memory add", json);
  const key = args[0] ?? "";
  const value = args[1] ?? "";
  const scope = typeof flags.scope === "string" && flags.scope.length > 0 ? flags.scope : undefined;
  const tags = typeof flags.tags === "string" && flags.tags.length > 0
    ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const provenance = typeof flags.provenance === "string" && flags.provenance.length > 0 ? flags.provenance : undefined;

  const { record, updated, findings } = await addRecord(process.cwd(), { key, value, scope, tags, provenance });
  if (findings.length > 0) {
    for (const f of findings) console.error(`error: [${f.code}] ${f.message}`);
    console.error(`  → ${findings[0]?.suggestion}`);
    process.exit(1);
  }
  if (json) return jsonOut({ status: "ok", command: "memory add", key, updated, version: record.version, record });
  console.log(`${updated ? "Updated" : "Recorded"} memory "${key}" (v${record.version})${scope ? ` [${scope}]` : ""}:`);
  console.log(`  ${record.value}`);
}

async function memoryList(json: boolean): Promise<void> {
  warnIfStandalone("memory list", json);
  const records = await listRecords(process.cwd());
  const summary = { total: records.length };
  if (json) return jsonOut({ status: "ok", command: "memory list", records, summary });
  if (records.length === 0) {
    console.log("No memory recorded yet. Add one: proagent memory add <key> \"<value>\"");
    return;
  }
  console.log(`\nProject memory: ${summary.total} record(s)\n`);
  for (const r of records) {
    console.log(`  ◈ ${r.key} v${r.version}${r.scope ? ` [${r.scope}]` : ""} — ${r.value}`);
  }
  console.log("");
}

async function memoryShow(key: string, json: boolean): Promise<void> {
  warnIfStandalone("memory show", json);
  if (!key) fail("Usage: proagent memory show <key>");
  const record = await getRecord(process.cwd(), key);
  if (!record) fail(`no memory record "${key}"`);
  if (json) return jsonOut({ status: "ok", command: "memory show", record });
  console.log(`\n${record.key} (v${record.version})${record.scope ? ` [${record.scope}]` : ""}`);
  if (record.tags && record.tags.length > 0) console.log(`  tags: ${record.tags.join(", ")}`);
  if (record.provenance) console.log(`  provenance: ${record.provenance}`);
  console.log(`  ${record.value}`);
  console.log("");
}

async function memoryRm(key: string, json: boolean): Promise<void> {
  warnIfStandalone("memory rm", json);
  if (!key) fail("Usage: proagent memory rm <key>");
  const removed = await removeRecord(process.cwd(), key);
  if (json) return jsonOut({ status: "ok", command: "memory rm", key, removed });
  console.log(removed ? `Removed memory "${key}".` : `No memory record "${key}".`);
}

async function memoryCompile(flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  warnIfStandalone("memory compile", json);
  const root = process.cwd();
  const target: HarnessSignal = resolveTargetFlag(flags) ?? (await detectHarnesses(root, {})).primary;
  const records: MemoryRecord[] = await listRecords(root);
  if (records.length === 0) {
    if (json) return jsonOut({ status: "ok", command: "memory compile", target: target.id, file: instructionsFileFor(target.id), records: [], block: null, note: "no memory recorded — nothing compiled" });
    console.log("No memory recorded — nothing compiled.");
    return;
  }

  const block = compileMemoryBlock(records);
  const file = instructionsFileFor(target.id);
  const abs = path.join(root, file);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  let existing = "";
  try {
    existing = await fs.readFile(abs, "utf8");
  } catch {
    // New file.
  }
  await fs.writeFile(abs, applyBlock(existing, block), "utf8");

  if (json) return jsonOut({ status: "ok", command: "memory compile", target: target.id, file, records: records.map((r) => r.key), block });
  console.log(`\nCompiled ${records.length} memory record(s) into ${file} (target ${target.id}).\n`);
  for (const r of records.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`  ◈ ${r.key} v${r.version}${r.scope ? ` [${r.scope}]` : ""}`);
  }
  console.log("");
}