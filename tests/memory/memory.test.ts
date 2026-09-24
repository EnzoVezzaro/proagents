import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  addRecord,
  applyBlock,
  compileMemoryBlock,
  getRecord,
  listRecords,
  removeRecord,
} from "../../src/memory/index.js";

/**
 * MEMORY-CORE — the `proagent memory` engine contract.
 *
 * Memory is the deterministic core (AGENTS.md invariant 1): validation is
 * explicit and loud (ME001–ME003), updates bump a version instead of a
 * timestamp, listing is key-sorted, and the compiled instruction block is
 * content-addressed so that compiling the same store always yields byte-identical
 * output and a stale block is detectable by its content marker. These tests pin
 * that contract so the CLI and adapters never silently drift.
 *
 * ME001 invalid key | ME002 empty/oversized value | ME003 invalid scope/tags.
 */

let seed = 0;
async function makeRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `memory-core-${process.pid}-${seed++}-`));
  await fs.mkdir(path.join(root, ".proagent", "memory"), { recursive: true });
  return root;
}

describe("memory core (validation ME001–ME003)", () => {
  it("ME001: rejects an invalid key without writing", async () => {
    const root = await makeRepo();
    const { findings, updated, record } = await addRecord(root, { key: "Bad.Key", value: "x" });
    expect(updated).toBe(false);
    expect(findings.map((f) => f.code)).toEqual(["ME001"]);
    expect(findings[0]?.suggestion).toMatch(/kebab-case/);
    expect(record.version).toBe(0);
    expect(await listRecords(root)).toEqual([]);
  });

  it("ME002: rejects an empty value", async () => {
    const root = await makeRepo();
    const { findings, updated } = await addRecord(root, { key: "deploy-window", value: "   " });
    expect(updated).toBe(false);
    expect(findings.map((f) => f.code)).toEqual(["ME002"]);
  });

  it("ME002: rejects an oversized value (> 2000 chars)", async () => {
    const root = await makeRepo();
    const { findings, updated } = await addRecord(root, { key: "deploy-window", value: "x".repeat(2001) });
    expect(updated).toBe(false);
    expect(findings.map((f) => f.code)).toEqual(["ME002"]);
  });

  it("ME003: rejects an oversized scope and an invalid tag", async () => {
    const root = await makeRepo();
    const { findings } = await addRecord(root, {
      key: "deploy-window",
      value: "ship on thursdays",
      scope: "x".repeat(65),
      tags: ["UPPER CASE"],
    });
    expect(findings.map((f) => f.code)).toEqual(["ME003", "ME003"]);
  });

  it("ME001–ME003 all surface with suggestion strings when combined", async () => {
    const root = await makeRepo();
    const { findings } = await addRecord(root, {
      key: "Bad Key",
      value: "",
      tags: ["bad tag!"],
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("ME001");
    expect(codes).toContain("ME002");
    expect(codes).toContain("ME003");
    for (const f of findings) expect(f.suggestion.length).toBeGreaterThan(0);
  });
});

describe("memory core (record lifecycle)", () => {
  it("adds a fresh record at version 1, reports updated:false, and persists", async () => {
    const root = await makeRepo();
    const { record, updated, findings } = await addRecord(root, {
      key: "deploy-window",
      value: "ship on thursdays",
      scope: "release",
      tags: ["release", "ops"],
      provenance: "docs planning session",
    });
    expect(updated).toBe(false);
    expect(findings).toEqual([]);
    expect(record.version).toBe(1);
    expect(record.scope).toBe("release");
    expect(record.tags).toEqual(["release", "ops"]);
    expect(record.provenance).toBe("docs planning session");
    expect(await getRecord(root, "deploy-window")).toEqual({
      key: "deploy-window",
      value: "ship on thursdays",
      scope: "release",
      tags: ["release", "ops"],
      provenance: "docs planning session",
      version: 1,
    });
  });

  it("updates bump the version (2, 3, …) and report updated:true", async () => {
    const root = await makeRepo();
    await addRecord(root, { key: "deploy-window", value: "v1" });
    const second = await addRecord(root, { key: "deploy-window", value: "v2" });
    expect(second.updated).toBe(true);
    expect(second.record.version).toBe(2);
    const third = await addRecord(root, { key: "deploy-window", value: "v3" });
    expect(third.updated).toBe(true);
    expect(third.record.version).toBe(3);
    const stored = await getRecord(root, "deploy-window");
    expect(stored?.version).toBe(3);
    expect(stored?.value).toBe("v3");
  });

  it("getRecord returns null for an unknown key", async () => {
    const root = await makeRepo();
    expect(await getRecord(root, "nope")).toBeNull();
  });

  it("listRecords is key-sorted and removeRecord deletes + reports removed then false", async () => {
    const root = await makeRepo();
    await addRecord(root, { key: "zeta", value: "z" });
    await addRecord(root, { key: "alpha", value: "a" });
    await addRecord(root, { key: "mike", value: "m" });
    expect((await listRecords(root)).map((r) => r.key)).toEqual(["alpha", "mike", "zeta"]);
    expect(await removeRecord(root, "mike")).toBe(true);
    expect((await listRecords(root)).map((r) => r.key)).toEqual(["alpha", "zeta"]);
    expect(await removeRecord(root, "mike")).toBe(false);
    expect(await getRecord(root, "alpha")).not.toBeNull();
  });
});

describe("memory core (deterministic compile)", () => {
  it("compiling the same store twice yields byte-identical, content-addressed blocks", async () => {
    const root = await makeRepo();
    await addRecord(root, { key: "deploy-window", value: "ship on thursdays", scope: "release", tags: ["release"] });
    await addRecord(root, { key: "api-shape", value: "PascalCase", tags: ["api"] });
    const blockA = compileMemoryBlock(await listRecords(root));
    const blockB = compileMemoryBlock(await listRecords(root));
    expect(blockA).toBe(blockB);
    const markerA = /proagent:memory:start ([a-f0-9]{12}) -->/.exec(blockA)?.[1];
    const markerB = /proagent:memory:start ([a-f0-9]{12}) -->/.exec(blockB)?.[1];
    expect(markerA).toMatch(/^[a-f0-9]{12}$/);
    expect(markerA).toBe(markerB);
    expect(blockA.indexOf("api-shape")).toBeLessThan(blockA.indexOf("deploy-window"));
  });

  it("editing a record changes the content-addressed marker (stale block detectable)", async () => {
    const root = await makeRepo();
    await addRecord(root, { key: "api-shape", value: "PascalCase" });
    const before = /proagent:memory:start ([a-f0-9]{12}) -->/.exec(compileMemoryBlock(await listRecords(root)))?.[1];
    await addRecord(root, { key: "api-shape", value: "camelCase" });
    const after = /proagent:memory:start ([a-f0-9]{12}) -->/.exec(compileMemoryBlock(await listRecords(root)))?.[1];
    expect(before).not.toBe(after);
    expect(before).toMatch(/^[a-f0-9]{12}$/);
  });

  it("the compiled block never embeds timestamps or ISO dates (deterministic core)", async () => {
    const root = await makeRepo();
    await addRecord(root, { key: "api-shape", value: "PascalCase", provenance: "planned 2026-01-01" });
    const block = compileMemoryBlock(await listRecords(root));
    expect(block).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(block).not.toMatch(/\b\d{2}:\d{2}(:\d{2})?\b/);
    expect(block).not.toMatch(/ISO 8601/i);
    expect(block).not.toContain("planned 2026-01-01"); // provenance is store metadata, never compiled
    expect(compileMemoryBlock(await listRecords(root))).toBe(block); // deterministic
  });

  it("applyBlock appends once, then replaces the prior region in place (no duplication)", async () => {
    const existing = "# Project Notes\n\nplain text\n";
    const block = compileMemoryBlock([{ key: "deploy-window", value: "ship on thursdays", tags: [], version: 1 }]);
    const appended = applyBlock(existing, block);
    expect(appended).toContain("proagent:memory:start");
    expect(appended).toContain("ship on thursdays");
    expect(appended).toContain(existing.trim());
    const replaced = applyBlock(appended, block);
    expect((replaced.match(/proagent:memory:start/g) ?? []).length).toBe(1);
    expect((replaced.match(/proagent:memory:end/g) ?? []).length).toBe(1);
    expect(replaced).toContain("ship on thursdays");
  });
});
