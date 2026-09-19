Yes. **ProAgents Registry** should be the canonical name. It also gives us a clean distinction between the **registry product** and the external sources it federates.

## ProAgents Registry

> **The universal registry for agentic development artifacts.**

The ProAgents Registry is not just a skills marketplace. It is the **discovery, composition, distribution, and resolution layer** for the ProAgents ecosystem.

```text
                         PROAGENTS REGISTRY
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
              PROAGENTS NATIVE            FEDERATED SOURCES
                    │                           │
                    │                ┌──────────┼──────────┐
                    │                │          │          │
                    │             SkillsMP    GitHub     Other
                    │
          ┌─────────┴─────────────────────────────┐
          │             ARTIFACTS                 │
          │                                       │
          │  Profiles       Crews       Workflows │
          │  Agents         Skills      Tools     │
          │  Capabilities   MCP         Prompts   │
          │  Hooks           Adapters    Policies │
          │  Templates       Extensions           │
          └──────────────────┬────────────────────┘
                             │
                       Unified Search
                             │
                       Dependency Graph
                             │
                          Resolver
                             │
                             ▼
                    Agent / Harness / WOS
```

### Core artifact model

```text
ProAgents Registry
│
├── profiles/
├── crews/
├── agents/
├── workflows/
├── capabilities/
├── skills/
├── tools/
├── mcp/
├── prompts/
├── hooks/
├── adapters/
├── policies/
├── templates/
└── extensions/
```

The important part is that **everything is an artifact** with a common manifest, versioning, dependencies, compatibility, provenance, permissions, and metadata.

---

## Federated sources

External marketplaces should **not become special cases inside ProAgents**.

Instead:

```text
proagents-registry/
│
├── sources/
│   ├── skillsmp.yaml
│   ├── github.yaml
│   ├── npm.yaml
│   ├── mcp.yaml
│   └── custom.yaml
│
├── artifacts/
├── policies/
└── indexes/
```

For example:

```yaml
schema: proagents/registry-source/v1

id: skillsmp

name: SkillsMP

type: marketplace

capabilities:
  search: true
  metadata: true
  resolve: true
  install: true

artifact_types:
  - skill

policy:
  allowed: true
```

Another source could expose:

```yaml
artifact_types:
  - skill
  - profile
  - agent
  - crew
  - workflow
```

So **ProAgents Registry normalizes different ecosystems into one artifact model**.

---

# Profile creation

This is where the registry becomes particularly powerful.

When creating a profile:

```bash
proagents profile create frontend-developer
```

the system can determine:

```text
Required capabilities
────────────────────────────

browser-automation
source-control
javascript-runtime
frontend-testing
code-review
```

Then:

```text
Searching ProAgents Registry...

Sources:
✓ ProAgents
✓ SkillsMP
✓ GitHub
✓ npm
✓ MCP Registry
✓ Company Registry

Found:

browser-automation
  ├── playwright
  ├── browser-use
  └── browser-mcp

source-control
  ├── git
  └── github-mcp

frontend-testing
  ├── react-testing
  └── playwright-testing
```

The user chooses the implementation, and ProAgents creates the profile dependency graph.

---

# The key abstraction

This should be the central rule of the entire system:

> **Profiles, crews, workflows, and agents declare what they need. ProAgents Registry resolves where those capabilities come from.**

So:

```yaml
requires:
  capabilities:
    - browser-automation
    - source-control
    - frontend-testing
```

rather than:

```yaml
requires:
  - skillsmp/browser-use
  - github/playwright
```

The latter is implementation-specific.

The former is **agent-native**.

---

# ProAgents Registry CLI

I would make the namespace explicitly ProAgents:

```bash
proagents search "browser automation"

proagents search "React testing" --type skill

proagents search "frontend developer" --type profile

proagents search "software development" --type crew

proagents search "release pipeline" --type workflow
```

Then:

