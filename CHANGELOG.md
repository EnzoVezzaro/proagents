# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.16.0] — 2026-09-24

### Added — explicit project memory (`proagent memory`)

- JSON-only memory records under `.proagent/memory/<key>.json`, each scope-
  and provenance-tagged by design. `memory add`/`list`/`show`/`rm` keep the
  store explicit — no raw-session learning — and every update bumps the
  record's version (never a timestamp). Invalid input is rejected loudly with
  **ME001–ME003** codes plus a suggestion, so a bad record is never silently
  accepted.
- **`memory compile`** renders the store as a deterministic, content-addressed
  instruction block (`<!-- proagent:memory:start <12-hex sha256> -->` …)
  compiled into the target harness's instructions file. Compiling the same
  store always yields byte-identical output — memory is part of the
  deterministic core, so the block survives re-equip/repair churn.

### Added — repo audit (`proagent audit`)

- Deterministic security scan of the repo, no model calls: secrets/private-key
  leakage (**AU001**), remote-fetch-into-shell pipes (**AU003**), remote MCP
  transports (**AU004**), unpinned MCP stdio launchers (**AU005**) and
  over-broad permission grants (**AU006**). Same tree, same bytes; exit
  contract `0` clean · `1` warnings · `2` errors, honored in `--json` so CI
  can gate on it.

### Added — install lifecycle (`list-installed`, `doctor`, `repair`)

- **`list-installed`** inventories everything ProAgents owns in the repo —
  profile/crew installs with their ownership markers plus instruction blocks —
  a pure provenance scan (no writes, deterministic order).
- **`doctor`** verifies those markers with pinned **DG001–DG007** codes
  (unparseable manifest, missing SKILL.md, unclosed/stale blocks, invalid
  `.claude/settings.json`/`.mcp.json`) and the same exit contract.
- **`repair`** deterministically recompiles broken single-profile installs
  from the on-disk canonical manifest — skills, manifest, instruction block,
  enforcement hooks, MCP merge — idempotently. Composed installs are never
  silently mangled: they surface in `limitations` with the re-equip pointer.

### Added — Studio surfaces: Console and Plan

- **Studio Console** is a read-only viewer for the CLI's `--json` introspection
  output (`doctor`, `audit`, `list-installed`, `memory`). The Studio runs
  entirely in your browser and cannot read your checkout, so you paste (or
  load) the CLI's JSON and it renders against the pinned code tables — the
  browser never fabricates repository state.
- **Plan** renders the Build flow's spec draft as a browsable plan:
  canonical-ordered environment sections, PA5xx-derived status, findings,
  next CLI steps and the `proagents.yaml` preview with download. Reachable
  from the builder's export step via "View plan".
- The Studio island gains a route bar (Build / Discover / Console / Plan) so
  the surfaces are reachable from anywhere.

## [0.15.0] — 2026-09-22

### Added — profile-driven rule enforcement (rules compile into runtime boundaries)

- **Rule files can carry machine-readable `enforcement` blocks** beside their
  prose: `bash` (forbidden command patterns), `paths` (protected file globs,
  leading double-star = any directories incl. none) and `tools` (semantic
  tool names — shell, filesystem, git, web, network — never a harness's own
  tool id). Hydration pairs each block with its rule prose into
  `ruleEnforcement` (folder-standard and remote registry hydration), the
  composition engine unions entries across profiles (deny-only, so the union
  is always safe), and the new **PA043** validation code rejects malformed
  or dangling blocks — gating equip, publish and CI.
- **The compiler now compiles the profile's actual rules** instead of two
  hardcoded patterns. OpenCode gets deny entries in `permission.bash` and
  `permission.edit` (verified against OpenCode's documented pattern maps;
  existing user config preserved, string values widened to catch-alls);
  Claude Code gets generated `PreToolUse` hooks — replaced by the
  `proagent:rule-enforcement` marker on re-equip, which also fixes the
  pre-existing duplicate-hook accumulation on re-equip and cleans up legacy
  pre-marker hooks. The manifest's `tools.forbidden` list compiles into the
  same mechanisms, and every native equip keeps the destructive-op compiler
  baseline (`git push --force*`, `rm -rf /*`) as defense in depth.
- **The honesty contract is machine-readable**: `proagent equip --json`
  gains an additive `enforcement: { enforced, advisory, baseline }` summary,
  and the console output reports the enforced-rule count. Unmappable tools,
  prose-only rules and non-native targets surface in `limitations[]` —
  never silently dropped ("Markdown is not enforcement" now has data behind
  it).
