# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] — 2026-09-19

### Added — real skills and MCP servers for every profile and crew

The shipped registry previously referenced the same three generic skill repos on
every profile and declared no MCP servers anywhere (8/8 crews empty or github-only).
All 25 profiles and 8 crews now carry curated, verified tooling (`scripts/enrich-tools.mjs`):

- **Profiles** (+39 skill files, 19 MCP declarations, 3 packages): profession-matched
  skills from skills.sh — vendor-official packs (hashicorp terraform, vercel-labs react,
  anthropics frontend-design/webapp-testing, supabase postgres, getsentry security-review,
  huggingface evals, flutter a11y) plus addyosmani web-quality/agent-skills, wshobson
  agents, mattpocock tdd. MCP per profession: postgres → database/data/backend,
  figma+playwright → frontend/a11y, playwright → QA/test, kubernetes → devops/platform/SRE,
  sequential-thinking → api-designer/architect, github → code-reviewer/release.
  Packages: lighthouse (frontend, performance), axe-core (accessibility).
- **Crews** (20 server entries, 27 member bindings): data-platform-crew gains postgres,
  feature-delivery-squad gains figma/playwright/sequential-thinking, incidere gains
  kubernetes, security-audit-crew and test-healer (previously empty) gain
  github/sequential-thinking and playwright/sequential-thinking, web-quality-crew gains
  playwright. Member `mcpServers` reference crew-level names; install merges them into
  `.mcp.json` (verified end to end).
- All MCP transports/npm packages verified against the MCP registry and npm before
  inclusion; skills attributed to their observed skills.sh repos.

### Added — the Registry layer: spec → resolve → lock → setup

The unified artifact model from NEW_CHANGES.md is implemented end to end. One artifact
vocabulary (13 kinds: profile, crew, agent, workflow, capability, skill, tool, mcp,
prompt, hook, adapter, policy, template, extension), capabilities as the central
abstraction, and a reproducible environment pipeline:

- **`src/registry/`** (new layer, per the AGENTS.md separation invariant): `types.ts`
  (artifact envelope, source declarations, spec/lock, PA5xx), `catalog.ts` (unified
  read API over the Git-backed catalog; falls back to the packaged npm copy in consumer
  repos), `sources.ts` + `source-adapters.ts` (federated search — skills.sh, npm, MCP
  registry, GitHub — declared as data in `registry/sources/*.yaml`, policy-gated,
  degrading never crashing), `capabilities.ts` (seed taxonomy + alias resolution + the
  deterministic manifest → capabilities mapper), `resolver.ts` (capability →
  implementation graph, pure — same inputs, byte-identical lock), `spec.ts` /
  `lock.ts` (canonical `proagents.yaml` / `proagents.lock`, no timestamps,
  sha256 checksums), `validate.ts` (the PA5xx aggregator), `setup.ts`.
- **PA5xx validation codes** — spec/registry checks with suggestions: PA500–PA506
  (spec structure, unsatisfiable/ambiguous capabilities, cycles, harness
  compatibility, policy violations) and PA510–PA512 (stale lock, checksum mismatch,
  invalid lock schema).
- **New CLI commands** (`src/cli/registry.ts`, all `--json` outputs additive):
  `search`, `info`, `install`, `remove`, `update`, `list --kind`, `resolve --select`,
  `lock`, `compose <kind:id>…`, `setup [--harness] [--dry-run]`, `validate --spec`,
  and `build --kind spec` (emit a spec draft from an interview session). Bare `list`,
  `equip` and all existing commands are unchanged. Catalog/taxonomy/source lookups
  fall back to the packaged registry when the working directory has no checkout.
- **`proagent setup`** — the end-to-end pipeline: read spec → search allowed sources →
  resolve → validate → compose the spec's profiles (PA02x) → compile for the target
  harness → install crews (`.mcp.json` merge) → report limitations honestly. A blocked
  setup writes nothing; `--dry-run` stops after resolution.
- **Studio Build mode** (the primary experience): `ProjectBuilderPage` walks intent →
  capabilities → artifacts → policies → export and downloads a portable
  `proagents.yaml`. Client-side validation mirrors PA501/PA502/PA505; the full PA5xx
  set stays with `proagent resolve`. Discover is demoted to a secondary route with a
  **Use in Project** handoff into the builder. `registry/capabilities/index.json` now
  ships with the site for the capability picker.
- **Tests**: `tests/registry/` (core), `tests/cli/registry.test.ts` (21 end-to-end
  JSON contracts incl. PA502/PA510/PA511 behavior), `web/src/project-spec.test.ts` +
  `ProjectBuilderPage.test.tsx`. Docs: registry guide "Projects" section, CLI
  reference, JSON interface (PA5xx table), getting-started.

### Changed — the marketplace splits into profiles/ and crews/

- **`.marketplace/items/` is gone**, split by kind: profiles live in
  `.marketplace/profiles/<slug>/` and crews in `.marketplace/crews/<id>/`. The
  catalog index (`catalog.json`) is unchanged and still lists both kinds — the
  `kind` field is the discriminator. All loaders (`profiles/registry.ts`,
  `crew/registry.ts`, SPA) resolve the new layout; the npm package ships both
  folders; publishing (`profile publish`, `crew publish`) writes the new paths.
  A repo checkout now overrides per kind: `.marketplace/profiles/` for equip,
  `.marketplace/crews/` for crew install.

