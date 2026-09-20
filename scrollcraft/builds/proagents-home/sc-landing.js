/* ============================================================================
   ProAgents landing — bespoke behaviour. Driven by the engine's published
   --sc-p on each act; the engine itself is untouched.

   Real data (pinned from the repo, 2026-09-19):
   - catalog: 25 profiles · 8 crews (7 listed + test-healer) · 1 agent · 33 items
   - security-engineer manifest: 2,125 B → 26 section files → 3,596 B hydrated
   - the embedded catalog below is copied from registry/catalog.json entries.
   ========================================================================== */

/* Real catalog entries (id, kind, name, version, description, mcp). */
var EMBED_ITEMS = [
  { id: "accessibility-engineer", kind: "profile", name: "Accessibility Engineer", version: "1.1.0", description: "Inclusive interfaces: WCAG conformance, assistive technology, and perceptible feedback." },
  { id: "api-designer", kind: "profile", name: "API Designer", version: "1.1.0", description: "Interface contracts: REST and GraphQL design, versioning, and consumer-first evolution." },
  { id: "backend-engineer", kind: "profile", name: "Backend Engineer", version: "1.1.0", description: "Server-side systems: APIs, data integrity, reliability, and operational safety.", mcp: ["postgres"] },
  { id: "code-reviewer", kind: "profile", name: "Code Reviewer", version: "1.1.0", description: "Multi-axis review: correctness, security, performance, and maintainability." },
  { id: "data-engineer", kind: "profile", name: "Data Engineer", version: "1.1.0", description: "Pipelines and analytics infrastructure: ingestion, transformation, and backfills." },
  { id: "database-engineer", kind: "profile", name: "Database Engineer", version: "1.1.0", description: "Schema design, query performance, migrations, and data integrity." },
  { id: "devops-engineer", kind: "profile", name: "DevOps Engineer", version: "1.1.0", description: "Delivery infrastructure: pipelines, environments, and deploy automation." },
  { id: "frontend-engineer", kind: "profile", name: "Frontend Engineer", version: "1.1.0", description: "Client-side systems: components, state, accessibility, and performance." },
  { id: "performance-engineer", kind: "profile", name: "Performance Engineer", version: "1.1.0", description: "Latency and throughput: profiling, budgets, and regression defense." },
  { id: "platform-engineer", kind: "profile", name: "Platform Engineer", version: "1.1.0", description: "Internal platforms: paved roads, golden paths, and developer experience." },
  { id: "principal-engineer", kind: "profile", name: "Principal Engineer", version: "1.1.0", description: "Cross-cutting technical leadership: architecture, tradeoffs, and alignment." },
  { id: "qa-engineer", kind: "profile", name: "QA Engineer", version: "1.1.0", description: "Quality strategy: test planning, coverage analysis, and release gates." },
  { id: "release-engineer", kind: "profile", name: "Release Engineer", version: "1.1.0", description: "Release trains, changelog discipline and rollback-first deployments." },
  { id: "security-engineer", kind: "profile", name: "Security Engineer", version: "1.1.0", description: "Threat modeling, attack-surface analysis, secure coding and security verification." },
  { id: "sre", kind: "profile", name: "Site Reliability Engineer", version: "1.1.0", description: "Reliability: SLOs, incident response, error budgets, and toil reduction." },
  { id: "systems-architect", kind: "profile", name: "Systems Architect", version: "1.1.0", description: "System-level design: boundaries, consistency models, and evolution." },
  { id: "test-automator", kind: "profile", name: "Test Automator", version: "1.1.0", description: "Automated testing: harnesses, flake control, and CI-integrated suites." },
  { id: "data-platform-crew", kind: "crew", name: "Data Platform Crew", version: "1.0.0", description: "Database, data, serving and quality workers with schema-first handoffs.", mcp: ["postgres", "github"] },
  { id: "feature-delivery-squad", kind: "crew", name: "Feature Delivery Squad", version: "1.0.0", description: "A delivery crew that takes a feature from plan through verified merge." },
  { id: "incidere-incident-response", kind: "crew", name: "Incident Response Crew", version: "1.0.0", description: "Incident triage, mitigation and follow-up with honest status reporting." },
  { id: "pr-review-gate", kind: "crew", name: "PR Review Gate", version: "1.0.0", description: "A read-only security reviewer and a standards checker on every pull request.", mcp: ["github"] },
  { id: "release-train-crew", kind: "crew", name: "Release Train Crew", version: "1.0.0", description: "Release coordination with rollback-first discipline." },
  { id: "security-audit-crew", kind: "crew", name: "Security Audit Crew", version: "1.0.0", description: "Attack-surface review and verification across a codebase." },
  { id: "test-healer", kind: "agent", name: "Test Healer", version: "0.3.0", description: "Diagnoses failing tests, separates real regressions from brittle assertions, proposes minimal patches.", mcp: ["playwright", "sequential-thinking"] },
  { id: "web-quality-crew", kind: "crew", name: "Web Quality Crew", version: "1.0.0", description: "Accessibility, performance and correctness checks for web frontends." }
];

var MANIFEST_BYTES = 2125;
var HYDRATED_BYTES = 3596;
var HYDRATED_FILES = 26;

