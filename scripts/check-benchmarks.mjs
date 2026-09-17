/**
 * CI gate for the deterministic guardrails benchmark suites.
 *
 * Usage: node scripts/check-benchmarks.mjs <run.json> [run.json …]
 * Fails (exit 1) if any run has failed cases, errors, or an aggregate
 * score below 100. Lives as a file so CI never has to quote JS inline
 * (bash expands ${...} inside double-quoted `node -e` — that bit us once).
 */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/check-benchmarks.mjs <run.json> [run.json …]");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  let run;
  try {
    run = JSON.parse(readFileSync(file, "utf8")).run;
  } catch (err) {
    console.error(`✗ ${file}: unreadable run output (${err.message})`);
    failed = true;
    continue;
  }
  const name = run.manifest?.suiteId ?? file;
  const bad = run.summary.failed + run.summary.errors;
  const score = run.aggregate.score;
  if (bad > 0 || score < 100) {
    console.error(`✗ ${name} regressed: failed=${run.summary.failed} errors=${run.summary.errors} score=${score}`);
    failed = true;
    continue;
  }
  console.log(`✓ ${name}: ${run.summary.passed}/${run.summary.cases} cases, score ${score}`);
}

process.exit(failed ? 1 : 0);
