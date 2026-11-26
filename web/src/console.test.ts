import { describe, expect, it } from "vitest";
import {
  parseConsoleReport,
  sortFindings,
  codeInfo,
  deriveExit,
  summarizeFindings,
  type ConsoleReport,
  type Finding,
} from "./console.js";

/**
 * CONSOLE — pure client-side normalization of the CLI's `--json`
 * introspection output (doctor, audit, list-installed, memory list/compile).
 * The Studio is a browser-only island and cannot read the local repo, so the
 * user pastes/loads the CLI JSON; this module validates its shape,
 * distinguishes report kinds deterministically, and re-derives summary data.
 * Shape errors are plain messages — the pinned DG/AU codes are facts the
 * renderer displays, not validation rules the app enforces.
 */

// Fixtures are the exact JSON documents pinned in docs/cli/json.md.

const doctorFixture = `{
  "status": "ok",
  "root": "/abs/path",
  "findings": [
    {
      "code": "DG002",
      "severity": "error",
      "file": ".agents/skills/senior-engineer/SKILL.md",
      "line": 1,
      "message": "profile \\"senior-engineer\\" is installed (manifest present) but its SKILL.md is missing",
      "suggestion": "repair restores it from the on-disk manifest: proagent repair"
    }
  ],
  "summary": { "total": 1, "errors": 1, "warnings": 0 },
  "exit": 2
}`;

const auditFixture = `{
  "status": "ok",
  "root": "/abs/path",
  "findings": [
    {
      "code": "AU001",
      "severity": "error",
      "file": "AGENTS.md",
      "line": 3,
      "message": "GitHub classic PAT detected in AGENTS.md",
      "suggestion": "Rotate the credential now, remove it from the tree, and keep secrets out of version control (e.g. .env + gitignore)."
    }
  ],
  "summary": { "total": 1, "errors": 1, "warnings": 0 },
  "exit": 2
}`;

const installedFixture = `{
  "status": "ok",
  "root": "/abs/path",
  "profiles": [
    { "dir": ".agents/skills/senior-engineer", "slug": "senior-engineer", "version": "1.1.0", "hasManifest": true, "hasSkill": true, "canonical": true }
  ],
  "crews": [
    { "dir": ".agents/crews/guard", "id": "guard", "version": "1.0.0", "hasSkill": true }
  ],
  "blocks": [
    { "file": "AGENTS.md", "marker": "ab12cd34ef56", "line": 3, "closed": true, "title": "Senior Engineer" }
  ],
  "summary": { "profiles": 1, "crews": 1, "blocks": 1 }
}`;

const memoryListFixture = `{
  "status": "ok",
  "command": "memory list",
  "records": [
    { "key": "beta", "value": "z", "tags": [], "version": 1 },
    { "key": "alpha", "value": "a", "scope": "release", "tags": ["release"], "version": 2 }
  ],
  "summary": { "total": 2 }
}`;

const memoryCompileFixture = `{
  "status": "ok",
  "command": "memory compile",
  "target": "codex",
  "file": "AGENTS.md",
  "records": ["deploy-window"],
  "block": "<!-- proagent:memory:start … <!-- proagent:memory:end -->"
}`;

describe("parseConsoleReport — kind detection (CONSOLE-DET)", () => {
  it("CONSOLE-DET-001: doctor JSON parses without a hint (DG codes)", () => {
    const r = parseConsoleReport(doctorFixture);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("doctor");
    const doc = r.report as Extract<ConsoleReport, { kind: "doctor" }>;
    expect(doc.root).toBe("/abs/path");
    expect(doc.summary).toEqual({ total: 1, errors: 1, warnings: 0 });
    expect(doc.exit).toBe(2);
    expect(doc.findings[0]!.code).toBe("DG002");
    expect(doc.findings[0]!.severity).toBe("error");
    expect(doc.findings[0]!.line).toBe(1);
  });

  it("CONSOLE-DET-002: audit JSON is distinguished from doctor by AU code prefix (no hint)", () => {
    const r = parseConsoleReport(auditFixture);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("audit");
    const a = r.report as Extract<ConsoleReport, { kind: "audit" }>;
    expect(a.findings[0]!.code).toBe("AU001");
    expect(a.summary).toEqual({ total: 1, errors: 1, warnings: 0 });
  });

  it("CONSOLE-DET-003: mixed/empty findings without a hint default to doctor", () => {
    const empty = `{ "status": "ok", "root": "/r", "findings": [], "summary": { "total": 0, "errors": 0, "warnings": 0 }, "exit": 0 }`;
    const r = parseConsoleReport(empty);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("doctor");
  });

  it("CONSOLE-DET-004: a hint disambiguates an empty findings payload", () => {
    const empty = `{ "status": "ok", "root": "/r", "findings": [], "summary": { "total": 0, "errors": 0, "warnings": 0 }, "exit": 0 }`;
    const r = parseConsoleReport(empty, "audit");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("audit");
  });

  it("CONSOLE-DET-005: list-installed JSON recognized by profiles/crews/blocks arrays", () => {
    const r = parseConsoleReport(installedFixture);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("list-installed");
    const inv = r.report as Extract<ConsoleReport, { kind: "list-installed" }>;
    expect(inv.profiles[0]).toMatchObject({ slug: "senior-engineer", canonical: true });
    expect(inv.crews[0]).toMatchObject({ id: "guard", hasSkill: true });
    expect(inv.blocks[0]).toMatchObject({ marker: "ab12cd34ef56", closed: true });
    expect(inv.summary).toEqual({ profiles: 1, crews: 1, blocks: 1 });
  });

  it("CONSOLE-DET-006: memory list recognized by command discriminator", () => {
    const r = parseConsoleReport(memoryListFixture);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("memory-list");
    const m = r.report as Extract<ConsoleReport, { kind: "memory-list" }>;
    // records are surfaced sorted by key regardless of paste order
    expect(m.records.map((rec) => rec.key)).toEqual(["alpha", "beta"]);
    expect(m.summary).toEqual({ total: 2 });
    expect(m.records[0]!.scope).toBe("release");
  });

  it("CONSOLE-DET-007: memory compile recognized by command discriminator", () => {
    const r = parseConsoleReport(memoryCompileFixture);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.report.kind).toBe("memory-compile");
    const c = r.report as Extract<ConsoleReport, { kind: "memory-compile" }>;
    expect(c.target).toBe("codex");
    expect(c.file).toBe("AGENTS.md");
    expect(c.records).toEqual(["deploy-window"]);
    expect(c.block).toContain("proagent:memory:start");
  });
});

