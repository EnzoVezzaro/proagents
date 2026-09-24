import type { AuditFinding } from "./types.js";

/**
 * Deterministic audit scanners — pure functions: same input → same findings,
 * no IO, no model calls, no randomness (AGENTS.md invariant 1).
 *
 * Codes:
 *   AU001  exposed secret / private key material in a text file
 *   AU003  instruction that pipes a remote fetch into a shell (curl|bash & co)
 *   AU004  MCP server uses a remote (non-localhost) http/sse transport
 *   AU005  MCP stdio launcher (npx/uvx/bunx) is not version-pinned
 *   AU006  harness permission allows an arbitrary command / everything
 *
 * Line numbers are 1-based. Every finding carries a suggestion so the CLI
 * contract always has stable shape.
 */

/** High-signal secret patterns. Each must be long/anchored enough to avoid prose. */
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "GitHub classic PAT", re: /(?:^|[^A-Za-z0-9])ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  { label: "GitHub fine-grained PAT", re: /(?:^|[^A-Za-z0-9_])github_pat_[A-Za-z0-9_]{22,}(?![A-Za-z0-9_])/g },
  { label: "AWS access key", re: /(?:^|[^A-Z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/g },
  { label: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g },
  { label: "OpenAI-style API key", re: /(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9]{20,}(?![A-Za-z0-9_])/g },
  { label: "Slack token", re: /(?:^|[^A-Za-z0-9_])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9_-])/g },
];

/** Instruction-file patterns that fetch a remote script and execute it. The
 *  pipe must be a real pipe — a backslash-escaped `\|` documents the pattern
 *  in markdown and must not fire. */
const REMOTE_EXEC_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "curl | sh/bash", re: /curl\s+[^\n\\|]+(?<!\\)\|\s*(?:sudo\s+)?(?:ba)?sh\b/gm },
  { label: "wget | sh/bash", re: /wget\s+[^\n\\|]+(?<!\\)\|\s*(?:sudo\s+)?(?:ba)?sh\b/gm },
  { label: "iwr | iex (PowerShell)", re: /iwr\s+[^\n\\|]+(?<!\\)\|\s*iex\b/gim },
  { label: "source <(curl …)", re: /source\s*<\(\s*(?:curl|wget)\b/gim },
  { label: "bash <(curl …)", re: /(?:ba)?sh\s*<\(\s*(?:curl|wget)\b/gim },
  { label: "sh -c \"$(curl …)\"", re: /(?:ba)?sh\s+-c\s+["']?[^"'\n]*\$\(?\s*(?:curl|wget)\b/gim },
];

/** Launcher words that fetch packages at runtime; must resolve a version to be safe. */
const UNPINNED_LAUNCHERS = ["npx", "npx --yes", "npx -y", "uvx", "bunx"];

/** Local hosts that are acceptable for an MCP http/sse transport. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return "";
  }
}

function report(
  code: string,
  severity: AuditFinding["severity"],
  file: string,
  line: number,
  message: string,
  suggestion: string,
): AuditFinding {
  return { code, severity, file, line, message, suggestion };
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/** AU001 — exposed secrets / private key material. */
export function scanSecrets(text: string, file: string): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const { label, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push(
        report(
          "AU001",
          "error",
          file,
          lineAt(text, m.index),
          `${label} detected in ${file}`,
          "Rotate the credential now, remove it from the tree, and keep secrets out of version control (e.g. .env + gitignore).",
        ),
      );
    }
  }
  return out;
}

/** AU003 — remote-fetch-piped-to-shell in instruction files. */
export function scanRemoteExec(text: string, file: string): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const { label, re } of REMOTE_EXEC_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push(
        report(
          "AU003",
          "error",
          file,
          lineAt(text, m.index),
          `${label} — instructions pipe a remote fetch into a shell (${m[0].trim()})`,
          "Download to a pinned file, verify its checksum, and execute explicitly — never pipe remote content into bash.",
        ),
      );
    }
  }
  return out;
}

/**
 * AU004 + AU005 — MCP server surface. Understands both the flat Claude/Codex
 * shape ({ "name": { "command"/"url" } }) and opencode's { mcp: { servers } }.
 */
