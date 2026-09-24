## Registry

> **Spec status.** This document is the registry product specification: it describes
> the target experience. Parts of it ship today — profile and crew listings in the
> Git-backed catalog, `profile install` / `crew install`, validated composition,
> issue-based publishing with CI validation, the profile compiler and runtime adapters —
> while the in-browser resource-discovery layer (npm/MCP/skill search inside the builder),
> connection testing, completeness scoring and benchmarking-from-the-builder are roadmap.
> Every section below carries a status marker: **Ships today**, **Partially shipped**, or
> **Specified, not yet shipped** — so the spec cannot silently drift from the product.

The registry is not an agent, and it does not build agents. It is a **repository of
specs**: profile specs (professions) and crew specs (teams of workers wired by a handoff
graph). Execution needs a harness — Claude Code, Codex, whatever coding agent you run —
and the `proagent` CLI is the courier that fetches a spec from here (or reads it locally)
and hands it to that harness as native artifacts.

It is a **Professional Agent Spec Builder**: a complete UX for designing, assembling,
testing, validating, publishing, and installing the specs an agent needs to operate
professionally in a specific domain.

### Build a complete professional spec

A registry profile can be assembled from multiple sources:

```text
                    PROFESSIONAL AGENT
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Expertise          Methods           Standards
        │                  │                  │
     Knowledge           Skills             Rules
        │                  │                  │
       MCPs              Tools             Policies
        │                  │                  │
     Packages          Context            Verification
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                   Professional Profile
                           │
                 ┌─────────┴─────────┐
                 │                   │
            Coding Agent         Runtime
```

The builder should make this feel simple for the user while producing a powerful, machine-readable result.

### Assemble from the ecosystem

Profiles can pull and compose resources from:

* **Agent Skills** — existing skills, local skills, Git repositories, skill registries
* **npm** — packages, CLIs, SDKs, libraries and runtime dependencies
* **MCP** — discover MCP servers, configure them, test connectivity and inspect available tools
* **Git repositories** — documentation, reference implementations, playbooks and domain knowledge
* **Context frameworks** — filesystem, Git, ACC and custom providers
* **Rules & instructions** — project conventions, security policies, organizational requirements
* **Knowledge sources** — documentation, standards, specifications, runbooks and reference material
* **Tools** — required CLIs, APIs, MCP tools and external services
* **Verification** — tests, validators, benchmarks, policies and acceptance criteria

The registry should **not merely store references**. It should understand the resources being assembled and produce a coherent professional profile.

---

## Studio Builder UX

> **Partially shipped.** The SPA ships a guided **profile builder** walkthrough —
> identity → expertise & rules → tools & MCP (with live health checks and registry
> packages) → skills (registry installs or written inline) → verification → ship —
> with per-step completion tracking, Next/Back navigation, draft persistence, slug
> collision blocking against the live catalog, and PR-based publishing. The crew builder
> (repo-grounded starter crew or custom, workers that reference profile specs as their
> profession, permission scoping, MCP bindings, handoff graph, one-click proposal) is
> also shipped. The CLI ships the pipeline (`profile install` / `crew build` with
> composition, validation and compilation, including profile-declared MCP servers merged
> into `.mcp.json` and written skills installed as standalone skills). The 15-step
> profile builder UX below is the roadmap target both builders already follow
> structurally: choose path → define → configure → validate → preview → publish/install.

The experience is designed as a progressive builder rather than a configuration form.

```text
1. Choose profession
        ↓
2. Define what the agent does
        ↓
3. Discover required capabilities
        ↓
4. Add / search resources
        ↓
5. Resolve dependencies
        ↓
6. Configure MCP + tools
        ↓
7. Test connections
        ↓
8. Configure skills + methods
        ↓
9. Configure rules + permissions
        ↓
10. Add knowledge + context
        ↓
11. Define verification
        ↓
12. Validate the complete profile
        ↓
13. Test / benchmark
        ↓
14. Preview generated agent
        ↓
15. Publish / install
```

The builder continuously identifies missing pieces and derives the next useful question.

For example:

```text
You are building:
Security Engineer Agent

The agent needs:
✓ Security methodology
✓ Code-review skills
✓ OWASP knowledge
✓ Repository context
✓ Read-only repository access
✓ Vulnerability scanning
✗ Dependency auditing
✗ Security test suite
✗ Verification policy

Next question:

Should the agent be able to execute security
scanners automatically, or only recommend them?
```

The registry therefore becomes an **agent construction environment**, not a static package directory.

---

## Resource Discovery

> **Specified, not yet shipped.** Discovery today is the static catalog (`proagent
> profile list`, `proagent crew list`, the SPA) plus local `./profiles/` — the unified
> npm/MCP/Git/skill search layer below is roadmap.

The builder should provide a unified resource discovery layer.

```text
Search:
"dependency vulnerability scanner"

             ↓

┌─────────────────────────────────────────────┐
│ npm                                         │
│ packages / CLIs / SDKs                      │
├─────────────────────────────────────────────┤
│ MCP                                         │
│ servers / tools                              │
├─────────────────────────────────────────────┤
│ Skills                                      │
│ existing agent skills                       │
├─────────────────────────────────────────────┤
│ Git                                         │
│ repositories / documentation                │
├─────────────────────────────────────────────┤
│ Context                                     │
│ context providers / frameworks              │
└─────────────────────────────────────────────┘
```

