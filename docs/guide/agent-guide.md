---
description: 'How another AI coding agent drives ProAgents end-to-end: detect, list, equip, interview, validate and build — deterministically.'
---

# Agent operating guide

ProAgents is built for **agents operating agents**. Another AI coding agent can drive the
entire workflow — equipping profiles or building specialized agents — without a terminal UI.

> The CLI knows this: when a human runs it interactively (both stdin and stdout are a
> terminal), it prints a one-time hint on stderr recommending delegation to an agent.
> It never appears in `--json` output, so machine parsing is unaffected. Set
> `PROAGENT_STANDALONE=1` to silence it entirely.

## Equipping profiles

```bash
proagent detect --json                     # → { primary, harnesses[] }
proagent list --json                       # → { profiles[] }
proagent inspect <slug> --json             # → { profile: ProfileManifest }
proagent equip <slug> [slug…] --json       # → { target, profile, files[], limitations[] }
proagent validate --profiles --json        # → { reports[] }
```

Equipping is the default path when the user wants their existing coding agent to operate
as a professional. Composition errors (`PA022`/`PA023`) exit non-zero with
`status: "blocked"` — surface the conflict and the suggestion, never bypass it.

## The interview loop

```bash
proagent init --intent "..." --non-interactive --json
# → { status, readiness, confidence, questions: [{ id, question, reason, impact }] }

proagent answer q_001 "..." --json
# → { status, readiness, confidence, contradictions, nextQuestions }
```

Repeat `question --json` → `answer <id> "..." --json` until readiness is `READY`.

## Readiness states

| State | Meaning | What to do |
|---|---|---|
| `NEEDS_INFORMATION` | High-impact questions remain | Answer the next question |
| `CONFLICTING_REQUIREMENTS` | Open contradiction | Answer the `q_resolve_*` question explicitly |
| `INSUFFICIENT_CONTEXT` | Too little signal | Add context sources; answer more |
| `READY` | Enough coverage, no conflicts | `proagent spec` |

## Answering well

- **From evidence**: if the answer lives in the repo (frameworks, environments, tools),
  look it up and answer with the source named — it lands in the session provenance.
- **From the user**: risk tolerance, approval policy, scope boundaries are the user's call.
- **One at a time**: each answer changes the next derived question.
- **Never resolve contradictions silently**: the resolution is recorded and shown in the
  generated agents' constraints.

## Driving with context

```bash
proagent init --intent "..." --context ./docs --context-framework filesystem --json
proagent context "incident runbooks" --context-framework filesystem --json
```

Context results carry `confidence`, `provenance`, `stale` per snippet. Treat them as derived
knowledge: verify anything load-bearing against the source before it enters a requirement.

## Full state dump

```bash
proagent inspect --json
# { state: KnowledgeState, architecture: AgentArchitecture, runtime: RuntimeCapabilities }
```

## Building

```bash
proagent spec --json > architecture.json
proagent validate          # non-zero exit on errors
proagent build --json      # writes .agents/skills/<agent>/{SKILL.md, agent.json}
```

`build --json` reports the runtime capability gaps it found — surface them to the user
rather than silently degrading.

## Registry operations

The registry is Git-backed: the catalog repo's `registry/profiles/` and
`registry/crews/` folders are the listings (indexed by `catalog.json`). Agents
can drive the full submit loop without a terminal UI:

```bash
proagent profile list --json               # → { status, repo, ref, profiles[] }
proagent profile show <id> --json          # → the full ProfileManifest
proagent profile install <id> --json       # → { command: "equip", target, profile, files[], limitations[] }
proagent profile validate <file.json> --json  # → { status, file, slug, problems[] }; non-zero exit on errors
proagent profile submit <file.json> --json # files a proposal issue (recommended)

proagent crew list --json                  # → crews in the catalog
proagent crew show <id> --json             # → full CrewDefinition
proagent crew install <id> --json          # → { files[] } written to the repo
proagent crew build <file.json> --json     # install from a local builder output
```

Submission etiquette mirrors the CLI contract: **validate before submitting**
(`profile validate` / `crew validate` must pass), prefer `submit` over `publish`, and
never bypass a `PA022`/`PA023` composition block — report it. Catalog writes are
gated: proposals become GitHub issues that CI validates, and a maintainer `/publish`
comment commits them. See the [registry guide](/guide/registry) for the review
flow, and the [JSON interface](/cli/json) for exact response shapes.
