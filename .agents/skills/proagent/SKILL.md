---
name: proagent
description: Equips existing coding agents with professional expertise, methods, rules, tools and verification through Professional Agent Profiles (proagent equip security-engineer), and builds new specialized agent systems from incomplete ideas through progressive questioning. Use when the user wants to give their coding agent a profession or discipline (e.g. "make my agent operate like a security engineer", "equip this repo for accessibility work"), when the user wants to build, design or improve a specialized AI agent or agent team, when an agent request is vague and needs requirements discovery, or when the user mentions proagent, agent-builder, or professional profiles.
---

# ProAgent — Professional Profiles & Specialized Agents

## Overview

Coding agents already have intelligence, tools and terminals. What they often lack is a
**professional operating model**: how a security engineer, an SRE or a staff engineer
approaches the work, what they refuse to do, and what evidence they produce before
claiming completion.

ProAgents provides two paths:

1. **Equip a profile** (default) — the user's existing coding agent is fine; it needs a
   profession. `proagent detect` → `proagent equip <slug>` compiles a Professional Agent
   Profile into the harness's own mechanisms.
2. **Build a specialized agent** — the professional system doesn't exist yet. The
   interview (`init` → `question`/`answer` → `spec` → `validate` → `build`) derives it
   progressively.

The CLI (`proagent`) is the deterministic core: profile registry, composition conflicts,
validation codes, compilation. You bring judgment: which profession fits, when to ask the
user, and when its output needs human review.

## When to Use

- The user wants their coding agent to **operate as a professional** ("like a security engineer", "with SRE discipline", "accessibility-first")
- The user asks to **equip / install a profile** or mentions `proagent equip`
- The user asks to **build/design an agent or agent team** ("a debugging agent", "a team for incident response")
- An agent request is **underspecified** and would otherwise be filled with silent assumptions

**When NOT to use:**

- Ordinary software engineering with no profession or agent component
- The user just wants a prompt or persona written (no profile structure, rules, or verification)
- Pure information requests about this repository

## Path 1 — Equip a profile (start here by default)

### 1. Detect the environment

```bash
proagent detect --json
```

- Returns `{ primary, harnesses[] }` with per-harness `capabilities`
  (projectInstructions, skills, mcp, ruleEnforcement, shell, git) and `evidence`.
- Use `primary.id` as the compile target unless the user names a different harness.

### 2. Pick the profession

```bash
proagent list --json                    # slugs + descriptions
proagent inspect <slug> --json          # full manifest: expertise, methods, rules, verification
```

- Choose from what the user asked for ("security" → `security-engineer`), or inspect and
  propose the closest match. If two professions apply, propose composing them (step 3).
- If nothing fits, the user can drop a profile folder into `.proagent/profiles/<slug>/` — say
  so, don't improvise a fake profile in the conversation.

### 3. Equip

```bash
proagent equip <slug> [slug…] --json            # detected harness
proagent equip <slug> --target codex --json     # explicit harness
proagent equip <slug> --dry-run --json          # plan without writing
```

- The response reports `files[]` (path + mechanism), `limitations[]` and `profile`.
- **Composition conflicts (`PA022`/`PA023`) block with non-zero exit and `status:"blocked"`.**
  Surface the conflict and the suggestion to the user — never work around it by editing
  profiles behind their back.
- `limitations[]` are honest reports (e.g. no native rule enforcement). Repeat them to the
  user; do not claim enforcement the harness cannot provide.

### 4. Verify the equip

```bash
proagent validate --profiles --json
```

- All shipped profiles must pass. PA037 flags knowledge references missing from the
  profile directory — it is not a local/shipped signal.
- Then confirm in the target harness: instructions block present once (idempotent markers),
  skill present under `.agents/skills/<slug>/SKILL.md`.

## Path 2 — Build a specialized agent

### 1. Start (or resume) the interview

```bash
proagent init --intent "<the user's request, near-verbatim>" --json
```

- Always pass `--json` when operating programmatically; never parse terminal prose.
- `init` resumes an existing `.proagent/session.json` if present — check `proagent status` first.
- The response contains `{ status, readiness, confidence, questions[] }`.

### 2. Answer questions with evidence, one at a time

```bash
proagent question --json          # highest-value open questions
proagent answer q_001 "..." --json
```

- **Answer from evidence, not invention**: look in the repository, docs, or ask the user.
- **One question at a time**: each answer changes the next derived question. Batching breaks the derivation.
- If a question is genuinely the user's to answer (risk tolerance, approval policy, scope),
  ask the user — do not guess on their behalf.