### Fixed — marketplace write commands hydrate folder manifests

- `crew publish`, `crew submit`, `profile publish`, `profile submit` and
  `profile validate` parsed their input with raw `JSON.parse`, rejecting the
  folder-standard/path-format files the tooling itself produces (`crew create`
  output, builder exports). All five now load through the hydrating loaders
  (`loadCrewFile` / `loadProfileFile`), so both shapes validate and publish
  identically.
- Hydration no longer appends handoff contract prose into `workflows` — it was
  re-serialized into `workflows/` files by `dehydrateCrew` and duplicated on
  every hydrate→dehydrate→hydrate round trip (caught by the fixed-point check).
  Handoff contracts live in `crew.handoffs` only.

### Added — five profile-backed crews

- **Five new marketplace crews**, every worker bound to a Professional Profile
  (agent + subagents that operate as professions, not hand-rolled prompts):
  - `feature-delivery-squad` (5 workers) — API designer → backend + frontend
    implementers → test automator → code reviewer; the API contract is the
    shared artifact every other worker consumes.
  - `data-platform-crew` (4) — database engineer (schema) → data engineer
    (pipelines) + backend engineer (serving) → QA; schema-first, quality-gated.
  - `release-train-crew` (4) — QA sign-off → release engineer → approval-gated
    DevOps rollout (PA043 by design: production write gated on `deploy` and
    `run_pipeline`) → SRE post-deploy watch.
  - `security-audit-crew` (4) — systems architect scopes, security engineer
    threat-models, second security engineer audits code against the model,
    privacy engineer covers PII flows and synthesizes the report; read-only.
  - `web-quality-crew` (4) — performance + accessibility auditors run in
    parallel, frontend engineer fixes within both budgets, QA verifies against
    the original findings.
- All five follow the crew folder standard (`crew.json` index +
  `workers/<id>/worker.json` + `instructions.md` + `mcp/servers.json` +
  `graph.json`), pass PA043–PA047 and the dehydrate/rehydrate fixed point, and
  bind only to profiles that exist in the catalog. New `CREW-CATALOG` test
  block keeps the whole set honest: folder↔catalog consistency, resolvable
  profile bindings, and canonical id ordering.

### Added — crews follow the folder standard (and the subagent standards)

- **Crews moved to the same folder standard as profiles.** The 3 shipped crews
  (`pr-review-gate`, `incidere-incident-response`, `test-healer`) are now folders —
  `crews/<id>/crew.json` (index) + `workers/<w>/worker.json` + `instructions.md` +
  `mcp/servers.json` + `graph.json` — instead of one flat JSON with inline worker
  instructions. Same authority model as profiles: the manifest is the index, the
  files are the source; hydration at load time, round-trip fixed point checked by
  `node scripts/crew-folders.mjs check-all`.
- **Subagent-standard validation for crews (PA043–PA047)**, mirroring the agent
  architecture rules PA006–PA010: PA043 production-write-without-approval-gate
  (error), PA044 secrets-without-gates, PA045 orphaned worker, PA046 excessive
  intake (>5 upstreams), PA047 missing/unloaded/mismatched worker manifest
  (error). Enforced by `proagent crew validate`, `crew publish`, and the
  marketplace PR workflow.
- CLI/registry/SPA read folder crews first with flat-JSON fallback; `crew publish`
  now commits the folder layout file-by-file (each file a reviewable diff).

## [0.9.0] - 2026-09-17

### Changed — marketplace is the single source of profiles

- **`profiles/` is gone; `.marketplace/items/` is the only source of profiles.** The 10
  built-ins that only existed in `profiles/` moved into the marketplace catalog, the 3
  duplicates were dropped (byte-identical), and the npm package now ships `.marketplace/`
  instead of `profiles/`. Resolution order for `equip`/`list`/`inspect`/`compile`: a
  repo's `.marketplace/items` checkout wins (origin `"marketplace"`) → the packaged
  snapshot fills gaps (origin `"builtin"`) → the remote catalog over HTTP. The old
  `./profiles/` local dir and its `"local"` origin no longer exist; working on a profile
  locally means editing it in your `.marketplace/items` checkout — the same files a
  publishing PR would carry.

### Changed — path-format manifest sections

- **Every section entry in `profile.json` is now a path to its file** — the same
  format `knowledge` always used: `identity`, `expertise`, `methods`, `rules`,
  `policies`, `standards`, and both `verification` lists hold
  `"section/NN-name.md"` paths; content lives only in the folder tree. The loader
  hydrates path entries to content at read time (tolerant: missing files surface
  as validation findings, not crashes), so composition, compilation, crews and the
  web SPA behave exactly as before. `sync` in `scripts/profile-folders.mjs` now
  writes paths; inline entries and legacy manifests remain valid via the same
  hydration path.

### Added — profile depth & folder standard (profiles v2)

- **Folder-per-profile standard**: every profile is now a self-contained folder —
  `profile.json` (canonical manifest) plus a folder per section of the profile tree
  (identity, expertise, knowledge, methods, skills, rules, policies, standards,
  tools, verification), one ordered `NN-*.md` file per item. Any concept can be
  added, removed, swapped or extended independently. `scripts/profile-folders.mjs`
  materializes (manifest → folders) and syncs (folders → manifest); the round trip
  is a pinned fixed point. The manifest carries a `files` index linking every entry
  to its file.
