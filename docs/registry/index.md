---
layout: page
sidebar: false
outline: false
description: 'Every installable profile, crew and agent in the ProAgents registry — each with its exact CLI equip command.'
---

<div class="pa-mp-head">
  <div class="pa-mp-intro">
    <h1 class="pa-mp-title">The Registry</h1>
    <p class="pa-mp-lede">
      Everything installable with the CLI — profiles, crews and agents, each with its
      equip command. Browse the source in
      <a href="https://github.com/EnzoVezzaro/proagents/tree/main/registry"><code>registry/</code></a>
      or compose your own environment in the
      <a href="/studio">Studio</a>.
    </p>
  </div>
  <div class="pa-mp-actions">
    <a class="pa-app-chip" href="/studio">Open the Studio ↗</a>
  </div>
</div>

<div class="pa-reg">
  <noscript>
    <p class="pa-reg-noscript">
      Enable JavaScript to browse the registry, or list it from the CLI:
      <code>proagent profile list</code> · <code>proagent crew list</code>
    </p>
  </noscript>

  <ClientOnly>
    <RegistryPage />
  </ClientOnly>

  <p class="pa-reg-foot">
    Listing generated from <code>registry/catalog.json</code> — the repo is the database.
    Machines: <code>curl -s https://proagents.reposell.dev/registry/catalog.json</code> ·
    CLI: <code>proagent search "&lt;query&gt;"</code> · <code>proagent profile list</code> · <code>proagent crew list</code>
  </p>
</div>
