---
description: 'The Professional Agent Profile schema: ten modular JSON sections, composition rules and the PA03x validation codes.'
---

# Professional profiles

The profile is ProAgents' core primitive: a portable, structured, versioned definition of
**how an AI agent operates as a professional**.

```text
Professional Profile
│
├── Identity
├── Expertise
├── Knowledge
├── Methods
├── Skills
├── Rules
├── Policies
├── Standards
├── Tool requirements
└── Verification
```

A profile is not a prompt. Skills answer *"how do I perform this class of task?"* — a
profile answers *"how should an agent operate as a professional in this discipline?"* and
composes skills, methods, rules and verification into a coherent operating model.

## Schema

```json
{
  "version": "2.0.0",
  "profile": {
    "name": "Security Engineer",
    "slug": "security-engineer"
  },
  "identity": { "title": "Security Engineer", "summary": "…" },
  "expertise": ["application security", "threat modeling"],
  "knowledge": ["knowledge/threat-modeling-basics.json"],
  "methods": ["threat-modeling", "root-cause-analysis"],
  "skills": ["github:obra/superpowers"],
  "rules": ["never expose secrets", "require security verification…"],
  "ruleEnforcement": [
    {
      "rule": "never expose secrets",
      "enforcement": { "bash": ["cat .env*"], "paths": ["**/.env", "**/*.pem"], "tools": ["web"] }
    }
  ],
  "policies": ["responsible disclosure timelines"],
  "standards": ["OWASP Top 10"],
  "references": { "OWASP Top 10": { "url": "https://owasp.org/Top10/" } },
  "tools": { "required": ["filesystem", "shell", "git"], "forbidden": [] },
  "verification": { "required": ["tests", "security-scan"] }
}
```

The schema is provider-agnostic and independent of any coding-agent harness.
`version` is the profile's single, own semver.

## Profile folder standard

A profile is a **self-contained folder** — every section of the tree is a real
folder of `NN-*.json` files (numeric prefix = display order), so any concept can
be added, removed, swapped or extended without touching the others:

```
<profile>/
├── manifest.json         canonical manifest — an INDEX; every entry links to its file
├── identity.json         who the agent is (title + summary)
├── docs.json             about-this-folder notes (docs-site rendering)
├── expertise/NN-*.json   one file per domain
├── knowledge/**          reference files installed at equip time
├── methods/NN-*.json     one file per named method (playbooks)
├── skills/NN-*.json      referenced skills (repo ref, install command, uses)
├── rules/NN-*.json       normative constraints (optional machine-readable `enforcement`)
├── policies/NN-*.json    governing policies of the profession
├── standards/NN-*.json   standards with authoritative URL + note
├── tools/requirements.json  structured tool requirements (required/optional/mcp/packages)
└── verification/required|optional/NN-*.json
```

In the **folder standard**, every section entry in `manifest.json` is a path to its
file — the loader hydrates paths to content at read time (missing files are reported
by validation, never silently dropped):

```json
{
  "identity": "identity.json",
  "expertise": ["expertise/01-application-security.json", "expertise/02-threat-modeling.json"],
  "knowledge": ["knowledge/threat-modeling-basics.json"],
  "methods": ["methods/01-threat-modeling.json"],
  "rules": ["rules/01-never-expose-secrets.json"],
  "verification": { "required": ["verification/required/01-tests.json"] }
}
```

`manifest.json` is the index; the folders are the source. Two commands keep both
representations in sync (round-trip is a pinned fixed point):

```bash
node scripts/profile-folders.mjs materialize <profile-dir>   # manifest → folders
node scripts/profile-folders.mjs sync <profile-dir>          # folders → manifest (writes paths)
```

Skills entries **reference** real skill collections (e.g. `github:obra/superpowers`,
`github:anthropics/skills`) with per-repo install commands — skills are composed,
never duplicated into the profile.

All profiles are registry items: `registry/profiles/<slug>/manifest.json` is the
single source of truth (the npm package ships this folder, so offline equip works).
Crews live alongside them in `registry/crews/<id>/`.

## Built-in profiles

| Slug | Profession |
|---|---|
| `senior-engineer` | General professional engineering practice |
| `staff-engineer` | Cross-team technical leadership |
| `principal-engineer` | Organization-scale architecture and risk |
| `backend-engineer` | APIs, data integrity, reliability |
| `frontend-engineer` | Accessible, responsive user interfaces |
| `security-engineer` | Threat modeling, secure coding, OWASP |
| `performance-engineer` | Measurement-driven optimization |
| `database-engineer` | Schema, migrations, integrity |
| `devops-engineer` | Pipelines, environments, deployment safety |
| `sre` | SLOs, error budgets, incident response |
| `qa-engineer` | Test strategy, regression analysis |
| `accessibility-engineer` | WCAG, assistive technology |
| `systems-architect` | Boundaries, contracts, failure modes |