```bash
proagents install <artifact>
proagents remove <artifact>
proagents update
proagents info <artifact>
proagents list
proagents resolve
proagents lock
proagents validate
```

And composition:

```bash
proagents compose \
  profile:frontend-developer \
  skill:security-audit \
  workflow:feature-development
```

---

# Registry vs Marketplace

I'd explicitly establish this terminology:

**ProAgents Registry**

The overall system.

**Registry Source**

A place from which ProAgents discovers artifacts.

**Marketplace**

A human-facing external catalog such as SkillsMP.

**Artifact**

Anything that can be discovered/composed/installed.

**Capability**

An abstract ability provided by one or more artifacts.

So:

```text
SkillsMP
   │
   ▼
Registry Source
   │
   ▼
ProAgents Registry
   │
   ▼
Artifact
   │
   ▼
Capability
   │
   ▼
Profile / Crew / Workflow
```

That gives **ProAgents Registry** a much broader scope than an "agent marketplace." It's effectively the **package registry + capability discovery + dependency resolution layer for agentic development**.

Yes — I think this changes the **frontend's primary product concept** significantly.

The public marketplace can still exist, but it shouldn't be the main experience. The core experience should be a **ProAgents Builder/Composer**: you describe what you want to build, assemble the required artifacts and capabilities, and ProAgents produces a **portable specification** that any compatible harness can consume.

The key idea:

> **Don't sell users a list of agents. Let them engineer an agent environment.**

# ProAgents Studio

I'd call the frontend experience **ProAgents Studio**.

```text
                         PROAGENTS STUDIO
                               │
                 "What are you building?"
                               │
                               ▼
                    Project / Agent Builder
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
           Profiles           Crews          Workflows
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                         Capabilities
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                  Skills      MCP        Tools
                               │
                               ▼
                    Registry Federation
                               │
                               ▼
                     Resolve + Validate
                               │
                               ▼
                       Project Spec
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
             Codex          OpenCode         Claude
             Adapter         Adapter          Adapter
```

The frontend isn't primarily:

> "Here are 10,000 agents you can buy/install."

It's:

> **"Let's build the exact agent environment your project needs."**

---

# 1. Start with a Project

Instead of starting with a marketplace listing, the user starts:

```text
New ProAgents Project

What are you building?

┌─────────────────────────────────────────────────────┐
│                                                     │
│  Build a production SaaS application with           │
│  React, Node.js, PostgreSQL and automated testing.  │
│                                                     │
└─────────────────────────────────────────────────────┘

                    [ Build Environment ]
```

The system analyzes the requirements and creates an initial architecture.

```text
Your project requires:

✓ Development
✓ Source control
✓ Frontend development
✓ Backend development
✓ Database access
✓ Testing
✓ Browser automation
✓ Security review
✓ CI/CD
```

Then the user can refine it.

---

# 2. Think of it as an IDE for agent environments

The UI could have:

```text
┌─────────────────────────────────────────────────────────────┐
│ ProAgents Studio                              Save   Export │
├───────────────┬─────────────────────────────┬───────────────┤
│               │                             │               │
│ PROJECT       │       ENVIRONMENT           │   INSPECTOR   │
│               │                             │               │
│ Profiles      │      ┌─────────────┐        │ Selected      │
│               │      │ Frontend    │        │ Profile       │
│ ● Frontend    │─────▶│ Developer   │        │               │
│ ● Backend     │      └──────┬──────┘        │ Dependencies  │
│               │             │               │               │
│ Crews         │      ┌──────▼──────┐        │ Skills        │
│               │      │ Browser     │        │ Tools         │
│ ● Dev Team    │      │ Automation  │        │ MCP           │
│               │      └─────────────┘        │               │
│ Workflows     │                             │ Permissions   │
│               │      ┌─────────────┐        │               │
│ ● Development │      │ QA          │        │ Compatibility │
│ ● Release     │      │ Agent       │        │               │
│               │      └─────────────┘        │               │
│ Capabilities  │                             │               │
│               │                             │               │
│ + Add         │                             │               │
└───────────────┴─────────────────────────────┴───────────────┘
```