- `security-engineer` and `devops-engineer` (both v1.2.0) ship real
  enforcement data for their secrets rule: writing `.env`, `*.pem`, `*.key`
  and `id_rsa*` files and running `cat .env*` are denied at the runtime
  boundary on OpenCode and Claude Code.
- Generated hook scripts are behaviorally verified: blocked commands and
  protected paths exit 2 with the rule's reason on stderr, benign payloads
  pass, and malformed hook JSON fails open (a broken payload never bricks
  the harness).

### Added — Product Hunt featured badge in the docs footer

- The official PH featured embed badge joins the site-wide `SiteFooter` nav row
  (link + SVG badge, lazy-loaded, stacks below the nav on narrow viewports) —
  every docs page now carries the launch chip; the landing keeps its fuller
  §06 launch card.

### Changed — React 19 across the Studio

- `react`, `react-dom`, `@types/react`, `@types/react-dom` moved to `^19.3.0`
  as one coordinated bump with a fresh lockfile install. Supersedes the split
  Dependabot PRs (#14, #15) — each alone was a broken half-upgrade that failed
  CI (types 19 / react 18, react-dom 19 / react 18). No legacy API usage in
  the app (no `ReactDOM.render`, no `defaultProps`), so the bump is a pure
  dependency jump; full suite green (452/452).

## [0.14.0] — 2026-09-21

### Added — landing crews act + site SEO/social meta

- **New landing section §04 "CREWS / MULTI-AGENT — Many professionals. One
  workflow."** between the equation and the evidence acts (evidence → §05, start
  here → §06). The roster panel is **real registry data**: security-audit-crew's four
  workers with their actual profiles (systems-architect, security-engineer ×2,
  privacy-engineer), read/write permission surfaces and MCP servers, plus the
  approval-gate callout (the release train's deploy step requires a human go). The
  install list carries five example crews with their exact `proagent crew install`
  commands and worker counts, linking to the registry listing. Editorial row rhythm
  matches the rest of the landing (hairline rows, mono code, violet top rule);
  stacks to one column <1000px. The section count landing stat strip still says 8
  crews — now with a section that shows what a crew is.
- **Per-page SEO + social-card meta**: the static site-wide `og:*` head block
  (which gave every page the same og:title/description and a **relative og:image**
  crawlers drop) is replaced by a `transformHead` hook emitting per-page
  canonical, `og:url`, `og:title`, `og:description`, `og:image` and the full
  `twitter:card` set (summary_large_image) — all absolute URLs against
  proagents.reposell.dev. Home gets the fuller "ProAgents — professional profiles
  for coding agents" card title. Redirect stubs (/marketplace, /app) emit no
  cards. 17 content pages gained page-specific frontmatter descriptions (YAML
  quoted — several contain `: `).
- **Crawlability**: `sitemap.xml` via VitePress's sitemap option (18 pages,
  marketplace stub excluded) and a `robots.txt` pointing at it.
