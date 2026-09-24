import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli } from "../helpers/run-cli.js";

/**
 * MEMORY-CLI — JSON + exit-contract tests for the `proagent memory` group:
 *   memory add <key> "<value>" [--scope s] [--tags a,b] [--provenance p]
 *   memory list
 *   memory show <key>
 *   memory rm <key>
 *   memory compile [--target <harness>]
 *
 * JSON output is contract-pinned here so the group stays additive: every
 * handler emits `{ status, command, … }` and a fresh add reports `updated:false`
 * at `version:1` while an update reports `updated:true` at the bumped version.
 * The compiled instruction block is content-addressed, never timestamped —
 * determinism is part of the same invariant the doctor enforces.
 */

function makeRepo(files: Record<string, string> = {}): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "memory-cli-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

function run(root: string, args: string[]): string {
  return runCli(root, args, { input: "" });
}

function runFailing<A extends string[]>(
  root: string,
  args: A,
): { status: number; stdout: string } {
  try {
    run(root, args);
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "" };
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
}

describe("memory CLI: add/list/show/rm lifecycle", () => {
  it("memory add writes a record and reports updated:false at version 1 (JSON)", async () => {
    const root = await makeRepo();
    const out = JSON.parse(run(root, ["memory", "add", "deploy-window", "ship on thursdays", "--json"])) as {
      status: string;
      command: string;
      key: string;
      updated: boolean;
      version: number;
    };
    expect(out.status).toBe("ok");
    expect(out.command).toBe("memory add");
    expect(out.key).toBe("deploy-window");
    expect(out.updated).toBe(false);
    expect(out.version).toBe(1);
    const list = JSON.parse(run(root, ["memory", "list", "--json"])) as {
      status: string;
      command: string;
      summary: { total: number };
    };
    expect(list.status).toBe("ok");
    expect(list.command).toBe("memory list");
    expect(list.summary.total).toBe(1);
  });

  it("memory add on the same key bumps the version (updated:true, version 2)", async () => {
    const root = await makeRepo();
    run(root, ["memory", "add", "deploy-window", "v1", "--json"]);
    const out = JSON.parse(run(root, ["memory", "add", "deploy-window", "v2", "--json"])) as {
      updated: boolean;
      version: number;
      record: { version: number; value: string };
    };
    expect(out.updated).toBe(true);
    expect(out.version).toBe(2);
    expect(out.record.version).toBe(2);
    expect(out.record.value).toBe("v2");
  });

  it("memory show returns the stored record and memory rm removes it (removed:true then false)", async () => {
    const root = await makeRepo();
    run(root, ["memory", "add", "deploy-window", "ship on thursdays", "--scope", "release", "--json"]);
    const show = JSON.parse(run(root, ["memory", "show", "deploy-window", "--json"])) as {
      status: string;
      command: string;
      record: { key: string; scope: string; version: number };
    };
    expect(show.status).toBe("ok");
    expect(show.command).toBe("memory show");
    expect(show.record.key).toBe("deploy-window");
    expect(show.record.scope).toBe("release");
    expect(show.record.version).toBe(1);
    const rm = JSON.parse(run(root, ["memory", "rm", "deploy-window", "--json"])) as {
      status: string;
      command: string;
      key: string;
      removed: boolean;
    };
    expect(rm.status).toBe("ok");
    expect(rm.command).toBe("memory rm");
    expect(rm.removed).toBe(true);
    const again = JSON.parse(run(root, ["memory", "rm", "deploy-window", "--json"])) as { removed: boolean };
    expect(again.removed).toBe(false);
  });

  it("memory rm reports removed:false (still exit 0) for an unknown key", async () => {
    const root = await makeRepo();
    const rm = JSON.parse(run(root, ["memory", "rm", "missing-record", "--json"])) as {
      status: string;
      command: string;
      key: string;
      removed: boolean;
    };
    expect(rm.status).toBe("ok");
    expect(rm.command).toBe("memory rm");
    expect(rm.key).toBe("missing-record");
    expect(rm.removed).toBe(false);
  });
});

describe("memory CLI: compile (deterministic instruction block)", () => {
  it("memory compile emits a content-addressed block, sorted by key, with no timestamps", async () => {
    const root = await makeRepo();
    run(root, ["memory", "add", "api-shape", "PascalCase", "--json"]);
    run(root, ["memory", "add", "deploy-window", "ship on thursdays", "--json"]);
    const out = JSON.parse(run(root, ["memory", "compile", "--json"])) as {
      status: string;
      command: string;
      target: { id: string };
      records: string[];
      block: string;
    };
    expect(out.status).toBe("ok");
    expect(out.command).toBe("memory compile");
    expect(out.records).toEqual(["api-shape", "deploy-window"]);
    const marker = /proagent:memory:start ([a-f0-9]{12}) -->/.exec(out.block)?.[1];
    expect(marker).toMatch(/^[a-f0-9]{12}$/);
    expect(out.block.indexOf("api-shape")).toBeLessThan(out.block.indexOf("deploy-window"));
    expect(out.block).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
    expect(out.block).not.toMatch(/\b\d{2}:\d{2}(:\d{2})?\b/);
  });

  it("memory compile is deterministic: the same store compiles byte-identically", async () => {
    const root = await makeRepo();
    run(root, ["memory", "add", "deploy-window", "ship on thursdays", "--json"]);
    const a = JSON.parse(run(root, ["memory", "compile", "--json"])) as { block: string };
    const b = JSON.parse(run(root, ["memory", "compile", "--json"])) as { block: string };
    expect(a.block).toBe(b.block);
  });

  it("memory compile --target <id> targets the documented harness contract", async () => {
    const root = await makeRepo();
    run(root, ["memory", "add", "deploy-window", "ship on thursdays", "--json"]);
    const out = JSON.parse(run(root, ["memory", "compile", "--target", "codex", "--json"])) as {
      target: { id: string };
      file: string;
    };
    expect(out.target).toBe("codex");
    expect(out.file).toContain("AGENTS.md");
  });
});
