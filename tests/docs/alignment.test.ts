import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HARNESS_SPECS } from "../../src/adapters/index.js";

/**
 * DOCS-ALIGN — the drift fence.
 *
 * Documents are claims about the CLI. This suite machine-checks the claims
 * (README, docs/, the shipped skill, the landing page, workflow guidance)
 * against the source of truth: the CLI dispatch, HARNESS_SPECS, the
 * registry folders and the catalog.
 *
 * When a check fails, decide which side is wrong and fix THAT — docs follow
 * code, not the other way around.
 */

const ROOT = process.cwd();
const TARGETS = [...HARNESS_SPECS.map((s) => s.id), "generic-cli"];
const GROUPS = ["profile", "crew", "benchmark"] as const;

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel, ext));
    else if (ext.some((e) => entry.name.endsWith(e))) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source of truth: commands scraped from the CLI dispatch
// ---------------------------------------------------------------------------

function scrapeCases(rel: string): string[] {
  const src = read(rel);
  return [...src.matchAll(/^\s*case "([a-z][a-z-]*)":/gm)].map((m) => m[1]);
}

const TOP_COMMANDS = new Set(scrapeCases("src/cli/index.ts").filter((c) => c !== "default"));
const SUB_COMMANDS: Record<string, Set<string>> = {
  profile: new Set(scrapeCases("src/cli/profiles.ts").filter((c) => c !== "help")),
  crew: new Set(scrapeCases("src/cli/crew.ts").filter((c) => c !== "help")),
  benchmark: new Set(scrapeCases("src/cli/benchmark.ts").filter((c) => c !== "help")),
};

// ---------------------------------------------------------------------------
// Documented surfaces that must stay aligned
// ---------------------------------------------------------------------------

const DOC_SURFACES = [
  "README.md",
  "REGISTRY.md",
  "AGENTS.md",
  ...walk("docs", [".md"]),
  ".agents/skills/proagent/SKILL.md",
  ...walk(".agents/skills/proagent/references", [".md"]),
  "docs/.vitepress/theme/landing/Landing.vue",
].map((rel) => rel.split(path.sep).join("/"));

interface Invocation {
  file: string;
  line: number;
  command: string;
  sub?: string;
  flags: string[];
}

