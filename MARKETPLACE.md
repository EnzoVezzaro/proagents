## Marketplace

> **Spec status.** This document is the marketplace product specification: it describes
> the target experience. Parts of it ship today — profile and crew listings in the
> Git-backed catalog, `profile install` / `crew install`, validated composition,
> issue-based publishing with CI validation, the profile compiler and runtime adapters —
> while the in-browser resource-discovery layer (npm/MCP/skill search inside the builder),
> connection testing, completeness scoring and benchmarking-from-the-builder are roadmap.
> Each section below notes what works now vs. what is specified.

The marketplace is not just a catalog of downloadable skills or pre-built crews.

It is a **Professional Agent Builder**: a complete UX for designing, assembling, testing, validating, publishing, and installing everything an agent needs to operate professionally in a specific domain.

### Build a complete professional agent

A marketplace profile can be assembled from multiple sources:

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

The marketplace should **not merely store references**. It should understand the resources being assembled and produce a coherent professional profile.

---

## Marketplace Builder UX

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

The marketplace therefore becomes an **agent construction environment**, not a static package directory.

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

A marketplace profile should never claim an MCP integration works without actually testing the connection when testing is possible.

---

## npm & Package Integration

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

The marketplace should provide a **profile test environment**.

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

The marketplace compiles the profile for the selected coding-agent runtime:

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

## Marketplace Packages

A marketplace listing represents a **complete professional agent profile** or a reusable component.

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

This creates an ecosystem where developers can publish both **professional agents** and the building blocks used to create them.

---

## Marketplace Installation

> **Ships today** — `proagent profile install <id>` (and the `proagent equip` shortcut)
> resolves a profile from the catalog, validates it, composes it if several are given,
> detects the harness and compiles the profile with reported limitations. Dependency
> graphs, MCP connection testing and interactive fallback choice are specified below.

Installing a profile should produce the complete agent configuration required by the target environment.

```bash
npx proagent profile install security-engineer
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

> **Ships today (single-file profiles + crews).** `proagent profile validate` gates,
> `proagent profile submit` files a reviewable proposal issue (CI-validated, maintainer
> `/publish` commits it), and `proagent profile publish` commits directly with
> contents:write. Crews have the same trio (`crew validate/submit/publish`). Multi-file
> profile bundles and provenance manifests are specified below.

Publishing should package the **entire professional profile**, including its dependency graph and provenance.

```bash
proagent profile publish ./profile
```

A published profile should contain:

```text
profile.json
skills/
knowledge/
methods/
rules/
policies/
tools/
mcp/
context/
verification/
benchmarks/
dependencies/
compatibility/
README.md
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

The marketplace should make the resulting profile inspectable and reproducible.

---

## Marketplace Philosophy

The marketplace is therefore not:

> "Download this SKILL.md."

It is:

> **"Build, equip, test and distribute a professional AI agent."**

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