- The docs drift-fence (`DOCS-ALIGN-001`) scraped `proagent …` from frontmatter
  prose as fake CLI invocations (e.g. a description saying "how agents parse
  proagent output"); the extractor now strips frontmatter before scanning —
  metadata is not command documentation.

### Added — Product Hunt launch week + Stripe donations

- **Landing act §06 "COMMUNITY / LAUNCH — Launch week on Product Hunt."** between
  the evidence act and the close (close → §07): the official Product Hunt launch
  embed rebuilt in the house style — hairline card on white (PH thumbnail,
  wordmark title, tagline) with Product Hunt orange `#ff6154` reserved as the
  third-party accent on the CTA pill (3px house geometry, hover + focus-visible
  states), and a mono status footer (`featured launch / vX / MIT`). Thumbnail
  lazy-loaded; stacks to one column <1000px. The raw embed card also ships in
  the README header (renders wherever raw HTML survives; GitHub shows the
  badges beside it).
- **Stripe Payment Link donations**: a hosted one-time donation URL
  (buy.stripe.com) joins GitHub Sponsors and Ko-fi across every donation
  surface — `.github/FUNDING.yml` (`custom:`), the README (header badge +
  support section), the docs (`license.md`, the registry guide's Donations
  section), the landing's ☕ support popup (💳 Donate — first option) and the
  Studio app (header Donate chip, builder footer, crew-detail "Support the
  project" button). Still no processor in the codebase: the link is a hosted
  payment URL and checkout happens on Stripe's domain — no keys, no SDKs, no
  checkout code.

### Fixed — aside curtain over the docs footer

- **VitePress's default `.aside-curtain` retired**: the gradient the default
  theme pins to the bottom of the doc-sidebar column bled over the custom navy
  footer on short pages. Hidden globally in `theme/custom.css` — the footer
  owns its close with the 4px ramp band.

## [0.13.0] — 2026-09-21

### Fixed — docs site round (header, /registry 404, footer)

- **Landing header links**: "Profiles" and "Registry" both linked to `/registry/` —
  the same page twice. Profiles now opens the **Professional profiles guide**
  (`/guide/profiles`, the schema/composition/validation doc), matching the site nav
  where Docs covers it; Registry keeps the listing page.
- **/registry rendered the branded 404 in dev**: the dev-only catalog middleware in
  `config.mts` intercepted **every** `/registry/*` request — including
  `/registry/index.md`, the page-module request VitePress's client router makes when
  loading the page itself. The repo's data folder `registry/` is JSON-only (no
  `index.md`), so the middleware 404'd it and the router fell back to the not-found
  view. The middleware now serves only files that physically exist under the repo
  `registry/` folder and **falls through everything else** to VitePress's pipeline
  (which serves the page module and handles genuinely missing URLs). Path-traversal
  rejection kept. Production was never affected — `assemble-site.mjs` copies the
  catalog files beside the emitted page there.
- **Docs footer replaced with the landing's navy close**: the plain VitePress text
  footer ("Released under the MIT License · Sponsor on GitHub · … / Copyright") is
  retired; a new `theme/SiteFooter.vue` renders through the `layout-bottom` slot on
  every docs page — the 4px animated logo-ramp band, the light lockup, mono uppercase
  nav (What is ProAgents? / Registry / JSON interface / GitHub) and the
  `MIT / OPEN SOURCE / 2026` line. One footer across both surfaces. VitePress's own
  footer hides on sidebar pages (the fixed sidebar covers it); here the band instead
  **indents past the sidebar with the same padding math as VPContent** (≥960px, and
  ≥1440px recenters against the layout max-width) so the close keeps the full-bleed
  navy band. Narrow sidebar viewports (960–1240px) stack the row like the landing's
  small-screen footer. The home landing renders its own §05 close — excluded via the
  `footer: false` frontmatter, no double footer.

### Added — Registry listing page (/registry)

- New **/registry** page: every installable artifact in the catalog — profiles, crews
  and agents — each card carrying its **exact CLI install command** (`proagent equip
  <slug>`, `proagent crew install <id>`, `proagent install agent:<id>`), click-to-copy
  with a ✓ confirmation. Sections follow the landing's voice: mono uppercase PA-LABEL
  strips with live counts from `catalog.json`, hairline cards, tags, mono commands.
  The catalog is fetched client-side from `/registry/catalog.json` (the repo IS the
  database — the static JSON ships beside the page); header, footer and the no-JS/CLI
  fallback server-render. Machines get the same data:
  `curl https://proagents.reposell.dev/registry/catalog.json`.
- **Search + harness filters + compatibility marks**: a mono search box (token-AND
  across name, id, description and tags), a harness chip bar mirroring `HARNESS_SPECS`
  (9 targets, same vendor marks as the landing orbit; click to filter, click again to
  clear, plus a Clear control), and per-card compatibility rows — every harness mark
  full-color when supported, ghosted grayscale when not declared in the catalog's
  `compatibility`. Section counts read "shown of total" while filtering, and empty
  sections hide.
- **Nav renamed**: the top-bar "Registry" entry (which pointed at the Studio app) is
  now **"Studio"**, and "Registry" opens the new listing page. The docs sidebar gains
  a Registry group (Browse the registry / Registry & crews guide). Landing links
  updated: "Explore the registry" → the listing page, footer "What is ProAgents?"
  restored to the guide page, and the Profiles nav item now goes to the listing.

### Fixed — custom-domain asset 404s (site down)

- **Every hashed asset on proagents.reposell.dev returned 404** (blank page: CSS,
  JS, logos, harness marks, favicon all gone while the HTML loaded). The artifact
  was still built with `base: "/proagents/"` — correct for the old project-path
  Pages URL (`enzovezzaro.github.io/proagents/`) but wrong once the custom domain
  took over: GitHub Pages serves a custom domain from the **root**, so all
  `/proagents/assets/…` references missed the files that physically sit at
  `/assets/…`. **Base switched to `/`** and every hardcoded `/proagents/…`
  reference updated to root-absolute paths: favicon + og:image head tags, footer
  license link, navbar logo swaps and 404 lockup (`custom.css` `content: url()`),
  the Vue 404 view (links, logo, stale-URL redirect), the static `404.html`
  (favicon, logo, buttons, redirect — which now also recovers the bare
  `/docs/…` form), the Studio GitHub PR body URL, `docs/guide/registry.md`, and
  the dev-server catalog middleware regex. `catalog.ts`/`links.ts` already derive
  from `BASE_URL`, so the island follows the new base automatically.

## [0.12.0] — 2026-09-20

### Fixed — light-mode code blocks (docs)

- Code block containers rendered a **dark navy background in light mode**:
  `custom.css` set `--vp-code-block-bg: #060d33` on `:root` (both modes) while the
  light Shiki theme (`github-light`) supplies light tokens — dark-on-dark text and
  a slab that fought the paper canvas. Light mode is now the landing's
  `.pa-manifest` panel: **paper `#f7f8fd` canvas, dark mono text, ink hairline
  border, blue-tinted highlight**; the navy terminal (`.pa-proof__term` voice) is
  dark mode only. Line-highlight/copy-button tokens are now set per mode.
- The matching docs-theme round is part of this release: docs headlines, sidebar
  group labels, tables, buttons, navbar, footer and code surfaces now re-use the
  landing's exact voices (Nunito display, mono uppercase PA-LABEL strips, Geist
  body) so both surfaces read as one product.

