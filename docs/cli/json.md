---
description: 'The deterministic --json contract: stable shapes for every operation, exit codes, and how agents parse proagent output.'
---

# JSON interface

Every important operation supports `--json`. Output is deterministic for a given session
state — same state, same bytes. Agents must never scrape terminal prose.

## Profile commands

### detect

```bash
proagent detect --json
```

```json
{
  "status": "ok",
  "command": "detect",
  "primary": {
    "id": "claude-code",
    "name": "Claude Code",
    "capabilities": {
      "projectInstructions": true,
      "skills": true,
      "ruleEnforcement": "native",
      "mcp": true,
      "shell": true,
      "git": true
    },
    "evidence": ["CLAUDE.md", ".mcp.json"]
  },
  "harnesses": ["…same shape as primary"]
}
```

### list / inspect

```bash
proagent list --json
proagent inspect security-engineer --json
```

`list` returns `{ status, command, profiles: [{ slug, name, version, description, origin, tags }] }`.
`origin` is `builtin`, `local` or `marketplace` (a registry checkout — the value predates the registry rebrand and stays for JSON stability).

`inspect` returns `{ status, command, profile: <full ProfileManifest>, origin }`.

### equip / compile

```bash
proagent equip security-engineer --json
proagent compile security-engineer --target claude-code --json
```

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

`limitations[]` is an honest report of what the target harness could not express or
enforce — surface it, never hide it. With `--dry-run`, returns
`{ status, dryRun: true, target, profile, effective }` and writes nothing.

Blocked equips (profile validation errors, or composition errors `PA022`/`PA023`) exit
non-zero:

```json
{ "status": "blocked", "command": "equip", "conflicts": [{ "code": "PA022", "severity": "error", "message": "…", "profiles": ["a", "b"], "suggestion": "…" }] }
```

### profile (registry group)

```bash
proagent profile list --json               # → { status, repo, ref, profiles[] }
proagent profile show <id> --json          # → { status, profile }
proagent profile install <id> --json       # same shape as equip
proagent profile validate <file> --json    # → { status: "ok"|"invalid", slug, problems[] }
proagent profile publish <file> --json     # → { status, slug, version, repo, ref, itemPath, catalogPath }
proagent profile submit <file> --json      # → { status, slug, version, repo, issue, url }
```

`profile validate` exits non-zero with `status: "invalid"` and the deterministic
`problems[]` (PA03x codes) when the manifest fails — the same gate CI runs on proposals.
`publish`/`submit`/`validate` hydrate path-format sections before validating, so both
inline and folder-standard manifests work.

### crew (registry group)

```bash
proagent crew list --json                  # → { status, repo, ref, catalog }
proagent crew show <id> --json             # → { status, crew: <full CrewDefinition> }
proagent crew validate <file|dir> --json   # → { status: "ok"|"invalid", crew, version, problems[], warnings[] }
proagent crew install <id> --json          # → { status, installed: { crewId, version, filesWritten[], mcpMerged } }
proagent crew build <file> --json          # same shape as install
proagent crew publish <file> --json        # → { status, crewId, version, repo, ref, itemPath, catalogPath }
proagent crew submit <file> --json         # → { status, crewId, version, repo, issue, url }
```

`crew validate` exits non-zero with the deterministic `problems[]` (including
subagent-standard codes PA043–PA048) when the crew fails. Folder-standard
manifests (manifest.json + members/ + …) are hydrated before validation.

### validate --profiles

```bash
proagent validate --profiles --json
```

```json
{
  "status": "ok",
  "command": "validate",
  "reports": [
    { "ok": true, "errors": 0, "warnings": 0, "findings": [], "profile": "security-engineer", "checkedAt": "…" }
  ]
}
```

## Registry commands

The unified artifact model — kinds: `profile · crew · agent · workflow · capability ·
skill · tool · mcp · prompt · hook · adapter · policy · template · extension`.

### search / info / list --kind

```bash
proagent search "browser automation" --type profile --json
proagent info profile:accessibility-engineer --json
proagent list --kind crew --json
```

