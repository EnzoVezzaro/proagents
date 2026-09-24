import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { compileForHarness, detectHarnesses } from "../adapters/index.js";
import type { HarnessSignal } from "../adapters/index.js";
import { composeProfiles } from "../profiles/composition.js";
import type { ProfileManifest } from "../profiles/types.js";

/**
 * Install lifecycle — deterministic provenance verification for equipped
 * artifacts (invariant 1: same repo state, same report).
 *
 * Ownership markers:
 *   - a profile install owns `.agents/skills/<dir>/manifest.json` (the
 *     canonical manifest is written beside the compiled skill)
 *   - instruction blocks own their `<!-- proagent:profile:start … -->` …
 *     `<!-- proagent:profile:end … -->` region
 *   - crews own `.agents/crews/<id>/manifest.json`
 *
 * `doctor` verifies those markers (present-once, balanced, parseable) and
 * reports the uninstall gap: blocks left behind by `proagent remove` are
 * surfaced as stale. `repair` deterministically recompiles single-profile
 * installs from the on-disk canonical manifest; composed installs cannot be
 * reconstructed from one stored manifest and are reported as limitations.
 */

const SKILL_DIRS = [".agents/skills", ".openclaude/skills"];
const INSTRUCTION_FILES = ["CLAUDE.md", "GEMINI.md", "AGENTS.md", ".github/copilot-instructions.md"];
const BLOCK_START = /<!-- proagent:profile:start ([0-9a-f]+) -->/g;
const BLOCK_HEADING = /^# Professional Profile: (.+)$/m;

export interface InstalledProfile {
  dir: string;
  slug: string;
  version: string;
  hasManifest: boolean;
  hasSkill: boolean;
  /** dir basename equals manifest.profile.slug — a reconstructible install. */
  canonical: boolean;
}

export interface InstalledCrew {
  dir: string;
  id: string;
  version: string;
  hasSkill: boolean;
}

export interface InstalledBlock {
  file: string;
  marker: string;
  line: number;
  closed: boolean;
  title?: string;
}

export interface InstalledInventory {
  root: string;
  profiles: InstalledProfile[];
  crews: InstalledCrew[];
  blocks: InstalledBlock[];
  summary: { profiles: number; crews: number; blocks: number };
}

export interface DoctorFinding {
  code: string;
  severity: "error" | "warning";
  file: string;
  line: number;
  message: string;
  suggestion: string;
}

export interface DoctorReport {
  status: "ok";
  root: string;
  findings: DoctorFinding[];
  summary: { total: number; errors: number; warnings: number };
  exit: number;
}

export interface RepairReport {
  status: "ok";
  root: string;
  target: string;
  repaired: string[];
  limitations: string[];
}

async function isFile(root: string, rel: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(root, rel))).isFile();
  } catch {
    return false;
  }
}

