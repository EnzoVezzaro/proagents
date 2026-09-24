import { type Finding, type ConsoleReport } from "./console-types.js";

/**
 * Console — the pure client-side reader for the CLI's `--json` introspection
 * output (doctor, audit, list-installed, memory). The Studio is a browser-only
 * island and cannot read the local repo, so the user pastes/loads the JSON the
 * CLI emits and this module normalizes it into a typed, deterministic report:
 * kind detection, shape validation, severity/exit re-derivation. The pinned
 * DG/AU code tables are display facts — the renderer annotates findings with
 * them, it never re-enforces them.
 */

export type { Finding, ConsoleReport };

/** Shape facts for one pinned inspection code. */
export interface CodeFact {
  /** "DG" | "AU" | "unknown". */
  family: string;
  known: boolean;
  severity: "error" | "warning" | null;
  meaning: string;
}

/** Pinned audit codes (docs/cli/json.md "audit"). */
const AUDIT_MEANINGS: Record<string, string> = {
  AU001: "exposed secret / private key material in a text file",
  AU003: "instruction pipes a remote fetch into a shell (curl | bash, iwr | iex, …)",
  AU004: "MCP server on a remote (non-localhost) http/sse transport",
  AU005: "MCP stdio launcher (npx/uvx/bunx) without a pinned version",
  AU006: "over-broad permission grant (*, bash:*, Bash(bash:*))",
};
const AUDIT_SEVERITY: Record<string, "error" | "warning"> = {
  AU001: "error",
  AU003: "error",
  AU004: "warning",
  AU005: "warning",
  AU006: "error",
};

/** Pinned doctor codes (docs/cli/json.md "doctor"). */
const DOCTOR_MEANINGS: Record<string, string> = {
  DG001: "manifest.json beside an installed skill is unreadable/invalid",
  DG002: "manifest present but SKILL.md missing",
  DG003: "instruction block start marker without a matching end marker",
  DG004: "more than one proagent: block region in one instructions file",
  DG005: "instruction block whose profile is not installed (stale after remove)",
  DG006: ".claude/settings.json is not valid JSON",
  DG007: ".mcp.json is not valid JSON",
};
const DOCTOR_SEVERITY: Record<string, "error" | "warning"> = {
  DG001: "error",
  DG002: "error",
  DG003: "error",
  DG004: "error",
  DG005: "warning",
  DG006: "warning",
  DG007: "warning",
};

export function codeInfo(code: string): CodeFact {
  if (AUDIT_MEANINGS[code]) {
    return { family: "AU", known: true, severity: AUDIT_SEVERITY[code] ?? "error", meaning: AUDIT_MEANINGS[code]! };
  }
  if (DOCTOR_MEANINGS[code]) {
    return { family: "DG", known: true, severity: DOCTOR_SEVERITY[code] ?? "error", meaning: DOCTOR_MEANINGS[code]! };
  }
  const family = /^DG/.test(code) ? "DG" : /^AU/.test(code) ? "AU" : "unknown";
  return { family, known: false, severity: null, meaning: "" };
}

function normSeverity(s: unknown): "error" | "warning" {
  return s === "error" ? "error" : "warning";
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Normalize one CLI finding entry (defaults message/suggestion/line). */
function normalizeFinding(raw: unknown): Finding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const code = asString(o.code, "");
  if (code.length === 0) return null;
  const meaning = codeInfo(code).meaning;
  return {
    code,
    severity: normSeverity(o.severity),
    file: asString(o.file, ""),
    line: asNum(o.line),
    message: asString(o.message, meaning.length > 0 ? meaning : "(no message)"),
    suggestion: asString(o.suggestion, ""),
  };
}

export function summarizeFindings(findings: Finding[]): { total: number; errors: number; warnings: number } {
  const errors = findings.filter((f) => f.severity === "error").length;
  return { total: findings.length, errors, warnings: findings.length - errors };
}

/** Exit contract shared by doctor and audit: 0 clean, 1 warnings, 2 errors. */
export function deriveExit(summary: { total: number; errors: number; warnings: number }): number {
  return summary.errors > 0 ? 2 : summary.warnings > 0 ? 1 : 0;
}

/** Deterministic render order: errors first, then code, then file. */
export function sortFindings(findings: Finding[]): Finding[] {
  const rank = (f: Finding): number => (f.severity === "error" ? 0 : 1);
  return [...findings].sort(
    (a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code) || a.file.localeCompare(b.file),
  );
}

export type ParseResult =
  | { ok: true; report: ConsoleReport }
  | { ok: false; errors: string[] };

function fail(errors: string[]): ParseResult {
  return { ok: false, errors };
}