function boot() {
  /* ------------------------------------------------ pipeline stage nodes -- */
  var pipelineAct = document.querySelector('[data-sc-act="pin"][data-sc-span="2.6"]');
  var stages = Array.prototype.slice.call(document.querySelectorAll(".sc-stage-node"));
  if (pipelineAct && stages.length) {
    var thresholds = stages.map(function (_, i) { return 0.14 + i * 0.2; });
    var update = function () {
      var p = parseFloat(pipelineAct.style.getPropertyValue("--sc-p")) || 0;
      stages.forEach(function (el, i) {
        el.classList.toggle("is-on", p >= thresholds[i]);
      });
      requestAnimationFrame(update);
    };
    update();
  }

  /* ------------------------------------------------------- the hydrator -- */
  var hydAct = document.querySelector('[data-hydrator]');
  if (hydAct) {
    var act = hydAct.closest("[data-sc-act]") || hydAct;
    var folders = Array.prototype.slice.call(hydAct.querySelectorAll("[data-folder]"));
    var pct = hydAct.querySelector("[data-hyd-pct]");
    var bar = hydAct.querySelector("[data-hyd-bar]");
    var done = hydAct.querySelector("[data-hyd-done]");
    var hydratedCount = 0;
    var tick = function () {
      var p = parseFloat(act.style.getPropertyValue("--sc-p")) || 0;
      hydratedCount = 0;
      folders.forEach(function (f) {
        var at = parseFloat(f.getAttribute("data-at")) || 0;
        var on = p >= at;
        f.classList.toggle("is-hydrated", on);
        if (on) hydratedCount++;
        var c = f.querySelector(".count");
        if (c) c.textContent = on ? f.getAttribute("data-count") || "" : "—";
      });
      if (pct) pct.textContent = Math.round(p * 100) + "%";
      if (bar) bar.value = Math.round(p * 100);
      if (done) done.style.opacity = p >= 0.97 ? "1" : "0";
      requestAnimationFrame(tick);
    };
    tick();
  }

  /* ------------------------------------------------------ demo terminal -- */
  var term = document.querySelector("[data-terminal]");
  if (term) {
    term.innerHTML = "";
    /* The view ([data-terminal]) is innerHTML-wiped on every render, so the
       input must live OUTSIDE it: a sibling inside the terminal card. */
    var card = term.closest(".sc-term") || term.parentElement;
    var view = term;
    var lines = [];
    function render() {
      var html = lines.map(function (l) {
        var cls = l.t === "cmd" ? "cmd" : l.t === "ok" ? "ok" : l.t === "warn" ? "warn" : l.t === "sig" ? "sig" : "dim";
        return "<span class=\"" + cls + "\">" + l.s + "</span>";
      }).join("\n");
      view.innerHTML = html +
        "\n<span class=\"sig\">proagent&gt;</span> <span class=\"cmd\">" + esc(input.value) +
        "</span><span class=\"term-caret\">▌</span>";
      view.scrollTop = view.scrollHeight;
    }
    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function out(s, t) { lines.push({ s: s, t: t || "dim" }); }
    function findItem(id) {
      var q = (id || "").toLowerCase().replace(/^(profile|crew|agent):/, "");
      return EMBED_ITEMS.filter(function (i) { return i.id === q; })[0];
    }
    function run(raw) {
      var argv = raw.trim().split(/\s+/).filter(Boolean);
      if (!argv.length) return;
      out("proagent> " + raw, "sig");
      var cmd = argv[0], arg = argv[1];
      if (cmd === "help") {
        out("commands: list [profiles|crews] · info <id> · install <id> · clear");
        out("(demo of the CLI over a snapshot of the real catalog)");
      } else if (cmd === "clear") {
        lines = [];
      } else      if (cmd === "list") {
        var kind = arg === "crews" ? "crew" : arg === "agents" ? "agent" : "profile";
        var items = EMBED_ITEMS.filter(function (i) { return i.kind === kind; });
        out(kind + "s (" + items.length + "):", "dim");
        var width = Math.max.apply(null, EMBED_ITEMS.map(function (i) { return i.id.length; })) + 2;
        items.forEach(function (i) { out("  " + i.id.padEnd(width) + "v" + i.version); });
        out("full catalog: proagent list --kind " + kind, "dim");
      } else if (cmd === "info") {
        var it = findItem(arg);
        if (!it) { out("error: unknown artifact '" + (arg || "") + "' — try: list", "warn"); return; }
        out("  " + it.kind + ":" + it.id + "  v" + it.version, "cmd");
        out("  " + it.description, "dim");
        out("  mcp: " + (it.mcp && it.mcp.length ? it.mcp.join(", ") : "none declared"), "dim");
      } else if (cmd === "install" || cmd === "equip") {
        var it2 = findItem(arg);
        if (!it2) { out("error: unknown artifact '" + (arg || "") + "' — try: info security-engineer", "warn"); return; }
        out("  resolving…    proagents registry · schema proagents/profile/v1", "dim");
        out("  validating…   PA030–PA037 structural checks", "dim");
        out("  + .agents/skills/" + it2.id + "/", "ok");
        if (it2.mcp && it2.mcp.length) out("  ~ .mcp.json (merged: " + it2.mcp.join(", ") + ")", "ok");
        out("  verify: proagent validate --profiles", "dim");
        out("  (demo — run the real CLI to install)", "warn");
      } else {
        out("unknown command '" + cmd + "' — try: help", "warn");
      }
    }
    var input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("aria-label", "Terminal input (demo)");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;";
    card.appendChild(input);
    /* Clicks anywhere on the card hand the cursor to the hidden input. */
    card.addEventListener("click", function () { input.focus(); });
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { run(input.value); input.value = ""; render(); }
    });
    out("ProAgents demo terminal — sample data. Type 'help'.", "dim");
    out("");
    render();

    var termAct = view.closest("[data-sc-act]");
    if (termAct && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) input.focus({ preventScroll: true });
          else input.blur();
        });
      }, { threshold: 0.4 });
      io.observe(view);
    }
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