async function readDir(root: string, rel: string): Promise<fsSync.Dirent[]> {
  try {
    return await fs.readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Parse the single proagent instruction block region in a file, if present. */

/**
 * Enumerate what ProAgents owns in a repo. Deterministic: sorted, keyed only
 * on the filesystem markers, never on model output.
 */
export async function scanInstalled(root: string): Promise<InstalledInventory> {
  const profiles: InstalledProfile[] = [];
  const crews: InstalledCrew[] = [];
  const blocks: InstalledBlock[] = [];

  for (const skillsDir of SKILL_DIRS) {
    for (const entry of await readDir(root, skillsDir)) {
      if (!entry.isDirectory()) continue;
      const dir = path.posix.join(skillsDir, entry.name);
      const manifestPath = path.posix.join(dir, "manifest.json");
      if (!(await isFile(root, manifestPath))) continue;

      let slug = entry.name;
      let version = "";
      let parsed = false;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(root, manifestPath), "utf8")) as Partial<ProfileManifest>;
        if (raw.profile?.slug) slug = raw.profile.slug;
        version = typeof raw.version === "string" ? raw.version : "";
        parsed = true;
      } catch {
        // falls through as a broken manifest (already reported by doctor)
      }
      profiles.push({
        dir,
        slug,
        version,
        hasManifest: parsed,
        hasSkill: await isFile(root, path.posix.join(dir, "SKILL.md")),
        canonical: entry.name === slug,
      });
    }
  }

  for (const entry of await readDir(root, ".agents/crews")) {
    if (!entry.isDirectory()) continue;
    const dir = path.posix.join(".agents/crews", entry.name);
    const manifestPath = path.posix.join(dir, "manifest.json");
    if (!(await isFile(root, manifestPath))) continue;
    let id = entry.name;
    let version = "";
    try {
      const raw = JSON.parse(await fs.readFile(path.join(root, manifestPath), "utf8")) as { crew?: { id?: string }; version?: string };
      if (raw.crew?.id) id = raw.crew.id;
      version = typeof raw.version === "string" ? raw.version : "";
    } catch {
      // broken crew manifest
    }
    crews.push({ dir, id, version, hasSkill: await isFile(root, path.posix.join(dir, "SKILL.md")) });
  }

  for (const file of INSTRUCTION_FILES) {
    if (!(await isFile(root, file))) continue;
    const content = await fs.readFile(path.join(root, file), "utf8");
    BLOCK_START.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLOCK_START.exec(content)) !== null) {
      const marker = m[1] ?? "";
      const line = content.slice(0, m.index).split("\n").length;
      const endRe = new RegExp(`<!-- proagent:profile:end ${marker} -->`);
      const within = content.slice(m.index + m[0].length);
      const endIdx = within.search(endRe);
      const isClosed = endIdx !== -1;
      // title: the block heading on the line after the start marker
      let title: string | undefined;
      const rest = content.slice(m.index + m[0].length, m.index + m[0].length + 4000);
      const head = BLOCK_HEADING.exec(rest);
      if (head?.[1]) title = head[1];
      blocks.push({ file, marker, line, closed: isClosed, ...(title ? { title } : {}) });
    }
  }

  profiles.sort((a, b) => a.dir.localeCompare(b.dir));
  crews.sort((a, b) => a.dir.localeCompare(b.dir));
  blocks.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return {
    root,
    profiles,
    crews,
    blocks,
    summary: { profiles: profiles.length, crews: crews.length, blocks: blocks.length },
  };
}

/**
 * `proagent doctor` — verify installed artifacts vs provenance. Exit:
 * 0 clean · 1 warnings only · 2 errors present (mirrors audit).
 */