function findingsReport(kind: "doctor" | "audit", root: string, findingsRaw: unknown): ParseResult {
  if (!Array.isArray(findingsRaw)) return fail(["Expected a findings[] array."]);
  const findings = findingsRaw.map(normalizeFinding).filter((f): f is Finding => f !== null);
  if (findings.length !== findingsRaw.length) return fail(["One or more findings lack a code."]);
  const summary = summarizeFindings(findings);
  const report: Extract<ConsoleReport, { kind: "doctor" | "audit" }> = {
    kind,
    root,
    findings: sortFindings(findings),
    summary,
    exit: deriveExit(summary),
  };
  return { ok: true, report: report as ConsoleReport };
}

/**
 * Parse pasted CLI JSON into a typed report. Kind detection uses structural
 * discriminators in priority order: the `command` field (memory list/compile),
 * then the presence of list-installed arrays, then finding code prefixes
 * (AU ⇒ audit, DG ⇒ doctor). An optional hint disambiguates empty/mixed
 * findings payloads; when neither applies the payload defaults to doctor.
 */
export function parseConsoleReport(raw: string, hint?: "doctor" | "audit"): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return fail([`Not valid JSON: ${(err as Error).message}`]);
  }
  if (typeof json !== "object" || json === null) return fail(["Expected a JSON object."]);
  const o = json as Record<string, unknown>;

  const command = asString(o.command, "");

  // memory compile — { status, command, target, file, records, block, note? }
  if (command === "memory compile") {
    const records: string[] = Array.isArray(o.records) ? o.records.filter((r): r is string => typeof r === "string") : [];
    return {
      ok: true,
      report: {
        kind: "memory-compile",
        target: asString(o.target, ""),
        file: asString(o.file, ""),
        records,
        block: typeof o.block === "string" ? o.block : null,
        note: asString(o.note, ""),
      },
    };
  }

  // memory list — { status, command, records, summary }
  if (command === "memory list") {
    if (!Array.isArray(o.records)) return fail(["Expected a records[] array."]);
    const records = o.records as unknown[];
    const cleaned = records.map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const r = raw as Record<string, unknown>;
      if (typeof r.key !== "string") return null;
      return {
        key: r.key,
        value: asString(r.value, ""),
        scope: asString(r.scope, "") || undefined,
        tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
        provenance: asString(r.provenance, "") || undefined,
        version: asNum(r.version) ?? 1,
      };
    });
    if (cleaned.some((r) => r === null)) return fail(["A record entry is missing its string key."]);
    const sorted = cleaned
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.key.localeCompare(b.key));
    return {
      ok: true,
      report: { kind: "memory-list", records: sorted, summary: { total: sorted.length } },
    };
  }

  // list-installed — { status, root, profiles, crews, blocks, summary }
  if (Array.isArray(o.profiles) || Array.isArray(o.crews) || Array.isArray(o.blocks)) {
    if (!Array.isArray(o.profiles) || !Array.isArray(o.crews) || !Array.isArray(o.blocks)) {
      return fail(["list-installed requires profiles[], crews[] and blocks[] arrays."]);
    }
    const profiles = o.profiles.map((p) => {
      const obj = (typeof p === "object" && p !== null ? p : {}) as Record<string, unknown>;
      return {
        dir: asString(obj.dir, ""),
        slug: asString(obj.slug, ""),
        version: asString(obj.version, ""),
        hasManifest: obj.hasManifest === true,
        hasSkill: obj.hasSkill === true,
        canonical: obj.canonical === true,
      };
    });
    const crews = o.crews.map((c) => {
      const obj = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>;
      return { dir: asString(obj.dir, ""), id: asString(obj.id, ""), version: asString(obj.version, ""), hasSkill: obj.hasSkill === true };
    });
    const blocks = o.blocks.map((b) => {
      const obj = (typeof b === "object" && b !== null ? b : {}) as Record<string, unknown>;
      return {
        file: asString(obj.file, ""),
        marker: asString(obj.marker, ""),
        line: asNum(obj.line),
        closed: obj.closed === true,
        title: asString(obj.title, ""),
      };
    });
    return {
      ok: true,
      report: {
        kind: "list-installed",
        root: asString(o.root, ""),
        profiles,
        crews,
        blocks,
        summary: { profiles: profiles.length, crews: crews.length, blocks: blocks.length },
      },
    };
  }

  // doctor / audit — { status, root, findings, summary, exit }
  if (Array.isArray(o.findings) || hint) {
    const prefix = Array.isArray(o.findings) && o.findings.length > 0
      ? asString((o.findings[0] as Record<string, unknown> | null)?.code, "")
      : "";
    const kind: "doctor" | "audit" = prefix.startsWith("AU")
      ? "audit"
      : hint === "audit"
        ? "audit"
        : "doctor";
    return findingsReport(kind, asString(o.root, ""), o.findings);
  }

  return fail(["JSON is not a recognized proagent report — expected doctor, audit, list-installed, memory list, or memory compile output."]);
}