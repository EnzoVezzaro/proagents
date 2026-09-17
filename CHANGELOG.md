# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
