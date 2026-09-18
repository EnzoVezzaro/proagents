// Profile folder standard — the two directions:
//
//   materialize  profile.json → section folders (bootstrap only; path-aware)
//   sync         section folders → profile.json  (files are the source of truth)
//
// Authority model (path format): profile.json's sections hold file paths
// ("expertise/01-x.md"); profile.json is the index, the folders are the
// source. sync regenerates the index from the files. materialize is
// path-aware: existing section folders are left untouched (the files ARE
// the data); only inline sections of a legacy manifest are materialized.
// Structured sections round-trip through file frontmatter: skills →
// ref/install/skills, tools → YAML frontmatter, standards → url/note.
//
// Usage: node scripts/profile-folders.mjs materialize <profile-dir>
//        node scripts/profile-folders.mjs sync <profile-dir>
//        node scripts/profile-folders.mjs materialize-all|sync-all|check-all

import fs from "node:fs";
import path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: m[2].trim() };
}

function serializeFrontmatter(meta, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) if (v !== undefined && v !== "") lines.push(`${k}: ${v}`);
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
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
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
}

function readItems(dir) {
  return listSectionFiles(dir).map((f) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), "utf8"));
    return { file: f, meta, body };
  });
}

function writeItem(dir, order, title, body, extraMeta = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(order).padStart(2, "0")}-${slugifyName(title)}.md`);
  fs.writeFileSync(file, serializeFrontmatter({ title, ...extraMeta }, body));
}

// ---------------------------------------------------------------------------
// tools file — YAML frontmatter carries the structured tools object
// ---------------------------------------------------------------------------

function toolsFrontmatter(tools) {
  return yamlStringify({
    title: "Tool requirements",
    note: "Source of truth for this profile's tool requirements — edit this file, then run sync.",
    required: tools.required ?? [],
    ...(tools.optional?.length ? { optional: tools.optional } : {}),
    ...(tools.forbidden?.length ? { forbidden: tools.forbidden } : {}),
    ...(tools.mcp?.length ? { mcp: tools.mcp } : {}),
    ...(tools.packages?.length ? { packages: tools.packages } : {}),
  }).trimEnd();
}

function writeToolsFile(profileDir, tools) {
  const lines = [
    "---",
    toolsFrontmatter(tools),
    "---",
    "",
    `**Required:** ${(tools.required ?? []).join(", ") || "—"}`,
    "",
  ];
  if (tools.optional?.length) lines.push(`**Optional:** ${tools.optional.join(", ")}`, "");
  if (tools.forbidden?.length) lines.push(`**Forbidden:** ${tools.forbidden.join(", ")}`, "");
  if (tools.mcp?.length) {
    lines.push("**MCP servers:**", "");
    for (const s of tools.mcp) lines.push(`- ${s.name} (${s.transport})${s.command ? `: \`${s.command}\`` : s.url ? `: ${s.url}` : ""}`);
    lines.push("");
  }
  if (tools.packages?.length) {
    lines.push("**Registry packages:**", "");
    for (const p of tools.packages) lines.push(`- ${p.registry}${p.reason ? ` — ${p.reason}` : ""}`);
    lines.push("");
  }
  fs.mkdirSync(path.join(profileDir, "tools"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "tools", "requirements.md"), lines.join("\n"));
}

// ---------------------------------------------------------------------------
// materialize: manifest → folders (path-aware; never clobbers folder content)
// ---------------------------------------------------------------------------

export function materializeProfile(profileDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, "profile.json"), "utf8"));

  if (!fs.existsSync(path.join(profileDir, "identity"))) {
    const id = typeof manifest.identity === "string" ? { title: "", summary: "" } : manifest.identity;
    writeItem(path.join(profileDir, "identity"), 1, id.title ?? "", id.summary ?? "");
  }

  // Inline list sections materialize only when the folder does not exist —
  // in path format the files are the data; rewriting from path strings
  // would destroy content.
  for (const section of ["expertise", "methods", "rules", "policies"]) {
    if (fs.existsSync(path.join(profileDir, section))) continue;
    for (const [i, item] of (manifest[section] ?? []).entries()) {
      if (typeof item !== "string" || item.endsWith(".md")) continue;
      writeItem(path.join(profileDir, section), i + 1, titleOf(item), item);
    }
  }

  if (!fs.existsSync(path.join(profileDir, "standards"))) {
    for (const [i, item] of (manifest.standards ?? []).entries()) {
      if (typeof item !== "string" || item.endsWith(".md")) continue;
      const ref = manifest.references?.[item];
      writeItem(path.join(profileDir, "standards"), i + 1, item, ref?.note ?? "", { url: ref?.url ?? "" });
    }
  }

  if (!fs.existsSync(path.join(profileDir, "skills"))) {
    let order = 1;
    for (const s of manifest.skills ?? []) {
      if (typeof s === "string" && s.endsWith(".md")) continue;
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
      if (typeof item === "string" && !item.endsWith(".md")) writeItem(path.join(profileDir, "verification", "required"), i + 1, titleOf(item), item);
    }
    for (const [i, item] of (manifest.verification?.optional ?? []).entries()) {
      if (typeof item === "string" && !item.endsWith(".md")) writeItem(path.join(profileDir, "verification", "optional"), i + 1, titleOf(item), item);
    }
  }

  if (!fs.existsSync(path.join(profileDir, "tools", "requirements.md"))) {
    writeToolsFile(profileDir, manifest.tools ?? { required: [] });
  }

  fs.writeFileSync(path.join(profileDir, "README.md"), readme(manifest));
  return manifest.profile.slug;
}

function readme(manifest) {
  const title = typeof manifest.identity === "string" ? manifest.profile.name : manifest.identity.title;
  return `# ${title}

