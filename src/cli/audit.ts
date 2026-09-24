import path from "node:path";
import { runAudit } from "../audit/index.js";
import { jsonOut } from "./json.js";
import { warnIfStandalone } from "./interactive.js";

/**
 * `proagent audit [--path <dir>] [--json]` — deterministic security audit.
 *
 * Exit contract: 0 clean · 1 warnings only · 2 errors present. The exit code
 * is honored even in --json mode (process.exitCode), matching validate/crew
 * precedent so CI can gate on it.
 *
 * --json { status, root, findings[], summary{total,errors,warnings}, exit }.
 */

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export async function runAuditCommand(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  warnIfStandalone("audit", flags.json === true);
  const target =
    typeof flags.path === "string" && flags.path.length > 0
      ? path.resolve(flags.path)
      : typeof args[0] === "string" && args[0].length > 0
        ? path.resolve(args[0])
        : process.cwd();

  const report = await runAudit(target);

  if (flags.json === true) {
    jsonOut(report);
    if (report.exit > 0) process.exitCode = report.exit;
    return;
  }

  const icon = (severity: string): string => (severity === "error" ? "✗" : "⚠");
  console.log(`\nAudit: ${report.root}\n`);
  for (const f of report.findings) {
    console.log(`  ${icon(f.severity)} [${f.code}] ${f.file}:${f.line}`);
    console.log(`      ${f.message}`);
    console.log(`      → ${f.suggestion}`);
  }
  const { total, errors, warnings } = report.summary;
  console.log(`\n${total} finding(s): ${errors} error(s), ${warnings} warning(s) — exit ${report.exit}`);
  console.log("");
  if (report.exit > 0) process.exitCode = report.exit;
}