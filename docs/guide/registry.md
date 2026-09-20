# Registry: the spec repository

The registry is a **repository of specs, not agents**: profile specs (professions) and
crew specs (teams of workers wired by a handoff graph). A harness — Claude Code, Codex,
whatever coding agent you run — does the executing. The proagent CLI is the courier: it
pulls a spec from here and hands it to your harness as native artifacts.

It distributes two kinds of reusable professional capability:

- **Profile specs** — a profession for your existing coding agent (`proagent equip security-engineer`)
- **Crew specs** — a bundle of workers, each optionally carrying a profile as its profession, wired together by a handoff graph

Everything is free and MIT-licensed. Every listing is a reviewable JSON file in the open
repo, and any item pulls into your repository with one command.

## The pieces

| Piece | Where | What it is |
|---|---|---|
| Studio app | [`/proagents/studio`](https://proagents.reposell.dev/studio) | Static SPA (React + Vite) deployed to GitHub Pages — runs entirely in your browser |
| Catalog | `registry/catalog.json` + `registry/profiles/` + `registry/crews/` + `registry/capabilities/` | **Git-as-database**: the repo itself is the data layer; every listing is a reviewable JSON file, and Pages serves reads |
| CLI | `proagent equip <slug>` · `proagent setup` · `proagent search …` | the courier: pulls a spec (profile or crew) — or resolves a whole environment — and hands it to your harness |
| Installer | `.agents/skills/<profile>/` + instructions block · `.agents/crews/<id>/` + `.mcp.json` | the on-disk layout any agent runtime can execute |

## Install a profile (the one-liner)

```bash
npx proagent equip security-engineer
```

That's it. The command resolves the profile (built-in, local, or the Git-backed catalog),
validates it, detects your coding-agent harness, and compiles the profession into the
harness's strongest mechanisms:

```
.agents/skills/security-engineer/SKILL.md   # skills mechanism (if supported)
CLAUDE.md                                   # marked profile block (instructions)
.claude/settings.json                       # native rule enforcement (if supported)
```

Useful variants:

```bash
proagent list                               # browse available profiles
proagent inspect security-engineer          # deep view: expertise, methods, rules
proagent equip security-engineer --dry-run  # see the plan, write nothing
proagent equip staff-engineer security-engineer   # compose professions
proagent compile security-engineer --target codex # explicit harness
```

### Remote vs local equip

`npx proagent equip <slug>` resolves in order: your repo's `.proagent/profiles/` local
creations (written by `proagent profile create`) → a `registry/profiles/` checkout →
the packaged snapshot shipped with the npm package → the remote catalog (fetched from the
catalog repo). Consequence: a profile you just scaffolded **works locally immediately**,
but the same one-liner only works remotely for other people **after the profile is
merged into the catalog repo** — which is exactly what publishing does.

### The `profile` command group

Everything the registry offers for profiles is also available as explicit
subcommands — mirroring the `crew` group:

```bash
proagent profile list                        # the profile slice of the catalog
proagent profile show <id>                   # print the full manifest
proagent profile install <id> [id…]          # resolve + validate + equip
proagent profile validate <file.json>        # gate before publish/submit (non-zero exit on errors)
proagent profile publish <file.json>         # direct catalog commit (contents:write)
proagent profile submit <file.json>          # file a proposal issue (recommended)
```

`profile submit` opens an issue with the manifest in a `PROFILE-JSON` block — CI validates
it automatically and a maintainer `/publish` commits it, the same review-gated flow crews
use. The issue form (`.github/ISSUE_TEMPLATE/profile-proposal.yml`) also works by hand.

## Crew folder standard

Crews follow the same folder standard as profiles — the manifest is an index,
the folders are the source:

```
registry/crews/<crew-id>/
├── manifest.json                      # the index: version, crew metadata, section paths
├── mission.json                       # why the team exists
├── members/NN-<member-id>.json        # profile bindings (CrewMemberSource)
├── coordination/NN-*.json             # how members coordinate and decide
├── tasks/NN-*.json                    # the units of work each member owns
├── workflows/NN-*.json                # end-to-end team workflows
├── handoffs/NN-*.json                 # per-edge handoff contracts
├── rules/NN-*.json                    # team-level normative rules
├── verification/NN-*.json             # how the crew verifies its output
└── mcp/servers.json                   # crew-level MCP servers
```

Every member binds an existing profile (`profile` field in its member file) —
expertise, methods and rules come from the profile, never from the crew;
permissions are explicit per member and never inherited. Edit the team by
editing the section files; add a member by adding a `members/NN-<id>.json`
binding and listing it in `manifest.json`. The CLI, SPA and CI all hydrate the
paths at load time — same model as a profile's `manifest.json`.

Crews are also held to the **subagent standards** (the crew-side form of the
PA001–PA013 architecture rules), enforced by the validator at publish and PR
time:

- **PA043** (error): production write without an approval gate
- **PA044**: secret access without approval gates
- **PA045**: an orphaned worker that exchanges no artifacts with the graph
- **PA046**: a worker receiving from more than 5 upstreams
- **PA047** (error): a member file that is missing, did not load, or whose
  filename stem matches no member id/profile
- **PA048** (error): a declared section file (mission, members, tasks, …)
  that cannot be loaded from the crew folder

## Install a crew (the one-liner)

```bash
npx proagent crew install incidere-incident-response
```

That's it. The command fetches the crew definition from the Git-backed catalog, validates
it, and writes everything the crew needs into the repo you ran it in:

```
.agents/crews/incidere-incident-response/
├── manifest.json              # full definition (source of truth)
├── SKILL.md                   # crew-level operating skill
└── workers/
    ├── triage/{SKILL.md, agent.json}
    ├── comms/{SKILL.md, agent.json}
    └── remediation/{SKILL.md, agent.json}
.mcp.json                      # MCP servers merged (never clobbers existing entries)
```

Useful variants:

```bash
proagent crew list                          # browse the catalog
proagent crew show <id>                     # inspect workers + permissions + MCP
proagent crew validate <dir>                # folder manifest + PA043–PA047 checks
proagent crew install <id> --dry-run        # see the plan, write nothing
proagent crew install <id> --repo owner/name --ref dev   # another catalog
```

## Projects: `proagents.yaml` → `setup`

Beyond single artifacts, the registry resolves **whole environments**. A project spec —
`proagents.yaml` at the repo root — declares what the project needs as *capabilities*
(abstract abilities like `browser-automation`), never as implementation-specific refs.
The registry resolves where those capabilities come from: native catalog first, then
allowed federated sources (skills.sh, npm, the MCP registry, GitHub — declared in
`registry/sources/*.yaml`, data not code).

```yaml
# proagents.yaml — the human-authored source of truth
schema: proagents/v1
project:
  name: my-saas
environment:
  profiles: [frontend-developer, backend-developer, qa]
  crews: [feature-delivery-squad]
  capabilities: [browser-automation, database-access, source-control]
policies:
  filesystem:
    workspace-only: true
  network:
    allowed: [github.com]
harness:
  compatibility: [codex, opencode]   # mode: compatible — never a pin
```

The pipeline (analogous to `package.json` + `package-lock.json`):

```bash
proagent resolve                 # capability → implementation graph (PA502/503/504)
proagent lock                    # persist proagents.lock (checksummed, no timestamps)
proagent validate --spec         # end-to-end PA5xx check of spec + lock
proagent setup                   # spec → resolve → validate → equip/install
proagent setup --harness codex   # same environment, different adapter
proagent setup --dry-run         # the plan, nothing written
```

`setup` chains the layers you already know: compose the spec's profiles (PA02x), compile
for the target harness, install crews (with the `.mcp.json` merge), and report what the
target could not enforce as **limitations** — markdown is not enforcement, and the report
is honest about it. A blocked setup writes nothing.

Validation codes — the PA5xx series (full table in [CLI → JSON interface](/cli/json)):

| Code | Meaning |
|---|---|
| `PA501` | invalid proagents.yaml schema |
| `PA502` | unsatisfiable capability (no implementation on any allowed source) |
| `PA503` | ambiguous capability, no selection (pass `--select c=kind:id`) |
| `PA504` | circular artifact dependency |
| `PA505` | artifact vs `harness.compatibility` mismatch |
| `PA510` | lock stale (spec changed after `lock`) |
| `PA511` | lock checksum mismatch / unverified |

In Studio, **Build an environment** (the primary experience) walks intent → capabilities →
artifacts → policies → export and downloads the same `proagents.yaml`. Discover is the
secondary surface; its **Use in Project** action imports any catalog item into the builder.

## The web app

### Build an environment (primary)
The Studio opens on **Build**: describe what you are building, pick the capabilities the
environment needs, add catalog artifacts that provide them, set policies, and export a
portable `proagents.yaml` (the [Projects](#projects-proagents-yaml-→-setup) flow above).
Every step validates client-side (PA501/PA502/PA505) with the full PA5xx set left to
`proagent resolve` — federated search is a CLI strength.

### Catalog & detail (discover)
Browse **profiles**, crews and single agents, filter by tag, and open any item for detail:
profiles show expertise, methods, rules and verification with the one-line equip command;
crews show the full worker table with **permission badges**
(write/production/secrets/approval gates/MCP). **Use in Project** imports any item into
the environment builder. Everything is free and MIT-licensed — every item installs directly.

### Build a profile (the guided walkthrough)
`Build a profile` opens a five-step walkthrough — each step shows its own completion state
in the rail, with Next/Back navigation and draft persistence across reloads:

1. **Identity** — name, slug, version, tags, author, one-line description, operating
   summary. The slug is checked against the live catalog **as you type**: a slug that
   already exists is blocked with an inline warning (publishing would collide).
2. **Expertise & rules** — expertise areas, methods, normative rules, and **standards**
   (one per line — as many as the profession follows: OWASP ASVS, ISO 27001, NIST SSDF…).
3. **Tools & MCP** — everything the profession needs from its environment: native
   required/forbidden tools, **MCP servers** (name, transport, command/URL, health-check
   endpoint — with a live **health check** button probing http/sse endpoints from the
   browser), and **registry packages** (`npm:<pkg>[@v]` or `github:owner/repo[@ref]`).
4. **Skills** — install from a package registry (`npm:`/`github:` refs) or **write your
   own** inline (name, description, markdown body). Written skills install as standalone
   `.agents/skills/<name>/SKILL.md` at equip time.
5. **Verification → Ship** — required/optional verification, then the Ship tab: download
   the JSON for local use, **Publish via pull request**, or file a proposal issue.

Validation (PA030–PA040) runs live on every step; the Ship tab gates on it before any
publish action.

### Build a crew (the main event)
`Build a crew` opens a two-path entry — both end in the same builder and the same output:

1. **Start from your repo** — after GitHub sign-in, pick one of your repositories. ProAgents
   analyzes its shape (languages, tests, CI, docs, migrations, IaC — a deterministic rules
   engine, no model calls) and drafts a grounded starter crew: suggested workers with
   reasons, context scopes from real directories, artifact-passing handoffs. Everything
   stays editable.
2. **Build it custom** — an empty crew, full control: name, workers with explicit
   permission models (read/write/production/secrets + approval gates), tool allowlists, MCP
   server bindings (stdio/http/sse), context scopes, and the handoff graph (must stay
   acyclic — that's what makes a crew installable and runnable).

Either way you end with a **CrewDefinition JSON** that:

- installs locally: download it, run `proagent crew build <dir>/manifest.json` in
  any repo (skills, agent contracts, merged `.mcp.json`), or
- publishes to the registry by **filing a proposal issue** (next section).

### Publishing = a PR or a proposal issue — never a silent direct commit
Registry submissions are gated by CI on two paths:

1. **Pull request (recommended — used by the profile builder's *Ship* tab).** Sign in with
   GitHub, press **Publish via pull request**: the app creates a branch
   (`proagent-profile/<slug>`), commits `profiles/<slug>/manifest.json` + the section
   folders and the catalog index, and opens
   a PR. The `Registry PR validation` workflow validates every changed item with the
   same deterministic validator and checks index consistency. Contributors without push
   access are supported automatically (the branch lands on a fork). A maintainer merge
   publishes.
2. **Proposal issue.** `proagent crew submit <item-dir>/manifest.json` /
   `proagent profile submit <item-dir>/manifest.json` (or the builders' *File proposal issue*
   buttons) open an issue with the
   full JSON in a parseable block; the `Crew proposal pipeline` workflow extracts and
   validates it, commenting ✅ or ❌ with exact problems. A maintainer comments `/publish`
   to commit, `/close <reason>` to reject.

Both paths run the identical validators — the PR path adds the catalog-index consistency
check. The issue forms (`.github/ISSUE_TEMPLATE/crew-proposal.yml`,
`profile-proposal.yml`) also work by hand.

### Preview an agent on your repo
`Dashboard → Preview on a repo`: sign in with GitHub (device flow — see below), pick one of
your repositories, pick a crew, and run it **on the fly** with the provider/model you set in
Settings. The model sees the crew contract plus your repo's file tree and reports fit, gaps,
suggested per-worker edits and permission risks. Your code never leaves the browser except
to your chosen provider. When it looks right, one button installs the crew into that repo
via the GitHub API — same layout as the CLI produces.

### Settings modal
Everything user-specific lives in the browser's localStorage — there is no server:

- **Provider & model** for previews: OpenAI, Anthropic, Google, OpenRouter, or any
  OpenAI-compatible endpoint + your API key
- **GitHub**: device-flow sign-in (recommended) or a PAT with `repo` scope

### Auth: GitHub device flow
The app signs in with the **ProAgents GitHub App** using the OAuth Device Flow — designed
for input-limited clients and, importantly for a static site, requiring **no client
secret**. Open **Settings → GitHub account** and press *Sign in with GitHub*, enter the
one-time code at `github.com/login/device`, done. The token stays in your browser.

**Why a proxy?** `github.com/login/*` sends no CORS headers, so the browser cannot call
the device-flow endpoints directly. In `vite` dev a local proxy serves `/github-oauth/*`;
GitHub Pages deployments relay the same two endpoints through a tiny Cloudflare Worker
(`workers/github-oauth-proxy.mjs`, deployed once, URL set via `VITE_OAUTH_PROXY_URL`).
All other GitHub traffic (`api.github.com`) allows CORS and is called directly.

**Token lifetime.** GitHub App user tokens expire (8h by default). The SPA stores the
refresh token issued alongside the access token and uses it to re-authenticate silently —
proactively when the token nears expiry, and reactively after any 401 — so a session
survives for about six months without a new device-flow round-trip. The CLI mirror is
`npm run gh:token`, which refreshes silently on re-run and records
`GITHUB_TOKEN_EXPIRES_AT` / `GITHUB_REFRESH_TOKEN` / `GITHUB_REFRESH_EXPIRES_AT` in
`.env`. To disable expiry entirely, uncheck *Expire user authorization tokens* in the
App's settings.

**App settings checklist** (GitHub → Settings → Developer settings → GitHub Apps →
`proagents`):

- ✅ **Enable Device Flow** — required for the Settings-modal sign-in button
- ✅ **Request user authorization (OAuth) during installation** — identity is granted on
  install
- **Callback URL** `https://proagents.reposell.dev/auth` — used by web
  application flow, not device flow (harmless to keep)
- **Permissions**: `repository metadata` (read) is enough for sign-in, previews and
  proposal issues; PR-based publishing additionally needs **Contents** read & write on
  the catalog repo (or works from a fork)
- **No webhook needed** — leave it inactive unless you build server-side features

## Donations

ProAgents is **fully open source** — there is nothing to buy. Every crew and agent in the
registry is free and MIT-licensed, and the project itself has no paid tier. If the tool
saves you time, support development through the donation channels:

- **GitHub Sponsors** — <https://github.com/sponsors/EnzoVezzaro> (the Donate button in
  the Studio header and the Sponsor button on the repo)
- **Ko-fi** — <https://ko-fi.com/enzojuniorvezzaro>

Both are wired into `.github/FUNDING.yml`, the README, the docs footer and the Studio
app. There are no payment processors in the codebase: no Stripe, no keys, no checkout.

## Environment & secrets (.env)

All credentials live in a gitignored **`.env`** at the project root; **`.env.example`**
is the committed template. Copy it and fill in real values:

```bash
cp .env.example .env
```

| Variable | Used by | Notes |
|---|---|---|
| `PROAGENT_MARKET_REPO` | CLI, SPA build | Catalog repo (default `EnzoVezzaro/proagents`) |
| `GITHUB_TOKEN` | CLI | `contents:write` token for `crew publish` / `profile publish` / browser-less install |
| `VITE_*` | SPA build | Public values only (`VITE_GITHUB_APP_CLIENT_ID`, `VITE_MARKET_REPO`, `VITE_OAUTH_PROXY_URL`) |

The rule: **a variable named `VITE_*` is public** and gets embedded in the deployed
bundle; everything else stays local. Resolution order: real environment variables →
`.env.local` → `.env` → `~/.proagent/.env` (user-global fallback for a globally-installed
CLI). Project files always outrank the global one, and CI secrets beat everything.

## Adding a listing to the catalog

The recommended path (used by the builder's *Ship* tab too):

```bash
# crews (folder standard — manifest.json is the entry point)
proagent crew validate registry/crews/my-crew/manifest.json       # must pass
proagent crew submit registry/crews/my-crew/manifest.json         # files the proposal issue; CI validates it

# profiles
proagent profile validate registry/profiles/my-profession/manifest.json # must pass
proagent profile submit registry/profiles/my-profession/manifest.json   # files the proposal issue; CI validates it
```

A maintainer then comments `/publish` on the issue, which commits the item folder
(`profiles/<slug>/` or `crews/<id>/`) and updates `catalog.json` — the next Pages build
serves them. Direct commits are still available to maintainers via `proagent crew
publish` / `proagent profile publish` (contents:write), but proposals are the
reviewable, auditable default.

## Known limitations

- The catalog has no server-side identity: authorship is an `author` field, and publishing
  requires GitHub sign-in. PR-based publishing supports fork workflows, so any signed-in
  contributor can propose; a maintainer merge is still required.
- Preview runs send the repo's *file tree* (paths only) to your chosen provider — not file
  contents. Reviews that need contents should use the installed crew locally.
- Identity is GitHub device flow only — there is no third-party identity provider in the
  product; the app's GitHub App grants permissions, not user roles.
