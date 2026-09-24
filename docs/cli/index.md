---
description: 'Every proagent command: equip profiles, install crews, validate, search, build and benchmark — with flags and --json output.'
---

# CLI overview

```
proagent <command> [options]
```

## Commands

### Profiles (equip existing coding agents)

| Command | Purpose |
|---|---|
| `detect` | Detect coding-agent harnesses and their capabilities |
| `list` | List available professional profiles |
| `inspect <profile>` | Inspect a professional profile (expertise, methods, rules) |
| `equip <slug> [slug…]` | Equip the detected harness with one or more profiles |
| `compile <slug> --target <id>` | Compile a profile for a specific harness |
| `equip … --dry-run` | Show the compile plan without writing |
| `equip … --target <id>` | Override harness detection |
| `validate --profiles` | Validate every discoverable profile |

Full details: [Professional profiles](/guide/profiles).

### Registry (unified artifact model)

One artifact model for every kind: `profile · crew · agent · workflow · capability · skill · tool · mcp · prompt · hook · adapter · policy · template · extension`. Loaders for profile/crew/agent land first; other kinds are schema-complete (metadata only).

| Command | Purpose |
|---|---|
| `search "<query>" [--type <kind>]` | Federated search: native catalog + allowed sources (skills.sh, npm, MCP registry, GitHub) |
| `info <kind:id>` | Inspect one catalog artifact (metadata + content when a loader exists) |
| `install <kind:id>` | Install an artifact — delegates to equip (profiles) / crew install (crews) |
| `remove <kind:id>` | Remove an installed artifact from this repo |
| `update` | Re-resolve a stale `proagents.lock` |
| `list --kind <k>` | List catalog items by kind (bare `list` stays the profile listing) |
| `resolve` | Capability → implementation graph for `proagents.yaml` (`--select c=kind:id` pins a choice) |
| `lock` | Persist the resolution as `proagents.lock` (checksummed, no timestamps) |
| `compose <kind:id>…` | Validate a cross-kind composition (PA02x conflicts surface here) |
| `setup [--harness <id>] [--dry-run]` | `proagents.yaml` → resolve → validate → equip/install — the end-to-end pipeline |
| `validate --spec` | End-to-end PA5xx validation of spec (+ lock when present) |

Full details: [Registry guide](/guide/registry).

### Security (deterministic audit)

| Command | Purpose |
|---|---|
| `audit [<dir>]` | Deterministic security scan of a repo or directory (no model calls, no timestamps) |
| `audit --path <dir>` | Audit a specific directory instead of the cwd |
| `audit --json` | Machine-readable audit report |

The audit is pure and deterministic: identical trees produce identical
reports (AGENTS.md invariant 1). It checks:

- **AU001** — exposed secrets / private key material in text files
- **AU003** — instructions that pipe a remote fetch into a shell (`curl \| bash`, `iwr \| iex`, …)
- **AU004** — MCP server on a remote (non-localhost) http/sse transport
- **AU005** — MCP stdio launcher (`npx`/`uvx`/`bunx`) without a pinned version
- **AU006** — over-broad permission grants (`*`, `bash:*`, `Bash(bash:*)`)

