# Implementation Plan — ProAgents Registry & Studio

Turns `NEW_CHANGES.md` into a phased build. **Principle: refactor, don't rewrite.** Every
new concept is mapped onto an existing module below; nothing already working is deleted.

## Status (2026-09-19) — Phases 0–5 implemented

- **Phase 0** (rebrand + catalog extension): done — `.marketplace/` → `registry/`,
  `publish.ts`, `REGISTRY.md`, `docs/guide/registry.md`, `docs/studio.md` (+ redirect stub).
- **Phase 1** (registry core): done — `src/registry/{types,catalog,sources,source-adapters}.ts`;
  catalog/taxonomy/sources fall back to the packaged npm copies when a consumer repo has
  no checkout (`import.meta.url` resolution).
- **Phase 2** (capabilities/resolver/spec/lock): done — `capabilities.ts`, `resolver.ts`,
  `spec.ts`, `lock.ts`, `validate.ts` (PA5xx aggregator); tests `tests/registry/`.
- **Phase 3** (CLI): done — `src/cli/registry.ts` (`search/info/install/remove/update/
  list --kind/resolve/lock/compose/setup` + `validate --spec` + `build --kind spec`);
  dispatch in `src/cli/index.ts`; JSON contracts pinned in `tests/cli/registry.test.ts`;
  docs in `docs/cli/index.md` + `docs/cli/json.md`.
- **Phase 4** (Studio): done — `ProjectBuilderPage` (Build primary, route
  `#/build-environment`, also the default route), Discover demoted (`#/discover`) with
  **Use in Project** handoff via sessionStorage (`proagents-project-picks`);
  `web/src/project-spec.ts` (canonical YAML serialization + client PA501/502/505);
  `assemble-site.mjs` ships `registry/capabilities/` for the picker.
- **Phase 5** (setup + docs): done — `src/registry/setup.ts` (resolve → validate →
  compose → compileForHarness / installCrew → limitations report; blocked writes nothing);
  `docs/guide/registry.md` Projects section, getting-started flow.

Remaining polish (non-blocking): capability picker during `profile create` (NEW_CHANGES.md
§Profile creation — mapper exists, wiring pending); Studio federated search inside the
builder (CORS-limited sources; CLI `search` is the full-parity path).

## Decisions locked (2026-09-19)

| Decision | Choice |
|---|---|
| Build order | Spec schema + resolver core **first**, then CLI and Studio **in parallel** against it |
| Artifact taxonomy | **All 13 kinds in the schema from day one** (schema-complete; loaders land per kind as content arrives) |
| Binary name | Keep `proagent` as the bin; docs use `proagent <cmd>` (project files stay `proagents.yaml` / `proagents.lock` per NEW_CHANGES.md) |
| Rebrand scope | **Full rename** marketplace → registry (modules, docs, routes, UI copy) |

## 0. Current → target mapping (what we reuse)

| NEW_CHANGES.md concept | Existing asset | Action |
|---|---|---|
| Unified artifact model | `registry/catalog.json` (`MarketplaceCatalog`/`MarketplaceItem`) | **Extend additively**: `kind` union grows to 13; add optional `provides`, `requires`, `compatibility`, `source`. No schema bump — old readers ignore new fields |
| Federated sources | `src/discovery/registry.ts` (searches MCP / npm / skills.sh / GitHub with provenance) | **Refactor**: searchers become source adapters behind `sources/*.yaml` declarations; discovery keeps its public API and delegates |
| Capability abstraction | PA025 "capability gap" in `src/profiles/composition.ts`; `tools/mcp/packages` in profiles | **New**: `src/registry/capabilities.ts` taxonomy + deterministic capability mapper |
| `proagents.yaml` / `proagents.lock` | Interview session `.proagent/session.json`; `AgentArchitecture` | **New**: `src/registry/spec.ts` + `resolver.ts` + `lock.ts`; `build --kind spec` emits a spec from a session |
| `proagent setup --harness X` | `src/adapters/` (`compileForAllHarnesses`), `src/crew/install.ts` (MCP merge), `runEquip` | **New orchestrator** that chains them |
| `compose` CLI | `src/profiles/composition.ts` (PA02x conflicts) | **Extend** to accept `kind:id` refs beyond profiles |
| `search` / `info` / `list` / `install` | `discover`, `inspect`, `list`, `crew install`, `profile install` | **New unified dispatcher** in `src/cli/registry.ts`; old commands stay |
| Studio Build mode | `BuildEntryPage` + `BuilderPage` + `llm.ts` + `proposal.ts` | **New `ProjectBuilderPage`** (Build flow) reusing those |
| Discover (secondary) | `CatalogPage` | **Reframe**: add "Use in Project" action, demote to secondary nav |
| Registry rebrand | `src/profiles/marketplace.ts`, `docs/guide/marketplace.md`, `MARKETPLACE.md`, UI copy | **Rename** (Phase 0) |

## 1. Target module layout