- **Full-depth content** for all 28 profiles, learned from real skill collections
  (obra/superpowers, wesleyegberto/software-engineering-skills, anthropics/skills):
  per-expertise reference files, per-method playbooks, and per-profile verification
  checklists — profiles previously shipped ~3 items per section with no knowledge
  files; exemplars now compile to 10+ files including 9–10 installed knowledge docs.
- **Skills composition without duplication**: profiles reference real, installable
  skills (`github:…` refs with `skillsDetail`: which skills, the `npx skills add`
  install command, and why) instead of embedding copies.
- **Policies section** (governing policies of the profession) rendered into the
  compiled skill and instructions blocks.
- **References with authoritative URLs** for standards/methods/certifications
  (OWASP, WCAG 2.2, DORA, Diátaxis, …), validated (PA041: https URL required) and
  rendered into the compiled skill.
- **Method→playbook binding**: compiled skills link each method to its installed
  playbook file, so equipped agents read procedures, not just names.

### Changed — profiles

- **Single version per profile**: the duplicated `profile.version` is removed;
  the outer `version` is the profile's own semver (validator errors on the old
  inner field). Marketplace catalog indexes and the web builder follow.
- **Marketplace item layout**: profiles live at `items/<slug>/profile.json`
  (folder standard); crews remain flat `items/<id>.json`. Discovery, remote
  fetching, the site assembler and the SPA detail pages accept both layouts.

### Added — marketplace

- **Install skills from any GitHub repo via the marketplace search**: paste a repo URL
  (or `owner/repo`, optionally with a `#anchor` subpath hint) into the marketplace search
  and press Enter — the marketplace discovers the repo's agent skills (`**/SKILL.md`),
  previews names + descriptions fetched client-side from the GitHub API, and hands out
  the matching `npx skills add owner/repo --skill <name>` install command per skill.
  Previously a pasted repo URL matched nothing and Enter was a dead end.

## [0.8.1] - 2026-09-17

### Fixed — equip completeness

