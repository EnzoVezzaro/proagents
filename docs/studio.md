---
layout: page
sidebar: false
outline: false
description: 'Build, discover, plan and inspect professional profiles and crews — everything runs entirely in your browser.'
---

<div class="pa-mp-head">
  <div class="pa-mp-intro">
    <h1 class="pa-mp-title">ProAgents Studio</h1>
    <p class="pa-mp-lede">
      Build, discover and equip professional profiles and crews — everything below runs entirely in your browser.
    </p>
  </div>
  <div id="pa-mp-actions" class="pa-mp-actions" aria-label="Studio actions"></div>
</div>

<ClientOnly>
  <AppIsland />
</ClientOnly>

## Studio surfaces

The island's route bar (Build / Discover / Console / Plan) navigates the same surfaces:

- **Build** — the project spec builder: intent → capabilities → artifacts → policies → export (`proagents.yaml`).
- **Discover** — the registry catalog: profiles and crews with "Use in Project" handoff.
- **Console** — read-only viewer for the CLI's `--json` introspection output
  (`proagent doctor`, `audit`, `list-installed`, `memory`). The Studio is
  browser-only, so you run the command in your checkout and paste (or load)
  its JSON here; findings render against the pinned code tables.
- **Plan** — read-only render of a spec draft as a plan (environment buckets,
  PA5xx findings, next CLI steps). Reachable from Build's export step via
  "View plan".

The Studio never reads your local filesystem and never writes to your repo —
it produces the portable, harness-agnostic spec and renders CLI reports.
