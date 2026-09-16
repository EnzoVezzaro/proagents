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
  "version": "1",
  "profile": {
    "name": "Security Engineer",
    "slug": "security-engineer",
    "version": "1.0.0"
  },
  "identity": { "title": "Security Engineer", "summary": "…" },
  "expertise": ["application security", "threat modeling"],
  "knowledge": [],
  "methods": ["threat-modeling", "root-cause-analysis"],
  "skills": ["security-audit", "secure-code-review"],
  "rules": ["never expose secrets", "require security verification…"],
  "standards": ["OWASP"],
  "tools": { "required": ["filesystem", "shell", "git"], "forbidden": [] },
  "verification": { "required": ["tests", "security-scan"] }
}
```

The schema is provider-agnostic and independent of any coding-agent harness.

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
| generic CLI | — (instructions only) | `AGENTS.md` block | none (reported) |

Every skill-directory compile also writes the canonical manifest beside the skill
(`profile.json`), so the portable profile stays inspectable in the target repo.

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
it (`profile.json`) so tools can load structured detail on demand instead of parsing
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
| `PA037` | knowledge reference missing from the profile directory / local-profile notice |
| `PA038` | duplicate slug across profile sources |

## Local and community profiles

Drop a JSON file into `./profiles/` in your repository:

```bash
mkdir -p profiles
$EDITOR profiles/my-profession.json
proagent list          # appears with [local] marker
proagent equip my-profession
```

Local profiles shadow built-ins with the same slug (last discovery wins) and are flagged
during `validate --profiles` so you always know what is shipped vs. local.

## From professional agents to specialized agent systems

Profiles also feed larger systems: a crew's workers can each carry their own professional
profile, skills, tools, permissions, context and verification, with handoffs passing
named artifacts. See the [marketplace guide](/guide/marketplace) for crews — bundles of
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