- **Compiled skills are self-contained**: knowledge files referenced by a
  profile (`PA037` resolves them against the profile's directory) were never
  installed — the compiled `SKILL.md` pointed at files that did not exist in
  the target repo. The compiler now copies them into the skill (mechanism:
  `knowledge`), reports missing sources as explicit limitations, and rejects
  path-escaping references.
- **`--target` is a compile directive, not a detection claim**:
  `compile <slug> --target cursor|gemini-cli` failed in repos without that
  layout — but equipping is how a repo becomes a `<target>` repo. Explicit
  targets now validate against every known harness (including the
  `generic-cli` fallback the help text itself advertises) instead of only the
  locally detected ones.

### Fixed — CLI

- **OpenCode rule enforcement writes `opencode.json`, not `.claude/settings.json`**
  (found by a user equip on OpenCode): the "native" enforcement branch always
  emitted Claude Code hook settings regardless of target, so OpenCode equips
  produced a file OpenCode never reads. OpenCode's native enforcement is
  `permission.bash` deny rules in `opencode.json`; deny rules now append there
  (preserving existing config), and Claude Code keeps its hooks.

- **PA025 no longer false-positives on prose verification outcomes** (found by a
  user equip of `developer-experience-engineer`): the capability-gap check
  assumed every `verification.required` entry must name a tool capability, so
  outcomes like "new-contributor setup under 15 minutes" warned that no tool
  provides them — every marketplace profile warned, while built-ins (keyword
  style) never did. PA025 now fires only when a verification entry names a
  known capability (`tests`, `build`, `security-scan`, …) that no required tool
  provides; prose outcomes are agent-executed within the session, exactly as
  the equip output already states.

### Added

- **`release-guardrails` benchmark suite** — three deterministic cases for the
  release-engineer contract (rollback-first planning, changelog discipline,
  dirty-tree refusal), matching `privacy-guardrails`.
- **Benchmarks gate CI**: the guardrails suites validate and run on every push
  and PR; any failed case, error or aggregate score below 100 fails the build.

### Changed

- The v0.8.0 GitHub release notes now carry highlights plus the full changelog
  section (the automation had posted only the compare link).

## [0.8.0] - 2026-09-17

### Fixed — site

- **Site build tolerates marketplace subdirectories**: the assembler copied
  each `.marketplace/items/` entry non-recursively, so the knowledge
  subdirectory crashed `site:build`. Items now copy recursively.

### Fixed — site (earlier)

- **Publish requires GitHub sign-in — visibly**: the builders' publish buttons
  (Publish via pull request / File proposal issue, File marketplace proposal)
  used to run anyway when signed out and just print "sign in with GitHub" into
  a status line — clicking them appeared to do nothing. They are now disabled
  until sign-in, with an inline hint explaining why and a **Sign in with
  GitHub** button that opens the Settings modal in place; completing the
  device-flow sign-in enables publishing immediately.

### Changed — site

- **Marketplace header is one row**: the page title and lede sit on the left,
  the Donate/Settings account actions on the right (the React chips portal into
  a static slot in the page header, so the static page and the island share a
  single header line; on non-marketplace surfaces they fall back to a local row).
- **Builder list fields accept separators again** — one-per-line textareas
  (expertise, methods, rules, standards, verification) and comma-separated
  inputs (tags, tools, emits, allowlists) killed the typed separator on the
  same keystroke (`value={list.join(sep)}` + immediate split), so a second
  item could never be added. The new shared `ListField` keeps the raw text
  while focused and normalizes the list on every keystroke and on blur
  (6 component tests pin the behavior).
- The marketplace app rail no longer duplicates navigation: the
  Catalog/Dashboard/Docs links are gone (the navbar carries Docs; the catalog
  is the landing view), leaving Donate and Settings.

### Added — profiles

- **Two new professional profiles**: `release-engineer` (release trains,
  changelog discipline, rollback-first deployments) and `privacy-engineer`
  (data minimization, PII flow verification, consent-before-collection).
  Both ship as marketplace items with catalog entries and their first
  knowledge references (`release-checklist.md`, `pii-handling-basics.md`),
  which validate under PA037 and render as a `## Knowledge` section in the
  compiled skill.

### Added — tests

- **Full-pipeline e2e round** (`tests/cli/pipeline.test.ts`, 10 cases): the
  complete chain is now pinned end to end — new marketplace profiles validate
  clean → equip compiles skill + canonical manifest + proagent instructions
  block into an example repo → the compiled agent's content is verified
  (frontmatter, identity, rules, marker pairs, composition merge, idempotent
  re-equip) → `compile --output` really redirects artifacts outside the repo →
  invalid profiles block with the PA03x finding → the equipped agent passes a
  deterministic benchmark suite at score 100 with report/baseline/regression
  tooling closing the loop.
- **Session-command CLI test round** (`tests/cli/session.test.ts`, 24 e2e cases):
  every agent-building command is now pinned to its documented contract in
  `docs/cli/index.md` / `docs/cli/json.md` — `status`, `question` (+ `--all`),
  `answer` (including the CONFLICTING_REQUIREMENTS contradiction flow),
  `context` (+ `frameworks`), `spec`, `validate` (session, explicit file, and
  the no-session profile fallback), `build` (+ `--agent`), `agents`, `inspect`,
  `improve`/`self-improve`, `version`, and unknown-command handling.

### Fixed — CLI (found by testing the commands against their documentation)

- `compile --output <dir>` is honored — previously the flag was parsed but
  never forwarded, so the compile artifacts always landed in the working
  directory regardless.
- `validate <file>` now validates that file even when an agent-building session
  exists — previously the session silently won, and without a session the file
  was ignored entirely (the profile fallback ran instead), making the documented
  `proagent validate arch.json` path unreachable. An explicit file always wins.
- `validate` exits non-zero on validation errors in `--json` mode too — the
  early JSON return skipped the exit-code setting, breaking the documented
  "CI-friendly" contract.
- `init --json` without an intent prints the documented
  `{"status":"needs_input","error":"intent_required"}` on stdout — while keeping
  the non-zero exit and stderr guidance (repo-derived proposals are still
  auto-accepted, exactly as before).
- `question --all` now actually returns/renders all open questions — the flag
  the CLI itself suggests (`(+2 more — run proagent question --all)`) was parsed
  but never used.

### Fixed — CI

- jsdom pinned to 26: jsdom 30's dependency line (`html-encoding-sniffer` 5/6 →
  `@exodus/bytes`) is ESM-only and breaks `require()` on Node 20, failing the CI
  matrix. jsdom 26 is the last fully-CJS major and runs on all three CI nodes.
- The site job's artifact checks now assert what exists statically
  (`pa-mp-head` in `marketplace.html`, `pa-app` in the bundle): the island is
  `<ClientOnly>`, so grepping static HTML for runtime classes never passed.

## [0.7.0] - 2026-09-16

### Added — the site is one VitePress project; the marketplace gets its own page

- **One project, one build**: the marketplace app and the docs merged into a single
  VitePress project (`docs/`, base `/proagents/`). The app mounts as a client-only React
  island (imperative `createRoot` in a Vue wrapper, automatic JSX runtime), consuming
  VitePress theme vars through a `:root` alias bridge — one design system, one deploy,
  one `npm run dev`, one `site:build` (artifact assembly lives in
  `scripts/assemble-site.mjs`, so local and CI builds are byte-identical).
- **`/marketplace` page** — the app has its own page with a proper header; the home page
  returns to hero + features with a browse-the-marketplace CTA. The navbar link, the
  `/app/` shim and the 404 CTA all point there.
- **Branded hero** — the bot mark sits above the hero name (background-image on the
  name, no atmosphere per DESIGN.md).
- **Branded not-found** — a themed `not-found` slot view replaces VitePress's default
  404 and recovers stale `/proagents/docs/…` bookmarks into the merged URL space.
- **Dev catalog middleware** — `vitepress dev` serves the git-backed `.marketplace/`
  at the production URLs, so the island works identically in dev and prod.
- **Settings modal above everything** — the modal portals to `document.body` (z-index
  200) so the fixed navbar can no longer paint over it.

### Fixed