It's basically **Figma for agent architecture** mixed with a package manager.

---

# 3. The user doesn't need to understand the underlying ecosystem

This is important.

They shouldn't have to know:

> "I need an MCP server."

They should be able to say:

> "The agent needs to interact with PostgreSQL."

ProAgents translates that into:

```text
Capability:
database-access

Possible implementations:
├── PostgreSQL MCP
├── PostgreSQL CLI
├── Database skill
└── custom API adapter
```

The user can inspect the options, but the abstraction remains:

```text
database-access
```

---

# 4. Everything becomes a building block

The builder could have:

```text
ADD
────────────────────

Profile
Crew
Agent
Workflow
Skill
Capability
Tool
MCP
Hook
Policy
Adapter
```

But these shouldn't all feel like completely different things.

They are **composable artifacts**.

For example:

```text
Development Crew

├── Planner Profile
│   ├── planning skill
│   └── project-management capability
│
├── Frontend Profile
│   ├── React skill
│   ├── browser capability
│   └── testing capability
│
├── Backend Profile
│   ├── Node skill
│   ├── PostgreSQL capability
│   └── API testing
│
└── QA Profile
    ├── testing skill
    ├── browser capability
    └── security capability
```

---

# 5. Registry search happens inside the builder

This is where the **ProAgents Registry** becomes invisible infrastructure.

User clicks:

```text
+ Add Capability
```

Search:

```text
browser
```

ProAgents searches all allowed sources:

```text
ProAgents Registry
├── Native
├── SkillsMP
├── GitHub
├── MCP sources
├── npm
└── Private registries
```

Results are normalized:

```text
Browser Automation

Playwright
Capability
✓ Browser automation
✓ CLI
✓ Node.js

Browser MCP
Capability
✓ Browser automation
✓ MCP

Browser Testing Skill
Skill
✓ Browser testing
```

Then:

```text
[ Add to Environment ]
```

No need to manually visit another marketplace.

---

# 6. The output is the important part

After building the environment:

```text
                         [ EXPORT ]
                              │
                              ▼
                       ProAgents Spec
```

The user gets something like:

```text
proagents.yaml
```

This is the **source of truth**.

For example:

```yaml
schema: proagents/v1

project:
  name: my-saas

environment:

  profiles:

    - frontend-developer
    - backend-developer
    - qa

  crews:

    - software-team

  workflows:

    - feature-development
    - release

  capabilities:

    - source-control
    - browser-automation
    - database-access
    - javascript-runtime

  skills:

    - react-development
    - debugging
    - security-audit

  tools:

    - git
    - playwright

  mcp:

    - github
    - postgres

policies:

  filesystem:
    workspace-only: true

  network:
    allowed:
      - github.com
      - api.example.com

harness:
  compatibility:
    - codex
    - opencode
    - claude
```

---

# 7. But don't make the spec harness-specific

This is critical.

The exported spec should **not** be:

```text
.claude/
```

or:

```text
.opencode/
```

or:

```text
.codex/
```

Instead:

```text
proagents.yaml
```

is the universal representation.

Then:

```text
                    proagents.yaml
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       Codex Adapter   OpenCode        Claude
            │              │              │
            ▼              ▼              ▼
        .codex/        .opencode/      .claude/
```

This gives ProAgents a **portable agent environment specification**.

---

# 8. Installation becomes incredibly simple

Someone receives:

```text
proagents.yaml
```

Then:

```bash
proagents setup
```

The CLI:

```text
Reading ProAgents specification...

✓ Resolving profiles
✓ Resolving crews
✓ Resolving workflows
✓ Resolving capabilities
✓ Resolving skills
✓ Resolving MCP servers
✓ Resolving tools

✓ Checking compatibility

✓ Installing dependencies

✓ Configuring harness

✓ Configuring permissions

✓ Creating environment

Environment ready.
```