Every resource should expose structured metadata:

```json
{
  "name": "...",
  "source": "npm | mcp | skill | git | custom",
  "version": "...",
  "capabilities": [],
  "dependencies": [],
  "requirements": [],
  "permissions": [],
  "security": {},
  "compatibility": {},
  "verification": {}
}
```

The system should distinguish between:

* what a resource **is**
* what it **provides**
* what it **requires**
* what permissions it needs
* what other resources it depends on
* which runtimes can use it
* how it can be verified

---

## MCP Integration

> **Partially shipped.** Crews carry MCP server bindings (merged into `.mcp.json` on
> install, never clobbering existing entries). The discover → test → allowlist workflow
> below is roadmap; profiles express tool requirements, and MCP wiring follows the crew
> path today.

MCP should be a first-class part of profile construction.

The builder should allow users to:

1. Search/discover MCP servers
2. Add an MCP server
3. Configure its connection
4. Detect its transport
5. Test connectivity
6. Enumerate available tools
7. Inspect tool schemas
8. Select allowed tools
9. Configure credentials/secrets requirements
10. Define approval requirements
11. Validate compatibility with the target agent runtime

Example:

```text
MCP Server
────────────────────────────────

GitHub MCP

Status: ✓ Connected

Available tools:
  ✓ search_code
  ✓ get_pull_request
  ✓ get_file
  ✓ create_issue
  ✓ create_pull_request

Permissions:
  read repository       ✓
  write repository      ⚠ approval required

Profile policy:
  search_code           ALLOW
  get_pull_request      ALLOW
  get_file              ALLOW
  create_issue          ALLOW + approval
  create_pull_request   DENY
```

**"Connected" should mean tested**, not merely configured.

A registry profile should never claim an MCP integration works without actually testing the connection when testing is possible.

---

## npm & Package Integration

> **Specified, not yet shipped.** Profiles today declare `tools.required/optional`
> (validated against verification needs by the PA025 check); the package discovery and
> capability-graph resolution below is roadmap.

npm is treated as an ecosystem source, not simply an installation command.

When a profile requires a capability, ProAgents can discover relevant packages and determine:

```text
Package
  ↓
Capabilities
  ↓
Dependencies
  ↓
Runtime requirements
  ↓
Security / permissions
  ↓
Compatibility
  ↓
Verification
```

For example:

```text
Security Agent
      │
      ├── dependency-audit
      │       └── npm package
      │
      ├── code-analysis
      │       └── CLI / package
      │
      ├── security-review
      │       └── Agent Skill
      │
      └── vulnerability intelligence
              └── MCP / API
```

The resulting profile contains the **capability graph**, rather than blindly installing arbitrary dependencies.

---

## Profile Completeness

> **Partially shipped** — deterministic profile validation (PA030–PA038) and composition
> conflict detection (PA02x) gate every equip and publish today; the percentage-complete
> scoring UX below is roadmap.

Every profile should have a machine-checkable completeness model.

```text
PROFESSIONAL PROFILE
────────────────────────────────

Identity              ✓
Expertise             ✓
Methods               ✓
Skills                ✓
Knowledge             ✓
Tools                 ✓
MCP                   ✓
Context               ✓
Rules                 ✓
Policies              ✓
Permissions           ✓
Dependencies          ✓
Verification          ⚠
Compatibility         ✓

                 94% complete

Missing:
→ verification strategy
```

The user can continue building until the profile reaches a valid state.

Validation should detect:

* missing capabilities
* unresolved dependencies
* conflicting rules
* incompatible tools
* unsupported runtime features
* unsafe permissions
* missing approvals
* missing secrets/configuration
* untested MCP connections
* missing verification
* incompatible skills
* duplicate/conflicting resources

---

## Test Before You Install

> **Partially shipped.** Before installing you can inspect (`profile show`), dry-run
> (`profile install --dry-run`, `crew install --dry-run`) and validate everything the
> validators check; crews additionally have a browser preview-on-your-repo flow and the
> deterministic benchmark system (`proagent benchmark`). The full connect → test →
> benchmark environment below is roadmap.

The registry should provide a **profile test environment**.

```text
Build Profile
      ↓
Resolve
      ↓
Validate
      ↓
Connect
      ↓
Test
      ↓
Benchmark
      ↓
Review
      ↓
Install
```

Users should be able to see what the resulting agent can actually do before installing it into their project.

A profile preview should expose:

```text
Identity
Expertise
Skills
Methods
Tools
MCP
Knowledge
Context
Permissions
Rules
Dependencies
Verification
Target runtimes
```

The result is a **professional-agent package**, not a prompt.

---

## Runtime Adapters

> **Ships today** — `src/adapters/` detects Claude Code, Codex, OpenCode, Cursor and
> Gemini CLI from project layout + env signals, and compiles profiles into each harness's
> strongest mechanisms with reported limitations.