### Changed — landing hero + harness-agnostic act

- **Full-viewport ASCII hero**: the dithered-field canvas became the hero's absolute
  background for the whole first viewport (`.pa-hero__stage { position: absolute; height:
  100vh }`) with the copy layered above. The field is now pure futuristic computation —
  interference waves, expanding pulse rings, the diagonal logo-ramp sweep and the cursor
  etch — with a radial quiet zone so the headline and lede stay crisp. The bot-icon figure
  (and the cursor flashlight reveal built on it) was removed with the two-column layout.
- **§01 reframed as harness-agnostic**: "The missing layer" became "One profession. Every
  harness." — the story of compiling one canonical profile into each environment's native
  mechanisms — with a slowly revolving orbit (60s/rev, pauses on hover, static under
  reduced motion) of all 9 harness chips: real brand marks, radial spokes sweeping with
  the ring, and an ASCII energy core (`AsciiCore` in `asciiBot.ts`) behind the mark.
- **§03 rebuilt as the equation**: "Different harnesses. Same profession." became the
  literal product equation — CANONICAL PROFILE + AGENT HARNESS = PROFESSIONAL AGENT —
  with an interactive harness picker (same 9 marks); the equip command line live-updates
  its `--target <slug>` to the picked harness, matching `KNOWN_HARNESSES` in
  `src/registry/spec.ts`.
- **§02 layers became a composer**: clicking a layer ADDS its section to the composed
  `manifest.json` (typed in char by char) instead of substituting it; selected layers
  stay highlighted with a −/+ affordance. Section values are the real registry paths;
  a "?" toggle retypes the document as plain-language explanations of what each section
  carries (paths stay the default).
- **Fan-out grid completed**: the ninth harness target (`generic-cli`) joined the §03
  grid, filling the 3×3 exactly.
- The archify-diagram experiment was reverted; `theme/landing/asciiBot.ts` remains the
  single hero renderer.

### Changed — docs/CLI/skill alignment round

- **New drift fence**: `tests/docs/alignment.test.ts` (23 checks) machine-verifies that
  every documented `proagent` command, flag, harness id, profile/crew slug and path
  claim in README, docs/, the shipped skill, the landing page, `catalog.json` and
  workflow guidance matches the source of truth (CLI dispatch, `HARNESS_SPECS`,
  registry folders). Docs follow code; drift goes red.
- **Hermetic CLI tests**: CLI-spawning vitest files now use `tests/helpers/run-cli.ts`,
  which strips harness env signals (`OPENCODE`, `CLAUDECODE`, …) from the subprocess
  environment. `detect`-dependent tests no longer flip primary harness when the suite
  runs inside an agent session (fixes PROFILES-CLI-001/010 flakiness).
- **Nine-target consistency**: the `--target` row in `docs/cli/index.md`, the skill's
  harness-id reference, the profile mechanism matrix, the landing harness strip and
  every `registry/catalog.json` `compatibility` array now list all nine targets
  (`claude-code`, `codex`, `opencode`, `cursor`, `gemini-cli`, `copilot`, `openclaude`,
  `freebuff`, `generic-cli`).
