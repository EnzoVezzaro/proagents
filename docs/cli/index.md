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
| `improve` | Show or configure self-improvement |
| `benchmark` | Benchmark generated agent systems (see below) |
| `build --kind spec` | Emit a `proagents.yaml` draft from the session's staged tooling |

## Global options

| Option | Purpose |
|---|---|
| `--json` | Machine-readable output on stdout |
| `--quiet` | Suppress decorations |
| `--target <harness>` | Target harness for equip/compile (claude-code, codex, opencode, cursor, gemini-cli, generic-cli) |
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
resolve a local checkout first (`registry/profiles/`, `registry/crews/`),
then fall back to the remote catalog (`--repo owner/name --ref branch --token <gh-token>`).

### crew

| Command | Purpose |
|---|---|
| `crew list` | List registry crews in the catalog |
| `crew show <id>` | Print a crew definition (workers, permissions, MCP) |
| `crew validate <crew.json\|dir>` | Hydrate + validate a crew manifest (folder standard or inline); enforces PA043–PA048 |
| `crew install <id>` | Install a crew into the current repo (`.agents/crews/<id>/` + `.mcp.json`) |
| `crew install <id> --dry-run` | Show the install plan without writing |
| `crew build <crew.json>` | Install from a local manifest (builder output or folder-standard `crew.json`) |
| `crew create <profile…>` | Compose existing profiles into a custom crew folder in `registry/crews/` (every member binds a profile) |
| `crew publish <file>` | Direct catalog commit (contents:write) |
| `crew submit <file>` | File a registry proposal issue (recommended) |

`crew create` flags: `--name`, `--id`, `--description`, `--role <member-role>`
(one per member, in argument order). `publish`/`submit` accept both
folder-standard and inline JSON manifests — folder manifests are hydrated
before validation.

### profile

| Command | Purpose |
|---|---|
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