A professional profile is provider-agnostic.

The registry compiles the profile for the selected coding-agent runtime:

```text
                 Professional Profile
                         │
              ┌──────────┼──────────┐
              ↓          ↓          ↓
          Claude Code   Codex    OpenCode
              │          │          │
              ↓          ↓          ↓
          runtime-specific adapter
              │          │          │
              ↓          ↓          ↓
          skills / rules / tools / MCP
```

The same professional profile should be reusable across supported agent harnesses wherever their capabilities permit it.

Unsupported capabilities must be reported rather than silently approximated.

---

## Registry Packages

A registry listing represents a **complete professional agent profile** or a reusable component.

### Full Profile

```text
Security Engineer
────────────────────────────────

Identity
Expertise
Methods
Skills
Knowledge
Rules
Policies
MCP
Tools
Context
Permissions
Dependencies
Verification
Compatibility
Benchmarks
```

### Components

> **Specified, not yet shipped.** The catalog supports two kinds today — `profile` and
> `crew`/`agent` (a single worker). Standalone component listings below are roadmap;
> composition within a profile set (`equip staff-engineer security-engineer`) is the
> shipped equivalent for rules/skills/verification reuse.

Profiles can also publish reusable components:

```text
Skills
MCP integrations
Context frameworks
Knowledge packs
Rules
Methods
Verification suites
Tool adapters
```

Components can be composed into larger profiles.

This creates an ecosystem where developers can publish both **complete professional specs**
and the building blocks used to compose them — and because workers can declare a profile
as their profession, profile specs and crew specs feed each other.

---

## Registry Installation

> **Ships today** — `proagent profile install <id>` (and the `proagent equip` shortcut)
> resolves a profile from the catalog, validates it, composes it if several are given,
> detects the harness and compiles the profile with reported limitations. Dependency
> graphs, MCP connection testing and interactive fallback choice are specified below.

Installing a profile should produce the complete configuration the target harness needs to operate as that profession — the CLI translates the spec into the harness's native artifacts.

```bash
npx @reposell/proagent profile install security-engineer
```

ProAgents resolves:

```text
profile
  ↓
dependencies
  ↓
skills
  ↓
MCP
  ↓
tools
  ↓
context
  ↓
rules
  ↓
permissions
  ↓
verification
  ↓
runtime adapter
```

Then writes the appropriate runtime artifacts into the project.

Nothing should be silently omitted.

If something cannot be installed or supported:

```text
⚠ Profile partially supported

Missing capability:
  MCP server requires HTTP transport

Target runtime:
  does not support HTTP MCP

Available alternatives:
  ✓ stdio adapter
  ✓ CLI fallback

Choose:
  [Use fallback]
  [Change runtime]
  [Cancel]
```

---

## Publish

> **Ships today (single-file profiles + crews).** Two publishing paths, both CI-validated:
>
> 1. **Proposal issue** — `proagent profile submit` (or the SPA's "File proposal issue")
>    files a reviewable issue; CI validates the PROFILE-JSON block; maintainer `/publish`
>    commits it.
> 2. **Pull request** — the SPA's "Publish via pull request" (GitHub sign-in required)
>    creates a branch, commits the folder standard (`profiles/<slug>/manifest.json` +
>    section folders) + `catalog.json`, and opens a PR;
>    `.github/workflows/registry-pr.yml` validates every changed item and the index
>    consistency; a maintainer merge publishes. Fork-based PRs are supported for
>    contributors without push access.
>
> The CLI also ships `proagent profile publish` (direct commit, contents:write). Crews
> have the same trio (`crew validate/submit/publish`). Multi-file profile bundles and
> provenance manifests are specified below.
>
> **Remote vs local equip:** `npx @reposell/proagent equip <slug>` resolves built-ins → local
> `.proagent/profiles/` → the registry catalog. A profile only works remotely once it is
> merged into the catalog repo — until then, use the local folder.

Publishing should package the **entire professional profile**, including its dependency graph and provenance.

```bash
proagent profile publish ./profile
```

A published profile should contain:

```text
manifest.json     # the index: identity, expertise, methods, rules, skills, tools, verification
identity.json
docs.json
expertise/
knowledge/        # when the profile ships reference files
methods/
skills/
rules/
policies/         # when present
standards/        # when present
tools/requirements.json
verification/required|optional/
```

Every external resource should retain provenance:

```text
Source
Version
License
Integrity
Capabilities
Dependencies
Compatibility
```

The registry should make the resulting profile inspectable and reproducible.

---

## Registry Philosophy

The registry is therefore not:

> "Download this SKILL.md."

It is:

> **"Build, equip, test and distribute professional specs — your harness builds the agent."**

A user should be able to start with:

```text
"I need a professional security engineer."
```

and end with:

```text
Professional Agent
      +
Skills
      +
Methods
      +
Knowledge
      +
MCP
      +
Tools
      +
Context
      +
Rules
      +
Permissions
      +
Verification
      +
Runtime Adapter
      ↓
READY-TO-INSTALL PROFESSIONAL AGENT
```

The complexity belongs in ProAgents.

**The UX should stay simple. The resulting agent should not.**
