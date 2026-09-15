# Reference — Professional Profiles

Machine-facing details for the equip path. The canonical schema lives in
`src/profiles/types.ts`; shipped profiles in `profiles/*.json`.

## Commands and JSON contracts

| Command | JSON response |
|---|---|
| `proagent detect --json` | `{ status, command, primary: HarnessSignal, harnesses: HarnessSignal[] }` |
| `proagent list --json` | `{ status, command, profiles: [{ slug, name, version, description, origin, tags }] }` |
| `proagent inspect <slug> --json` | `{ status, command, profile: ProfileManifest, origin }` |
| `proagent equip <slugs…> --json` | `{ status, command, target, profile: string[], files: [{path, mechanism}], limitations: string[] }` — or `{ status: "blocked", conflicts }` |
| `proagent compile <slug> --target <id> --json` | same as equip with `command: "compile"` |
| `proagent equip … --dry-run --json` | `{ status, dryRun: true, target, profile, effective }` |
| `proagent validate --profiles --json` | `{ status, command, reports: ProfileValidationReport[] }` |

`HarnessSignal = { id, name, capabilities, evidence }` where capabilities include
`projectInstructions`, `skills`, `ruleEnforcement` (`native | instructions | none`), `mcp`,
`shell`, `git`. Harness ids: `claude-code`, `codex`, `opencode`, `cursor`, `gemini-cli`,
`generic-cli`.

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

## Equip output layout

For a harness with skills + native enforcement (Claude Code):

```text
.agents/skills/<slug>/SKILL.md      # agent-skill mechanism
CLAUDE.md                           # project-instructions (marked block)
.claude/settings.json               # rule-enforcement (PreToolUse hook)
```

The instructions block is delimited by `<!-- proagent:profile:start <hash> -->` /
`<!-- proagent:profile:end <hash> -->` markers. Re-equipping replaces the block between
markers — it never duplicates or rewrites the rest of the file. The marker hash is derived
from profile content (deterministic), never a timestamp.

## Local profiles

A repo can define its own professions:

```text
./profiles/<slug>.json
```

- Local profiles shadow built-ins with the same slug (discovery order: builtin → local).
- They appear in `list --json` with `origin: "local"`.
- `validate --profiles` flags them with a PA037 local notice so shipped vs. local is
  always distinguishable.