- **Inline-code contrast**: `--vp-code-color` is the code TEXT color — a 7%-alpha value
  had rendered inline code invisible in both themes. The tint moved to `--vp-code-bg`
  and code blocks set `--vp-code-block-bg` so VitePress's dark rule cannot win the
  cascade.
- **Marketplace page layout**: `layout: page` has no doc container — the page header
  and island now share one 1152px container instead of full-bleeding.
- The island's `--cyan` is mode-aware (deep cyan on white, bright cyan on navy).
- Docs pages keep the VPFooter; pages hosting the island no longer double-footer.

### Added — the profile builder becomes a guided, publishable walkthrough

- **Guided profile-builder walkthrough** — the SPA builder is now a 5-step rail
  (identity → expertise & rules → tools & MCP → skills → verification → ship) with
  per-step completion checkmarks, Next/Back navigation, live PA030–PA040 validation on
  every step, draft persistence, and a Ship tab that gates on validation before any
  publish action.
- **Slug collision blocking** — the builder loads the live marketplace catalog and blocks
  a slug that already exists inline while typing (PA038), so publish-time collisions are
  caught at authoring time.
- **Multiple standards** — standards are one-per-line free text (any number), replacing
  the single comma-separated field.
- **MCP servers in profiles** (`tools.mcp`, PA039) — name/transport/command-or-URL/
  health-check/allowedTools, validated deterministically (duplicate names, stdio without
  command, http/sse without URL all fail). The SPA Tools tab adds servers with a **live
  health check** (browser-side probe for http/sse; shape check for stdio). At equip time
  profile MCP servers merge into the harness `.mcp.json` (existing entries preserved) and
  render in the compiled SKILL.md.
- **Registry packages in profiles** (`tools.packages`, PA040) — `npm:<pkg>[@v]` or
  `github:owner/repo[@ref]` refs with a reason, validated at authoring and publish time;
  equip surfaces them as explicit follow-ups (the harness never installs packages
  silently).
- **Skills in the profile builder** — a dedicated Skills tab: install from a registry
  (`npm:`/`github:` refs, PA040-checked) or **write your own** (name, description, markdown
  body). Written skills (`skillBodies`) install as standalone
  `.agents/skills/<name>/SKILL.md` at equip time alongside the profile skill.
- **PR-based publishing** — "Publish via pull request" in the Ship tab (GitHub sign-in
  required): creates `proagent-profile/<slug>`, commits `items/<slug>.json` + catalog
  index, opens the PR (fork fallback for contributors without push access, idempotent on
  retry). New `Marketplace PR validation` workflow validates every changed marketplace
  item with the same deterministic validators plus catalog-index consistency, and comments
  the verdict on the PR. The proposal-issue path remains as an alternative.
- **Docs** — MARKETPLACE.md Publish and Builder-UX sections updated for both paths;
  marketplace guide gains "Remote vs local equip" (why `npx proagent equip <slug>` needs
  a merged catalog) and the walkthrough reference.

### Added — profiles are the atoms; marketplace is a spec repository

- **Crew workers can carry a profession**: `CrewWorker.profile` references a profile spec
  (built-in, local `profiles/`, or the marketplace catalog). At install time the
  profession's expertise, methods, rules, standards and verification are compiled into
  the worker's SKILL.md; hand-written instructions become optional. Missing profiles fail
  the install with an actionable error ("equip it first"). The resolver is injected, so
  the deterministic core stays provider-agnostic.
- **Profile builder in the marketplace app** (`Build a profile`): a deliberately simple
  4-step flow — identity → expertise & rules → tools & verification → ship — emitting the
  canonical ProfileManifest JSON, downloadable and publishable as a `PROFILE-JSON`
  proposal issue with client-side PA03x validation.
- **Crew builder is profession-first**: workers pick a profile spec from the catalog
  (chips) or type a built-in/local slug instead of hand-crafting every agent config
  field; permissions are framed as scoping the profession to the pipeline role.
- **Spec-repository framing** across MARKETPLACE.md, docs and both builders: the
  marketplace builds and hosts *specs* (profile specs + crew specs); it never builds the
  agent itself — your harness does that, fed by the `proagent` CLI as the courier.

### Changed

- Profile-less workers are unchanged: instructions still required, installs identical
  (regression-tested). CLI JSON contracts remain additive.

## [0.6.0] - 2026-09-15

### Added

- **`proagent profile` command group** — marketplace parity with crews:
  `profile list/show/install/validate/publish/submit`. `profile install` is the
  MARKETPLACE.md one-liner (resolve → validate → equip); `profile submit` files a
  `[profile-proposal]` issue with a PROFILE-JSON block; `profile publish` commits to the
  catalog via the GitHub Contents API
- **`proagent crew build <file.json>`** — install a crew from a local builder JSON (the
  command the SPA builder and docs reference); `--file`/`--dry-run` supported
- **Robust catalog reads** — authenticated raw.githubusercontent 404s retry
  unauthenticated, so an invalid token no longer masks a public catalog
- **MARKETPLACE.md spec status markers** — each section now notes what ships today vs.
  what is specified (discovery, MCP testing, completeness scoring are roadmap)
- **GitHub community & CI support files** — dependabot config (npm + web + Actions), pull-
  request template with the determinism/boundary/contract checklist, issue-template config
  (discussions + docs links), and a **profile-proposal issue form** mirroring the crew form
