// One-time format migration → the unified registry format:
//
//   every artifact is a folder with a manifest.json entry point and modular
//   section files; JSON for machine-readable contracts, Markdown only where
//   content is instructional (profile knowledge docs).
//
//   profiles/<slug>/   manifest.json (+schema "proagents/profile/v1"),
//                      identity.json, expertise|methods|rules|policies/
//                      NN-x.json ({title, body}), standards/NN-x.json
//                      ({title, url?, note?}), skills/NN-repo.json
//                      ({ref, install, skills, note}), tools/requirements.json
//                      ({required, optional, mcp, packages}), knowledge/**/*.md
//   crews/<id>/        manifest.json (+schema "proagents/crew/v1"),
//                      mission.json, members/*.json (unchanged),
//                      coordination|tasks|workflows|rules|verification/NN.json,
//                      handoffs/NN.json ({from, to, artifact, body}),
//                      mcp/servers.json (unchanged)
//
// JSON section files mirror the old frontmatter+body shape: every key except
// `body` is the meta, `body` is the markdown body. Hydration semantics are
// therefore identical — only the container changes.
//
// Usage: node scripts/convert-registry-format.mjs
import fs from "node:fs";
import path from "node:path";
import { parse as yamlParse } from "yaml";

const PROFILES = "registry/profiles";
const CREWS = "registry/crews";

function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw.trim() };
  try {
    const meta = yamlParse(m[1] ?? "");
    if (meta && typeof meta === "object") return { meta, body: (m[2] ?? "").trim() };
  } catch {
    // Legacy frontmatter sometimes has unquoted colons in values — fall back
    // to the naive loader-compatible parser (key = up to first ":").
  }
  const meta = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: (m[2] ?? "").trim() };
}

/** md section file → JSON section object ({...meta, body}). */
function mdToJson(raw) {
  const { meta, body } = parseFrontmatter(raw);
  const out = { ...meta };
  if (body !== "") out.body = body;
  return out;
}

let stats = { profiles: 0, crews: 0, sections: 0, dropped: 0 };

function convertProfileDir(slugName) {
  const dir = path.join(PROFILES, slugName);
  const manifestPath = path.join(dir, "profile.json");
  if (!fs.existsSync(manifestPath)) return; // already converted (manifest.json present)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const convertSection = (entry) => {
    // Returns the new path for the manifest section list.
    if (typeof entry !== "string" || !entry.endsWith(".md")) return entry; // knowledge/docs refs stay as-is
    const mdPath = path.join(dir, entry);
    if (!fs.existsSync(mdPath)) return entry;
    const json = mdToJson(fs.readFileSync(mdPath, "utf8"));
    const newPath = entry.replace(/\.md$/, ".json");
    fs.mkdirSync(path.dirname(path.join(dir, newPath)), { recursive: true });
    fs.writeFileSync(path.join(dir, newPath), JSON.stringify(json, null, 2) + "\n");
    fs.unlinkSync(mdPath);
    stats.sections++;
    return newPath;
  };

  // identity → root-level identity.json ({title, body}).
  if (typeof manifest.identity === "string" && manifest.identity.endsWith(".md")) {
    const raw = fs.readFileSync(path.join(dir, manifest.identity), "utf8");
    const json = mdToJson(raw);
    fs.writeFileSync(path.join(dir, "identity.json"), JSON.stringify(json, null, 2) + "\n");
    fs.rmSync(path.join(dir, "identity"), { recursive: true, force: true });
    manifest.identity = "identity.json";
    stats.sections++;
  } else if (Array.isArray(manifest.identity) && manifest.identity.length === 1 && typeof manifest.identity[0] === "string" && manifest.identity[0].endsWith(".md")) {
    // Some profiles carry identity as a 1-element list.
    const raw = fs.readFileSync(path.join(dir, manifest.identity[0]), "utf8");
    const json = mdToJson(raw);
    fs.writeFileSync(path.join(dir, "identity.json"), JSON.stringify(json, null, 2) + "\n");
    fs.rmSync(path.join(dir, "identity"), { recursive: true, force: true });
    manifest.identity = "identity.json";
    stats.sections++;
  }

  for (const section of ["expertise", "methods", "rules", "policies", "standards", "skills"]) {
    if (Array.isArray(manifest[section])) {
      manifest[section] = manifest[section].map(convertSection);
    }
  }
  if (manifest.verification) {
    for (const part of ["required", "optional"]) {
      if (Array.isArray(manifest.verification[part])) {
        manifest.verification[part] = manifest.verification[part].map(convertSection);
      }
    }
  }

  // tools → tools/requirements.json (structured object as the file).
  if (manifest.tools === "tools/requirements.md") {
    const { meta } = parseFrontmatter(fs.readFileSync(path.join(dir, "tools/requirements.md"), "utf8"));
    fs.writeFileSync(path.join(dir, "tools/requirements.json"), JSON.stringify(meta, null, 2) + "\n");
    fs.unlinkSync(path.join(dir, "tools/requirements.md"));
    manifest.tools = "tools/requirements.json";
    stats.sections++;
  }

  // New manifest: schema marker, drop the stale unconsumed files block.
  delete manifest.files;
  const out = { schema: "proagents/profile/v1", ...manifest };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(out, null, 2) + "\n");
  fs.unlinkSync(manifestPath);
  stats.profiles++;
}

