// Crew folder standard — mirrors scripts/profile-folders.mjs:
//
//   convert-all   flat .marketplace/items/<id>.json → folder .marketplace/items/<id>/
//                 (crew.json + workers/<w>/worker.json + instructions.md +
//                  mcp/servers.json + graph.json), one-time migration
//   check-all     fixed point: every folder crew hydrates, passes crewProblems
//                 (incl. PA043–PA047), and dehydrate→hydrate is content-identical
//
// Authority model: crew.json is the index; the worker/mcp/graph files are the
// source. Uses the built core (dist/) for hydration, dehydration and
// validation so the script and the runtime can never disagree.

import fs from "node:fs";
import path from "node:path";

const ITEMS = ".marketplace/items";

async function loadCore() {
  try {
    const [hydrate, validate] = await Promise.all([
      import("../dist/crew/hydrate.js"),
      import("../dist/crew/validate.js"),
    ]);
    return { hydrate, validate };
  } catch {
    console.error("dist/ not found — run `npm run build` first.");
    process.exit(2);
  }
}

function flatCrewFiles() {
  if (!fs.existsSync(ITEMS)) return [];
  return fs
    .readdirSync(ITEMS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(ITEMS, f));
}

function folderCrewDirs() {
  if (!fs.existsSync(ITEMS)) return [];
  return fs
    .readdirSync(ITEMS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ITEMS, e.name, "crew.json")))
    .map((e) => path.join(ITEMS, e.name));
}

async function convert(file, core) {
  const crew = JSON.parse(fs.readFileSync(file, "utf8"));
  const problems = core.validate.crewProblems(crew);
  if (problems.length > 0) {
    console.error(`  skipped ${file}: invalid crew (${problems.join("; ")})`);
    return false;
  }
  const dir = path.join(ITEMS, crew.id);
  const files = core.hydrate.dehydrateCrew(crew);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.rmSync(file);
  return true;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function checkAll(core) {
  let checked = 0;
  let bad = 0;
  for (const dir of folderCrewDirs()) {
    const mf = path.join(dir, "crew.json");
    let crew;
    try {
      crew = await core.hydrate.loadCrewFile(mf);
    } catch (err) {
      bad++;
      console.error(`  hydrate failed: ${mf} (${err.message})`);
      continue;
    }
    const problems = core.validate.crewProblems(crew);
    if (problems.length > 0) {
      bad++;
      console.error(`  invalid: ${mf}\n    ${problems.join("\n    ")}`);
      continue;
    }
    // Fixed point: dehydrate to a temp folder, rehydrate, compare content.
    const tmp = fs.mkdtempSync(path.join(".tmp-crew-check-"));
    try {
      const files = core.hydrate.dehydrateCrew(crew);
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
      const roundTrip = await core.hydrate.loadCrewFile(path.join(tmp, "crew.json"));
      if (!deepEqual(crew, roundTrip)) {
        bad++;
        console.error(`  NOT a fixed point: ${mf}`);
        continue;
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    checked++;
  }
  console.log(`checked ${checked} crews, ${bad} bad`);
  process.exit(bad === 0 ? 0 : 1);
}

const [, , cmd] = process.argv;
const core = await loadCore();

if (cmd === "convert-all") {
  let n = 0;
  for (const f of flatCrewFiles()) {
    if (await convert(f, core)) n++;
  }
  console.log(`converted ${n} crews to folder layout`);
} else if (cmd === "check-all") {
  await checkAll(core);
} else {
  console.error("usage: crew-folders.mjs convert-all | check-all");
  process.exit(2);
}