```
src/registry/                  NEW layer (5th layer; per AGENTS.md separation invariant)
  types.ts                     Artifact envelope, ArtifactKind (13), SourceManifest,
                               SpecDocument, LockFile, ResolutionGraph
  catalog.ts                   unified catalog read/normalize/write (delegates item
                               hydration to src/profiles + src/crew loaders)
  sources.ts                   sources/*.yaml load + validate (schema proagents/registry-source/v1)
  source-adapters.ts           native adapter + adapters wrapping discovery searchers
  capabilities.ts              taxonomy, aliases, deterministic mapper
                               (manifest → required capabilities; no model calls)
  resolver.ts                  capability → candidate implementations → ResolutionGraph
                               pure: (requires, catalog, sourceResults) → graph
  spec.ts                      proagents.yaml parse/validate/serialize
  lock.ts                      proagents.lock write/verify (checksums; NO timestamps)
  setup.ts                     setup pipeline: resolve → validate → equip/install → report
src/cli/registry.ts            NEW command group (search/install/…/setup) → index.ts dispatch
web/src/ui/pages/ProjectBuilderPage.tsx   NEW Build mode page
registry/
  sources/{skillsmp,github,npm,mcp}.yaml   NEW source declarations
  capabilities/index.json                  NEW seed taxonomy
  workflows/ … extensions/                 NEW dirs as content arrives
```

Renames (full rebrand, mechanical, tests updated in same commit):

| Old | New |
|---|---|
| `src/profiles/marketplace.ts` | `src/profiles/publish.ts` |
| `MARKETPLACE.md` | `REGISTRY.md` |
| `docs/guide/marketplace.md` (+ route/nav/config links) | `docs/guide/registry.md` |
| "marketplace" in UI copy, README, AGENTS.md, comments | "registry" (AGENTS.md also fixes its stale `.marketplace/` paths → `registry/`) |

Artifact kinds (schema day one): `profile · crew · agent · workflow · capability · skill ·
tool · mcp · prompt · hook · adapter · policy · template · extension`.
Loaders complete for: profile, crew, agent (existing), skill, workflow, capability (Ph 1–2).
Other kinds: accepted in schema/catalog, `info` reports "no loader yet".

## 2. Core schemas

**Artifact index entry** (additive to `MarketplaceItem`):
```yaml
id: frontend-engineer
kind: profile            # 13-kind union
version: 2.1.0
provides: [frontend-development, ui-accessibility]
requires:
  capabilities: [browser-automation, source-control]
  artifacts: [skill:security-audit]
compatibility: [claude-code, codex, opencode, cursor, gemini-cli, generic-cli]
source: proagents        # provenance: "proagents" or federated source id
```

**`proagents.yaml`** (human-authored, repo root):
```yaml
schema: proagents/v1
project: { name: my-saas }
environment:
  profiles: [frontend-developer, backend-developer, qa]
  crews: [software-team]
  workflows: [feature-development, release]
  capabilities: [browser-automation, database-access, source-control]
  skills: [react-development, security-audit]
  tools: [git, playwright]
  mcp: [github, postgres]
policies:
  filesystem: { workspace-only: true }
  network: { allowed: [github.com, api.example.com] }
harness:
  compatibility: [codex, opencode, claude]   # mode: compatible
```

**`proagents.lock`** (machine-resolved; reproducible → **no timestamps**):
```yaml
schema: proagents/lock/v1
specHash: sha256:…
resolved:
  browser-automation:
    source: skillsmp
    artifact: skill:playwright-agent
    version: 2.1.0
    checksum: sha256:…        # sha256 of canonical manifest bytes at that version
```

**Source declaration** (`registry/sources/skillsmp.yaml`) exactly as in NEW_CHANGES.md
(`schema: proagents/registry-source/v1`, capabilities: search/metadata/resolve/install,
`artifact_types`, `policy.allowed`). An unknown/unallowed source is skipped with a surfaced
note, never a crash.

## 3. Capability model

- `registry/capabilities/index.json`: id, title, description, aliases, impl hints.
- Seed set (~24): source-control, browser-automation, frontend-development,
  backend-development, database-access, javascript-runtime, python-runtime, testing,
  frontend-testing, api-testing, code-review, security-review, ci-cd, documentation,
  planning, observability, containerization, cloud-deploy, data-pipelines, ml-training,
  accessibility, performance, privacy, communication.
- **Deterministic mapper** (`capabilities.ts`): profile/crew manifest (`tools`, `mcp`,
  `packages`, `expertise` keywords, standards) → required capabilities. Rules table in code;
  same manifest always yields the same capability list. Composition (PA025) upgrades from
  string-heuristics to this model.
- Resolution preference order: native catalog → enabled federated sources (policy.allowed)
  → ambiguous (PA503 in non-interactive mode).

## 4. Validation codes — new PA5xx series (spec/registry)