function convertCrewDir(crewId) {
  const dir = path.join(CREWS, crewId);
  const manifestPath = path.join(dir, "crew.json");
  if (!fs.existsSync(manifestPath)) return; // already converted
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const proseSections = ["mission", "coordination", "tasks", "workflows", "rules", "verification"];
  for (const section of proseSections) {
    if (!Array.isArray(manifest[section])) continue;
    manifest[section] = manifest[section].map((entry) => {
      if (typeof entry !== "string" || !entry.endsWith(".md")) return entry;
      const mdPath = path.join(dir, entry);
      if (!fs.existsSync(mdPath)) return entry;
      const json = mdToJson(fs.readFileSync(mdPath, "utf8"));
      const newPath = entry.replace(/\.md$/, ".json");
      fs.writeFileSync(path.join(dir, newPath), JSON.stringify(json, null, 2) + "\n");
      fs.unlinkSync(mdPath);
      stats.sections++;
      return newPath;
    });
    // mission hydrates to a string; keep it as its own single file at root.
    if (section === "mission" && manifest.mission[0]) {
      const oldName = manifest.mission[0];
      fs.renameSync(path.join(dir, oldName), path.join(dir, "mission.json"));
      manifest.mission = "mission.json";
    }
  }

  // handoffs → {from, to, artifact, body}.
  if (Array.isArray(manifest.handoffs)) {
    manifest.handoffs = manifest.handoffs.map((entry) => {
      if (typeof entry !== "string" || !entry.endsWith(".md")) return entry;
      const mdPath = path.join(dir, entry);
      if (!fs.existsSync(mdPath)) return entry;
      const { meta, body } = parseFrontmatter(fs.readFileSync(mdPath, "utf8"));
      const json = { ...meta, ...(body !== "" ? { body } : {}) };
      const newPath = entry.replace(/\.md$/, ".json");
      fs.writeFileSync(path.join(dir, newPath), JSON.stringify(json, null, 2) + "\n");
      fs.unlinkSync(mdPath);
      stats.sections++;
      return newPath;
    });
  }

  const out = { schema: "proagents/crew/v1", ...manifest };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(out, null, 2) + "\n");
  fs.unlinkSync(manifestPath);
  stats.crews++;
}

for (const d of fs.readdirSync(PROFILES)) {
  if (fs.statSync(path.join(PROFILES, d)).isDirectory()) convertProfileDir(d);
}
for (const d of fs.readdirSync(CREWS)) {
  if (fs.statSync(path.join(CREWS, d)).isDirectory()) convertCrewDir(d);
}
console.log(
  `converted ${stats.profiles} profiles + ${stats.crews} crews (${stats.sections} section files md→json); knowledge/**/*.md untouched`,
);