## Registry profiles

Beyond the built-ins, the Git-backed registry carries community profiles —
browse them on the site's Studio page, or with `proagent list`. Equip
works identically on both origins (missing slugs are fetched from the
catalog automatically):

| Slug | Profession |
|---|---|
| `api-designer` | API contract design, versioning and deprecation strategy |
| `code-reviewer` | Correctness analysis, API/schema review, test adequacy |
| `data-engineer` | Batch and streaming pipelines, warehouse modeling |
| `developer-experience-engineer` | Onboarding automation, local dev environments |
| `legacy-modernizer` | Strangler-fig migrations, characterization testing |
| `ml-engineer` | Training pipelines, evaluation methodology |
| `mobile-engineer` | Offline-first architecture, performance budgets |
| `platform-engineer` | Internal developer platforms, CI/CD architecture |
| `privacy-engineer` | Data minimization, PII handling, privacy-by-design review |
| `release-engineer` | Release trains, changelog discipline, rollback-first deployments |
| `technical-writer` | API documentation, architecture explainers |
| `test-automator` | Test pyramid architecture, flake diagnosis |

## Equip and compile

```bash
proagent equip security-engineer              # detected harness
proagent equip security-engineer --target codex
proagent compile security-engineer --target claude-code
proagent equip staff-engineer security-engineer   # composition
proagent equip senior-engineer --dry-run
```

The **profile compiler** decides how the canonical profile is expressed by the target
harness, using the strongest mechanism available:

| Harness | Skills | Project instructions | Rule enforcement |
|---|---|---|---|
| Claude Code | `.agents/skills/<profile>/SKILL.md` | `CLAUDE.md` block | native (hooks) |
| Codex | `.agents/skills/<profile>/SKILL.md` | `AGENTS.md` block | instructions fallback |
| OpenCode | `.agents/skills/<profile>/SKILL.md` | `AGENTS.md` block | native |
| Cursor | `.agents/skills/<profile>/SKILL.md` | `AGENTS.md` block | instructions fallback |
| Gemini CLI | `.agents/skills/<profile>/SKILL.md` | `GEMINI.md` block | instructions fallback |
| GitHub Copilot | `.agents/skills/<profile>/SKILL.md` | `.github/copilot-instructions.md` block | instructions fallback |
| OpenClaude | `.openclaude/skills/<profile>/SKILL.md` | `AGENTS.md` block | instructions fallback |
| Freebuff | `.agents/skills/<profile>/SKILL.md` | `AGENTS.md` block | none (reported) |
| generic CLI | — (instructions only) | `AGENTS.md` block | none (reported) |

Every skill-directory compile also writes the canonical manifest beside the skill
(`manifest.json`), so the portable profile stays inspectable in the target repo.

Equipping is idempotent: re-running replaces the marked `proagent:profile` block instead
of duplicating it, and never touches the rest of your instructions file.

## Progressive disclosure

Professional profiles may contain substantial knowledge and many skills. ProAgents does
not dump everything into the model context:

```text
Task
 ↓
Understand intent
 ↓
Identify relevant profession
 ↓
Discover relevant skills
 ↓
Load relevant methods
 ↓
Retrieve relevant knowledge
 ↓
Activate required tools
 ↓
Apply rules
 ↓
Execute
 ↓
Verify
```

Only relevant capabilities load when needed. The compiled artifacts follow the same
principle: `SKILL.md` stays a lean operating summary; the canonical manifest sits beside
it (`manifest.json`) so tools can load structured detail on demand instead of parsing
prose.

## Rules are enforced

Rules in a profile are normative, not advisory prose:

```text
Never expose secrets.
Never modify production without approval.
Preserve public API compatibility.
Require tests after source changes.
```

Where the target harness supports enforcement mechanisms (Claude Code hooks, OpenCode
policies), ProAgents compiles rules into them. Where it does not, ProAgents reports the
limitation in the equip output and `--json` response and provides the strongest fallback.

A rule file may carry a machine-readable `enforcement` block alongside its prose — the
three deny-only kinds profile rules support, expressed harness-agnostically:

```json
{
  "title": "never expose secrets in logs, errors, or committed files",
  "enforcement": {
    "bash": ["cat .env*"],
    "paths": ["**/.env", "**/*.env.*", "**/*.pem", "**/*.key", "**/id_rsa*"]
  },
  "body": "never expose secrets in logs, errors, or committed files"
}
```

- **`bash`** — shell command patterns the rule forbids (`*` any run, `?` one character).
- **`paths`** — file globs the rule forbids modifying (a leading `**` matches any
  directories, including none).