| Code | Meaning |
|---|---|
| PA500 | unknown artifact kind in spec |
| PA501 | invalid proagents.yaml schema |
| PA502 | unsatisfiable capability (no implementation on any allowed source) |
| PA503 | ambiguous capability, non-interactive, no selection |
| PA504 | capability/artifact circular dependency |
| PA505 | harness incompatibility (artifact vs harness.compatibility) |
| PA506 | policy violation (e.g. MCP URL outside network allowlist) |
| PA510 | lock stale (specHash mismatch) |
| PA511 | lock checksum mismatch |
| PA512 | invalid lock schema |

Each with a `suggestion` string + tests (per AGENTS.md convention).

## 5. CLI surface (bin stays `proagent`)

New (in `src/cli/registry.ts`): `search [--type k]`, `info <kind:id>`, `install <kind:id>`,
`remove <kind:id>`, `update`, `list --kind k`, `resolve`, `lock`, `compose <kind:id>…`,
`setup [--harness X]`. `validate` gains spec/lock mode. `build --kind spec` emits
`proagents.yaml` from a session. **All `--json` outputs additive** (invariant).
Existing commands unchanged; `discover` remains (session staging) and shares source
adapters with `search`.

## 6. Studio (web)

- **Build mode** — `ProjectBuilderPage`: intent → detected requirements (reuse `llm.ts`,
  `proposal.ts`) → capability chips → suggested profiles/crews/workflows (native catalog,
  same-origin fetch) → per-capability implementations (client-side: npm/GitHub search APIs;
  SkillsMP where CORS allows; source policy respected) → policies → validate (mirror PA5xx)
  → **export `proagents.yaml`** (+ lock when resolved) + "finish with `proagent setup`" hint.
- **Discover** — `CatalogPage` demoted to secondary; gains "Use in Project".
- `web/src/types.ts` mirrors extend with the envelope fields (kept in sync manually, as today).

## 7. Phases, files, acceptance

**Phase 0 — Rename & catalog extension** (mechanical)
Rename table in §1; extend `MarketplaceItem` + `web/src/types.ts` mirrors + `crew/types.ts`;
AGENTS.md/README/DESIGN copy; all existing tests green; `npm run typecheck` + `npm test`.

**Phase 1 — Registry core**
`src/registry/{types,catalog,sources,source-adapters}.ts`; seed
`registry/sources/*.yaml`; refactor `src/discovery/registry.ts` to delegate (public API
stable, `tests/discovery.test.ts` untouched and passing). Tests: `tests/registry/`.

**Phase 2 — Capabilities + resolver + spec/lock** (the heart; CLI/Studio build against this)
`capabilities.ts`, `resolver.ts`, `spec.ts`, `lock.ts`, seed taxonomy; PA5xx in
`src/registry/validate.ts`; composition consumes the mapper. Tests: resolver determinism
(same inputs → byte-identical lock), spec round-trip, stale-lock detection (PA510).

**Phase 3 — CLI** (parallel with 4)
`src/cli/registry.ts` + dispatch + `--json` additive outputs; `profile create` gains the
capability picker (NEW_CHANGES.md §Profile creation: derive caps → search → choose →
manifest + requires written); docs/cli/index.md. Tests: `tests/cli/registry.test.ts`.

**Phase 4 — Studio** (parallel with 3)
`ProjectBuilderPage`, Discover reframe, export/lock download; UI tests in
`web/src/test`; DESIGN.md token grammar respected.

**Phase 5 — setup end-to-end + docs/site**
`setup.ts` chains resolve → PA5xx validation → `compileForAllHarnesses` / `crew install`
(MCP merge) / skills install → limitations reporting (EquipResult pattern);
docs: registry.md, projects.md (spec reference), getting-started rewrite, studio.md;
e2e fixture: `proagents.yaml` → `setup --harness opencode` → expected files in a tmp repo;
`npm run site:build` green.

## 8. Invariants compliance (AGENTS.md)

1. **Deterministic core** — resolver/lock/mapper are pure; IO (fetch, GitHub API) injected.
   Lock carries no timestamps. No model calls outside Studio's LLM-assist (which produces
   *drafts*, never compiled artifacts).
2. **Layer separation** — `src/registry/` is a new layer; CLI and Studio are thin consumers.
3. **Provider-agnostic** — no vendor code in core/adapters boundaries; sources are data.
4. **ACC optional** — untouched.
5. **Information firewall** — spec/lock contain declarations + resolutions only.
6. **Markdown is not enforcement** — policies compile into harness enforcement via adapters
   where supported; `setup` reports limitations otherwise (existing pattern).
7. **Portability** — manifests stay harness-agnostic; `compatibility` is declared metadata,
   not per-harness schema.

## 9. Risks

- Rename churn → mechanical renames with tests in the same commit; keep `git mv` history.
- Federated search nondeterminism → resolver consumes *results*, never performs IO.
- Browser CORS for some sources → Studio v1 searches CORS-friendly sources; full parity
  via `proagent search`; documented.
- Checksums need network at lock time → degrade to `unverified` + PA-note, never crash.
- `web/src/types.ts` mirrors drift → same manual-sync discipline as today, extended fields
  only.