Professional profile (v${manifest.version}). In the folder standard every
section entry in \`profile.json\` is a path to its file — the manifest is the
index, the folders are the source.

    ├── profile.json       the index (paths; hydrated to content at load time)
    ├── identity/          who the agent is (title + summary)
    ├── expertise/         one file per domain expertise
    ├── knowledge/         real reference files, installed at equip time
    ├── methods/           one file per named professional method
    ├── skills/            skill refs (frontmatter) or written skills
    ├── rules/             normative constraints (one per file)
    ├── policies/          governing policies of the profession
    ├── standards/         standards with authoritative URLs (url/note frontmatter)
    ├── tools/             requirements.yaml — structured tools object (source of truth)
    └── verification/      required/ + optional/ completion checks

Edit a section: add, remove or swap an \`NN-*.md\` file, then run
\`node scripts/profile-folders.mjs sync <dir>\` to regenerate \`profile.json\`.
`;
}

// ---------------------------------------------------------------------------
// sync: folders → manifest (writes paths; lossless for everything it owns)
// ---------------------------------------------------------------------------

export function syncProfileFolders(profileDir) {
  const manifestPath = path.join(profileDir, "profile.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const identityFiles = readItems(path.join(profileDir, "identity"));
  if (identityFiles[0]) {
    manifest.identity = `identity/${identityFiles[0].file}`;
  }

  const paths = (section) => readItems(path.join(profileDir, section)).map((it) => `${section}/${it.file}`);
  manifest.expertise = paths("expertise");
  manifest.methods = paths("methods");
  manifest.rules = paths("rules");
  manifest.policies = paths("policies");

  // standards — url/note frontmatter becomes references (keyed by title).
  const standards = readItems(path.join(profileDir, "standards"));
  manifest.standards = standards.map((it) => `standards/${it.file}`);
  const references = {};
  for (const it of standards) {
    if (it.meta.url) references[it.meta.title] = { url: it.meta.url, ...(it.meta.note ? { note: it.meta.note } : {}) };
  }
  if (Object.keys(references).length > 0) manifest.references = references;
  else delete manifest.references;

  // skills: path entries; written skills (skillBodies) survive — the skills
  // file with a matching name carries their content.
  const skills = readItems(path.join(profileDir, "skills"));
  const skillPaths = skills.map((it) => `skills/${it.file}`);
  const written = Object.keys(manifest.skillBodies ?? {}).filter(
    (k) => !skills.some((it) => (it.meta.name ?? it.file.replace(/\.md$/, "")) === k),
  );
  manifest.skills = [...skillPaths, ...written];
  delete manifest.skillsDetail;

  manifest.verification = {
    required: readItems(path.join(profileDir, "verification", "required")).map((it) => `verification/required/${it.file}`),
    optional: readItems(path.join(profileDir, "verification", "optional")).map((it) => `verification/optional/${it.file}`),
  };

  // tools — the file is the source of truth: write the path, drop the
  // structured object from the manifest.
  if (fs.existsSync(path.join(profileDir, "tools", "requirements.md"))) {
    manifest.tools = "tools/requirements.md";
  }

  if ((manifest.knowledge ?? []).length === 0) delete manifest.knowledge;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
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
      if (fs.existsSync(path.join(dir, "profile.json"))) yield dir;
    }
  }
}

const [, , cmd, arg] = process.argv;
const ROOTS = [".marketplace/items"];

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
  // Fixed-point check: sync must be idempotent and materialize must not
  // change any manifest on a path-format tree.
  let checked = 0;
  let dirty = 0;
  for (const dir of profileDirs(ROOTS)) {
    const before = fs.readFileSync(path.join(dir, "profile.json"), "utf8");
    materializeProfile(dir);
    syncProfileFolders(dir);
    const mid = fs.readFileSync(path.join(dir, "profile.json"), "utf8");
    syncProfileFolders(dir);
    const after = fs.readFileSync(path.join(dir, "profile.json"), "utf8");
    checked++;
    if (mid !== after) { dirty++; console.error("NOT a fixed point:", dir); }
    if (before !== mid) console.error("materialize+sync changed:", dir);
  }
  console.log(`checked ${checked} profiles, ${dirty} drift`);
  process.exit(dirty === 0 ? 0 : 1);
} else {
  console.error("usage: profile-folders.mjs materialize|sync <dir> | materialize-all | sync-all | check-all");
  process.exit(2);
}
