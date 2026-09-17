# AGENTS.md

Guidance for any AI coding agent working in this repository. Plain Markdown — behavioral
context, **not** a security boundary (that principle is also this project's product).

## What this project is

**ProAgents** (`proagent` on npm): an open-source agentic CLI + Agent Skill that **equips
existing coding agents with professional expertise, methods, rules and verification** —
portable, composable, versioned **Professional Agent Profiles** (`proagent equip
security-engineer`). It also builds new specialized agent systems from incomplete ideas
through progressive questioning (`init` → `spec` → `build`). Not a web app, not a SaaS,
not a prompt generator.

## Architecture invariants — do not violate

1. **Deterministic core.** `src/core/engine.ts`, `src/core/validation.ts`,
   `src/profiles/*` and `src/adapters/*` must produce identical output for identical
   state. No model calls, no randomness, no timestamps in compiled artifacts.
2. **Layer separation.** Skill ≠ CLI ≠ Question Engine ≠ Context Framework ≠ Profile
   Compiler. Never collapse them into one module or one giant prompt.
3. **Provider-agnostic.** No OpenAI/Anthropic/Google code in `src/core/` or
   `src/profiles/`. Runtime detection lives in `src/core/runtime.ts`; harness detection
   and compilation live in `src/adapters/` behind env-signal + filesystem-layout signals.
4. **ACC is optional.** `acc-code-context` is an adapter discovered at runtime. Never add a
   hard import or a hard dependency on it.
5. **Information firewall.** Context flows scoped and provenance-tagged. Never add a
   "dump everything" path.
6. **Markdown is not enforcement.** Permissions/approval logic belongs in runtime
   boundaries and validation rules, not prose. Profile rules compile into enforcement
   where the harness supports it; where it does not, the limitation is reported.
   (Site note: the app (`web/src`) and the docs (`docs/`) are ONE VitePress
   project — the app mounts as a client-only island on /marketplace; one
   package.json, one lockfile, one test runner; `scripts/assemble-site.mjs`
   is the single source of the Pages artifact layout.)
7. **Canonical profiles are portable.** `profiles/*.json` and the profile schema never
   reference a specific harness; only `src/adapters/` knows how to compile per target.

## Commands

```bash
npm run typecheck    # tsc --noEmit (strict, core + web) — must pass
npm test             # vitest (core + web suites) — must pass
npm run build        # tsc → dist/
npm run cli          # run the built CLI

npm run dev         # everything: core watcher + the merged VitePress site (SPA + docs) on :5173
npm run site:build  # full artifact → site/ (must pass before PRs)
```

## Conventions

- TypeScript strict, ESM (`NodeNext`), `.js` extensions in relative imports
- New engine behavior needs engine tests (`tests/core.test.ts`)
- New profile/composition behavior needs tests (`tests/profiles/`)
- New harness adapters need adapter tests (`tests/adapters/`, `tests/context.test.ts`)
- CLI JSON output changes must be additive
- Validation rules get `PA0xx` codes + a suggestion string + tests (profiles: PA02x
  composition conflicts, PA03x profile validation; agents: PA001–PA013)
- Brand palette (from `branding/`): navy `#000024`, blue `#0048e4`, violet
  `#5424e4`, cyan `#0ccccc`, ice `#f4f7ff` — see DESIGN.md for the token
  grammar before touching any UI color
- The shipped skill lives at `.agents/skills/proagent/` — keep SKILL.md lean, push detail
  into `references/` (progressive disclosure)

## Session artifacts

- `.proagent/session.json` — interview state (gitignored, inspectable)
- `.agents/skills/<agent>/` — generated agent skills (committed if the user wants)

## When unsure

The README is the product specification: it defines the Professional Agent Profile model
and the equip-first experience. When evidence and the README conflict, surface the
conflict instead of guessing — that is this project's own philosophy applied to itself.