export async function runDoctor(root: string): Promise<DoctorReport> {
  const inv = await scanInstalled(root);
  const findings: DoctorFinding[] = [];
  const push = (code: string, severity: "error" | "warning", file: string, line: number, message: string, suggestion: string): void => {
    findings.push({ code, severity, file, line, message, suggestion });
  };

  for (const p of inv.profiles) {
    if (!p.hasManifest) {
      push(
        "DG001",
        "error",
        path.posix.join(p.dir, "manifest.json"),
        1,
        `profile manifest in ${p.dir} is unreadable or invalid`,
        `re-equip the profile or remove the broken directory: proagent remove ${p.slug}`,
      );
    }
    if (p.hasManifest && !p.hasSkill) {
      push(
        "DG002",
        "error",
        path.posix.join(p.dir, "SKILL.md"),
        1,
        `profile "${p.slug}" is installed (manifest present) but its SKILL.md is missing`,
        `repair restores it from the on-disk manifest: proagent repair`,
      );
    }
  }

  for (const file of INSTRUCTION_FILES) {
    const rel = file;
    if (!(await isFile(root, rel))) continue;
    const content = await fs.readFile(path.join(root, rel), "utf8");
    const starts: Array<{ marker: string; index: number; line: number }> = [];
    BLOCK_START.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLOCK_START.exec(content)) !== null) {
      const line = content.slice(0, m.index).split("\n").length;
      starts.push({ marker: m[1] ?? "", index: m.index, line });
    }

    for (const s of starts) {
      const endRe = new RegExp(`<!-- proagent:profile:end ${s.marker} -->`);
      if (content.slice(s.index + 1).search(endRe) === -1) {
        push(
          "DG003",
          "error",
          rel,
          s.line,
          `instruction block marker ${s.marker} in ${rel} has no matching end marker`,
          "repair rewrites the block: proagent repair",
        );
      }
    }
    if (starts.length > 1) {
      const first = starts[0];
      push(
        "DG004",
        "error",
        rel,
        first?.line ?? 1,
        `${rel} contains more than one proagent block region`,
        "repair collapses them to a single canonical block: proagent repair",
      );
    }
  }

  // DG005 — stale block: an instruction block whose profile is not installed
  // (the uninstall gap surfaced: proagent remove deletes the skill dir but not
  // the instruction region).
  const installedTitles = new Set(inv.profiles.map((p) => p.slug).filter(Boolean));
  const normalize = (s: string): string => s.toLowerCase().replace(/[-_]/g, " ");
  for (const b of inv.blocks) {
    const title = normalize(b.title ?? "");
    const owned = [...installedTitles].find((s) => title.includes(normalize(s)) || normalize(s).includes(title));
    if (!owned) {
      push(
        "DG005",
        "warning",
        b.file,
        1,
        `instruction block "${b.title ?? b.marker}" in ${b.file} matches no installed profile (stale after remove)`,
        "remove the stale region or re-equip the profile: proagent equip <slug>",
      );
    }
  }

  const settings = path.join(".claude", "settings.json");
  if (await isFile(root, settings)) {
    try {
      JSON.parse(await fs.readFile(path.join(root, settings), "utf8"));
    } catch {
      push(
        "DG006",
        "warning",
        settings,
        1,
        ".claude/settings.json is not valid JSON — rule enforcement hooks cannot load",
        "repair regenerates the enforcement config: proagent repair",
      );
    }
  }

  const mcp = ".mcp.json";
  if (await isFile(root, mcp)) {
    try {
      JSON.parse(await fs.readFile(path.join(root, mcp), "utf8"));
    } catch {
      push(
        "DG007",
        "warning",
        mcp,
        1,
        ".mcp.json is not valid JSON — merged MCP servers cannot load",
        "repair regenerates the merge: proagent repair",
      );
    }
  }

  // Deterministic ordering by code then file.
  findings.sort((a, b) => a.code.localeCompare(b.code) || a.file.localeCompare(b.file) || a.line - b.line);

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const exit = errors > 0 ? 2 : warnings > 0 ? 1 : 0;
  return {
    status: "ok",
    root,
    findings,
    summary: { total: findings.length, errors, warnings },
    exit,
  };
}

/**
 * `proagent repair` — deterministic reconstruction from on-disk owner
 * manifests. Single-profile installs (dir basename === manifest.profile.slug)
 * are recompiled for the target harness; everything reconstructible is
 * repaired. Composed installs cannot be rebuilt from one stored manifest and
 * are reported as limitations, never silently mangled.
 */
export async function runRepair(root: string, target?: HarnessSignal): Promise<RepairReport> {
  const selected = target ?? (await detectHarnesses(root, {})).primary;
  const inv = await scanInstalled(root);
  const repaired: string[] = [];
  const limitations: string[] = [];

  for (const p of inv.profiles) {
    if (!p.hasManifest) {
      limitations.push(`${p.dir} has a broken manifest — cannot repair; re-equip or remove it`);
      continue;
    }
    if (!p.canonical) {
      limitations.push(
        `${p.dir} is a composed install (dir != manifest.profile.slug "${p.slug}") — cannot reconstruct from a single stored manifest; re-equip with the full profile set`,
      );
      continue;
    }
    // Recompile the single profile from the canonical on-disk manifest.
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, p.dir, "manifest.json"), "utf8"),
    ) as ProfileManifest;
    const composed = composeProfiles([manifest]);
    const result = await compileForHarness(composed.effective, manifest, selected, root, {
      knowledgeDirs: [path.join(root, p.dir)],
    });
    for (const f of result.files) repaired.push(f.path);
    if (result.limitations.length > 0) limitations.push(...result.limitations);
  }

  repaired.sort();
  limitations.sort();
  return { status: "ok", root, target: selected.id, repaired, limitations };
}