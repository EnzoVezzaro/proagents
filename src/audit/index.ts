import fs from "node:fs/promises";
import path from "node:path";
import { scanMcpConfig, scanPermissionConfig, scanRemoteExec, scanSecrets } from "./scanners.js";

/**
 * Deterministic repo auditor — the `proagent audit` engine.
 *
 * Pure scanning (src/audit/scanners.ts) plus a deterministic filesystem walk:
 * entries are visited in sorted order, findings are sorted by (file, code,
 * line), and no timestamps or randomness ever enter the report. Two audits of
 * the same tree always produce byte-identical output — the audit is part of
 * the deterministic core (AGENTS.md invariant 1).
 */

/** Small dirs that would swallow a walk without changing the verdict. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "site",
  "coverage",
  ".vitepress/cache",
  ".tmp-e2e",
  ".claude",
]);

/** Files scanned for secrets/remote-exec. Config-name list is separate below. */
const TEXT_SUFFIXES = [".md", ".mdx", ".txt", ".json", ".jsonc", ".yaml", ".yml", ".toml"];

/** Instruction surfaces where remote-exec pipelines are dangerous. */
const REMOTE_EXEC_FILES = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md"]);

/** MCP-config surfaces (parsed as JSON). */
const MCP_FILES = new Set([".mcp.json", "mcp.json", "opencode.json", "opencode.jsonc"]);

/** Permission-config surfaces (parsed as JSON). */
const PERMISSION_FILES = new Set(["opencode.json", "opencode.jsonc", ".claude/settings.json"]);

function scanableFile(name: string): boolean {
  if (name.startsWith(".env")) return true;
  if (TEXT_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return REMOTE_EXEC_FILES.has(name) || MCP_FILES.has(name) || PERMISSION_FILES.has(name) || name === ".cursorrules";
}

/** Recursive, deterministically-ordered file listing under `root`. */
async function listFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await listFiles(root, abs, out);
      continue;
    }
    if (!e.isFile() || !scanableFile(e.name)) continue;
    out.push(abs);
  }
  return out;
}

/**
 * Read one file as text; returns null for unreadable/binary/huge files so a
 * hostile tree degrades to a skip, never a crash.
 */
async function readText(abs: string): Promise<string | null> {
  try {
    const st = await fs.stat(abs);
    if (st.size > 512 * 1024) return null;
    const text = await fs.readFile(abs, "utf8");
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}

/** Run every applicable scanner over one file's text. Pure given content. */
export function auditText(rel: string, name: string, text: string) {
  const findings = [
    ...scanSecrets(text, rel),
    ...(REMOTE_EXEC_FILES.has(name) || name.endsWith(".md") || name.endsWith(".mdx") || name.endsWith(".txt")
      ? scanRemoteExec(text, rel)
      : []),
    ...(MCP_FILES.has(name) ? scanMcpConfig(text, rel) : []),
    ...(PERMISSION_FILES.has(name) ? scanPermissionConfig(text, rel) : []),
  ];
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code) || a.line - b.line);
}

/** Deterministic audit of a directory tree. */
export async function runAudit(root: string): Promise<{
  status: "ok";
  root: string;
  findings: ReturnType<typeof auditText>;
  summary: { total: number; errors: number; warnings: number };
  exit: number;
}> {
  const files = await listFiles(root);
  const findings = [];
  for (const abs of files) {
    const text = await readText(abs);
    if (text === null) continue;
    const rel = path.relative(root, abs);
    findings.push(...auditText(rel, path.basename(abs), text));
  }
  const total = findings.length;
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = total - errors;
  return {
    status: "ok",
    root,
    findings,
    summary: { total, errors, warnings },
    exit: errors > 0 ? 2 : warnings > 0 ? 1 : 0,
  };
}