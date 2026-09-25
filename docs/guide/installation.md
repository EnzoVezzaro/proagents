---
description: 'The complete, agent-driven install runbook: how to install, set up, verify and repair proagent profiles and crews — everything needed to finish the job correctly.'
---

# Install & setup runbook (for agents)

This file is the operating procedure an AI coding agent follows when asked to **install,
equip or set up** ProAgents artifacts (profiles, crews, or a whole environment). It is
written so the job is done *entirely* — installed, verified, and reported — not left
half-finished.

Follow it top to bottom. Each section is ordered; do not skip the verification step.
When in doubt, dry-run before writing, and report anything blocked instead of forcing it.

## 0. What "done" means

A job is complete only when:

1. The CLI is available (`proagent` resolves, `--json` parses cleanly).
2. The requested artifact is installed **and** written to disk (path is into `.agents/`,
   `CLAUDE.md`/`AGENTS.md`, `.claude/settings.json`, or `.mcp.json` as appropriate).
3. Verification passes: `doctor` exits `0`, `validate` reports no errors, and
   `list-installed` lists the artifact.
4. Any `limitations[]` the CLI reported are surfaced to the user — never hidden.
5. You report what was written, what could not be enforced, and what you did not do.

## 1. Make the CLI available

Requires **Node.js ≥ 20**. Two ways:

```bash
# install globally
npm install -g @reposell/proagent

# or run one-off without installing
npx --yes @reposell/proagent --version
```

Verify it answers deterministically:

```bash
proagent --version
proagent detect --json   # harness detection + capabilities
```

`proagent detect --json` returns `{ status, primary: { id, capabilities, evidence[] }, harnesses[] }`.
The `primary` harness is what `equip` will target by default.

## 2. Figure out what artifact the user actually wants

ProAgents installs three different shapes. Pick the matching flow:

| User wants | Flow | Command |
|---|---|---|
| One profession on an existing agent | Profile | `proagent equip <slug>` |
| A crew (team of workers) in the repo | Crew | `proagent crew install <id>` |
| Several professions + crews at once | Environment | `proagents.yaml` → `proagent setup` |
| Browse first | List | `proagent list --json` / `proagent crew list --json` |
| Install by registry switch | Unified | `proagent install <kind:id>` |

Browse what exists before installing:

```bash
proagent list --json              # { profiles: [{ slug, name, version, description, origin, tags }] }
proagent list --kind crew --json  # { items: [<MarketplaceItem>] }
proagent inspect <slug> --json    # full profile manifest
proagent crew show <id> --json    # full crew definition (workers, permissions, MCP)
```

`origin` is `builtin`, `local` or `marketplace` — a local `.proagent/profiles/` copy
wins over the packaged snapshot for the same slug.

## 3. Fly through the decision procedure

Before writing anything, answer these in order:

1. **Is it a profile, crew, or environment?** → Section 4, 5 or 6.
2. **Which harness?** Default is whatever `detect` called `primary`; override explicitly
   only if the user names one (`--target codex`, `--harness codex`).
3. **Dry-run first.** Every install command has `--dry-run` — run it, read the plan,
   then run the real command. Never skip the dry-run for the first execution.
4. **Will it compose?** Equipping several profiles merges them. Composition conflicts
   (`PA022`/`PA023`) **block** the install with non-zero exit — report them, never bypass.
5. **Will it touch `.mcp.json`?** Crew installs merge MCP servers and **never clobber**
   existing entries. Expect `mcpMerged` in the result.

## 4. Profile flow (`equip`)

```bash
proagent equip <slug> [slug…] --dry-run   # the plan, nothing written
proagent equip <slug> [slug…] --json      # the install
```

Expected `--json` shape:

```json
{
  "status": "ok",
  "command": "equip",
  "target": "claude-code",
  "profile": ["security-engineer"],
  "files": [
    { "path": ".agents/skills/security-engineer/SKILL.md", "mechanism": "agent-skill" },
    { "path": "CLAUDE.md", "mechanism": "project-instructions" },
    { "path": ".claude/settings.json", "mechanism": "rule-enforcement" }
  ],
  "limitations": []
}
```

- `files[]` is the proof of install — every written path.
- `limitations[]` is the honest report of what the harness could not express or enforce
  (e.g. `ruleEnforcement` unsupported). Report it verbatim to the user.
- A **blocked** equip exits non-zero with `{ status: "blocked", conflicts: [{ code,
  severity, message, suggestion }] }`. Surface the conflict + suggestion.

### Equip variants

```bash
proagent equip staff-engineer security-engineer     # compose professions
proagent equip <slug> --target codex                # explicit harness
proagent compile <slug> --target claude-code --json # same pipeline, explicit target
proagent profile install <id> --json                # registry-equivalent of equip
```

## 5. Crew flow (`crew install`)

```bash
proagent crew list --json                           # what crews exist
proagent crew show <id> --json                      # workers, permissions, MCP
proagent crew install <id> --dry-run                # plan first
proagent crew install <id> --json                   # the install
```

A crew install writes:

