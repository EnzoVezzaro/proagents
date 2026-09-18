// Profile folder standard — the two directions:
//
//   materialize  profile.json  →  section folders (bootstrap the tree)
//   sync         section folders  →  profile.json  (files are the source of truth)
//
// Sections with per-item files: identity, expertise, methods, skills, rules,
// policies, standards, verification (required/optional), tools (mirror).
// knowledge/ is already file-based and referenced by path in the manifest.
//
// Losslessness: sync regenerates exactly the sections it reads files for.
// tools.required/optional/forbidden/mcp/packages are structured data owned by
// profile.json; the tools/ folder carries a human-readable mirror with a
// pointer to the authoritative file. Round-trip materialize→sync is a fixed
// point (pinned by tests/profiles/profile-folders.test.ts).
//
// Usage: node scripts/profile-folders.mjs materialize <profile-dir>
//        node scripts/profile-folders.mjs sync <profile-dir>
//        node scripts/profile-folders.mjs materialize-all|sync-all|check-all

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// tiny frontmatter (constrained: "key: value" lines, comma lists)
// ---------------------------------------------------------------------------

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
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
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
// materialize: manifest → folders
// ---------------------------------------------------------------------------

export function materializeProfile(profileDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, "profile.json"), "utf8"));
  const cleaned = cleanSections(manifest);

  // wipe generated section folders (knowledge/ is NOT generated — it is real content)
  for (const d of ["identity", "expertise", "methods", "skills", "rules", "policies", "standards", "verification", "tools"]) {
    fs.rmSync(path.join(profileDir, d), { recursive: true, force: true });
  }

  // identity — single file: frontmatter title, body = summary
  writeItem(path.join(profileDir, "identity"), 1, cleaned.identity.title, cleaned.identity.summary ?? "");

  cleaned.expertise.forEach((item, i) => writeItem(path.join(profileDir, "expertise"), i + 1, titleOf(item), item));
  cleaned.methods.forEach((item, i) => writeItem(path.join(profileDir, "methods"), i + 1, titleOf(item), item));
  cleaned.rules.forEach((item, i) => writeItem(path.join(profileDir, "rules"), i + 1, titleOf(item), item));
  cleaned.policies.forEach((item, i) => writeItem(path.join(profileDir, "policies"), i + 1, titleOf(item), item));

  cleaned.standards.forEach((item, i) => {
    const ref = cleaned.references[item];
    writeItem(path.join(profileDir, "standards"), i + 1, item, ref?.note ?? "", { url: ref?.url ?? "" });
  });

  for (const [ref, detail] of Object.entries(cleaned.skillsDetail)) {
    const title = ref.replace(/^(npm|github):/, "").replaceAll("/", "-");
    writeItem(path.join(profileDir, "skills"), Object.keys(cleaned.skillsDetail).indexOf(ref) + 1, title, detail.note ?? "", {
      ref,
      install: detail.install ?? "",
      skills: detail.skills.join(", "),
    });
  }

  cleaned.verification.required.forEach((item, i) => writeItem(path.join(profileDir, "verification", "required"), i + 1, titleOf(item), item));
  cleaned.verification.optional.forEach((item, i) => writeItem(path.join(profileDir, "verification", "optional"), i + 1, titleOf(item), item));

  // tools — human-readable mirror (profile.json stays authoritative)
  const tools = manifest.tools ?? {};
  const mirror = [
    "---",
    "title: Tool requirements",
    "note: Generated mirror — edit profile.json (tools) as the authoritative source.",
    "---",
    "",
    `**Required:** ${(tools.required ?? []).join(", ") || "—"}`,
    "",
    `**Optional:** ${(tools.optional ?? []).join(", ") || "—"}`,
    "",
    `**Forbidden:** ${(tools.forbidden ?? []).join(", ") || "—"}`,
    "",
  ];
  if ((tools.mcp ?? []).length > 0) {
    mirror.push("**MCP servers:**", "");
    for (const s of tools.mcp) mirror.push(`- ${s.name} (${s.transport})${s.command ? `: \`${s.command}\`` : s.url ? `: ${s.url}` : ""}`);
    mirror.push("");
  }
  if ((tools.packages ?? []).length > 0) {
    mirror.push("**Registry packages:**", "");
    for (const p of tools.packages) mirror.push(`- ${p.registry}${p.reason ? ` — ${p.reason}` : ""}`);
    mirror.push("");
  }
  fs.mkdirSync(path.join(profileDir, "tools"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "tools", "requirements.md"), mirror.join("\n"));

  // README — the layout contract
  fs.writeFileSync(path.join(profileDir, "README.md"), readme(manifest));
  return manifest.profile.slug;
}

/**
 * Build the manifest `files` map: every section entry linked to its file —
 * the profile.json becomes an index over the folder tree, the same way
 * knowledge entries already are paths. Deterministic ordering = array order.
 */
export function buildFilesMap(profileDir) {
  const files = {};
  const idFiles = listSectionFiles(path.join(profileDir, "identity"));
  if (idFiles.length) files.identity = `identity/${idFiles[0]}`;
  const map = (section) => listSectionFiles(path.join(profileDir, section)).map((f) => `${section}/${f}`);
  for (const section of ["expertise", "methods", "skills", "rules", "policies", "standards"]) {
    const v = map(section);
    if (v.length) files[section] = v;
  }
  const req = map("verification/required").map((f) => f.replace("verification/", ""));
  const opt = map("verification/optional").map((f) => f.replace("verification/", ""));
  if (req.length || opt.length) files.verification = { ...(req.length ? { required: req } : {}), ...(opt.length ? { optional: opt } : {}) };
  if (fs.existsSync(path.join(profileDir, "tools", "requirements.md"))) files.tools = "tools/requirements.md";
  // knowledge entries ARE paths already — mirror them for a complete index.
  const manifest = JSON.parse(fs.readFileSync(path.join(profileDir, "profile.json"), "utf8"));
  if ((manifest.knowledge ?? []).length) files.knowledge = [...manifest.knowledge];
  return files;
}

function readme(manifest) {
  return `# ${manifest.identity.title}

Professional profile (v${manifest.version}). The canonical machine manifest is
\`profile.json\`; the section folders below are the standardized, extensible
source — one file per item, ordered by numeric prefix.

    ├── profile.json       canonical manifest (engine reads this)
    ├── identity/          who the agent is (title + summary)
    ├── expertise/         one file per domain expertise
    ├── knowledge/         real reference files, installed at equip time
    ├── methods/           one file per named professional method
    ├── skills/            referenced skills (install commands, never duplicated)
    ├── rules/             normative constraints (one per file)
    ├── policies/          governing policies of the profession
    ├── standards/         standards/certifications with authoritative URLs
    ├── tools/             tool requirements (mirror; profile.json is authoritative)
    └── verification/      required/ + optional/ completion checks

Edit a section: add, remove or swap an \`NN-*.md\` file, then run
\`node scripts/profile-folders.mjs sync ${manifest.profile.slug ? `<dir>` : ""}\` to
regenerate \`profile.json\`.
`;
}