Then:

```bash
proagents run
```

or simply launch the selected harness.

---

# 9. Even better: don't require a specific harness

The spec could say:

```yaml
harness:
  mode: compatible
```

Then:

```bash
proagents setup --harness opencode
```

or:

```bash
proagents setup --harness codex
```

or:

```bash
proagents setup --harness claude
```

Same environment.

Different adapter.

---

# 10. The frontend therefore has two modes

I'd structure ProAgents Studio around two major experiences:

### Build

```text
BUILD
```

The professional environment builder.

```text
Project
→ Requirements
→ Profiles
→ Crews
→ Workflows
→ Capabilities
→ Skills
→ Tools
→ MCP
→ Policies
→ Validation
→ Export
```

### Discover

```text
DISCOVER
```

The public marketplace/catalog.

This becomes secondary.

```text
Discover
├── Profiles
├── Crews
├── Workflows
├── Skills
├── Capabilities
├── Tools
└── MCP
```

A marketplace artifact can simply be imported into the builder:

```text
[ Use in Project ]
```

rather than:

```text
[ Buy/Install Agent ]
```

---

# 11. This creates a much better lifecycle

```text
                  IDEA
                    │
                    ▼
             CREATE PROJECT
                    │
                    ▼
             DEFINE REQUIREMENTS
                    │
                    ▼
            DISCOVER ARTIFACTS
                    │
                    ▼
               COMPOSE
                    │
                    ▼
               RESOLVE
                    │
                    ▼
              VALIDATE
                    │
                    ▼
            GENERATE SPEC
                    │
                    ▼
          ┌─────────┴─────────┐
          ▼                   ▼
      Local Setup        Share / Commit
          │                   │
          ▼                   ▼
       Harness             Another
       Adapter             Developer
          │                   │
          └─────────┬─────────┘
                    ▼
             AGENT ENVIRONMENT
```

And the spec can live directly in Git:

```text
my-project/
├── src/
├── tests/
├── package.json
└── proagents.yaml
```

That's very compelling.

---

# 12. The spec should describe intent + resolution

I'd actually separate two files:

```text
proagents.yaml
proagents.lock
```

### `proagents.yaml`

Human-authored desired environment:

```yaml
requires:
  capabilities:
    - browser-automation
    - database-access

  skills:
    - react-development
    - security-audit
```

### `proagents.lock`

Machine-resolved implementation:

```yaml
resolved:

  browser-automation:
    source: skillsmp
    package: playwright-agent
    version: 2.1.0
    checksum: ...

  database-access:
    source: proagents
    package: postgres-mcp
    version: 1.4.2
    checksum: ...
```

This is analogous to:

```text
package.json
+
package-lock.json
```

and makes the environment reproducible.

---

# 13. And this changes what ProAgents actually is

The product stack becomes very clear:

```text
                         PROAGENTS
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
        PROAGENTS        PROAGENTS        PROAGENTS
         STUDIO           REGISTRY          RUNTIME
             │               │                │
             │               │                │
             ▼               ▼                ▼
          Builder       Discovery        Execution
          Composer      Federation       Sandbox
          Validator     Packages         Adapters
          Spec Editor   Artifacts         Harnesses
             │               │                │
             └───────────────┼────────────────┘
                             ▼
                      proagents.yaml
                             │
                    ┌────────┼────────┐
                    ▼        ▼        ▼
                  Codex   OpenCode   Claude
```

And the **marketplace becomes just one surface of the Registry**, rather than the product itself.

The strongest positioning becomes something like:

> **ProAgents — Build, compose, and ship portable AI agent environments.**

Or more technically:

> **ProAgents is an open specification, registry, and composition framework for portable agent environments.**

That gives the frontend a real professional workflow: **design → compose → validate → generate spec → install anywhere**, rather than just browsing a catalog of agents.
