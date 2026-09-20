import { execFileSync } from "node:child_process";
import path from "node:path";
import { HARNESS_SPECS } from "../../src/adapters/index.js";

const CLI = path.resolve("dist/cli/index.js");

// Harness env signals (OPENCODE, CLAUDECODE, …) leak the parent session into the
// spawned CLI: detect would promote that harness to primary and change which
// files equip writes. Strip them so CLI subprocess tests are hermetic.
const HARNESS_ENV_KEYS = HARNESS_SPECS.flatMap((s) => s.env);

/**
 * Run the built CLI in `cwd`, returning stdout. Throws the execFileSync error
 * (with .status/.stdout/.stderr) on non-zero exit, like the raw call sites.
 */
export function runCli(cwd: string, args: string[], options: { input?: string } = {}): string {
  const env = { ...process.env };
  for (const key of HARNESS_ENV_KEYS) delete env[key];
  return execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8", input: options.input, env });
}
