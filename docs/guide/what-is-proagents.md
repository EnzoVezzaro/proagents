# What is ProAgents?

ProAgents is an open-source **agentic CLI + Agent Skill** that **equips existing coding
agents with professional expertise, methods, skills, rules, tools and verification
practices** — a portable, structured, versioned **Professional Agent Profile**.

It does not replace Claude Code, Codex, OpenCode, Gemini CLI, Cursor or any other
coding-agent harness. **It gives them a profession.**

```text
Existing Coding Agent
        +
Professional Agent Profile
        ↓
Professional Agent
```

## The core abstraction

A generic coding agent can write code. A professional agent knows **how a professional in
a particular discipline approaches the work**: what to check first, what never to do, what
evidence to produce before claiming completion.

A Professional Agent Profile defines the professional layer an agent operates under:

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

A profile is not a prompt. It is a structured, composable and versioned definition of how
an agent should operate within a profession:

```bash
proagent equip security-engineer
```

The underlying model does not change. **The agent's professional capabilities and
operating discipline do.**

## The architecture

ProAgents sits above existing coding-agent harnesses:

```text
                       HUMAN
                         │
                         ▼
                    PROAGENTS
                         │
                         ▼
              PROFESSIONAL PROFILE
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    KNOWLEDGE          METHODS           RULES
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                       SKILLS
                         │
                       TOOLS
                         │
                   VERIFICATION
                         │
                         ▼
                 PROFILE COMPILER
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Claude Code       Codex        OpenCode
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  CODING AGENT
```

The canonical profile is provider-agnostic and harness-agnostic. The **profile compiler**
(`src/adapters/`) decides how a target harness expresses it using that harness's own
mechanisms: project instructions, skills directories, rules and hooks.

## Two ways to work

| Path | When | How |
|---|---|---|
| **Equip a profile** | Your coding agent is fine, but it should operate like a professional in a discipline | `proagent detect` → `proagent equip security-engineer` |
| **Build a crew spec** | The professional system you need doesn't exist yet — as a spec your harness executes | `proagent init --intent "…"` → progressive interview → `spec`/`validate`/`build` |

Both paths share the same primitives: skills, rules, verification, context frameworks,
validation codes, and the registry.

## Design non-negotiables

- **Provider-agnostic** — the canonical profile never depends on a harness; adapters compile per target
- **Harness-aware** — compilation uses the strongest mechanism the target supports and reports limitations honestly where it can't
- **Rules are enforced, not suggested** — where the harness supports enforcement (hooks, policies), ProAgents compiles into it; otherwise it says so
- **Composition is validated** — conflicting rules, incompatible tools, capability gaps: serious conflicts are never silently ignored
- **JSON-first** — every operation has deterministic `--json` output
- **Local and inspectable** — profiles are plain JSON; equipped output is plain files in your repo

## Next steps

- [Getting started](/guide/getting-started) — detect, list, equip in five minutes
- [Professional profiles](/guide/profiles) — the schema, composition and validation codes
- [Agent operating guide](/guide/agent-guide) — how another AI agent drives the whole flow
- [Context frameworks](/context/) — builtin adapters and writing your own