// ---------------------------------------------------------------------------
// sync: folders → manifest (lossless for the sections it owns)
// ---------------------------------------------------------------------------

export function syncProfileFolders(profileDir) {
  const manifestPath = path.join(profileDir, "profile.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const cleaned = cleanSections(manifest);

  const identityFiles = readItems(path.join(profileDir, "identity"));
  if (identityFiles[0]) {
    manifest.identity = { title: identityFiles[0].meta.title ?? manifest.identity.title, summary: identityFiles[0].body };
  }

  const simple = (section) => readItems(path.join(profileDir, section)).map((it) => it.body);
  manifest.expertise = simple("expertise");
  manifest.methods = simple("methods");
  manifest.rules = simple("rules");
  manifest.policies = simple("policies");

  // standards + references
  const standards = readItems(path.join(profileDir, "standards"));
  manifest.standards = standards.map((it) => it.meta.title);
  manifest.references = {};
  for (const it of standards) {
    if (it.meta.url) manifest.references[it.meta.title] = { url: it.meta.url, ...(it.meta.note ? { note: it.meta.note } : {}) };
  }

  // skills + skillsDetail
  const skills = readItems(path.join(profileDir, "skills"));
  const syncedRefs = new Set();
  for (const it of skills) {
    const ref = it.meta.ref;
    if (!ref) continue;
    syncedRefs.add(ref);
    manifest.skillsDetail = manifest.skillsDetail ?? {};
    manifest.skillsDetail[ref] = {
      skills: (it.meta.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      ...(it.meta.install ? { install: it.meta.install } : {}),
      ...(it.body ? { note: it.body } : {}),
    };
  }
  // written skills (skillBodies keys) survive sync — they are not folder-managed
  const written = Object.keys(manifest.skillBodies ?? {});
  manifest.skills = [...syncedRefs, ...written];
  if (Object.keys(manifest.skillsDetail ?? {}).length === 0) delete manifest.skillsDetail;
  if (manifest.skills.length === 0) delete manifest.skills;

  manifest.verification = {
    required: readItems(path.join(profileDir, "verification", "required")).map((it) => it.body),
    optional: readItems(path.join(profileDir, "verification", "optional")).map((it) => it.body),
  };

  // Link every section to its file (see buildFilesMap). knowledge stays
  // path-native; the map mirrors it so profile.json indexes the whole tree.
  manifest.files = buildFilesMap(profileDir);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return manifest.profile.slug;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Normalize a manifest into section arrays with stable defaults for sync/materialize. */
function cleanSections(manifest) {
  return {
    identity: { title: manifest.identity?.title ?? "", summary: manifest.identity?.summary ?? "" },
    expertise: manifest.expertise ?? [],
    methods: manifest.methods ?? [],
    rules: manifest.rules ?? [],
    policies: manifest.policies ?? [],
    standards: manifest.standards ?? [],
    references: manifest.references ?? {},
    skills: manifest.skills ?? [],
    skillsDetail: manifest.skillsDetail ?? {},
    verification: {
      required: manifest.verification?.required ?? [],
      optional: manifest.verification?.optional ?? [],
    },
  };
}

/** Human title from an item string (strips the "— see ..." pointer). */
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

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const [, , cmd, arg] = process.argv;
const ROOTS = ["profiles", ".marketplace/items"];

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
  // fixed-point check: sync after materialize must not change any manifest
  let checked = 0;
  let dirty = 0;
  for (const dir of profileDirs(ROOTS)) {
    const before = fs.readFileSync(path.join(dir, "profile.json"), "utf8");
    materializeProfile(dir);
    syncProfileFolders(dir);
    const after = fs.readFileSync(path.join(dir, "profile.json"), "utf8");
    checked++;
    if (before !== after) {
      dirty++;
      console.error("NOT a fixed point:", dir);
    }
  }
  console.log(`checked ${checked} profiles, ${dirty} drift`);
  process.exit(dirty === 0 ? 0 : 1);
} else {
  console.error("usage: profile-folders.mjs materialize|sync <dir> | materialize-all | sync-all | check-all");
  process.exit(2);
}