- **Profile marketplace publishing** — `publishProfile()` writes `items/<slug>.json` + a
  `kind: "profile"` catalog entry through the GitHub Contents API (Git-as-database, same
  two-commit reviewable flow as crews); `profileProblems()` is the deterministic CI gate
- **Marketplace proposal pipeline accepts profiles** — the `crew-submission` workflow now
  extracts CREW-JSON *or* PROFILE-JSON blocks, validates with the matching deterministic
  validator, and publishes either kind on maintainer `/publish`
- **Professional Agent Profiles** — the core new primitive: a portable, structured,
  versioned definition of how an AI agent operates as a professional. Equip an existing
  coding agent with a profession in one command:
  `proagent detect` → `proagent list` → `proagent equip security-engineer`
- **Profile compiler + harness adapters** (`src/adapters/`) — filesystem-driven detection
  of Claude Code, Codex, OpenCode, Cursor, Gemini CLI (env signals promote the primary);
  compilation into the target's strongest mechanisms: skills directory, marked project-
  instructions block (idempotent, content-hashed markers), native rule enforcement via
  hooks where supported. Limitations are reported, never papered over
- **13 built-in profiles** (`profiles/*.json`) — senior/staff/principal engineer, backend,
  frontend, security, performance, database, devops, SRE, QA, accessibility, systems
  architect
- **Deterministic composition engine** (`src/profiles/composition.ts`) — merge profiles
  into one effective operating model; conflicting rules (PA022) and incompatible tools
  (PA023) block; capability gaps (PA025) and duplicates (PA026) warn
- **Profile validation** (`proagent validate --profiles`, PA03x codes) — required fields,
  kebab-case slugs, semver, non-empty expertise/tools/verification, required-vs-forbidden
  tool contradictions, duplicate slugs
- **Marketplace profiles** — `kind: "profile"` catalog items; `equip` resolves slugs from
  the registry or fetches them from the Git-backed catalog; profile detail renderer in
  the marketplace SPA
- **New CLI commands** — `detect`, `list`, `inspect <profile>`, `equip`, `compile
  --target`, `validate --profiles`; all JSON-first (`--json`)
- Skill (`proagent`) rewritten around the two product paths: equip-a-profile first,
  build-a-specialized-agent second; new `references/profiles.md`
- Docs: new Professional Profiles guide, rewritten hero/what-is/getting-started, CLI
  reference split into profile and agent-building commands

### Changed

- Product framing: ProAgents equips existing coding agents with professions; the
  progressive interview (init/question/answer/spec/build) is the second path for creating
  new professional systems
- `validate --profiles` extends (does not replace) architecture validation

## [0.5.3] - 2026-09-15

### Fixed

- **`init` prompt no longer hangs in a real terminal** — the interactive prompts read
  stdin to EOF (`for await (const chunk of process.stdin)`), which deadlocks on a TTY
  because terminal stdin never ends. Prompts now resolve on the first line
  (`src/cli/interactive.ts`), with regression tests simulating a held-open stdin.

### Added

- **Standalone-use warning** — ProAgents is designed to be driven by an AI agent; when
  run interactively (stdin+stdout TTY, no `--json`, non-informational command) the CLI
  prints a one-time stderr hint to delegate to an agent with the skill
  (`npx skills add EnzoVezzaro/proagents`). Silenced by `PROAGENT_STANDALONE=1`.

## [0.5.2] - 2026-09-15

### Added

- **Repo-aware `init`** — running `proagent init` without `--intent` in an existing repo
  scans it deterministically (manifests, README, structure, CI, tests, MCP config, agent
  skills), proposes a repo-derived intent, and pre-seeds the facts the repo already answers;
  the interview only asks genuine gaps (non-TTY auto-accepts the proposal). Engine now
  skips questions whose *categories* are already covered by seeded facts. New
  `src/core/repo-scan.ts` + 4 tests (`BENCH-REPO-SCAN-*`), including a determinism test
  that caught per-scan ID leakage.

## [0.5.1] - 2026-09-15

### Added

- README: **Working in an existing repo** — running `proagent init` at the root of an
  existing codebase (grounded questions via `--context`, the interview loop, scoped context
  retrieval, `spec`/`validate`/`build` in place), what the session reads deterministically
  from the repo, and the GUI equivalent (`Build a crew → Start from your repo`)

## [0.5.0] - 2026-09-15

### Added

- **Two-path crew builder** — `Build a crew` now offers: (1) *start from your repo* — a
  deterministic analyzer turns the repo's file tree into a grounded starter crew (suggested
  workers with reasons, real context scopes, handoffs), fully editable afterwards; (2)
  *build it custom* — empty crew, full control
- **Issue-based marketplace publishing** — publishing files a `crew-proposal` GitHub issue
  (from the builder or `proagent crew submit`); the new `Crew proposal pipeline` workflow
  validates the embedded JSON with the deterministic validator and posts the verdict, and a
  maintainer `/publish` (write-gated) commits it to the catalog. `/close` rejects. Issue
  form template included; nothing goes live without human review
- SPA craft pass: global focus-visible rings, button hover/active feedback, skeleton
  loading states for the catalog, refined type ramp and shared design tokens

### Changed

