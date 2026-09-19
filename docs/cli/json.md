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
manifests (crew.json + members/ + …) are hydrated before validation.

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

## Error contract

- Errors go to **stderr** with a non-zero exit code; JSON results to **stdout**
- `validate` exits non-zero when errors exist — CI-friendly
- `build` refuses to emit when validation fails and reports why