function extractInvocations(rel: string): Invocation[] {
  const text = read(rel);
  const lines = text.split("\n");
  const found: Invocation[] = [];
  for (const [i, line] of lines.entries()) {
    const re = /\bproagent\s+([a-z][a-z0-9-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const command = m[1];
      let sub: string | undefined;
      if ((GROUPS as readonly string[]).includes(command)) {
        const rest = line.slice(m.index + m[0].length).trimStart();
        const sm = /^([a-z][a-z0-9-]*)/.exec(rest);
        if (sm) sub = sm[1];
      }
      const flags = [...line.matchAll(/--([a-z][a-z0-9-]*)/g)].map((f) => f[1]);
      found.push({ file: rel, line: i + 1, command, sub, flags });
    }
  }
  return found;
}

const ALL_INVOCATIONS = DOC_SURFACES.flatMap(extractInvocations);

// ---------------------------------------------------------------------------
// Per-command flag contracts (mirrors src/cli handlers; guarded against
// source rot below). Global flags are accepted everywhere.
// ---------------------------------------------------------------------------

const GLOBAL_FLAGS = new Set(["json", "quiet", "non-interactive", "all-targets"]);

const COMMAND_FLAGS: Record<string, string[]> = {
  detect: [],
  list: ["kind", "repo", "ref", "token"],
  equip: ["target", "dry-run", "repo", "ref", "token"],
  compile: ["target", "output", "dry-run", "repo", "ref", "token"],
  init: ["intent", "context", "context-framework", "self-improving", "improvement-policy"],
  status: [],
  question: ["all"],
  answer: ["answer"],
  context: ["task", "scope", "max-bytes", "depth", "context-framework"],
  spec: ["output"],
  validate: ["spec", "profiles", "file"],
  build: ["kind", "agent", "output", "slug", "id", "description"],
  discover: [],
  search: ["type", "limit", "repo", "ref", "token"],
  info: [],
  install: ["target", "dry-run"],
  remove: [],
  update: ["file"],
  resolve: ["select", "file"],
  lock: ["select", "file"],
  compose: [],
  setup: ["harness", "dry-run", "file"],
  agents: [],
  inspect: [],
  improve: ["improvement-policy"],
  "self-improve": ["schedule", "improvement-policy"],
  crew: ["repo", "ref", "token"],
  benchmark: [],
};

const SUB_FLAGS: Record<string, Record<string, string[]>> = {
  profile: {
    create: ["slug", "description", "name"],
    list: ["repo", "ref", "token"],
    show: [],
    install: ["target", "dry-run", "repo", "ref", "token"],
    validate: [],
    publish: ["repo", "ref", "token"],
    submit: ["repo"],
  },
  crew: {
    list: ["repo", "ref", "token"],
    validate: [],
    show: [],
    install: ["dry-run"],
    build: ["file", "repo", "ref", "token", "dry-run"],
    create: ["name", "id", "description", "role"],
    publish: ["repo", "ref", "token"],
    submit: ["repo"],
  },
  benchmark: {
    list: [],
    create: [],
    validate: [],
    run: ["runs", "case", "agent", "deterministic"],
    report: [],
    compare: [],
    baseline: [],
    regressions: [],
    inspect: [],
    evaluators: [],
  },
};

function flagsFor(inv: Invocation): Set<string> {
  const group = (GROUPS as readonly string[]).includes(inv.command) ? inv.command : null;
  const key = group && inv.sub && SUB_FLAGS[group]?.[inv.sub] ? `${inv.command} ${inv.sub}` : inv.command;
  const list = SUB_FLAGS[inv.command]?.[inv.sub] ?? COMMAND_FLAGS[inv.command] ?? [];
  return new Set([...list, ...GLOBAL_FLAGS, ...(group ? COMMAND_FLAGS[inv.command] ?? [] : [])]);
}

describe("docs alignment (DOCS-ALIGN)", () => {
  it("DOCS-ALIGN-001: every documented `proagent <cmd>` resolves to a real command", () => {
    const bad = ALL_INVOCATIONS.filter(
      (inv) => !TOP_COMMANDS.has(inv.command) || (inv.sub && !SUB_COMMANDS[inv.command]?.has(inv.sub)),
    );
    expect(bad).toEqual([]);
  });

  it("DOCS-ALIGN-002: every documented flag is valid for its command (e.g. no --harness on equip)", () => {
    const bad = ALL_INVOCATIONS.filter((inv) => inv.flags.some((f) => !flagsFor(inv).has(f))).map(
      (inv) => `${inv.file}:${inv.line} ${inv.command}${inv.sub ? " " + inv.sub : ""} --${inv.flags.join(" --")}`,
    );
    expect(bad).toEqual([]);
  });

  it("DOCS-ALIGN-003: the flag contracts do not rot — every mapped flag still exists in the CLI source", () => {
    const cliSource = ["src/cli", "src/core", "src/registry"]
      .flatMap((dir) => walk(dir, [".ts"]))
      .map(read)
      .join("\n");
    const stale: string[] = [];
    for (const [command, flags] of Object.entries(COMMAND_FLAGS)) {
      if (!TOP_COMMANDS.has(command) && !(GROUPS as readonly string[]).includes(command)) continue;
      for (const flag of flags) {
        if (!cliSource.includes(`--${flag}`) && !cliSource.includes(flag)) stale.push(`${command} --${flag}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("DOCS-ALIGN-010: docs/cli/index.md documents every dispatch command (reference completeness)", () => {
    const cliIndex = read("docs/cli/index.md");
    const missing = [...TOP_COMMANDS]
      .filter((c) => !["help", "version"].includes(c))
      .filter((c) => !new RegExp(`\\b${c}\\b`).test(cliIndex));
    const missingSubs = (["profile", "crew", "benchmark"] as const).flatMap((group) =>
      [...SUB_COMMANDS[group]].filter((sub) => !new RegExp(`\\b${sub}\\b`).test(cliIndex)).map((sub) => `${group} ${sub}`),
    );
    expect({ missing, missingSubs }).toEqual({ missing: [], missingSubs: [] });
  });

  it("DOCS-ALIGN-011: the --target row lists every accepted harness id", () => {
    const row = read("docs/cli/index.md")
      .split("\n")
      .find((l) => l.includes("--target <harness>"));
    expect(row).toBeDefined();
    const missing = TARGETS.filter((id) => !(row ?? "").includes(id));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-012: the shipped skill's harness-id list matches HARNESS_SPECS + generic-cli", () => {
    const text = read(".agents/skills/proagent/references/profiles.md");
    const missing = TARGETS.filter((id) => !text.includes(id));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-013: the profile mechanism matrix covers every harness spec", () => {
    const matrix = read("docs/guide/profiles.md").split("\n").slice(140, 185).join("\n");
    const names = HARNESS_SPECS.map((s) => s.name);
    const missing = [...names, "generic CLI"].filter((name) => !matrix.includes(name));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-014: the catalog's compatibility arrays list every accepted target", () => {
    const catalog = JSON.parse(read("registry/catalog.json")) as { items: Array<{ compatibility?: string[] }> };
    const offenders = catalog.items.filter((i) => (i.compatibility ?? []).length !== TARGETS.length);
    expect(offenders).toEqual([]);
  });

  it("DOCS-ALIGN-015: registry folders and catalog ids agree (profiles + crews)", () => {
    const catalog = JSON.parse(read("registry/catalog.json")) as {
      items: Array<{ id: string; kind: string }>;
    };
    const profileFolders = fs.readdirSync(path.join(ROOT, "registry/profiles")).filter((f) => f !== ".DS_Store");
    const crewFolders = fs.readdirSync(path.join(ROOT, "registry/crews")).filter((f) => f !== ".DS_Store");
    const catalogProfiles = catalog.items.filter((i) => i.kind === "profile").map((i) => i.id).sort();
    const catalogCrews = catalog.items.filter((i) => i.kind === "crew" || i.kind === "agent").map((i) => i.id).sort();
    expect(catalogProfiles).toEqual([...profileFolders].sort());
    expect(catalogCrews).toEqual([...crewFolders].sort());
  });

  it("DOCS-ALIGN-020: no .md section paths in manifest examples (registry is JSON-only)", () => {
    const surfaces = ["README.md", ...walk("docs", [".md"])];
    const SECTION = "(?:identity|expertise|knowledge|methods|skills|rules|standards|policies|verification|tools|docs)";
    const violations: string[] = [];
    for (const rel of surfaces) {
      const text = read(rel);
      const jsonPaths = [...text.matchAll(new RegExp(`"${SECTION}/[a-z0-9][a-z0-9/._-]*\\.md"`, "g"))].map((m) => m[0]);
      const yamlPaths = [...text.matchAll(/^(?:identity|tools):\s*[a-z0-9][a-z0-9/_-]*\.md\s*$/gm)].map((m) => m[0]);
      if (jsonPaths.length || yamlPaths.length) violations.push(`${rel}: ${[...jsonPaths, ...yamlPaths].join(", ")}`);
    }
    expect(violations).toEqual([]);
  });

  it("DOCS-ALIGN-021: README shows the JSON manifest standard, not YAML", () => {
    expect(read("README.md")).not.toMatch(/```yaml/);
  });

  it("DOCS-ALIGN-022: getting-started shows JSON where it claims plain JSON", () => {
    const gs = read("docs/guide/getting-started.md");
    const fence = /plain JSON[^`]*```([a-z]+)/.exec(gs);
    expect(fence?.[1]).toBe("json");
  });

  it("DOCS-ALIGN-030: README profile examples exist in the registry", () => {
    const block = /Examples:\s*```text\s*([\s\S]*?)```/.exec(read("README.md"));
    expect(block).toBeDefined();
    const slugs = (block?.[1] ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[a-z][a-z-]*$/.test(l));
    const registrySlugs = fs.readdirSync(path.join(ROOT, "registry/profiles")).filter((f) => f !== ".DS_Store");
    const missing = slugs.filter((s) => !registrySlugs.includes(s));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-031: docs/guide/profiles.md tables cover every registry slug", () => {
    const text = read("docs/guide/profiles.md");
    const registrySlugs = fs.readdirSync(path.join(ROOT, "registry/profiles")).filter((f) => f !== ".DS_Store");
    const missing = registrySlugs.filter((slug) => !new RegExp(`\\b${slug}\\b`).test(text));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-040: the skill points at .proagent/profiles, not ./profiles/", () => {
    const skill = [".agents/skills/proagent/SKILL.md", ...walk(".agents/skills/proagent/references", [".md"])].map(read).join("\n");
    expect(skill).toContain(".proagent/profiles");
    expect(skill).not.toMatch(/\.\/profiles\//);
    expect(skill).not.toMatch(/`profiles\/\*\.json`/);
  });

  it("DOCS-ALIGN-041: the compiled canonical manifest is manifest.json, never profile.json", () => {
    const refs = walk(".agents/skills/proagent/references", [".md"]).map(read).join("\n");
    expect(refs).toContain("manifest.json");
    expect(refs).not.toMatch(/\bprofile\.json\b/);
    const workflows = walk(".github/workflows", [".yml"]).map(read).join("\n");
    expect(workflows).not.toMatch(/registry\/profiles\/[a-z-]+\/profile\.json/);
  });

  it("DOCS-ALIGN-042: REGISTRY.md describes the folder standard PR path", () => {
    const text = read("REGISTRY.md");
    expect(text).not.toMatch(/\bitems\/<slug>\.json\b/);
    expect(text).toContain("manifest.json");
  });

  it("DOCS-ALIGN-050: the landing page version badge is derived from package.json", () => {
    const landing = read("docs/.vitepress/theme/landing/Landing.vue");
    expect(landing).toMatch(/package\.json/);
    expect(landing).not.toMatch(/v0\.\d+\.\d+/);
  });

  it("DOCS-ALIGN-051: the landing page shows valid signatures", () => {
    const landing = read("docs/.vitepress/theme/landing/Landing.vue");
    expect(landing).not.toContain("--harness auto");
    expect(landing).not.toContain("profile validate security-engineer");
  });

  it("DOCS-ALIGN-060: every npm script referenced by AGENTS.md exists in package.json", () => {
    const agents = read("AGENTS.md");
    const scripts = Object.keys(JSON.parse(read("package.json")).scripts);
    const referenced = [...agents.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1]);
    const missing = [...new Set(referenced)].filter((s) => !scripts.includes(s));
    expect(missing).toEqual([]);
  });

  it("DOCS-ALIGN-061: session artifacts are gitignored", () => {
    expect(read(".gitignore")).toMatch(/\.proagent/);
  });
});

describe("docs link integrity (DOCS-LINK)", () => {
  function urlToDocFile(url: string): string | null {
    if (!url.startsWith("/")) return null;
    const clean = url.replace(/\/+$/, "");
    const candidates = clean === "" ? ["docs/index.md"] : [`docs${clean}.md`, `docs${clean}/index.md`];
    for (const c of candidates) if (fs.existsSync(path.join(ROOT, c))) return c;
    return null;
  }

  it("DOCS-LINK-001: every VitePress nav/sidebar link resolves to a docs page", () => {
    const config = read("docs/.vitepress/config.mts");
    const links = [...config.matchAll(/link:\s*"(\/[^"]*)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(10);
    const broken = links.filter((url) => !fs.existsSync(path.join(ROOT, urlToDocFile(url) ?? "\0/nope")));
    expect(broken).toEqual([]);
  });

  it("DOCS-LINK-002: every internal markdown link in docs pages and README resolves", () => {
    const surfaces = ["README.md", "AGENTS.md", "REGISTRY.md", "CONTRIBUTING.md", ...walk("docs", [".md"])];
    const broken: string[] = [];
    for (const rel of surfaces) {
      const text = read(rel);
      for (const m of text.matchAll(/\]\((\/[^)#\s]+)\)/g)) {
        const file = urlToDocFile(m[1]);
        if (!file || !fs.existsSync(path.join(ROOT, file))) broken.push(`${rel}: ${m[1]}`);
      }
      for (const m of text.matchAll(/\]\((?!https?:|#|\/)([^)#\s]+\.md)\)/g)) {
        const abs = path.join(ROOT, rel.split("/").slice(0, -1).join("/"), m[1]);
        if (!fs.existsSync(abs)) broken.push(`${rel}: ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
