<script setup lang="ts">
// The landing surface — authored markup for the scroll-craft build
// (scrollcraft/builds/proagents-home). The engine (scrollcraft.js) reads the
// data-sc-* attributes and drives them from scroll; nothing here is generated
// at runtime. All numbers shown are real: registry/catalog.json, the
// security-engineer manifest, the 418-test suite, PA validation codes.
</script>

<template>
  <div id="sc-main">
    <span data-sc-progress aria-hidden="true"></span>

    <!-- App chrome, not a marketing bar: the status bar is the nav. -->
    <header class="sc-statusbar">
      <a class="sc-statusbar__mark" href="/"><i aria-hidden="true"></i>ProAgents</a>
      <span class="sc-statusbar__path">~/dev/my-saas — zsh — proagent</span>
      <span class="sc-statusbar__live"><i aria-hidden="true"></i>registry: synced</span>
      <a class="sc-statusbar__cta" href="/guide/getting-started">Get started</a>
    </header>

    <main id="sc-main-inner">

      <!-- 1 · RECOGNITION + TENSION — flow: the surface is already in a state.
           Hero = the agent session itself; the gap arrives as log lines. -->
      <section class="sc-hero" data-sc-act="flow" data-sc-drift="#000024">
        <div class="sc-hero__inner">
          <p class="sc-k" data-sc-in>Your coding agent is already in this repository</p>
          <h1 class="sc-h-display" data-sc-in data-sc-stagger="70">
            Same agent.<br />Now it has a profession.
          </h1>
          <p class="sc-lede" data-sc-in>
            ProAgents equips the coding agent you already use with a Professional
            Agent Profile — expertise, methods, rules, tools and verification,
            versioned in a JSON registry and compiled into your harness. Not
            another harness.
          </p>
          <div class="sc-term" data-sc-in aria-label="Example ProAgents session (static transcript)">
            <div class="sc-term__bar"><i></i><i></i><i></i><span>agent — session</span></div>
            <div class="sc-term__body"><span class="sig">$</span> <span class="cmd">proagent equip security-engineer</span>