`search` → `{ status, command, query, kind?, findings: [{ kind, name, description, source, sourceLabel, reference, score, native? }], sources: [{ source, count, error? }] }`.
`native: true` marks catalog hits; `sources[]` reports per-source counts, and degraded
sources carry an `error` note (federation degrades, never crashes).

`info` → `{ status, command, item: <MarketplaceItem>, content?: <manifest>, loader: boolean }`.
`loader: false` = schema-complete kind with no item loader yet (metadata only).

`list --kind <k>` → `{ status, command, kind, items: [<MarketplaceItem>] }`.

### resolve / lock

```bash
proagent resolve --json
proagent lock --select browser-automation=skill:playwright-agent --json
```

`resolve` → `{ status, command, graph: { resolved, unresolved, ambiguous, artifactRefs, cycles }, findings }`.

`lock` (writes `proagents.lock`) → `{ status, command, file, lock: { schema, specHash, resolved } }`.
Both exit non-zero on resolution errors (PA502/PA504) — `lock` additionally refuses
ambiguous capabilities (PA503) unless `--select` pins them.

### setup / validate --spec

```bash
proagent setup --json                 # spec → resolve → validate → equip/install
proagent setup --harness codex --json # explicit target
proagent validate --spec --json       # end-to-end PA5xx check of spec (+ lock)
```

`setup` → `{ command, status: "ok"|"blocked", spec?, findings, conflicts, harness?, files, limitations, steps: [{ step, ok, detail? }] }`.
Steps report each pipeline stage; blocked setups write nothing.

`validate --spec` → `{ status: "ok"|"invalid", command, spec?, findings }`.

### PA5xx — spec/registry validation codes

| Code | Meaning |
|---|---|
| `PA500` | unknown artifact kind in spec |
| `PA501` | invalid proagents.yaml schema |
| `PA502` | unsatisfiable capability (no implementation on any allowed source) |
| `PA503` | ambiguous capability, no selection (non-interactive) |
| `PA504` | capability/artifact circular dependency |
| `PA505` | harness incompatibility (artifact vs harness.compatibility) |
| `PA506` | policy violation (e.g. network allowlist wildcard) |
| `PA510` | lock stale (specHash mismatch) |
| `PA511` | lock checksum mismatch / unverified |
| `PA512` | invalid lock schema |

Every finding carries `severity`, `message`, `suggestion`, and where applicable `entities`.

## audit

```bash
proagent audit --json
proagent audit --path ./my-repo --json
```

Deterministic security scan — same tree, same bytes, no model calls, no
timestamps. Exit contract: `0` clean · `1` warnings only · `2` errors present
(honored in `--json` mode too, so CI can gate on it).

```json
{
  "status": "ok",
  "root": "/abs/path",
  "findings": [
    {
      "code": "AU001",
      "severity": "error",
      "file": "AGENTS.md",
      "line": 3,
      "message": "GitHub classic PAT detected in AGENTS.md",
      "suggestion": "Rotate the credential now, remove it from the tree, and keep secrets out of version control (e.g. .env + gitignore)."
    }
  ],
  "summary": { "total": 1, "errors": 1, "warnings": 0 },
  "exit": 2
}
```

Audit codes:

| Code | Severity | Meaning |
|---|---|---|
| `AU001` | error | exposed secret / private key material in a text file |
| `AU003` | error | instruction pipes a remote fetch into a shell (`curl \| bash`, `iwr \| iex`, …) |
| `AU004` | warning | MCP server on a remote (non-localhost) http/sse transport |
| `AU005` | warning | MCP stdio launcher (`npx`/`uvx`/`bunx`) without a pinned version |
| `AU006` | error | over-broad permission grant (`*`, `bash:*`, `Bash(bash:*)`) |

## list-installed

```bash
proagent list-installed --json
proagent list-installed --path ./my-repo --json
```

Inventory of what ProAgents owns in the repo. Pure provenance scan: no writes,
no model calls, deterministic `sort` by path.