```
.agents/crews/<crew-id>/
├── manifest.json        # full definition (source of truth)
├── SKILL.md             # crew-level operating skill
└── workers/
    ├── <worker>/{SKILL.md, agent.json}
    └── …
.mcp.json                # MCP servers merged (never clobbers existing entries)
```

Expected `--json` shape:

```json
{ "status": "ok", "installed": { "crewId": "...", "version": "...", "filesWritten": [], "mcpMerged": true } }
```

Alternatives:

- `proagent crew build <manifest.json> --json` — install from a local builder output /
  folder-standard manifest.
- `proagent install crew:<id> --json` — the unified registry form of the same thing.
- `proagent crew install <id> --repo owner/name --ref dev` — another catalog.

If the user has a local crew folder instead (e.g. from the Studio builder),
`proagent crew install <id> --json` from inside the folder that contains
`.proagent/crews/<id>/manifest.json` resolves the local copy.

## 6. Environment flow (`proagents.yaml` → `setup`)

When the user wants several profiles + crews resolved together from a spec:

```bash
proagent resolve --json            # capability → implementation graph
proagent lock --json               # persist proagents.lock (checksummed)
proagent validate --spec --json    # end-to-end PA5xx check, must be clean
proagent setup --dry-run           # the plan, nothing written
proagent setup --json              # spec → resolve → validate → equip/install
```

- `setup` composes the spec's profiles, compiles for the target harness, installs crews,
  merges `.mcp.json`, and reports what the harness could not enforce in `limitations`
  (or `steps[].ok`/`findings`).
- A **blocked** setup (`status: "blocked"`) writes nothing. Resolve the PA5xx problem
  (see table below) and retry.

| Code | Meaning |
|---|---|
| `PA501` | invalid `proagents.yaml` schema |
| `PA502` | unsatisfiable capability |
| `PA503` | ambiguous capability, no selection |
| `PA504` | circular artifact dependency |
| `PA505` | harness incompatibility |
| `PA510` | lock stale (spec changed after `lock`) |
| `PA511` | lock checksum mismatch / unverified |

## 7. Verify the install — always

Run all three, in order. They are deterministic and make no writes.

```bash
proagent validate --profiles --json   # PA03x on-installed + profile validation
proagent list-installed --json        # provenance inventory
proagent doctor --json                # health of installed artifacts
```

- `validate --profiles` → `{ status, reports: [{ ok, errors, warnings, findings, profile }] }`.
  Any `errors > 0` means the install is not valid — repair or re-equip.
- `list-installed` → `{ profiles[], crews[], blocks[], summary }`. Confirm the artifact
  you installed appears in the correct category. `hasManifest: true` means the canonical
  manifest parses; `canonical: true` means a single-profile install is reconstructible.
- `doctor` → `{ findings[], summary, exit }`. Exit `0` = healthy, `1` = warnings only,
  `2` = errors present. Doctor codes `DG001`–`DG007`; a `DG00x` finding must be repaired
  except `DG005` (stale instruction block — expected after a `remove`) and warnings
  (`DG006`/`DG007`, unparseable settings/MCP json — still worth flagging).

When something is damaged, `repair` rebuilds canonical installs from the on-disk manifest:

```bash
proagent repair --json       # recompiles broken canonical installs, idempotently
proagent repair --target codex --json
```

If a compose (`dirname == "slug1-slug2"`) is damaged, `repair` reports it in
`limitations` — do not try to force repair; re-equip the full profile set instead.

## 8. Resolving a removal (if asked)

```bash
proagent remove profile:<slug> --json   # or crew:<id>, agent:<id>, …
proagent list-installed --json          # confirm it is gone
proagent doctor --json                  # DG005 (stale block) may appear — expected
```

`remove` cleans the skill dir, its instruction block and (for crews) the merged MCP
references. Verify with `list-installed` and `doctor`.

## 9. Rules that are always in force

- **Dry-run before first write.** Never skip it.
- **`--json` is the contract.** Parse stdout; never scrape terminal prose. Deterministic
  core — same state, same bytes.
- **Blocked ≠ forced.** A `status: "blocked"` or `PA0xx`/`PA5xx` error exits non-zero.
  Report the code + suggestion; never bypass validation.
- **`limitations[]` is a deliverable.** Markdown is not enforcement — where the target
  harness cannot enforce a rule, the report says so. Tell the user, don't hide it.
- **MCP merges, never clobbers.** Crew installs add servers to `.mcp.json`; existing
  entries are preserved.
- **Errors → stderr, non-zero exit.** JSON → stdout. On any confusing non-zero exit,
  re-read stdout/stderr together before retrying.

## 10. Report — the shape of a finished job

End your summary with three sections, named exactly:

- **Installed**: artifact slug/id, target harness, and the list of written paths
  (from `files[]` / `filesWritten[]`).
- **Verified**: `doctor` exit code + `list-installed` summary line.
- **Limitations / not done**: any `limitations[]` entries, any `DG00x` warnings, and any
  step you deliberately did not take (plus why).

## References

- Deterministic JSON shapes: [JSON interface](/cli/json)
- Fleet of profiles & crews: [Registry guide](/guide/registry)
- Driving the CLI from an agent: [Agent operating guide](/guide/agent-guide)
- Human quickstart: [Getting started](/guide/getting-started)