- Contradictions surface as `CONFLICTING_REQUIREMENTS`; resolve via the `q_resolve_*` question,
  never silently.

### 3. Ground in context (information firewall)

```bash
proagent context frameworks                                       # what's available
proagent context "<task>" --context-framework filesystem --json   # scoped retrieval
```

- Context responses carry `confidence`, `provenance` and `stale` metadata — derived
  knowledge, not ground truth. The source code remains authoritative.

### 4. Reach READY, then generate

```bash
proagent status --json        # NEEDS_INFORMATION → keep answering; READY → proceed
proagent spec --json          # agent architecture (agents, graph, runtime requirements)
proagent validate             # deterministic checks (cycles, orphans, permission conflicts)
proagent build                # writes .agents/skills/<agent>/SKILL.md + agent.json
```

- `build` refuses to emit skills when validation fails — fix findings first.
- It reports **runtime capability gaps** honestly; surface them, never paper over them.

## Reading the Output

- Profile commands are JSON-first: `detect`, `list`, `inspect`, `equip`, `compile`,
  `validate --profiles` all accept `--json`.
- Equipping writes real files: `.agents/skills/<profile>/SKILL.md` plus a marked
  `proagent:profile` block in the harness's instructions file (`CLAUDE.md`, `AGENTS.md`, …).
- Generated agent skills follow progressive disclosure: `SKILL.md` (workflow) +
  `references/permissions.md` (normative) + `agent.json` (machine contract).
- Markdown is **not enforcement**. Rules compile into runtime boundaries where the harness
  supports it (hooks, policies); where it doesn't, `limitations[]` says so.

## Examples

**"Make my agent work like a security engineer"**

```
→ proagent detect --json                       # claude-code, skills+hooks available
→ proagent inspect security-engineer --json    # matches the ask
→ proagent equip security-engineer --json
→ files: SKILL.md + CLAUDE.md block + settings.json hooks
→ tell the user: restart the harness session so the profile loads
```

**"We also care deeply about performance"**

```
→ proagent equip security-engineer performance-engineer --json
→ PA025 warning (benchmark verification) reported, equip succeeds
→ surface the warning; no silent composition
```

**Vague request → defined system**

```
User: "build me an agent that fixes bugs"
→ proagent init --intent "agent that fixes bugs" --json
→ engine derives: which environments? write access? approval gates?
→ answer from repo: TypeScript monorepo, Kubernetes, PR-based flow
→ contradiction: "auto-fix everything" vs "humans approve merges" → resolved explicitly
→ proagent spec/validate/build → researcher/implementer/reviewer skills
```

## Anti-rationalization

| Temptation | Reality |
|---|---|
| "The request is clear, skip detect" | Capabilities differ per harness; equipping blind writes weak fallbacks. |
| "Compose profiles without checking conflicts" | Conflicting rules must block, not silently merge. `PA022` exists for a reason. |
| "The intent is clear enough, skip the interview" | If you can't state the permission model and validation criteria, it isn't clear. |
| "I'll answer questions myself to save time" | Guessing bakes wrong assumptions into a generated runtime contract. |
| "Treat context output as fact" | Context is derived, possibly stale, probabilistic. Source code is authoritative. |
| "Markdown permissions are enough" | Markdown informs; runtime boundaries enforce. Limitations are reported, not hidden. |

## Verification

- [ ] `detect --json` run before the first equip; target matches the user's harness
- [ ] Profile chosen from `list`/`inspect`, or user-provided — not invented
- [ ] `equip --json` output shown to the user, including `limitations[]` and any `PA02x` warnings
- [ ] Composition conflicts (blocked equips) surfaced with suggestions, never bypassed
- [ ] `validate --profiles` passes after equipping
- [ ] Interview path (when used): questions answered one at a time from evidence or the user
- [ ] `proagent validate` passes before `build`; runtime gaps surfaced when present

## References

- `references/profiles.md` — profile schema, composition conflicts, validation codes
- `references/questioning.md` — interview technique and question-value model
- `references/context.md` — context frameworks, adapters, and the firewall principle
- `references/architecture.md` — spec schema, agent graph, validation codes
- `references/self-improvement.md` — improvement lifecycle, policies, immutable constraints

Beyond the two default paths, the CLI exposes a full surface — reach for it only when the
task calls for it (see `docs/cli/index.md` for the complete reference):

- Registry & projects: `proagent search`, `info`, `install`, `remove`, `update`, plus
  project specs via `resolve`, `lock`, `setup` (driven by a `proagents.yaml` lockfile).
- Verification at scale: `proagent benchmark list|create|run|report` for deterministic-first
  agent evaluation.