Exit contract: `0` clean · `1` warnings only · `2` errors present. The exit
code is honored in `--json` mode too, so CI can gate on it. Full machine
contract: [JSON interface](/cli/json#audit).

### Install lifecycle (verify and repair what's installed)

| Command | Purpose |
|---|---|
| `list-installed [<dir>]` | Inventory what ProAgents owns: profiles, crews, instruction blocks |
| `list-installed --path <dir>` | Scan a specific directory instead of the cwd |
| `doctor [<dir>]` | Verify installed artifacts against provenance (deterministic) |
| `doctor --path <dir>` | Check a specific directory instead of the cwd |
| `repair` | Recompile single-profile installs from the on-disk canonical manifest |
| `repair --target <id>` | Recompile for this harness instead of the detected one |

Like the audit, `doctor` is pure and deterministic: identical trees produce
identical reports (AGENTS.md invariant 1). It checks:

- **DG001** — `manifest.json` beside an installed skill is unreadable/invalid
- **DG002** — manifest present but `SKILL.md` missing (broken install)
- **DG003** — instruction block start marker without a matching end marker
- **DG004** — more than one `proagent:` block region in a single instructions file
- **DG005** — instruction block whose profile is not installed (stale after `remove`)
- **DG006** — `.claude/settings.json` is not valid JSON (enforcement hooks cannot load)
- **DG007** — `.mcp.json` is not valid JSON (merged servers cannot load)

Exit contract: `0` healthy · `1` warnings only · `2` errors present — same
shape as `audit`. `repair` is deterministic too: it recompiles every
single-profile install (where the skill directory name matches
`manifest.profile.slug`) and reports composed installs as limitations, since
a composition cannot be reconstructed from one stored manifest. Full machine
contracts: [JSON interface](/cli/json#list-installed),
[doctor](/cli/json#doctor), [repair](/cli/json#repair).

### Memory (explicit project knowledge)

`proagent memory <subcommand>` — explicit, portable project memory. Records are
JSON-only files under `.proagent/memory/<key>.json`, each scope- and
provenance-tagged. Nothing is inferred or recorded behind your back; there is
no raw-session learning.

| Command | Purpose |
|---|---|
| `memory add <key> "<value>"` | Record or update a memory entry (bumps the stored version) |
| `memory add <key> "<value>" --scope <s>` | …tagged with a scope label (e.g. `release`, `api`) |
| `memory add <key> "<value>" --tags a,b` | …tagged with comma-separated tags |
| `memory add <key> "<value>" --provenance <p>` | …annotated with who/what recorded it (default `cli`) |
| `memory list` | List recorded entries, sorted by key |
| `memory show <key>` | Show one entry |
| `memory rm <key>` | Delete an entry |
| `memory compile` | Compile all records into the detected harness's instructions file |
| `memory compile --target <id>` | …for a specific harness instead of the detected one |

Validation codes (ME001–ME003): invalid key shape, empty/oversized value,
invalid scope or tag. Memory is part of the deterministic core: the compiled
block's marker is a content hash, so the same store always compiles
byte-identically (AGENTS.md invariant 1). Full machine contract:
[JSON interface](/cli/json#memory).

### Agent building (progressive interview)

| Command | Purpose |
|---|---|
| `init` | Start (or resume) an agent-building session |
| `status` | Knowledge state, confidence and readiness |
| `question` | Show the next high-value questions (`--all` for every open question) |
| `answer <id> "<text>"` | Answer a question and advance the interview |
| `context` | Retrieve scoped context for a task |
| `context frameworks` | List available context frameworks |
| `spec` | Generate the agent architecture specification |
| `validate` | Validate the architecture (non-zero exit on errors) — or an explicit file: `validate arch.json` |
| `build` | Generate deployable agent skills (`.agents/skills/<agent>/`) |
| `agents` | List agents in the generated architecture |
| `inspect` | Dump full session state (for agents/humans) |
| `discover` | Suggest registry items matching a query (or the session's intent) |
| `improve` | Show or configure self-improvement |
| `self-improve` | Alias of `improve` (`--schedule <freq>` maps to `improve schedule <freq>`) |
| `benchmark` | Benchmark generated agent systems (see below) |
| `build --kind spec` | Emit a `proagents.yaml` draft from the session's staged tooling |

## Global options

| Option | Purpose |
|---|---|
| `--json` | Machine-readable output on stdout |
| `--quiet` | Suppress decorations |
| `--target <harness>` | Target harness for equip/compile (claude-code, codex, opencode, cursor, gemini-cli, copilot, openclaude, freebuff, generic-cli) |
| `--intent "<text>"` | Provide intent without the interactive prompt |
| `--context <path>` | Add a context source (repeatable / comma-separated) |
| `--context-framework <id>` | Use a context framework (builtin, optional, or path/URL) |
| `--agent <id>` | Target a specific agent (build/agents) |
| `--output <dir>` | Build/spec output directory (default `.agents/skills`) |
| `--non-interactive` | Never prompt; emit questions for the caller |
| `--self-improving <freq>` | daily / weekly / monthly / quarterly / manual |
| `--improvement-policy <mode>` | propose / supervised / auto |

## Benchmark subcommands

`proagent benchmark <subcommand>` — deterministic-first benchmarking of generated agents. Full details: [Benchmark system](/guide/benchmarking).

| Subcommand | Purpose |
|---|---|
| `benchmark list` | List suites in `.agents/benchmarks/` |
| `benchmark create <suite>` | Scaffold a suite |
| `benchmark validate <suite>` | Validate cases, rubrics, judges, weights |
| `benchmark run <suite>` | Execute: traces → deterministic checks → judges → consensus → score |
| `benchmark run <suite> --runs N` | Repeated runs with flaky detection |
| `benchmark run <suite> --agent <ref>` | Run against a reference agent (perfect/unsafe/flaky/cheating/…) |
| `benchmark report <run-id>` | Human-readable report |
| `benchmark baseline create <run-id>` | Store a run as suite baseline |
| `benchmark regressions <run-id>` | Per-metric/case regression detection (non-zero exit on regressions) |
| `benchmark compare <a> <b>` | Compare two runs |
| `benchmark inspect <case>` | Show a case's checks and expectations |
| `benchmark evaluators` | List deterministic evaluators |

All support `--json`.

## Registry groups

The Git-backed registry has two command groups — one per item kind. Both
resolve local sources first — your repo's `.proagent/profiles/` and
`.proagent/crews/` creations (where `profile create` / `crew create` scaffold),
then a `registry/profiles/` / `registry/crews/` checkout — and fall back to the
remote catalog (`--repo owner/name --ref branch --token <gh-token>`).

### crew

| Command | Purpose |
|---|---|
| `crew list` | List registry crews in the catalog |
| `crew show <id>` | Print a crew definition (workers, permissions, MCP) |
| `crew validate <manifest.json\|dir>` | Hydrate + validate a crew manifest (folder standard or inline); enforces PA043–PA048 |
| `crew install <id>` | Install a crew into the current repo (`.agents/crews/<id>/` + `.mcp.json`) |
| `crew install <id> --dry-run` | Show the install plan without writing |
| `crew build <manifest.json>` | Install from a local manifest (builder output or folder-standard `manifest.json`) |
| `crew create <profile…>` | Compose existing profiles into a custom crew folder in `.proagent/crews/` (every member binds a profile) |
| `crew publish <file>` | Direct catalog commit (contents:write) |
| `crew submit <file>` | File a registry proposal issue (recommended) |

`crew create` flags: `--name`, `--id`, `--description`, `--role <member-role>`
(one per member, in argument order). `publish`/`submit` accept both
folder-standard and inline JSON manifests — folder manifests are hydrated
before validation.

### profile

| Command | Purpose |
|---|---|
| `profile create <name>` | Scaffold a custom profile into `.proagent/profiles/<slug>/` (`--slug`, `--description`) |
| `profile list` | List registry profiles in the catalog |
| `profile show <id>` | Print a profile manifest (hydrated) |
| `profile install <id>` | Resolve + validate + equip from the catalog (same as `equip`) |
| `profile validate <file.json>` | Validate a profile manifest (hydrates path-format sections) |
| `profile publish <file.json>` | Direct catalog commit (contents:write) |
| `profile submit <file.json>` | File a registry proposal issue (recommended) |

Shortcuts: `proagent equip` = `profile install`, `proagent list` = `profile list`.

## Typical session (human, interactive)

```bash
proagent detect
proagent equip security-engineer
proagent inspect security-engineer
proagent validate --profiles
```

Or the agent-building path:

```bash
proagent init --intent "I want an agent that reviews PRs for security issues"
proagent answer q_001 "It reviews diffs in our Node.js services and comments on PRs"
proagent status
proagent spec
proagent validate && proagent build
```

## Typical session (agent, non-interactive)

See the [JSON interface](/cli/json) for the full machine contract.