<span class="dim">  resolving…        proagents registry · schema proagents/profile/v1</span>
<span class="dim">  validating…       5 rules · 6 expertise areas · verification required</span>
<span class="ok">  +</span> <span class="cmd">.agents/skills/security-engineer/</span>   <span class="dim">profile compiled</span>
<span class="ok">  +</span> <span class="cmd">.claude/settings.json</span>            <span class="dim">rule enforcement</span>
<span class="warn">  ⚠</span> <span class="dim">generic-cli target: rules are advisory only — reported, not silent</span>
<span class="dim">  verify:</span> <span class="cmd">proagent validate --profiles</span></div>
          </div>
          <div class="sc-ctarow" data-sc-in>
            <a class="sc-cta" href="/guide/getting-started">Equip a profile</a>
            <a class="sc-cta sc-cta--ghost" href="/studio">Browse the registry</a>
          </div>
        </div>
      </section>

      <!-- 2 · TURN — pin: the surface holds while the pipeline advances.
           Ground present at p=0 (the pipeline panel), so no empty-stage window. -->
      <section class="sc-pin" data-sc-act="pin" data-sc-span="2.6" data-sc-drift="#01052b">
        <div data-sc-stage class="sc-pin__grid">
          <div class="sc-pin__copy">
            <p class="sc-k" data-sc-cue="0 1 0 0.06">one command, four deterministic stages</p>
            <h2 class="sc-h-section" data-sc-cue="0 1 0 0.06">
              The profile is compiled,<br />not pasted.
            </h2>
            <p class="sc-lede" data-sc-cue="0.04 1 0 0.06">
              A manifest is read, resolved, validated and compiled into the
              strongest mechanisms your harness supports. Where a harness cannot
              enforce something, the CLI says so instead of pretending.
            </p>
          </div>
          <div class="sc-pipeline" role="list" aria-label="Equip pipeline stages">
            <div class="sc-stage-node" role="listitem" data-stage="0">
              <i aria-hidden="true"></i>
              <div><b>01 · read</b><span>Load the profile manifest and every JSON section it points to.</span><code class="out">manifest.json → 26 section files</code></div>
            </div>
            <div class="sc-stage-node" role="listitem" data-stage="1">
              <i aria-hidden="true"></i>
              <div><b>02 · resolve</b><span>Match skills, MCP servers and packages against the registry.</span><code class="out">playwright, figma → .mcp.json</code></div>
            </div>
            <div class="sc-stage-node" role="listitem" data-stage="2">
              <i aria-hidden="true"></i>
              <div><b>03 · validate</b><span>Deterministic validators, PA-coded. Conflicts are never silent.</span><code class="out">PA030–PA037, PA043–PA048</code></div>
            </div>
            <div class="sc-stage-node" role="listitem" data-stage="3">
              <i aria-hidden="true"></i>
              <div><b>04 · compile</b><span>Emit skills, rules, hooks and settings per harness — or report limits.</span><code class="out">claude-code · codex · opencode · cursor</code></div>
            </div>
          </div>
        </div>
      </section>

      <!-- 3 · SUBSTANCE — flow + reveal + count: the registry schema and the
           real numbers. Flow section after a pin takes reduced top padding. -->
      <section class="sc-section sc-section--after-pin" data-sc-act="flow" data-sc-drift="#000024">
        <div class="sc-wrap sc-split">
          <div class="sc-stack" data-sc-in data-sc-stagger="70">
            <p class="sc-k">the unified registry format</p>
            <h2 class="sc-h-section">JSON all the way down.</h2>
            <p class="sc-lede">
              Every artifact is a folder with a <code class="sc-mono">manifest.json</code>
              entry point and modular section files. An agent loads exactly the
              section it needs — skills, rules, tools, MCP — and automations
              never parse prose.
            </p>
            <p class="sc-lede sc-mono" style="font-size: 13.5px; color: #f4f7ff;">
              <span data-sc-count="0 25">0</span> profiles ·
              <span data-sc-count="0 8">0</span> crews ·
              <span data-sc-count="0 33">0</span> catalog artifacts ·
              <span data-sc-count="0 418">0</span> tests
            </p>
          </div>
          <figure class="sc-schema" data-sc-reveal="up" data-sc-reveal-at="0.15 0.6" aria-label="Registry folder layout (illustrative)">