describe("parseConsoleReport — shape validation (CONSOLE-SHAPE)", () => {
  it("CONSOLE-SHAPE-001: invalid JSON yields an ok:false result with a message", () => {
    const r = parseConsoleReport("{ nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it("CONSOLE-SHAPE-002: a findings payload missing findings[] is rejected", () => {
    const r = parseConsoleReport(`{ "status": "ok", "root": "/r" }`);
    expect(r.ok).toBe(false);
  });

  it("CONSOLE-SHAPE-003: findings missing message/suggestion keep shape but expose defaults", () => {
    const doc = `{ "status": "ok", "root": "/r", "findings": [{ "code": "DG005", "severity": "warning", "file": "AGENTS.md" }] }`;
    const r = parseConsoleReport(doc, "doctor");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    const f = (r.report as Extract<ConsoleReport, { kind: "doctor" }>).findings[0] as Finding;
    expect(f.file).toBe("AGENTS.md");
    expect(f.message.length).toBeGreaterThan(0);
  });

  it("CONSOLE-SHAPE-004: missing summary/exit are recomputed deterministically", () => {
    const doc = `{ "status": "ok", "root": "/r", "findings": [{ "code": "AU004", "severity": "warning", "file": ".mcp.json", "message": "m", "suggestion": "s" }] }`;
    const r = parseConsoleReport(doc, "audit");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    const a = r.report as Extract<ConsoleReport, { kind: "audit" }>;
    expect(a.summary).toEqual({ total: 1, errors: 0, warnings: 1 });
    expect(a.exit).toBe(1);
  });

  it("CONSOLE-SHAPE-005: list-installed rejects profiles that are not an array", () => {
    const r = parseConsoleReport(`{ "profiles": "oops", "crews": [], "blocks": [] }`);
    expect(r.ok).toBe(false);
  });

  it("CONSOLE-SHAPE-006: memory-list rejects malformed records entries", () => {
    const r = parseConsoleReport(`{ "command": "memory list", "records": [{ "key": 7 }] }`);
    expect(r.ok).toBe(false);
  });
});

describe("code tables (CONSOLE-CODES)", () => {
  it("CONSOLE-CODES-001: DG codes are known with pinned severity and family", () => {
    expect(codeInfo("DG002")).toMatchObject({ known: true, family: "DG", severity: "error" });
    expect(codeInfo("DG005")).toMatchObject({ known: true, family: "DG", severity: "warning" });
    expect(codeInfo("DG007")).toMatchObject({ known: true, family: "DG", severity: "warning" });
  });

  it("CONSOLE-CODES-002: AU codes are known with pinned severity and family", () => {
    expect(codeInfo("AU001").severity).toBe("error");
    expect(codeInfo("AU004").severity).toBe("warning");
    expect(codeInfo("AU005").severity).toBe("warning");
    expect(codeInfo("AU006").severity).toBe("error");
  });

  it("CONSOLE-CODES-003: unknown codes surface as unknown, not a crash", () => {
    expect(codeInfo("DG999")).toMatchObject({ known: false, family: "DG", severity: null });
    expect(codeInfo("NOPE")).toMatchObject({ known: false, family: "unknown", severity: null });
  });
});

describe("sorting and summary helpers (CONSOLE-AGG)", () => {
  it("CONSOLE-AGG-001: findings sort errors before warnings, then by code and file", () => {
    const findings: Finding[] = [
      { code: "DG005", severity: "warning", file: "AGENTS.md", message: "w" },
      { code: "DG002", severity: "error", file: ".skills/a/SKILL.md", message: "e" },
      { code: "DG001", severity: "error", file: "AGENTS.md", message: "e" },
    ];
    const sorted = sortFindings(findings);
    expect(sorted.map((f) => f.code)).toEqual(["DG001", "DG002", "DG005"]);
    expect(sorted[0]!.severity).toBe("error");
    expect(sorted[2]!.severity).toBe("warning");
  });

  it("CONSOLE-AGG-002: summarizeFindings counts severities from contents", () => {
    const findings: Finding[] = [
      { code: "A", severity: "error", file: "f", message: "m" },
      { code: "B", severity: "error", file: "f", message: "m" },
      { code: "C", severity: "warning", file: "f", message: "m" },
    ];
    expect(summarizeFindings(findings)).toEqual({ total: 3, errors: 2, warnings: 1 });
  });

  it("CONSOLE-AGG-003: deriveExit maps errors→2, warnings-only→1, clean→0", () => {
    expect(deriveExit(summarizeFindings([]))).toBe(0);
    expect(deriveExit({ total: 0, errors: 0, warnings: 1 })).toBe(1);
    expect(deriveExit({ total: 1, errors: 1, warnings: 0 })).toBe(2);
  });
});