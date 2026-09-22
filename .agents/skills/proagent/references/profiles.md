# Reference — Professional Profiles

Machine-facing details for the equip path. The canonical schema lives in
`src/profiles/types.ts`; shipped profiles live as folders in `registry/profiles/<slug>/`,
each behind one `manifest.json` whose section entries are `.json` paths.

## Commands and JSON contracts

| Command | JSON response |
|---|---|
| `proagent detect --json` | `{ status, command, primary: HarnessSignal, harnesses: HarnessSignal[] }` |
| `proagent list --json` | `{ status, command, profiles: [{ slug, name, version, description, origin, tags }] }` |
| `proagent inspect <slug> --json` | `{ status, command, profile: ProfileManifest, origin }` |
| `proagent equip <slugs…> --json` | `{ status, command, target, profile: string[], files: [{path, mechanism}], limitations: string[], enforcement: { enforced: string[], advisory: string[], baseline: string[] } }` — or `{ status: "blocked", conflicts }` |
| `proagent compile <slug> --target <id> --json` | same as equip with `command: "compile"` |
| `proagent equip … --dry-run --json` | `{ status, dryRun: true, target, profile, effective }` |
| `proagent validate --profiles --json` | `{ status, command, reports: ProfileValidationReport[] }` |
| `proagent profile list --json` | `{ status, repo, ref, profiles[] }` (catalog slice, kind: profile) |
| `proagent profile show <id> --json` | `{ status, profile }` |
| `proagent profile install <id> --json` | same shape as equip |
| `proagent profile validate <file> --json` | `{ status: "ok"\|"invalid", slug, problems[] }` |
| `proagent profile publish <file> --json` | `{ status, slug, version, repo, ref, itemPath, catalogPath }` |
| `proagent profile submit <file> --json` | `{ status, slug, version, repo, issue, url }` |

`HarnessSignal = { id, name, capabilities, evidence }` where capabilities include
`projectInstructions`, `skills`, `ruleEnforcement` (`native | instructions | none`), `mcp`,
`shell`, `git`. Harness ids: `claude-code`, `codex`, `opencode`, `cursor`, `gemini-cli`, `copilot`,
`openclaude`, `freebuff`, `generic-cli`.

Exit codes: profile validation failures and composition **errors** exit non-zero with
`status: "blocked"`. Warnings never block.

## Composition conflict codes (PA02x)

| Code | Severity | Meaning |
|---|---|---|
| `PA022` | error | Conflicting rules: the same rule required by one profile, forbidden by another. Blocks. |
| `PA023` | error | Incompatible tools: required by one profile, forbidden by another. Blocks. |
| `PA024` | warning | Method dependency declaration (`depends:<method>`) — verify no cycle. |
| `PA025` | warning | Capability gap: verification requirement no declared tool can satisfy. |
| `PA026` | warning | The same profile listed twice in one composition. |

Composition is deterministic: same inputs → same effective profile and conflict set.
Rules merge by list order with deduplication; conflicts are never resolved silently —
blocked equips need an explicit user decision.

## Validation codes (PA03x)

| Code | Meaning |
|---|---|
| `PA030` | Missing required field (version, profile.name/slug/version, identity.title) |
| `PA031` | Slug is not kebab-case |
| `PA032` | profile.version is not semver |
| `PA033` | expertise is empty |
| `PA034` | tools.required is empty |
| `PA035` | verification.required is empty |
| `PA036` | A tool is both required and forbidden |
| `PA037` | Knowledge reference missing, or local-profile notice |
| `PA038` | Duplicate slug across profile sources |
| `PA039` | Malformed MCP server entry (name/transport/url/command) |
| `PA040` | Invalid package/skill registry ref (not npm:/github:) |
| `PA041` | Reference entry without an https:// URL |
| `PA042` | Section path entry missing from the profile directory |
| `PA043` | Malformed or dangling rule enforcement block |

## Rule enforcement

A rule section file may carry a machine-readable `enforcement` block beside its `body` —
the deny-only kinds `bash` (command patterns), `paths` (protected file globs) and
`tools` (semantic tool names: shell, filesystem, git, web, network). The loader collects
them into `ruleEnforcement` (prose + data, paired); composition unions them across
profiles. The compiler translates per target:

- OpenCode → deny patterns in `opencode.json` (`permission.bash`, `permission.edit`) —
  plus the manifest's `tools.forbidden`.
- Claude Code → generated `PreToolUse` hooks in `.claude/settings.json`, replaced by
  marker on re-equip (user hooks preserved; legacy pre-marker generated hooks cleaned up).
- Every native equip adds a compiler baseline (`git push --force*`, `rm -rf /*` denied).
- What cannot compile is reported in `limitations` and the `--json` `enforcement`
  summary (`enforced` / `advisory` / `baseline`) — never silently dropped.

## Equip output layout

For a harness with skills + native enforcement (Claude Code):

```text
.agents/skills/<slug>/SKILL.md      # agent-skill mechanism
.agents/skills/<slug>/manifest.json  # canonical manifest (portable, inspectable)
CLAUDE.md                           # project-instructions (marked block)
.claude/settings.json               # rule-enforcement (PreToolUse hook)
```

The instructions block is delimited by `<!-- proagent:profile:start <hash> -->` /
`<!-- proagent:profile:end <hash> -->` markers. Re-equipping replaces the block between
markers — it never duplicates or rewrites the rest of the file. The marker hash is derived
from profile content (deterministic), never a timestamp.

## Marketplace publishing

Profiles reach the catalog the reviewable way:

```bash
proagent profile validate my.json    # deterministic gate (PA03x, non-zero exit on errors)
proagent profile submit my.json      # files a [profile-proposal] issue with a PROFILE-JSON block
```

CI extracts the block, runs `profileProblems()` and comments the verdict; a maintainer
`/publish` commits `items/<slug>.json` + the `kind: "profile"` catalog entry.
`proagent profile publish` performs the same two Contents-API commits directly (requires
contents:write) — proposals are the default because every change is a reviewable diff.

## Local profiles

A repo can define its own professions:

```text
.proagent/profiles/<slug>/
├── manifest.json          # the single entry point
├── identity.json
├── expertise/01-*.json
└── …                      # same folder standard as registry profiles
```

- Local profiles shadow built-ins with the same slug (resolution: local
  `.proagent/profiles/` first, then a `registry/` checkout, then the packaged catalog).
- They appear in `list --json` with `origin: "local"`.
- `validate --profiles` flags them with a PA037 local notice so shipped vs. local is
  always distinguishable.
