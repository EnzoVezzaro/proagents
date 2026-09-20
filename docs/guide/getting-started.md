# Getting started

## Install

```bash
npm install -g proagent
# or run without installing:
npx proagent --help
```

Requires Node.js 20+.

## Equip a profile

The core experience: give the coding agent you already use a profession.

```bash
# 1. What harnesses are set up in this repo, and what can they do?
proagent detect
# Detected coding agents:
#   ✓ Claude Code  (primary)
#       CLAUDE.md, .mcp.json
# Detected capabilities:
#   ✓ Project instructions   ✓ Skills   ✓ MCP   ✓ Shell   ✓ Git

# 2. What professions are available?
proagent list

# 3. Equip the detected harness
proagent equip security-engineer
# ✓ Equipped Security Engineer → Claude Code
#   • .agents/skills/security-engineer/SKILL.md  (agent-skill)
#   • CLAUDE.md  (project-instructions)
#   • .claude/settings.json  (rule-enforcement)

# 4. Inspect what was equipped
proagent inspect security-engineer

# 5. Verify all profiles (including local ones)
proagent validate --profiles
```

Open your coding agent and it now operates under the profile: threat modeling before
fixing auth code, security verification before claiming completion, and the profile's
rules as normative constraints.

### Target a specific harness

Detection picks the strongest harness present, but you can always be explicit:

```bash
proagent equip security-engineer --target codex
proagent compile security-engineer --target claude-code   # same pipeline, explicit
proagent equip senior-engineer --dry-run                  # plan without writing
```

### Compose professions

```bash
proagent equip staff-engineer security-engineer
```

Composition merges expertise, methods, skills, rules and verification into one effective
professional operating model. Conflicts are detected deterministically — contradictory
rules or incompatible tools **block** the equip with `PA02x` codes instead of being
silently ignored. See [profiles](/guide/profiles#composition).

## Profiles are plain JSON

Every profile is a versioned, inspectable file:

```json
{
  "version": "1.0.0",
  "profile": { "slug": "security-engineer" },
  "identity": { "title": "Security Engineer" },
  "expertise": ["application security", "threat modeling"],
  "methods": ["threat-modeling", "root-cause-analysis"],
  "rules": ["never expose secrets", "require security verification…"],
  "tools": { "required": ["filesystem", "shell", "git"] },
  "verification": { "required": ["tests", "security-scan"] }
}
```

Drop your own under `registry/profiles/<slug>/` in your repo — a checkout copy wins over
the packaged snapshot for the same slug.

## The interview path: build a specialized agent

When the professional system you need doesn't exist yet, ProAgents derives it from an
incomplete idea through progressive questioning:

```bash
proagent init --intent "I want an agent that helps developers debug production issues"
proagent question
proagent answer q_001 "It diagnoses incidents in our TypeScript services and proposes patches for humans to approve"
proagent status      # readiness + confidence
proagent spec        # agent architecture
proagent validate    # deterministic checks — must pass before build
proagent build       # emits .agents/skills/<agent>/SKILL.md + agent.json
```

Each answer changes the next derived question. In an existing repo, run `proagent init`
without `--intent`: the repository is scanned deterministically (manifests, CI, tests,
MCP config, existing skills), a repo-derived intent is proposed, and facts the repo
already answers are pre-seeded so the interview only asks genuine gaps.

## Ground it in context

```bash
# see what's available
proagent context frameworks

# scoped retrieval for a task (builtin, always available)
proagent context "where are deployment runbooks" --context-framework filesystem
```

## Installing the skill (for agent environments)

The repo ships a ready-made skill at `.agents/skills/proagent/`:

```bash
# any agent, one command:
npx skills add EnzoVezzaro/proagents
```

This installs into 70+ agents (Claude Code, Cursor, Codex, Copilot, Cline, ...). The skill
teaches your agent to drive the CLI end to end — see the [agent operating guide](/guide/agent-guide).

## Session state

Everything persists in `.proagent/session.json` — plain, inspectable JSON:

```bash
proagent status            # human view
proagent inspect --json    # full state + architecture + runtime (for agents)
```

## Or: resolve a whole environment

For a project that needs several professions at once, declare the environment as a spec —
capabilities, not implementations — and let the registry resolve it:

```bash
proagent build --kind spec   # draft proagents.yaml from an interview session (optional)
proagent resolve             # capability → implementation graph
proagent lock                # persist proagents.lock (reproducible, checksummed)
proagent setup               # equip/install everything for your harness
proagent setup --harness codex   # same environment, another adapter
```

In the browser, [Studio → Build](/studio) walks the same flow and exports the
`proagents.yaml`. Full reference: [Registry → Projects](/guide/registry).

## Next steps

- [Professional profiles](/guide/profiles) — schema, composition, validation codes
- [The question engine](/guide/question-engine) — how derivation and confidence work
- [Registry](/guide/registry) — projects, sources, publishing
- [JSON interface](/cli/json) — the machine contract
- [Registry](/guide/registry) — ready-made profiles and crews