export function scanMcpConfig(raw: string, file: string): AuditFinding[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof doc !== "object" || doc === null) return [];

  const servers: Array<[string, unknown]> = [];
  if (file === "opencode.json" || file === "opencode.jsonc") {
    const mcp = (doc as Record<string, unknown>).mcp;
    if (typeof mcp === "object" && mcp !== null) {
      const nested = (mcp as Record<string, unknown>).servers;
      const map = (typeof nested === "object" && nested !== null ? nested : mcp) as Record<string, unknown>;
      for (const [name, def] of Object.entries(map)) servers.push([name, def]);
    }
  } else {
    for (const [name, def] of Object.entries(doc as Record<string, unknown>)) servers.push([name, def]);
  }

  const out: AuditFinding[] = [];
  for (const [name, def] of servers) {
    if (typeof def === "string") {
      // opencode shorthand: { "server": "npx -y @scope/pkg" }
      const launcher = UNPINNED_LAUNCHERS.find((l) => def.startsWith(l));
      if (launcher && !/@\d+(?:\.\d+){1,2}/.test(def)) {
        out.push(
          report(
            "AU005",
            "warning",
            file,
            0,
            `MCP server "${name}" uses an unpinned launcher: ${def}`,
            "Pin the package version (e.g. npx -y @scope/pkg@1.2.3) so the runtime pulls a known build.",
          ),
        );
      }
      continue;
    }
    if (typeof def !== "object" || def === null) continue;
    const d = def as Record<string, unknown>;
    const url = typeof d.url === "string" ? d.url : undefined;
    const transport = typeof d.transport === "string" ? d.transport : url?.startsWith("http") ? "http" : "stdio";

    if (url && (transport === "http" || transport === "sse")) {
      const host = hostOf(url);
      if (host && !LOCAL_HOSTS.has(host)) {
        out.push(
          report(
            "AU004",
            "warning",
            file,
            0,
            `MCP server "${name}" uses a remote ${transport} transport: ${url}`,
            "Remote MCP servers send context to a third party. Prefer local servers, or gate this transport behind explicit approval.",
          ),
        );
      }
      continue;
    }
    if (transport === "stdio") {
      const cmd = typeof d.command === "string" ? d.command : "";
      const args = Array.isArray(d.args) ? d.args.map((a) => String(a)).join(" ") : "";
      const joined = `${cmd} ${args}`.trim();
      const launcher = UNPINNED_LAUNCHERS.find((l) => joined.split(/\s+/).slice(0, 3).join(" ").includes(l));
      if (launcher && !/@\d+(?:\.\d+){1,2}/.test(joined)) {
        out.push(
          report(
            "AU005",
            "warning",
            file,
            0,
            `MCP server "${name}" uses an unpinned stdio launcher: ${joined}`,
            "Pin the package version (e.g. npx -y @scope/pkg@1.2.3) so the runtime pulls a known build.",
          ),
        );
      }
    }
  }
  return out;
}

/**
 * AU006 — over-broad permission grants in harness configs (opencode
 * `permission.allow`, Claude `permissions.allow`).
 */
export function scanPermissionConfig(raw: string, file: string): AuditFinding[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof doc !== "object" || doc === null) return [];

  const d = doc as Record<string, unknown>;
  const perm = typeof d.permission === "object" && d.permission !== null ? (d.permission as Record<string, unknown>) : null;
  const perms = typeof d.permissions === "object" && d.permissions !== null ? (d.permissions as Record<string, unknown>) : null;
  const allow = (perm?.allow ?? perms?.allow) ?? [];
  if (!Array.isArray(allow)) return [];

  const out: AuditFinding[] = [];
  for (const rawEntry of allow) {
    if (typeof rawEntry !== "string") continue;
    const entry = rawEntry.trim();
    const isArbitraryRun =
      entry === "*" ||
      entry === "bash:*" ||
      /\bBash\(\s*\*\s*\)/.test(entry) ||
      /\bBash\(\s*bash:\*\s*\)/.test(entry);
    if (isArbitraryRun) {
      out.push(
        report(
          "AU006",
          "error",
          file,
          0,
          `Permission "${entry}" allows arbitrary command execution`,
          "Restrict the surface to the exact commands the agent needs (e.g. Bash(npm test)) and reject the rest.",
        ),
      );
    }
  }
  return out;
}