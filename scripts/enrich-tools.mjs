// One-shot tools enrichment: give every profile and crew real, matched
// skills and MCP servers.
//
// Sources (all verified 2026-09-19):
//   - skills.sh  — skill repos are exactly as observed in search results
//     (repo + skill name + install counts); install command is the standard
//     `npx skills add owner/repo --skill <name>`.
//   - MCP registry (registry.modelcontextprotocol.io) — Figma remote
//     https://mcp.figma.com/mcp is the official registered endpoint.
//   - npm — every stdio command's package verified present (npx -y <pkg>).
//
// Profiles: adds skills/NN-*.md ref files + mcp/packages in
// tools/requirements.md frontmatter, then `profile-folders.mjs sync-all`
// regenerates profile.json (folders are the source of truth).
// Crews: fills mcp/servers.json and wires member mcpServers by name.
//
// Usage: node scripts/enrich-tools.mjs
import fs from "node:fs";
import path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

const REG = path.resolve("registry");

// ---------------------------------------------------------------- servers
// Canonical server definitions (referenced by name across profiles/crews).
const SERVERS = {
  github: {
    name: "github",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    allowedTools: ["get_file_contents", "list_commits", "search_code", "create_pull_request"],
  },
  postgres: {
    name: "postgres",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@henkey/postgres-mcp-server"],
  },
  playwright: {
    name: "playwright",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
  },
  figma: {
    name: "figma",
    transport: "http",
    url: "https://mcp.figma.com/mcp",
  },
  "sequential-thinking": {
    name: "sequential-thinking",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  kubernetes: {
    name: "kubernetes",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-kubernetes"],
  },
};

// ---------------------------------------------------------------- profiles
// skills: skills.sh-observed packs { repo, skills, note }.
// mcp/packages: written into tools/requirements.md frontmatter.
const PROFILES = {
  "accessibility-engineer": {
    skills: [
      { repo: "addyosmani/web-quality-skills", skills: ["accessibility"], note: "axe-style a11y checks (54k installs on skills.sh)" },
      { repo: "flutter/agent-plugins", skills: ["flutter-improving-accessibility"], note: "a11y patterns for Flutter/mobile" },
    ],
    mcp: ["figma", "playwright"],
    packages: [{ registry: "npm:axe-core", reason: "programmatic a11y rule checks in verification" }],
  },
  "api-designer": {
    skills: [
      { repo: "addyosmani/agent-skills", skills: ["api-and-interface-design"], note: "contract/module boundary design" },
      { repo: "github/awesome-copilot", skills: ["rest-api-design"], note: "REST resource-modeling guidance" },
    ],
    mcp: ["sequential-thinking"],
  },
  "backend-engineer": {
    skills: [
      { repo: "wshobson/agents", skills: ["nodejs-backend-patterns"], note: "service/repository patterns for the dominant backend stack" },
      { repo: "vercel/vercel-plugin", skills: ["create-a-backend"], note: "scaffold-to-ship backend flow" },
    ],
    mcp: ["postgres"],
  },
  "database-engineer": {
    skills: [
      { repo: "github/awesome-copilot", skills: ["postgresql-optimization", "postgresql-code-review"], note: "query plans, indexes, schema review" },
      { repo: "supabase/agent-skills", skills: ["supabase-postgres-best-practices"], note: "Postgres schema/RLS best practices" },
    ],
    mcp: ["postgres"],
  },
  "data-engineer": {
    skills: [{ repo: "github/awesome-copilot", skills: ["sql-code-review"], note: "reviewing analytical SQL in pipelines" }],
    mcp: ["postgres"],
  },
  "developer-experience-engineer": {
    skills: [{ repo: "addyosmani/agent-skills", skills: ["documentation-and-adrs"], note: "ADRs and docs as DX artifacts" }],
  },
  "devops-engineer": {
    skills: [
      { repo: "hashicorp/agent-skills", skills: ["terraform-style-guide", "terraform-test"], note: "IaC authoring + test practices (vendor-official)" },
      { repo: "addyosmani/agent-skills", skills: ["ci-cd-and-automation"], note: "pipeline quality gates" },
    ],
    mcp: ["kubernetes"],
  },
  "frontend-engineer": {
    skills: [
      { repo: "vercel-labs/agent-skills", skills: ["vercel-react-best-practices"], note: "React performance patterns (vendor-official)" },
      { repo: "anthropics/skills", skills: ["frontend-design"], note: "polished, production-quality UI craft" },
    ],
    mcp: ["figma", "playwright"],
    packages: [{ registry: "npm:lighthouse", reason: "programmatic perf/SEO audits during verification" }],
  },
  "legacy-modernizer": {
    skills: [
      { repo: "wshobson/agents", skills: ["dotnet-backend-patterns", "nodejs-backend-patterns"], note: "target patterns for the two most common legacy stacks" },
    ],
  },
  "ml-engineer": {
    skills: [
      { repo: "axiomhq/skills", skills: ["writing-evals"], note: "eval authoring for model-backed features" },
      { repo: "huggingface/skills", skills: ["huggingface-community-evals"], note: "community benchmark harnesses (vendor-official)" },
      { repo: "mindrally/skills", skills: ["machine-learning"], note: "training/eval fundamentals" },
    ],
  },
  "mobile-engineer": {
    skills: [
      { repo: "wshobson/agents", skills: ["mobile-ios-design", "mobile-android-design"], note: "platform-conventional mobile UI" },
      { repo: "flutter/agent-plugins", skills: ["flutter-improving-accessibility"], note: "cross-platform a11y (vendor-official)" },
    ],
  },
  "performance-engineer": {
    skills: [{ repo: "addyosmani/web-quality-skills", skills: ["performance"], note: "Core Web Vitals audit practice (27k+ installs)" }],
    mcp: ["playwright"],
    packages: [{ registry: "npm:lighthouse", reason: "CI-grade performance audits" }],
  },
  "platform-engineer": {
    skills: [
      { repo: "hashicorp/agent-skills", skills: ["terraform-style-guide"], note: "IaC conventions (vendor-official)" },
      { repo: "addyosmani/agent-skills", skills: ["ci-cd-and-automation"], note: "golden-path pipeline work" },
    ],
    mcp: ["kubernetes"],
  },
  "principal-engineer": {
    skills: [{ repo: "addyosmani/agent-skills", skills: ["api-and-interface-design"], note: "interface boundaries at system scale" }],
    mcp: ["sequential-thinking"],
  },
  "privacy-engineer": {
    skills: [{ repo: "bitwarden/ai-plugins", skills: ["threat-modeling"], note: "privacy threat modeling (vendor-official)" }],
  },
  "qa-engineer": {
    skills: [
      { repo: "anthropics/skills", skills: ["webapp-testing"], note: "browser-driven test flows (vendor-official)" },
      { repo: "mattpocock/skills", skills: ["tdd"], note: "test-first practice" },
    ],
    mcp: ["playwright"],
  },
  "release-engineer": {
    skills: [
      { repo: "addyosmani/agent-skills", skills: ["ci-cd-and-automation"], note: "release pipeline gates" },
      { repo: "superagent-ai/skills", skills: ["ci-cd-security"], note: "supply-chain security of the pipeline" },
    ],
    mcp: ["github"],
  },
  "security-engineer": {
    skills: [
      { repo: "getsentry/skills", skills: ["security-review"], note: "structured security review (vendor-official)" },
      { repo: "openai/skills", skills: ["security-best-practices"], note: "secure-coding checklist (vendor-official)" },
    ],
  },
  "sre": {
    skills: [{ repo: "addyosmani/agent-skills", skills: ["observability-and-instrumentation"], note: "SLI/SLO instrumentation practice" }],
    mcp: ["kubernetes", "github"],
  },
  "staff-engineer": {
    skills: [{ repo: "addyosmani/agent-skills", skills: ["documentation-and-adrs"], note: "written strategy and decision records" }],
  },
  "systems-architect": {
    skills: [{ repo: "wshobson/agents", skills: ["api-design-principles"], note: "interface-first architecture" }],
    mcp: ["sequential-thinking"],
  },
  "technical-writer": {
    skills: [
      { repo: "anthropics/knowledge-work-plugins", skills: ["documentation"], note: "structured docs practice (vendor-official)" },
      { repo: "content-designer/ux-writing-skill", skills: ["ux-writing"], note: "interface copy standards" },
    ],
  },
  "test-automator": {
    skills: [
      { repo: "anthropics/skills", skills: ["webapp-testing"], note: "browser-driven testing (vendor-official)" },
      { repo: "wshobson/agents", skills: ["e2e-testing-patterns"], note: "suite design and flake control" },
      { repo: "mattpocock/skills", skills: ["tdd"], note: "test-first workflow" },
    ],
    mcp: ["playwright"],
  },
  // code-reviewer, senior-engineer: already well-served by obra/superpowers
  // + wesleyegberto packs; code-reviewer additionally gets the github MCP
  // for reviewing PRs in place.
  "code-reviewer": { mcp: ["github"] },
};

// ------------------------------------------------------------------ crews
// servers: crew-level mcp/servers.json entries (replaces the file).
// members: member display name -> server names wired into mcpServers.
const CREWS = {
  "data-platform-crew": {
    servers: ["postgres", "github"],
    members: {
      "Database Engineer": ["postgres", "github"],
      "Data Engineer": ["postgres", "github"],
      "Backend Engineer": ["postgres", "github"],
      "QA Engineer": ["postgres", "github"],
    },
  },
  "feature-delivery-squad": {
    servers: ["github", "figma", "playwright", "sequential-thinking"],
    members: {
      "API Designer": ["github", "sequential-thinking"],
      "Backend Engineer": ["github"],
      "Frontend Engineer": ["github", "figma", "playwright"],
      "Test Automator": ["github", "playwright"],
      "Code Reviewer": ["github"],
    },
  },
  "incidere-incident-response": {
    servers: ["github", "kubernetes", "sequential-thinking"],
    members: {
      "Triage Analyst": ["github", "kubernetes", "sequential-thinking"],
      "Remediation Engineer": ["github", "kubernetes"],
      "Comms Drafter": ["github"],
    },
  },
  "pr-review-gate": {
    servers: ["github", "sequential-thinking"],
    members: {
      "Security & Architecture Reviewer": ["github", "sequential-thinking"],
      "Standards Checker": ["github"],
    },
  },
  "release-train-crew": {
    servers: ["github", "kubernetes", "playwright"],
    members: {
      "QA Sign-off": ["github", "playwright"],
      "Release Engineer": ["github"],
      "DevOps Engineer": ["github", "kubernetes"],
      "SRE Watcher": ["github", "kubernetes"],
    },
  },
  "security-audit-crew": {
    servers: ["github", "sequential-thinking"],
    members: {
      "Audit Scout": ["github", "sequential-thinking"],
      "Threat Modeler": ["github", "sequential-thinking"],
      "Code Security Auditor": ["github"],
      "Privacy Auditor": ["github"],
    },
  },
  "test-healer": {
    servers: ["playwright", "sequential-thinking"],
    members: { "Test Healer": ["playwright", "sequential-thinking"] },
  },
  "web-quality-crew": {
    servers: ["playwright", "github"],
    members: {
      "Performance Auditor": ["playwright", "github"],
      "Accessibility Auditor": ["playwright", "github"],
      "Frontend Engineer": ["github", "playwright"],
      "QA Verifier": ["playwright", "github"],
    },
  },
};

// ---------------------------------------------------------------- helpers
const slug = (repo) => repo.split("/").slice(-1)[0];
const addCmd = (repo, firstSkill) => `npx skills add ${repo} --skill ${firstSkill}`;
const skillFile = (n, repo) => `skills/${String(n).padStart(2, "0")}-${slug(repo)}.md`;

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  return { meta: yamlParse(m[1]) ?? {}, body: m[2] ?? "" };
}