- **JSON-only manifests everywhere shown**: the README profile example is now the real
  JSON folder standard (`manifest.json` + `.json` section paths) instead of a YAML
  manifest with `.md` sections; `docs/guide/profiles.md` shows `.json` knowledge paths;
  `docs/guide/getting-started.md` shows valid JSON where it claims "plain JSON".
- **Landing page**: the version badge is injected from `package.json` at build time
  (no more hand-maintained `v0.11.0`), the equip example uses the real default flow
  (no phantom `--harness auto`), and `profile validate` shows a real file argument.
- **Shipped skill corrected**: local profiles live in `.proagent/profiles/<slug>/`
  (not `./profiles/`), the compiled canonical manifest is `manifest.json` (not
  `profile.json`), and a compact "beyond the two default paths" pointer covers the
  registry/project (`search`…`setup`) and `benchmark` command groups without changing
  the equip/interview default emphasis.
- **New workflow conformance suite**: `tests/cli/workflow.test.ts` executes the CLI the
  way users and agents meet it — every top-level command answers (read-only commands
  succeed on a bare repo; state-dependent commands fail with guidance, never a stack
  trace), the equip quickstart, the progressive interview (real question loop to READY →
  spec → validate → build), the registry project flow (`build --kind spec` → resolve →
  lock → `validate --spec` → `setup --dry-run`) and the benchmark flow run end-to-end,
  `SKILL.md` frontmatter is validated against the Agent Skills spec, and every fenced
  `proagent` invocation the skill teaches replays green in document order.
- **Housekeeping**: the completed `IMPLEMENTATION_PLAN.md` and the alignment-round
  `tasks/` planning files were removed after verification (all phases shipped; the
  drift + workflow suites are the permanent guards).

### Changed — Studio Policies step

- The Build flow's Policies & harness targets step now mirrors the deterministic
  core: all nine known harnesses (adds `openclaude`, `freebuff`) with per-target
  tooltips, Select all/Clear controls, an inline PA506 policy check (trailing
  wildcards + non-hostname allowlist entries warn before export), and a compiled
  `policies:`/`harness:` yaml readout. `copyText` fallback no longer leaks its
  textarea on `execCommand` failure. Web `SpecFinding` accepts `PA506`.

### Changed — production domain

- The site's production domain is **proagents.reposell.dev**: README header links,
  docs (`registry.md` Studio/callback URLs), submission-issue templates and workflow
  copy all point at it, and a `CNAME` file (via `docs/public/`) ships in the Pages
  artifact so GitHub Pages serves the custom domain and 301s the old
  `enzovezzaro.github.io/proagents` URL. All redirect shims are relative, so they
  work unchanged on the new host.

### Changed — Studio export: full agent build instructions

- The Build flow's final step is now **"Instructions to build proagent <name>"**
  (tab renamed from Export; `serializeAgentBrief` in `web/src/project-spec.ts`).
  Copy places a complete build brief on the clipboard, addressed to the AI coding
  agent working in the user's repo: what the environment contains (profiles,
  crews, capabilities, policies, harness targets), the exact `proagents.yaml` in
  a fenced block (byte-identical to `serializeSpecYaml`), the install +
  `resolve`/`lock`/`setup` commands, how to verify the build (`setup` report,
  harness files, `proagent status`, commit spec + lock), and the operating rules
  once equipped (follow profile methods, evidence over assertion, stay inside
  policies). Download keeps saving the plain spec file for the repo root.

### Fixed — public-surface polish

- **Studio registry (dev):** the catalog dev-middleware regex in
  `docs/.vitepress/config.mts` contained `\registry` where `\r` is a carriage-return
  escape, so the middleware never matched and Vite's history fallback answered
  `registry/**` requests with the SPA `index.html` — every Studio `fetch().json()`
  threw. Regex fixed; catalog, profile sections and capabilities now serve as JSON
  in dev (production was unaffected — `scripts/assemble-site.mjs` copies the files).
- **Landing color correctness:** `a { color: inherit }` out-ranked the button/link
  component rules, so primary buttons rendered ink-on-blue and the light variant
  white-on-white; component selectors now out-rank the generic rule. Manifest status
  line switched to an AA cyan (`--cyan-ink`) on paper; section label muted color
  lifted to pass AA on the tint surface.
- **Landing alignment:** nav, containers and the ASCII caption strip share one
  1200px gutter at every width; fan-out tiles render equal heights.