<pre>registry/profiles/security-engineer/
├─ manifest.json          <span class="s">← the entry point</span>
├─ identity.json
├─ expertise/  01…06 .json
├─ methods/    01…04 .json
├─ skills/     01…04 .json
├─ rules/      01…05 .json
├─ tools/      requirements.json
└─ knowledge/  owasp/*.json</pre>
          </figure>
        </div>
      </section>

      <!-- 4 · PEAK — the hydrator. Largest span on the page. Scroll drives the
           hydration of the real manifest tree; landing.js owns thresholds. -->
      <section class="sc-section sc-section--peak" data-sc-act="pin" data-sc-span="3.6" data-sc-drift="#01052b" id="hydrator">
        <div data-sc-stage class="sc-hydrator sc-pin--peak">
          <div class="sc-hstats">
            <p class="sc-k" data-sc-cue="0 1 0 0.06">signature move · watch it hydrate</p>
            <h2 class="sc-h-section" data-sc-cue="0 1 0 0.06">
              Scroll is the<br />installer.
            </h2>
            <div class="sc-hstat" data-sc-cue="0.08 1 0 0.06">
              <b class="sc-mono" style="font-size: clamp(1.4rem, 2.6vw, 2rem);">2,125 → 3,596 B</b>
              <span>one manifest, hydrated into 26 section files</span>
            </div>
            <p class="sc-lede" data-sc-cue="0.12 1 0 0.06" style="font-size: 14px;">
              This is the real security-engineer manifest. The scrollbar walks
              the same hydration the CLI performs at equip time.
            </p>
          </div>
          <div class="sc-tree" data-hydrator aria-label="Hydration of the security-engineer manifest">
            <div class="sc-k" style="margin-bottom: 10px;">hydrating manifest.json — <span data-hyd-pct>0%</span></div>
            <progress data-hyd-bar max="100" value="0" aria-label="hydration progress"></progress>
            <details open>
              <summary><span class="dir">security-engineer/</span></summary>
              <ul>
                <li data-folder data-count="1 file" data-at="0.06"><span class="file">identity.json</span><span class="sz">282 B</span><span class="count"></span></li>
                <li data-folder data-count="6 files" data-at="0.2">
                  <details open><summary><span class="dir">expertise/</span><span class="count"></span></summary>
                  <ul>
                    <li class="file">01-application-security.json<span class="sz">68 B</span></li>
                    <li class="file">02-threat-modeling.json<span class="sz">73 B</span></li>
                    <li class="file">03-attack-surface-analysis.json<span class="sz">76 B</span></li>
                  </ul></details>
                </li>
                <li data-folder data-count="4 files" data-at="0.34">
                  <details open><summary><span class="dir">methods/</span><span class="count"></span></summary>
                  <ul><li class="file">01-threat-modeling.json<span class="sz">70 B</span></li><li class="file">02-attack-surface-analysis.json<span class="sz">78 B</span></li></ul>
                  </details>
                </li>
                <li data-folder data-count="4 files" data-at="0.48">
                  <details open><summary><span class="dir">skills/</span><span class="count"></span></summary>
                  <ul><li class="file">01-wesleyegberto-software-engineering-skills.json<span class="sz">341 B</span></li><li class="file">02-obra-superpowers.json<span class="sz">298 B</span></li></ul>
                  </details>
                </li>
                <li data-folder data-count="5 files" data-at="0.62">
                  <details open><summary><span class="dir">rules/</span><span class="count"></span></summary>
                  <ul><li class="file">01-never-expose-secrets-in-logs-errors-or-committed-files.json<span class="sz">152 B</span></li><li class="file">02-require-security-verification-for-authentication-or-authorization.json<span class="sz">148 B</span></li></ul>
                  </details>
                </li>
                <li data-folder data-count="1 file" data-at="0.72"><span class="file">tools/requirements.json</span><span class="sz">257 B</span><span class="count"></span></li>
                <li data-folder data-count="4 files" data-at="0.84">
                  <details open><summary><span class="dir">policies/</span><span class="count"></span></summary>
                  <ul><li class="file">01-filesystem.json<span class="sz">168 B</span></li><li class="file">02-network.json<span class="sz">171 B</span></li></ul>
                  </details>
                </li>
              </ul>
            </details>
            <div class="meta" data-hyd-done style="margin-top: 10px; opacity: 0; transition: opacity 200ms;">✓ hydrated · 26 files · 3,596 bytes</div>
          </div>
        </div>
      </section>

      <!-- 5 · RANGE — pan: the catalog travels laterally. Museum labels. -->
      <section class="sc-rail-wrap" data-sc-act="pan" data-sc-span="3.2" data-sc-drift="#000024">
        <div data-sc-stage>
          <div class="sc-rail" data-sc-pan="0.06">
            <div class="sc-stack" style="width: clamp(260px, 30vw, 380px); flex: none; align-self: center;">
              <p class="sc-k">the catalog</p>
              <h2 class="sc-h-section">Choose a profession.</h2>
              <p class="sc-lede" style="font-size: 14px;">Every entry is a versioned, validated artifact. Equipping one is a single command.</p>
            </div>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">profile</span><h3>Security Engineer</h3>
              <p>Threat modeling, attack-surface analysis, secure coding and security verification.</p>
              <span class="ver">v1.1.0 · 5 rules · MCP: figma</span>
            </article>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">profile</span><h3>Backend Engineer</h3>
              <p>Server-side systems: APIs, data integrity, reliability, operational safety.</p>
              <span class="ver">v1.1.0 · MCP: postgres</span>
            </article>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">profile</span><h3>Accessibility Engineer</h3>
              <p>Inclusive interfaces: WCAG conformance, assistive technology, perceptible feedback.</p>
              <span class="ver">v1.1.0 · MCP: playwright</span>
            </article>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">profile</span><h3>Release Engineer</h3>
              <p>Release trains, changelog discipline, rollback-first deployments.</p>
              <span class="ver">v1.1.0 · MCP: github</span>
            </article>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">crew</span><h3>Data Platform Crew</h3>
              <p>Database, data, serving and quality workers with schema-first handoffs.</p>
              <span class="ver">v1.0.0 · 4 workers · MCP: postgres, github</span>
            </article>
            <article class="sc-card" data-sc-tilt="6">
              <span class="kind">crew</span><h3>PR Review Gate</h3>
              <p>A read-only security reviewer and a standards checker on every pull request.</p>
              <span class="ver">v1.0.0 · 2 workers · MCP: github</span>
            </article>
            <div class="sc-stack" style="width: clamp(240px, 26vw, 320px); flex: none; align-self: center;">
              <p class="sc-lede" style="font-size: 14px;">Plus agents, skills, workflows and capabilities — one schema for all 13 artifact kinds.</p>
              <a class="sc-cta sc-cta--ghost" style="height: 38px; font-size: 13.5px;" href="/studio">Open the registry</a>
            </div>
          </div>
        </div>
      </section>

      <!-- 6 · PROOF — flow: the enforcement table, short and honest. -->
      <section class="sc-section sc-section--after-pin" data-sc-act="flow" data-sc-drift="#01052b" style="padding-top: 48px;">
        <div class="sc-wrap" data-sc-in data-sc-stagger="70">
          <p class="sc-k">markdown informs · boundaries enforce</p>
          <h2 class="sc-h-section">Rules become enforcement where the harness allows it.</h2>
          <table class="sc-table">
            <thead><tr><th>Code</th><th>Catches</th><th>Then what</th></tr></thead>
            <tbody>
              <tr><td>PA030–PA037</td><td>Missing structure, missing verification, tool conflicts</td><td>Profile is invalid — it does not compile</td></tr>
              <tr><td>PA043–PA048</td><td>Crews failing the subagent standard</td><td>Crew fails validation with a fix suggestion</td></tr>
              <tr><td>PA021–PA026</td><td>Conflicting rules, tools, capabilities in composition</td><td>Composition reports errors; serious ones are blocking</td></tr>
            </tbody>
          </table>
          <p class="sc-lede" style="margin-top: 18px; font-size: 14px;">
            Where a harness has no enforcement mechanism, the equip report says
            so in plain text. Advisory beats silent.
          </p>
        </div>
      </section>

      <!-- 7 · COMMITMENT — pin (short): the close is an actual input. -->
      <section data-sc-act="pin" data-sc-span="1.3" data-sc-drift="#000024" id="start">
        <div data-sc-stage class="sc-close__inner">
          <p class="sc-k" data-sc-cue="0.05" data-sc-rise="0">try the real interface</p>
          <h2 class="sc-h-section sc-h-display" style="font-size: clamp(2rem, 4.6vw, 3.4rem);" data-sc-cue="0.05" data-sc-rise="0">
            Type the first command.
          </h2>
          <div class="sc-term sc-term--live" data-sc-cue="0.1" data-sc-rise="0" style="width: 100%; max-width: 760px;">
            <div class="sc-term__bar"><i></i><i></i><i></i><span>proagent — demo of the CLI (sample data)</span></div>
            <div class="sc-term__body" data-terminal aria-label="Interactive demo terminal: type help, list, info, or install"></div>
          </div>
          <div class="sc-ctarow" data-sc-cue="0.14" data-sc-rise="0">
            <a class="sc-cta" href="/guide/getting-started">Get started</a>
            <a class="sc-cta sc-cta--ghost" href="/cli/">CLI reference</a>
          </div>
          <footer class="sc-foot" style="border: 0; padding: 8px 0 0;">
            <span>© 2026 ProAgents</span>
            <a href="/guide/what-is-proagents">What is ProAgents?</a>
            <a href="/guide/profiles">Profile schema</a>
            <a href="/cli/json">JSON interface</a>
            <a href="https://github.com">GitHub</a>
          </footer>
        </div>
      </section>

    </main>
  </div>
</template>