```json
{
  "status": "ok",
  "root": "/abs/path",
  "profiles": [
    { "dir": ".agents/skills/senior-engineer", "slug": "senior-engineer", "version": "1.1.0", "hasManifest": true, "hasSkill": true, "canonical": true }
  ],
  "crews": [
    { "dir": ".agents/crews/guard", "id": "guard", "version": "1.0.0", "hasSkill": true }
  ],
  "blocks": [
    { "file": "AGENTS.md", "marker": "ab12cd34ef56", "line": 3, "closed": true, "title": "Senior Engineer" }
  ],
  "summary": { "profiles": 1, "crews": 1, "blocks": 1 }
}
```

- `profiles[].hasManifest` — the canonical `manifest.json` beside the skill
  parsed and passed PA0xx validation (the owner marker).
- `profiles[].canonical` — skill directory name equals `manifest.profile.slug`
  (a single-profile install, reconstructible by `repair`). Composed installs
  (dir is `slug1-slug2`) store only the first profile's manifest, so they
  cannot be canonical.
- `blocks[].closed` — a matching `<!-- proagent:profile:end <marker> -->`
  exists in the same file.

## doctor

```bash
proagent doctor --json
proagent doctor --path ./my-repo --json
```

Verification of installed artifacts against provenance — deterministic
(same tree, same report), no writes. Exit contract mirrors `audit`:
`0` healthy · `1` warnings only · `2` errors present (honored in `--json`).

```json
{
  "status": "ok",
  "root": "/abs/path",
  "findings": [
    {
      "code": "DG002",
      "severity": "error",
      "file": ".agents/skills/senior-engineer/SKILL.md",
      "line": 1,
      "message": "profile \"senior-engineer\" is installed (manifest present) but its SKILL.md is missing",
      "suggestion": "repair restores it from the on-disk manifest: proagent repair"
    }
  ],
  "summary": { "total": 1, "errors": 1, "warnings": 0 },
  "exit": 2
}
```

Doctor codes (DG — deterministic, the same family the audit uses for AU):

| Code | Severity | Meaning |
|---|---|---|
| `DG001` | error | `manifest.json` beside an installed skill is unreadable/invalid |
| `DG002` | error | manifest present but `SKILL.md` missing |
| `DG003` | error | instruction block start marker without a matching end marker |
| `DG004` | error | more than one `proagent:` block region in one instructions file |
| `DG005` | warning | instruction block whose profile is not installed (stale after `remove`) |
| `DG006` | warning | `.claude/settings.json` is not valid JSON |
| `DG007` | warning | `.mcp.json` is not valid JSON |

## repair

```bash
proagent repair --json
proagent repair --target codex --json
```

Deterministic reconstruction of broken installs from the on-disk canonical
manifest. Recompiles every canonical single-profile install for the target
harness (detected by default, `--target` overrides), which rewrites
`SKILL.md`, `manifest.json`, the instruction block, enforcement hooks and the
MCP merge — all idempotently (same input, same bytes).

```json
{
  "status": "ok",
  "root": "/abs/path",
  "target": "codex",
  "repaired": [
    ".agents/skills/senior-engineer/SKILL.md",
    ".agents/skills/senior-engineer/manifest.json",
    "AGENTS.md"
  ],
  "limitations": []
}
```

Composed installs are never silently mangled: their directory name
(`slug1-slug2`) differs from the single stored manifest's `profile.slug`, so a
composition cannot be reconstructed from one manifest. They are reported in
`limitations` with a pointer to re-equip with the full profile set.

## init

```bash
proagent init --intent "..." --non-interactive --json
```

```json
{
  "status": "ok",
  "sessionId": "71a083d3-fd4d-47f0-9eb6-8df7744e9f9d",
  "readiness": "NEEDS_INFORMATION",
  "confidence": 0,
  "questions": [
    {
      "id": "q_001",
      "question": "What should the agent do, in one or two sentences — and for whom?",
      "reason": "The objective drives every downstream decision; without it no architecture can be derived.",
      "impact": "high"
    }
  ]
}
```

Without `--intent` and without a repo-derived proposal, init prints
`{ "status": "needs_input", "error": "intent_required" }` on stdout, prints usage
guidance on stderr, and exits non-zero — a machine-readable failure, never a
silent one. (Inside a recognized repo, the repo-derived intent is still
auto-accepted, exactly as in the human workflow.)