- The builder's Ship tab now leads with *local install* (download JSON + copy CLI command)
  before *marketplace proposal*; direct SPA commits to the catalog were removed in favor of
  proposals
- Marketplace guide rewritten around the two build paths and the proposal pipeline

## [0.4.1] - 2026-09-15

### Removed

- **Stripe & per-crew pricing** — the project is fully open source with donations only
  (GitHub Sponsors + Ko-fi). Removed `pricing`/`checkoutUrl` from crew definitions and the
  catalog schema, the `crew checkout` command, all Stripe env vars, and every pricing UI
  (catalog cards, detail buy button, builder pricing tab). All listings are free · MIT.

### Added

- **`.env` / `.env.example`** — all credentials centralized in a gitignored `.env` with a
  committed template; `.gitignore` now keeps `!.env.example` tracked
- Dependency-free `.env` loader for the CLI (walks up to the nearest `.env`/`.env.local`,
  then falls back to user-global `~/.proagent/.env`; real environment variables always win)
- SPA build-time config from root `.env` (`envDir: ..`): `VITE_GITHUB_APP_CLIENT_ID`,
  `VITE_MARKET_REPO`, `VITE_CLERK_PUBLISHABLE_KEY` replace hardcoded values
- Donation links in the marketplace app (header ♥ Donate button, footer, detail page,
  builder ship tab) — Sponsors + Ko-fi, no payment processor in the codebase
- 7 env tests (parsing, precedence, directory walk-up, global fallback, sensitivity classes)
- `npm run gh:token` — one-command GitHub App device-flow token refresh: prints a code,
  waits for authorization at `github.com/login/device`, verifies identity and writes
  `GITHUB_TOKEN` into the gitignored `.env`

### Changed

- `crew publish` tokens and repo now resolve from env/`.env` (`GITHUB_TOKEN`,
  `PROAGENT_MARKET_REPO`) — flags still override

### Added

- **Crews & marketplace** — publishable bundles of specialized workers (skill + permission
  model + tool allowlist + MCP servers + context bindings + artifact-passing handoff graph)
- `proagent crew` CLI: `list`, `show`, `validate`, `install` (the one-liner: pulls a crew
  into the repo you run it in — writes `.agents/crews/<id>/` skills/contracts and merges
  `.mcp.json`), `publish` (commits to the Git-backed catalog via the GitHub Contents API)
- Deterministic crew validation: permission vocabulary, unknown MCP/upstream references,
  handoff-artifact integrity, acyclicity (DAG) — invalid crews are refused at install,
  publish and download time
- **Marketplace web app** (static SPA on GitHub Pages at `/app/`): catalog browsing,
  crew detail with permission badges, **crew builder GUI** (the CLI interview as forms,
  exporting the same `CrewDefinition` JSON), **preview-on-repo** (sign in, pick a repo, run
  a crew on the fly with your own provider/model, install it via the GitHub API), settings
  modal (provider/model/key, GitHub token, Clerk publishable key) — everything stored in
  the browser's localStorage, zero backend
- **Git-as-database catalog** (`.marketplace/`): reads are static same-origin fetches,
  writes are reviewable commits through the GitHub Contents API (GitRows pattern); three
  seed listings (2 crews + 1 agent)
- **GitHub Device Flow auth** in the browser (ProAgents GitHub App client id only — no
  client secret in the bundle) with PAT fallback
- **Stripe Payment Links** for paid crews: sandbox link minted for the seed paid crew;
  checkout happens on Stripe's domain, the static site never holds a secret key
- 19 new tests (CREW-VALIDATE/INSTALL/REGISTRY/CLI), 159 total, all offline

## [0.3.0] - 2026-09-15

### Added

- **New benchmark styles** (closing the `test`/`patch`/`predicate` style gap):
  - `test_execution` — declared tests must be run via the `test_runner` tool and results
    recorded honestly (`must_run`/`must_pass`); skipped or hidden failures fail deterministically
  - `patch_apply` — recorded unified-diff patches must transform base fixtures into golden
    fixtures (in-memory LCS diff engine with context-tolerant hunk application, no code execution)
  - `artifact_predicate` — content assertions on artifacts: `contains` / `not_contains` /
    `matches` (regex, validated at load time) / `min_length`
  - `approval_required` — approval-gated tools require a granted human-approval event first
- **Three new shipped benchmark suites** in `.agents/benchmarks/`:
  - `api-contract-validator` — 5 schema-driven, judge-free cases (conformance, missing fields,
    secret leakage, invalid payloads, broken contracts)
  - `migration-reviewer` — 4 cases over SQL fixtures (destructive-op detection, patch-style
    reviewed-migration reproduction, test-style verification)
  - `incident-responder` — 4 multi-agent cases (triage/comms/remediation participation,
    handoff integrity, approval-gated restart)
- New reference agents: `patch-agent`, `wrong-patch-agent`, `test-runner-agent`,
  `test-skipper-agent`, and the case-adaptive multi-agent `responder-team`
- Structured suite expectations: `required_fields`, `output_schema`, `output_artifact`,
  `required_agents` (case- and suite-level), `tests`, `patch`, `predicates`, `approvals` —
  all validated at load time with precise `BENCHMARK_CONFIG_ERROR` messages
