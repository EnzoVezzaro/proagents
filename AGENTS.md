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
   project — the Studio app mounts as a client-only island on /studio; one
   package.json, one lockfile, one test runner; `scripts/assemble-site.mjs`
   is the single source of the Pages artifact layout.)
7. **Canonical profiles are portable.** The registry (`registry/profiles/` +
   `registry/crews/`) is the
   single source of profiles — the npm package ships it, and the profile schema never
   references a specific harness; only `src/adapters/` knows how to compile per target.
   Manifests use the folder standard: every section entry is a path into the item's
   folder, hydrated to content at load time (`src/profiles/registry.ts`).
8. **The registry is JSON-only.** Every artifact is a folder whose `manifest.json` is
   the single entry point and whose section files are modular `.json` (identity,
   skills, rules, handoffs, mission, `tools/requirements.json`, knowledge included).
   Zero `.md` under `registry/` — loaders, validators (`PATH_RE`), adapters, CLI
   scaffolds and folder-sync scripts all reject/emit JSON sections only, so
   automations never parse prose. Keep it that way; new sections get `.json` files
   plus a loader path in `src/profiles/registry.ts` / `src/crew/hydrate.ts`.

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
- Brand palette (DESIGN.md §5.2, "Logo Ramp" — ratified 2026-09-20): the
  palette IS the logo (`branding/logo.png`) — violet `#5d2de2` → blue `#0e4bec`
  → sky `#13a6e0` → cyan `#0cced4`, navy `#000828` dark canvas. Light is the
  default mode (cool paper `#f7f8fd`); interactive color is the ramp core
  blue. The 4-stop ramp is rationed to brand moments (hero em, footer band),
  never buttons or text fills. Type pairing: Nunito display (the logo
  wordmark's face) / Geist body / JetBrains Mono. Brand assets in `docs/public/`
  are derived from `branding/` — never edit them directly. See DESIGN.md before
  touching any UI color
- The shipped skill lives at `.agents/skills/proagent/` — keep SKILL.md lean, push detail
  into `references/` (progressive disclosure)

## Session artifacts

- `.proagent/session.json` — interview state (gitignored, inspectable)
- `.agents/skills/<agent>/` — generated agent skills (committed if the user wants)
- `docs/.vitepress/theme/landing/` — the landing surface (Logo Ramp): a static
  Vue SFC + stylesheet server-rendered by VitePress and wrapped by
  `LandingIsland.vue`; no scroll engine, no build step. Keep the landing SSR'd —
  a ClientOnly mount lets VitePress hoist its static nodes into the lean chunk,
  and they never render.

## Browser verification (ego-browser)

One task space, always. Never create a new space per task:

- Resume by name: `taskSpace("proagents-dev")` returns the same space every
  time (a new name creates a new space — that's how 44 stale spaces piled up).
  Print the `spaceId` at the end of a round so the next round can resume by ID.
- Only create when `listTaskSpaces()` shows `proagents-dev` missing.
- Close pages you opened before ending the round; on completion call
  `finish({ keep: [] })`. Zombie `about:blank` tabs survive `page.close()` —
  kill them via `t.cdp("Target.closeTarget", { targetId })` or the space never
  closes.
- When the user must act in the browser, `handOff()` — never claim their space
  back unasked.

## When unsure

The README is the product specification: it defines the Professional Agent Profile model
and the equip-first experience. When evidence and the README conflict, surface the
conflict instead of guessing — that is this project's own philosophy applied to itself.