## question / answer

```bash
proagent question --json
proagent answer q_001 "..." --json
```

```json
{
  "status": "ok",
  "answered": "q_001",
  "readiness": "CONFLICTING_REQUIREMENTS",
  "confidence": 0.513,
  "contradictions": [
    {
      "id": "c_1",
      "a": { "statement": "read-only production access", "source": "q_001" },
      "b": { "statement": "automatically restart production deployments", "source": "q_002" },
      "status": "open"
    }
  ],
  "nextQuestions": [
    { "id": "q_resolve_c_1", "question": "These two requirements conflict: ...", "impact": "high" }
  ]
}
```

## context

```bash
proagent context "auth architecture" --context-framework filesystem --json
```

```json
[
  {
    "framework": "filesystem",
    "snippets": [
      {
        "path": "./src/auth/session.ts",
        "text": "...",
        "reason": "matched: auth, session",
        "confidence": 0.82,
        "stale": false,
        "provenance": ["filesystem", "./src/auth/session.ts"]
      }
    ],
    "truncated": false,
    "totalBytes": 1200
  }
]
```

## spec / validate / build / inspect

- `spec --json` → the full `AgentArchitecture` (agents, edges, team, runtime, selfImprovement)
- `validate --json` → `{ ok, errors, warnings, findings: [{ code, severity, message, entities, suggestion }] }`
- `build --json` → `{ status, runtime: { id, gaps }, agents: [paths], architecture }`
- `inspect --json` → `{ state, architecture, runtime }` — everything, for programmatic resume

## memory

Explicit project memory (`proagent memory`). Records are JSON-only files under
`.proagent/memory/<key>.json`; the same CLI invocation always produces the same
canonical bytes (deterministic core — AGENTS.md invariant 1). Provenance is an
input you supply; timestamps never appear in compiled artifacts.

```bash
proagent memory add deploy-window "Ship on Thursdays; freeze Wednesday noon." --scope release --tags release,ops --provenance "docs planning session"
```

```json
{
  "status": "ok",
  "command": "memory add",
  "key": "deploy-window",
  "updated": false,
  "version": 1,
  "record": {
    "key": "deploy-window",
    "value": "Ship on Thursdays; freeze Wednesday noon.",
    "scope": "release",
    "tags": ["release", "ops"],
    "provenance": "docs planning session",
    "version": 1
  }
}
```

Updating the same key bumps `version` and merges your input:

```bash
proagent memory add deploy-window "…" --provenance "team sync" --json
```

```json
{ "status": "ok", "command": "memory add", "key": "deploy-window", "updated": true, "version": 2 }
```

```bash
proagent memory list
proagent memory show api-rate-limit --json
proagent memory rm api-rate-limit
```

`memory list` returns records sorted by key; `memory show <key> --json` returns
one record (`{ status, command, record }`) or exits 1 with `not_found` when the
key is unknown. `memory rm` reports `{ status, key, removed }`.

Validation findings use codes **ME001–ME004** (invalid key, empty/oversized
value, invalid scope, invalid tag). An invalid record is never silently
accepted: the CLI prints the finding and exits, or reports it in `--json`
mode with a non-zero exit code.

### memory compile

```bash
proagent memory compile --target codex
```

```json
{
  "status": "ok",
  "command": "memory compile",
  "target": "codex",
  "file": "AGENTS.md",
  "records": ["deploy-window"],
  "block": "<!-- proagent:memory:start <!-- hash -->…<!-- proagent:memory:end -->"
}
```

Compiled memory is injected as a deterministic instruction block into the
target harness's instructions file, marked with a content-derived marker so
compiling the same store always emits the same bytes. The block is advisory
project knowledge — it does not grant permissions, and the compiler never
prompts.

## Error contract

- Errors go to **stderr** with a non-zero exit code; JSON results to **stdout**
- `validate` exits non-zero when errors exist — CI-friendly
- `build` refuses to emit when validation fails and reports why
