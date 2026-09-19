// Profile folder standard — the two directions:
//
//   materialize  manifest.json → section folders (bootstrap only; path-aware)
//   sync         section folders → manifest.json  (files are the source of truth)
//
// Authority model (unified registry format): manifest.json's sections hold
// file paths ("expertise/01-x.json"); manifest.json is the index, the folders
// are the source. sync regenerates the index from the files. materialize is
// path-aware: existing section folders are left untouched (the files ARE
// the data); only inline sections of a legacy manifest are materialized.
// Structured sections round-trip through JSON files: skills → {ref, install,
// skills, note}, tools → tools/requirements.json, standards → {title, url, note}.
//
// Usage: node scripts/profile-folders.mjs materialize <profile-dir>
//        node scripts/profile-folders.mjs sync <profile-dir>
//        node scripts/profile-folders.mjs materialize-all|sync-all|check-all

import fs from "node:fs";
import path from "node:path";

function jsonPretty(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

export function slugifyName(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

function listSectionFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

function readItems(dir) {
  return listSectionFiles(dir).map((f) => {
    const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const { body, ...meta } = json;
    return { file: f, meta, body: typeof body === "string" ? body : "" };
  });
}

function writeItem(dir, order, title, body, extraMeta = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(order).padStart(2, "0")}-${slugifyName(title)}.json`);
  const clean = Object.fromEntries(Object.entries({ title, ...extraMeta }).filter(([, v]) => v !== undefined && v !== ""));
  fs.writeFileSync(file, jsonPretty({ ...clean, ...(body ? { body } : {}) }));
}

// ---------------------------------------------------------------------------
// tools file — the structured tools object IS the file
// ---------------------------------------------------------------------------

function writeToolsFile(profileDir, tools) {
  fs.mkdirSync(path.join(profileDir, "tools"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "tools", "requirements.json"), jsonPretty(tools));
}

// ---------------------------------------------------------------------------
// materialize: manifest → folders (path-aware; never clobbers folder content)
// ---------------------------------------------------------------------------

export function materializeProfile(profileDir) {
  const manifestPath = fs.existsSync(path.join(profileDir, "manifest.json"))
    ? path.join(profileDir, "manifest.json")
    : path.join(profileDir, "profile.json"); // legacy, one-time migration
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (!fs.existsSync(path.join(profileDir, "identity.json"))) {
    const id = typeof manifest.identity === "string" ? { title: "", summary: "" } : manifest.identity;
    writeItem(profileDir, 1, id.title ?? "", id.summary ?? "").slice(0, 0); // no-op for tree-shake lint
    fs.writeFileSync(path.join(profileDir, "identity.json"), jsonPretty({ ...(id.title ? { title: id.title } : {}), ...(id.summary ? { body: id.summary } : {}) }));
  }

  // Inline list sections materialize only when the folder does not exist —
  // in path format the files are the data; rewriting from path strings
  // would destroy content.
  for (const section of ["expertise", "methods", "rules", "policies"]) {
    if (fs.existsSync(path.join(profileDir, section))) continue;
    for (const [i, item] of (manifest[section] ?? []).entries()) {
      if (typeof item !== "string" || item.endsWith(".json")) continue;
      writeItem(path.join(profileDir, section), i + 1, titleOf(item), item);
    }
  }

  if (!fs.existsSync(path.join(profileDir, "standards"))) {
    for (const [i, item] of (manifest.standards ?? []).entries()) {
      if (typeof item !== "string" || item.endsWith(".json")) continue;
      const ref = manifest.references?.[item];
      writeItem(path.join(profileDir, "standards"), i + 1, item, ref?.note ?? "", { url: ref?.url ?? "" });
    }
  }

  if (!fs.existsSync(path.join(profileDir, "skills"))) {
    let order = 1;
    for (const s of manifest.skills ?? []) {
      if (typeof s === "string" && s.endsWith(".json")) continue;
      const detail = manifest.skillsDetail?.[s];
      if (detail && (s.startsWith("npm:") || s.startsWith("github:"))) {
        const title = s.replace(/^(npm|github):/, "").replaceAll("/", "-");
        writeItem(path.join(profileDir, "skills"), order++, title, detail.note ?? "", {
          ref: s,
          install: detail.install ?? "",
          skills: detail.skills.join(", "),
        });
      } else {
        const body = manifest.skillBodies?.[s]?.body ?? "";
        writeItem(path.join(profileDir, "skills"), order++, s, body, {
          name: s,
          description: manifest.skillBodies?.[s]?.description ?? "",
        });
      }
    }
  }

  if (!fs.existsSync(path.join(profileDir, "verification"))) {
    for (const [i, item] of (manifest.verification?.required ?? []).entries()) {
      if (typeof item === "string" && !item.endsWith(".json")) writeItem(path.join(profileDir, "verification", "required"), i + 1, titleOf(item), item);
    }
    for (const [i, item] of (manifest.verification?.optional ?? []).entries()) {
      if (typeof item === "string" && !item.endsWith(".json")) writeItem(path.join(profileDir, "verification", "optional"), i + 1, titleOf(item), item);
    }
  }

  if (!fs.existsSync(path.join(profileDir, "tools", "requirements.json"))) {
    writeToolsFile(profileDir, typeof manifest.tools === "string" ? { required: [] } : manifest.tools ?? { required: [] });
  }

  return manifest.profile.slug;
}

// ---------------------------------------------------------------------------
// sync: folders → manifest.json (writes paths; lossless for what it owns)
// ---------------------------------------------------------------------------

export function syncProfileFolders(profileDir) {
  const manifestPath = path.join(profileDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // identity — the file is the single source ({title, body}).
  manifest.identity = "identity.json";
  if (fs.existsSync(path.join(profileDir, "identity"))) {
    // Legacy folder → collapse into identity.json.
    const legacy = readItems(path.join(profileDir, "identity"))[0];
    if (legacy) fs.writeFileSync(path.join(profileDir, "identity.json"), jsonPretty({ ...(legacy.meta.title ? { title: legacy.meta.title } : {}), ...(legacy.body ? { body: legacy.body } : {}) }));
    fs.rmSync(path.join(profileDir, "identity"), { recursive: true, force: true });
  } else if (!fs.existsSync(path.join(profileDir, "identity.json"))) {
    const id = typeof manifest.identity === "string" ? { title: "", body: "" } : manifest.identity;
    fs.writeFileSync(path.join(profileDir, "identity.json"), jsonPretty({ ...(id.title ? { title: id.title } : {}), ...((id.summary ?? id.body) ? { body: id.summary ?? id.body } : {}) }));
  }

  const paths = (section) => readItems(path.join(profileDir, section)).map((it) => `${section}/${it.file}`);
  manifest.expertise = paths("expertise");
  manifest.methods = paths("methods");
  manifest.rules = paths("rules");
  manifest.policies = paths("policies");

  // standards — the url/note keys become references (keyed by title).
  const standards = readItems(path.join(profileDir, "standards"));
  manifest.standards = standards.map((it) => `standards/${it.file}`);
  const references = {};
  for (const it of standards) {
    if (it.meta.url) references[it.meta.title ?? it.file.replace(/\.json$/, "")] = { url: it.meta.url, ...(it.meta.note ? { note: it.meta.note } : {}) };
  }
  if (Object.keys(references).length > 0) manifest.references = references;
  else delete manifest.references;

  // skills: path entries; written skills (skillBodies) survive — the skills
  // file with a matching name carries their content.
  const skills = readItems(path.join(profileDir, "skills"));
  const skillPaths = skills.map((it) => `skills/${it.file}`);
  const written = Object.keys(manifest.skillBodies ?? {}).filter(
    (k) => !skills.some((it) => (it.meta.name ?? it.file.replace(/\.json$/, "")) === k),
  );
  manifest.skills = [...skillPaths, ...written];
  delete manifest.skillsDetail;

  manifest.verification = {
    required: readItems(path.join(profileDir, "verification", "required")).map((it) => `verification/required/${it.file}`),
    optional: readItems(path.join(profileDir, "verification", "optional")).map((it) => `verification/optional/${it.file}`),
  };

  // tools — the file is the source of truth: write the path, drop the
  // structured object from the manifest.
  if (fs.existsSync(path.join(profileDir, "tools", "requirements.json"))) {
    manifest.tools = "tools/requirements.json";
  }

  if ((manifest.knowledge ?? []).length === 0) delete manifest.knowledge;

  fs.writeFileSync(manifestPath, jsonPretty(manifest));
  return manifest.profile.slug;
}

// ---------------------------------------------------------------------------
// helpers + CLI
// ---------------------------------------------------------------------------

function titleOf(item) {
  const cut = item.split(/\s+—\s+see\s+/)[0].split(/\s+—\s+playbook:/)[0];
  return cut.length > 70 ? cut.slice(0, 67) + "…" : cut;
}

function* profileDirs(roots) {
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      if (fs.existsSync(path.join(dir, "manifest.json"))) yield dir;
    }
  }
}

const [, , cmd, arg] = process.argv;
const ROOTS = ["registry/profiles"];

if (cmd === "materialize" && arg) {
  console.log("materialized:", materializeProfile(arg));
} else if (cmd === "sync" && arg) {
  console.log("synced:", syncProfileFolders(arg));
} else if (cmd === "materialize-all") {
  let n = 0;
  for (const dir of profileDirs(ROOTS)) { materializeProfile(dir); n++; }
  console.log(`materialized ${n} profiles`);
} else if (cmd === "sync-all") {
  let n = 0;
  for (const dir of profileDirs(ROOTS)) { syncProfileFolders(dir); n++; }
  console.log(`synced ${n} profiles`);
} else if (cmd === "check-all") {
  let bad = 0;
  for (const dir of profileDirs(ROOTS)) {
    const before = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
    syncProfileFolders(dir);
    const after = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
    if (before !== after) {
      bad++;
      console.error(`  NOT in sync: ${dir} (sync-all rewrote it — commit the result or fix the folders)`);
    }
  }
  console.log(`checked ${bad === 0 ? "all" : bad} profile folder(s), ${bad} out of sync`);
  process.exit(bad === 0 ? 0 : 1);
} else {
  console.error("usage: profile-folders.mjs materialize <dir> | sync <dir> | materialize-all | sync-all | check-all");
  process.exit(2);
}