function enrichProfile(dirName, cfg) {
  const dir = path.join(REG, "profiles", dirName);
  if (!fs.existsSync(dir)) throw new Error(`profile dir missing: ${dirName}`);
  let addedSkills = 0;

  // 1. Skill ref files — append after the highest existing NN- index.
  if (cfg.skills?.length) {
    const existing = fs.readdirSync(path.join(dir, "skills")).filter((f) => f.endsWith(".md"));
    let n = existing.reduce((mx, f) => Math.max(mx, parseInt(f, 10) || 0), 0);
    for (const s of cfg.skills) {
      n += 1;
      const file = skillFile(n, s.repo);
      const body = [
        "---",
        `title: ${slug(s.repo)}`,
        `ref: github:${s.repo}`,
        `install: ${addCmd(s.repo, s.skills[0])}`,
        `skills: ${s.skills.join(", ")}`,
        "---",
        "",
        s.note + ".",
        "",
      ].join("\n");
      fs.writeFileSync(path.join(dir, file), body);
      addedSkills++;
    }
  }

  // 2. tools/requirements.md — merge mcp/packages into frontmatter, note in body.
  const reqPath = path.join(dir, "tools", "requirements.md");
  const raw = fs.readFileSync(reqPath, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  const mcp = (cfg.mcp ?? []).map((k) => SERVERS[k]);
  const packages = cfg.packages ?? [];
  for (const [key, value] of [
    ["mcp", mcp],
    ["packages", packages],
  ]) {
    if (value.length === 0) continue;
    if (meta[key]?.length) throw new Error(`${dirName}: tools.${key} already declared — refusing to overwrite`);
    meta[key] = value;
  }
  const lines = ["---", yamlStringify(meta).trim(), "---", "", body.trim(), ""];
  if (mcp.length) {
    lines.push(`**MCP servers:** ${mcp.map((s) => s.name).join(", ")}`, "");
  }
  if (packages.length) {
    lines.push(`**Packages:** ${packages.map((p) => p.registry).join(", ")}`, "");
  }
  fs.writeFileSync(reqPath, lines.join("\n"));
  return { addedSkills, mcp: mcp.length, packages: packages.length };
}

function enrichCrew(crewId, cfg) {
  const dir = path.join(REG, "crews", crewId);
  if (!fs.existsSync(dir)) throw new Error(`crew dir missing: ${crewId}`);
  const servers = cfg.servers.map((k) => SERVERS[k]);
  fs.writeFileSync(path.join(dir, "mcp", "servers.json"), JSON.stringify(servers, null, 2) + "\n");
  let wired = 0;
  for (const memberFile of fs.readdirSync(path.join(dir, "members"))) {
    if (!memberFile.endsWith(".json")) continue;
    const mPath = path.join(dir, "members", memberFile);
    const member = JSON.parse(fs.readFileSync(mPath, "utf8"));
    const names = cfg.members[member.name];
    if (!names) continue; // not every member needs servers
    member.mcpServers = names;
    fs.writeFileSync(mPath, JSON.stringify(member, null, 2) + "\n");
    wired++;
  }
  return { servers: servers.length, wired };
}

// ------------------------------------------------------------------- main
let profileStats = { skills: 0, mcp: 0, packages: 0, touched: 0 };
for (const [slugKey, cfg] of Object.entries(PROFILES)) {
  const r = enrichProfile(slugKey, cfg);
  profileStats.skills += r.addedSkills;
  profileStats.mcp += r.mcp;
  profileStats.packages += r.packages;
  if (r.addedSkills || r.mcp || r.packages) profileStats.touched++;
}
let crewStats = { servers: 0, wired: 0 };
for (const [crewId, cfg] of Object.entries(CREWS)) {
  const r = enrichCrew(crewId, cfg);
  crewStats.servers += r.servers;
  crewStats.wired += r.wired;
}
console.log(
  `profiles: ${profileStats.touched} enriched (+${profileStats.skills} skill files, +${profileStats.mcp} mcp, +${profileStats.packages} packages)\n` +
    `crews: ${Object.keys(CREWS).length} enriched (${crewStats.servers} server entries, ${crewStats.wired} members wired)\n` +
    `next: node scripts/profile-folders.mjs sync-all`,
);