- **`tools`** — semantic tool names the rule forbids (`shell`, `filesystem`, `git`,
  `web`, `network`) — adapters map them to the target's own tools; unmappable names
  are reported as limitations, never dropped silently.

The compiler translates these per target: OpenCode gets `permission.bash`/`permission.edit`
deny patterns in `opencode.json`; Claude Code gets generated `PreToolUse` hooks in
`.claude/settings.json` (idempotently replaced on re-equip, user hooks preserved). The
manifest's `tools.forbidden` list compiles through the same mechanisms. Every equip also
carries a compiler baseline (`git push --force*`, `rm -rf /*` denied on native targets)
and reports exactly which rules were enforced and which stayed advisory — in
`limitations` and the `--json` `enforcement` field. Malformed enforcement blocks are
rejected by `PA043`.

**Markdown informs. Runtime boundaries enforce whenever the harness allows it.**

## Verification

A profile without verification requirements is invalid (`PA035`). Verification is compiled
into the profile's instructions as required-before-completion steps, and the equip output
is honest about what the harness can and cannot gate on.

## Composition

```bash
proagent equip staff-engineer security-engineer
```

Composition produces a single effective professional operating model. It is deterministic
— the same inputs always produce the same effective profile and the same conflict set.

```text
Profile A  +  Profile B
      ↓
Composition Engine
      ↓
Effective Professional Profile
```

Detected conflicts:

| Code | Conflict | Severity |
|---|---|---|
| `PA021` | duplicate skill with conflicting definitions | reserved (content-level) |
| `PA022` | conflicting rules (same rule required and forbidden) | **error** — blocks |
| `PA023` | incompatible tools (required by one, forbidden by another) | **error** — blocks |
| `PA024` | circular method dependencies | warning |
| `PA025` | capability gap (verification impossible with declared tools) | warning |
| `PA026` | duplicate profile in composition | warning |

Serious conflicts are never silently ignored: `PA022`/`PA023` errors exit non-zero and
report the offending profiles and a suggestion.

## Validation codes

`proagent validate --profiles` runs deterministic checks on every discoverable profile:

| Code | Check |
|---|---|
| `PA030` | missing required field (version, name, slug, identity…) |
| `PA031` | slug is not kebab-case |
| `PA032` | profile.version is not semver |
| `PA033` | expertise is empty |
| `PA034` | no required tools |
| `PA035` | no verification requirements |
| `PA036` | a tool is both required and forbidden |
| `PA037` | knowledge reference missing from the profile directory |
| `PA038` | duplicate slug across profile sources |
| `PA039` | malformed MCP server entry |
| `PA040` | invalid package/skill registry reference |
| `PA041` | reference entry without an https:// URL |
| `PA042` | section path entry missing from the profile directory |
| `PA043` | malformed or dangling rule enforcement block |

## Local and community profiles

Profiles resolve from two local places before anything remote: your repo's
`.proagent/profiles/` (where `proagent profile create` scaffolds consumer-repo
creations) and a `registry/profiles/` checkout of the registry itself. To work
on a profile locally:

```bash
# a consumer-repo creation (wins over everything else):
proagent profile create "My Profession" --slug my-profession
$EDITOR .proagent/profiles/my-profession/manifest.json

# or a registry checkout:
mkdir -p registry/profiles/my-profession
$EDITOR registry/profiles/my-profession/manifest.json

proagent list          # your local items win over the packaged snapshot
proagent equip my-profession
```

A repo's `registry/profiles` checkout **is** the registry: it wins over the packaged
snapshot shipped with the npm package (same slug → checkout version), and packaged items
fill gaps for slugs the checkout does not have. Publishing is then just a PR with your
item folder — the same files you tested locally.

Or install a profile from the Git-backed registry catalog — the same resolver the CLI
uses for built-ins, with catalog items filling gaps only:

```bash
proagent profile list                    # the profile slice of the catalog
proagent profile install <id>            # resolve + validate + equip
```

`proagent equip <id>` is the same pipeline with a shorter name. To contribute a profile,
see [Adding a listing to the catalog](/guide/registry#adding-a-listing-to-the-catalog).

## From professional agents to specialized agent systems

Profiles also feed larger systems: a crew's workers can each carry their own professional
profile, skills, tools, permissions, context and verification, with handoffs passing
named artifacts. See the [registry guide](/guide/registry) for crews — bundles of
specialized workers wired together by a handoff graph — and the
[question engine](/guide/question-engine) for deriving a new system when no profile fits.

## JSON interface

```bash
proagent detect --json
proagent list --json
proagent inspect security-engineer --json
proagent equip security-engineer --json
proagent compile security-engineer --target claude-code --json
proagent validate --profiles --json
```

See the [JSON interface](/cli/json) for the full machine contract.