### Changed — public-surface redesign: Logo Ramp (DESIGN.md §5.2)

The whole public surface (landing, docs theme, 404, Studio SPA) now runs one
ratified token set **sampled from the logo itself** (`branding/logo.png`):
violet `#5d2de2` → blue `#0e4bec` → sky `#13a6e0` → cyan `#0cced4`, with the
bot's navy `#000828` as the dark canvas. **Light mode is the default** (cool
paper `#f7f8fd`); interactive color is the ramp core blue; the 4-stop ramp is
reserved for brand moments (hero emphasis, footer band), never buttons or text
fills. (Supersedes the same-day Phosphor Ink pass; purple and cyan are wanted
again by the brand.)
- Brand assets in `docs/public/` rebuilt from `branding/` (lockups, bot icon,
  derived favicon, og-image) — previously stale files from the old palette.
- **Landing rewritten** as a narrative page with a signature hero: the bot
  rendered as **dithered ASCII art** on canvas (`theme/landing/asciiBot.ts`,
  converted from `branding/logo-bot-icon.png`), swept by the logo ramp and
  reacting to the cursor; static frame under reduced motion, loop paused
  off-screen and on hidden tabs. The earlier build shipped four hardcoded
  hand-drawn text frames instead — the canvas renderer now implements what
  DESIGN.md §5.2 specifies. Layout follows the browserbase pattern: centered
  editorial hero with the full-bleed ASCII band below it, then feature rows,
  one shared section rhythm (`clamp(72px,10vw,110px)`), reveal-on-scroll
  gated on `html.js`, mobile CTA kept visible (§20). The page covers what was
  missing: the registry's publish/submit flow (PR or proposal issue,
  CI-validated), federated sources (skills.sh, npm, MCP registry, GitHub),
  crew installs, `proagents.yaml` → `resolve`/`lock`/`setup` environments,
  and the PA validation table. All internal links are base-aware
  (`withBase`) and the page is SSR'd (no scroll engine, no build step).
- Display face switched to **Nunito** (matches the logo wordmark);
  Bricolage Grotesque removed. Geist body + JetBrains Mono unchanged.
- The scroll-craft landing build (`scrollcraft/`) was removed. The landing is a
  static Vue island (`docs/.vitepress/theme/landing/`) **server-rendered** by
  VitePress and wrapped by `LandingIsland.vue`. It must stay SSR'd: a client-only
  mount lets VitePress hoist the island's static nodes into the lean JS chunk,
  where they never render.
- Docs theme (`custom.css`), `NotFound.vue`, static 404, `AppIsland.vue` and SPA
  tokens (`web/src/ui/tokens.ts`) re-skinned on the same `--pa-*` set;
  interactive pill-shaped controls reduced to 6px radii per DESIGN.md §7.

## [0.11.0] — 2026-09-19

### Changed — breaking: JSON-only registry format

The unified registry format is now **JSON-only** (`scripts/convert-registry-format.mjs`):
every artifact is a folder whose `manifest.json` is the single entry point and whose
sections are modular `.json` files. All ~782 legacy `.md` section files (identity,
expertise, methods, skills, rules, standards, policies, verification, handoffs,
mission, coordination, tasks, `tools/requirements.md`, knowledge docs) were converted;
`registry/` contains zero Markdown. Loaders (`src/profiles/registry.ts`,
`src/crew/hydrate.ts`), validation path patterns (`.json` only), adapters, CLI
scaffolds (`profile create`, `build --kind`), folder-sync scripts and the web SPA
hydrators are JSON-only, so automations never parse prose. Consumers of the npm
registry artifact must upgrade to this version.

### Added — scroll-craft landing for the docs home

The VitePress home (`/`) is now a scroll-driven live-surface page built with the
scroll-craft skill and the typesafe.ai aesthetic, themed to DESIGN.md tokens
(`docs/.vitepress/theme/LandingIsland.vue` + `scrollcraft/builds/proagents-home/`).
Seven acts, all real data: a session-terminal hero, the equip pipeline lighting stage
by stage, the JSON-only registry schema with real counters (25/8/33/418), the
signature-move hydrator (scroll drives the real security-engineer manifest hydrating
into its 26 JSON section files, 2,125 → 3,596 B), a pannable catalog rail of real
catalog entries, the PA-code enforcement table, and a working demo terminal computing
over an embedded catalog snapshot. Verified with the scroll-craft harness: desktop,
390×844 mobile and reduced-motion passes (no dead scroll, contrast ≥ 4.5:1).

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