- Suite-relative fixture loading with fixture hashes in the run manifest
- 35 new tests (BENCH-PATCH/TEST/PRED/APPROVAL/RED/SCORE/SUITE/RUN/SHIPPED), 140 total, all offline

### Fixed

- Secret redaction corrupted benchmark data: an unanchored `pass` pattern redacted the
  ordinary key `passed` (and test results) to `[REDACTED]`; pattern is now substring-safe
  (`password|passwd` spelled out) while still matching compounds like `accessToken`
- Unified-diff parsing created a phantom context line from trailing newlines, breaking
  round-trip application of generated diffs
- Weighted metrics that were never evaluated defaulted to 0, silently punishing cases that
  declared no checks for that metric; they now default to a **vacuous pass (1.0)** with
  explicit provenance (`semantic_quality` stays 0 — semantic silence is not excellence)

## [0.2.0] - 2026-09-15

### Added

- **Benchmark subsystem** (`proagent benchmark`): deterministic-first evaluation of
  generated agent systems — execution traces with secret redaction and tamper seals,
  10 deterministic evaluators (artifact/schema/fields/forbidden/permission/handoff/
  participation/trace/output), pluggable judge providers with strict rubric-bound
  prompts and evidence validation, consensus analysis with disagreement detection,
  deterministic-first adjudication, weighted scoring with full provenance and
  confidence kept separate from score, repeated runs with flaky detection, run
  manifests for reproducibility, baselines and per-metric/per-case regression gates
- Benchmark CLI: `list`, `create`, `validate`, `run` (`--case`, `--runs`, `--agent`,
  `--deterministic`), `report`, `compare`, `baseline create`, `regressions`,
  `inspect`, `evaluators` — all with `--json`
- Example `production-debugger` suite: 9 cases (success, incomplete context,
  contradictory requirements, forbidden production write, incorrect fix, missing
  artifact, invalid handoff, noisy logs, regression), 2 rubrics, 3 judges
- Reference agents for testing the benchmark: perfect, incorrect, partial, unsafe,
  malformed, no-op, flaky, nondeterministic, cheating
- Offline built-in judge providers (`builtin-deterministic`, `builtin-semantic`,
  `builtin-safety`) — CI needs no network or API keys
- 81 benchmark tests across unit / integration / adversarial / metamorphic / e2e
  layers with stable `BENCH-*` ids, including the GOOD-vs-BAD-vs-CHEATING
  classification challenge
- Sponsor/donate support: GitHub Sponsors + Ko-fi buttons (README, docs footer,
  FUNDING.yml, license page)
- Docs: benchmarking guide, benchmark-testing guide, CLI reference section

### Fixed

- CLI version is read from `package.json` at runtime — the published 0.1.1 binary
  incorrectly reported 0.1.0 (found by dogfooding the published package)
- Strictly read-only systems are no longer planned as implementer/operator teams; the
  single-vs-team decision honors the declared permission polarity, while explicit
  multi-agent requests still produce teams restricted to read-only roles
- Filesystem context retrieval ignores common English stopwords that caused irrelevant
  snippets (e.g. matching on "and")
- Benchmark: `artifact_schema` now validates *declared* artifacts (missing artifacts
  no longer pass vacuously) and the no-op agent fails multiple checks as intended
- Benchmark: `tool_discipline` now receives deterministic signals
  (permission/forbidden-tool findings), so fully deterministic runs can reach 100
- Benchmark: flaky reference agent emits contract-compliant JSON on passing runs so
  flakiness detection works against JSON contracts

## [0.1.1] - 2026-09-15

### Changed

- Release workflow now publishes via npm trusted publishing (OIDC) — no long-lived
  `NPM_TOKEN` secret required for releases after this one

## [0.1.0] - 2026-09-14

### Added

- Progressive question engine: deterministic derivation, topic-triggered follow-ups,
  contradiction detection with explicit resolution, coverage/confidence/readiness scoring
- Persistent session state in `.proagent/session.json` (resumable, inspectable)
- Context Framework API with `filesystem` and `git` builtin adapters
- Optional `agents-code-context` (ACC) adapter — available when the `acc` CLI is installed,
  never a hard dependency
- External framework loading from local paths and git URLs
- Agent specification generation: single agent or derived team with roles, permissions,
  approval gates, escalation and validation criteria
- Agent graph with handoffs (named artifacts), delegation, review, aggregation and
  escalation edges; parallelism flags
- Deterministic architecture validation (`PA0xx` codes); build blocks on errors
- `proagent build` — generates specialized agent skills
  (`.agents/skills/<agent>/SKILL.md` + `references/` + `agent.json`)
- Runtime capability detection with honest gap reporting (provider-agnostic)
- Self-improvement configuration (frequencies, propose/supervised/auto policies,
  immutable constraint set)
- JSON-first CLI: `init`, `status`, `question`, `answer`, `context`, `spec`, `validate`,
  `build`, `agents`, `inspect`, `improve` — all with deterministic `--json` output
- Shipped `proagent` agent skill (SKILL.md + references, progressive disclosure)
- VitePress documentation site (ink/cream/lime brand) with GitHub Pages deployment
- CI (test matrix + docs build), npm release workflow with provenance
- Full test suite covering engine, context, session, runtime and validation
