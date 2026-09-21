<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { withBase } from "vitepress";
import { AsciiBotField, AsciiCore } from "./asciiBot";
import pkg from "../../../../package.json";

const menuOpen = ref(false);

/* -- nav coffee: types "buy me a coffee", opens the support popup -- */
const COFFEE_TEXT = "buy me a coffee";
const coffeeTyped = ref("");
const supportOpen = ref(false);
let coffeeTimer: number | null = null;
const SUPPORT_LINKS = {
  kofi: "https://ko-fi.com/enzojuniorvezzaro",
  github: "https://github.com/sponsors/EnzoVezzaro",
};
/** Start the nav coffee typewriter once on mount (skipped: reduced motion). */
function startCoffeeType(): void {
  if (reducedMotion.value) {
    coffeeTyped.value = COFFEE_TEXT;
    return;
  }
  let i = 0;
  const step = (): void => {
    i += 1;
    coffeeTyped.value = COFFEE_TEXT.slice(0, i);
    if (i < COFFEE_TEXT.length) coffeeTimer = window.setTimeout(step, 90);
  };
  coffeeTimer = window.setTimeout(step, 1200); // let the page settle first
}
const reducedMotion = ref(false);

/* -- the signature ASCII bot: the hero's background layer -- */
const botCanvas = ref<HTMLCanvasElement | null>(null);
const coreCanvas = ref<HTMLCanvasElement | null>(null);
const botReady = ref(false);
let bot: AsciiBotField | null = null;
let core: AsciiCore | null = null;

/* -- interactive manifest (§02): click a layer, the document retypes -- */
/* Per-layer manifest sections: clicking a layer ADDS its section to the
 * composed manifest.json; clicking again removes it. Values are the real
 * registry paths by default; the "?" toggle explains what each carries. */
const LAYER_SECTIONS: Record<string, string> = {
  identity: `  "identity": "./identity.json",`,
  expertise: `  "docs": "./docs.json",`,
  knowledge: `  "knowledge": "./knowledge.json",`,
  methods: `  "handoffs": ["./handoffs/*"],`,
  skills: `  "skills": ["./skills/*"],`,
  rules: `  "rules": ["./rules/*"],`,
  policies: `  "policies": "./policies.json",`,
  standards: `  "standards": ["./standards/*"],`,
  tools: `  "tools": "./tools/requirements.json",`,
  verification: `  "verification": "./verification.json"`,
};
const LAYER_EXPLAINED: Record<string, string> = {
  identity: `  "identity": "who the agent is — title, scope, voice",`,
  expertise: `  "docs": "discipline-specific depth and judgment",`,
  knowledge: `  "knowledge": "authoritative references it trusts",`,
  methods: `  "handoffs": "professional playbooks for the work",`,
  skills: `  "skills": "composable capabilities it can invoke",`,
  rules: `  "rules": "normative constraints it must obey",`,
  policies: `  "policies": "tool governance — allowed, gated, forbidden",`,
  standards: `  "standards": "external requirements it complies with",`,
  tools: `  "tools": "packages, MCP servers and CLIs it may use",`,
  verification: `  "verification": "checks that must pass before done"`,
};
const explainMode = ref(false);
const selectedLayers = ref<Set<string>>(new Set());
const displayedManifest = ref("");
const typingTimer = ref<number | null>(null);
const typingActive = ref(false);

const LINKS = {
  logo: withBase("/logo-dark.png"),
  logoLight: withBase("/logo.png"),
  bot: withBase("/bot-icon.png"),
  harnessIcon: (file: string) => withBase(`/harness/${file}`),
  gettingStarted: withBase("/guide/getting-started"),
  whatIs: withBase("/guide/what-is-proagents"),
  profiles: withBase("/registry/"),
  profileGuide: withBase("/guide/profiles"),
  registry: withBase("/registry/"),
  browse: withBase("/registry/"),
  cli: withBase("/cli/"),
  json: withBase("/cli/json"),
  studio: withBase("/studio"),
};

const LAYERS = [
  ["01", "identity", "title, scope, voice"],
  ["02", "expertise", "discipline-specific depth"],
  ["03", "knowledge", "authoritative references"],
  ["04", "methods", "professional playbooks"],
  ["05", "skills", "composable capabilities"],
  ["06", "rules", "normative constraints"],
  ["07", "policies", "tool governance"],
  ["08", "standards", "external requirements"],
  ["09", "tools", "packages, MCP, CLIs"],
  ["10", "verification", "checks before done"],
] as const;
const VALIDATION = [
  ["PA030", "profile", "manifest section path is missing"],
  ["PA035", "profile", "rule has no enforceable target"],
  ["PA043", "crew", "production write lacks an approval gate"],
  ["PA047", "crew", "member file mismatches its manifest"],
] as const;
/* -- §04 terminal: types the validate command, then prints evidence -- */
/* SSR/no-JS renders the full transcript; on first scroll into view the
 * JS path replays it like a live terminal (skipped under reduced motion). */
const TERM_LINES: Array<{ kind: "cmd" | "ok"; text: string }> = [
  { kind: "cmd", text: "proagent profile validate manifest.json" },
  { kind: "ok", text: "✓ manifest resolved" },
  { kind: "ok", text: "✓ 10 sections hydrated" },
  { kind: "ok", text: "✓ enforcement targets mapped" },
  { kind: "ok", text: "✓ verification requirements present" },
];
const termEl = ref<HTMLElement | null>(null);
const typedCmd = ref(TERM_LINES[0].text);
const termProgress = ref(TERM_LINES.length); // SSR: fully printed
const termPlaying = ref(false);
let termPlayed = false;
const termTimers: number[] = [];

/** Replay the transcript: type the command, then print lines like a REPL. */
function playTerminal(): void {
  if (termPlayed || reducedMotion.value) return;
  termPlayed = true;
  termPlaying.value = true;
  termProgress.value = 0;
  typedCmd.value = "";
  const cmd = TERM_LINES[0].text;
  for (let i = 1; i <= cmd.length; i++) {
    termTimers.push(window.setTimeout(() => { typedCmd.value = cmd.slice(0, i); }, 24 * i));
  }
  const afterCmd = 24 * cmd.length + 350;
  termTimers.push(window.setTimeout(() => { termProgress.value = 1; }, afterCmd));
  TERM_LINES.slice(1).forEach((_, k) => {
    termTimers.push(window.setTimeout(() => { termProgress.value = k + 2; }, afterCmd + 600 + k * 320));
  });
  termTimers.push(window.setTimeout(() => { termPlaying.value = false; }, afterCmd + 600 + (TERM_LINES.length - 1) * 320 + 400));
}
/* §03 equation: the harness term is interactive — pick a target, the
 * equation retargets. Labels mirror ORBIT; the CLI slug is the real
 * `--target` value from src/registry/spec.ts KNOWN_HARNESSES. */
const pickedHarness = ref("Claude Code");
const pickedOrbit = computed(() => ORBIT.find((h) => h.name === pickedHarness.value) ?? null);
const HARNESS_SLUGS: Record<string, string> = {
  "Claude Code": "claude-code",
  "Codex": "codex",
  "OpenCode": "opencode",
  "Cursor": "cursor",
  "Gemini CLI": "gemini-cli",
  "Copilot": "copilot",
  "OpenClaude": "openclaude",
  "Freebuff": "freebuff",
  "Any CLI": "generic-cli",
};
const pickedSlug = computed(() => HARNESS_SLUGS[pickedHarness.value] ?? "generic-cli");
/* §05 quickstart: click a command line to copy it. Counts mirror the
 * registry (registry/profiles, registry/crews) — keep in sync. */
const INSTALL_COMMANDS = ["npm install -g proagent", "proagent equip security-engineer"];
const copied = ref<string | null>(null);
let copiedTimer: number | null = null;
async function copyInstall(cmd: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(cmd);
    copied.value = cmd;
    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copied.value = null; }, 1400);
  } catch {
    /* clipboard unavailable — the text stays selectable */
  }
}
/* The §01 orbit: every harness, one profession. Marks are local Simple
 * Icons SVGs (docs/public/harness) tinted by each vendor's primary hue. */
const ORBIT = [
  { name: "Claude Code", icon: "anthropic.svg", color: "#d97757" },
  { name: "Codex", icon: "openai.svg", color: "#10a37f" },
  { name: "OpenCode", icon: "opencode.svg", color: "#0e4bec" },
  { name: "Cursor", icon: "cursor.svg", color: "#5d2de2" },
  { name: "Gemini CLI", icon: "googlegemini.svg", color: "#4285f4" },
  { name: "Copilot", icon: "githubcopilot.svg", color: "#24292f" },
  { name: "OpenClaude", icon: "openclaude.png", color: "#13a6e0" },
  { name: "Freebuff", icon: "freebuff.png", color: "#0cced4" },
  { name: "Any CLI", icon: null, color: "#57627e" },
];

onMounted(() => {
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  startCoffeeType();

  // Reveal-on-scroll: only the listed nodes animate; content is visible
  // without JS and under reduced motion (CSS gates on html.js).
  const revealEls = Array.from(document.querySelectorAll<HTMLElement>(".pl-reveal"));
  if (!reducedMotion.value && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of revealEls) io.observe(el);
    cleanupFns.push(() => io.disconnect());
  } else {
    for (const el of revealEls) el.classList.add("is-in");
  }

  // The ASCII bot: static geometry stays SSR'd; only the canvas needs JS.
  if (botCanvas.value) {
    AsciiBotField.create(botCanvas.value, "/bot-icon.png").then((field) => {
      if (!field) return; // image failed — band collapses via .is-live absence
      bot = field;
      bot.start();
      botReady.value = true;
    });
  }

  // §01 orbit hub: the core is a live ASCII energy field feeding the ring.
  if (coreCanvas.value) {
    core = AsciiCore.create(coreCanvas.value);
    core?.start();
  }

  // §04 terminal: replay the transcript the first time it scrolls into view.
  if (termEl.value && !reducedMotion.value && "IntersectionObserver" in window) {
    const tio = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          playTerminal();
          tio.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    tio.observe(termEl.value);
    cleanupFns.push(() => tio.disconnect());
  }
});

const cleanupFns: Array<() => void> = [];
onBeforeUnmount(() => {
  bot?.dispose();
  bot = null;
  core?.dispose();
  core = null;
  if (typingTimer.value !== null) window.clearInterval(typingTimer.value);
  typingTimer.value = null;
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  if (coffeeTimer !== null) window.clearTimeout(coffeeTimer);
  for (const t of termTimers) window.clearTimeout(t);
  termTimers.length = 0;
  for (const fn of cleanupFns) fn();
});

/** The composed manifest: `{` + one line per selected layer + `}`. */
function composeManifest(selected: Set<string>): string {
  const source = explainMode.value ? LAYER_EXPLAINED : LAYER_SECTIONS;
  const lines = LAYERS
    .map(([, name]) => name)
    .filter((name) => selected.has(name) && source[name])
    .map((name) => source[name].replace(/,\s*$/, ""));
  if (lines.length === 0) return "";
  return `{\n${lines.join(",\n")}\n}`;
}

const DEFAULT_MANIFESTS = {
  paths: `{\n  "identity": "./identity.json",\n  "handoffs": ["./handoffs/*"],\n  "rules": ["./rules/*"],\n  "verification": "./verification.json"\n}`,
  explained: `{\n  "identity": "who the agent is — title, scope, voice",\n  "handoffs": "professional playbooks for the work",\n  "rules": "normative constraints it must obey",\n  "verification": "checks that must pass before done"\n}`,
};
const defaultManifest = computed(() => (explainMode.value ? DEFAULT_MANIFESTS.explained : DEFAULT_MANIFESTS.paths));

/** Tiny deterministic highlighter: quote-delimited keys get the accent. */
function highlightManifest(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([a-z-]+)":/g, '<b>"$1"</b>:');
}

const manifestHtml = computed(() => highlightManifest(displayedManifest.value || defaultManifest.value));

/** Retype the whole composed manifest into the document panel. */
function typeManifest(text: string): void {
  if (typingTimer.value !== null) {
    window.clearInterval(typingTimer.value);
    typingTimer.value = null;
  }
  if (reducedMotion.value) {
    displayedManifest.value = text;
    typingActive.value = false;
    return;
  }
  displayedManifest.value = "";
  typingActive.value = true;
  let i = 0;
  typingTimer.value = window.setInterval(() => {
    i += 1;
    displayedManifest.value = text.slice(0, i);
    if (i >= text.length) {
      if (typingTimer.value !== null) window.clearInterval(typingTimer.value);
      typingTimer.value = null;
      typingActive.value = false;
    }
  }, 12);
}

/** Toggle a layer: add its section to (or remove it from) the manifest. */
function selectLayer(name: string): void {
  const next = new Set(selectedLayers.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  selectedLayers.value = next;
  const composed = composeManifest(next);
  if (composed) {
    typeManifest(composed);
  } else {
    if (typingTimer.value !== null) window.clearInterval(typingTimer.value);
    typingTimer.value = null;
    typingActive.value = false;
    displayedManifest.value = ""; // falls back to the default view
  }
}

/** "?" toggle: retype the current selection as paths or as explanations. */
function toggleExplain(): void {
  explainMode.value = !explainMode.value;
  const composed = composeManifest(selectedLayers.value);
  if (composed) {
    typeManifest(composed);
  } else {
    displayedManifest.value = ""; // default view switches via computed
  }
}

</script>

<template>
  <div class="pa-landing">
    <header class="pa-nav">
      <div class="pa-nav__inner">
        <a class="pa-logo" :href="LINKS.whatIs"><img :src="LINKS.logo" alt="ProAgents" width="150" height="42" /></a>
        <span class="pa-nav-readout">/ professional agent infrastructure</span>
        <span class="pa-coffee-wrap">
          <button class="pa-coffee" type="button" :aria-haspopup="'dialog'" :aria-expanded="supportOpen" title="Support ProAgents" @click="supportOpen = !supportOpen">
            <span aria-hidden="true">☕</span>
            <span class="pa-coffee__type">{{ coffeeTyped }}<i v-if="coffeeTyped.length < COFFEE_TEXT.length" class="pa-coffee__caret" aria-hidden="true"></i></span>
          </button>
          <Transition name="pa-support">
            <div v-if="supportOpen" class="pa-support" role="dialog" aria-label="Support ProAgents">
              <p>ProAgents is free and open source. If it earns its keep on your team:</p>
              <div class="pa-support__links">
                <a :href="SUPPORT_LINKS.kofi" target="_blank" rel="noopener noreferrer">☕ Buy me a coffee <small>Ko-fi ↗</small></a>
                <a :href="SUPPORT_LINKS.github" target="_blank" rel="noopener noreferrer">★ Sponsor <small>GitHub ↗</small></a>
              </div>
              <button class="pa-support__close" type="button" aria-label="Close support dialog" @click="supportOpen = false">×</button>
            </div>
          </Transition>
        </span>
        <nav id="pa-nav" :class="{ 'is-open': menuOpen }" aria-label="Primary navigation">
          <a :href="LINKS.profiles">Profiles</a><a :href="LINKS.registry">Registry</a><a :href="LINKS.studio">Studio</a><a :href="LINKS.cli">CLI</a>
        </nav>
        <a class="pa-ghstar" href="https://github.com/EnzoVezzaro/proagents" target="_blank" rel="noopener noreferrer" aria-label="Star ProAgents on GitHub">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
          <span>Star</span>
        </a>
        <a class="pa-button pa-button--small" :href="LINKS.gettingStarted">Get started</a>
        <button class="pa-menu" type="button" aria-label="Toggle navigation" aria-controls="pa-nav" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><span></span><span></span></button>
      </div>
    </header>

    <main>
      <!-- Hero: centered editorial copy; the futuristic ASCII field runs
           full-width as the band beneath it, continuously animated. -->
      <section class="pa-hero" aria-labelledby="hero-title">
        <div class="pa-container pa-hero__copy pl-reveal">
          <p class="pa-label"><span class="pa-live-mark"></span> PROAGENTS / v{{ pkg.version }} / OPEN SOURCE — MIT</p>
          <h1 id="hero-title">Give your coding agent a <em>profession.</em></h1>
          <p class="pa-hero__lede">ProAgents equips the agent you already use with a Professional Agent Profile — expertise, methods, rules, tools and verification, versioned in an open JSON registry and compiled into your harness.</p>
          <div class="pa-hero__actions">
            <a class="pa-button" :href="LINKS.gettingStarted">Equip a profile</a>
            <a class="pa-textlink" :href="LINKS.registry">Browse the registry <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div class="pa-hero__stage" :class="{ 'is-live': botReady }" aria-hidden="true">
          <canvas ref="botCanvas" class="pa-hero__canvas"></canvas>
        </div>
      </section>

      <!-- ===================== 01 HARNESS-AGNOSTIC ===================== -->
      <section class="pa-section pa-section--paper">
        <div class="pa-container pa-universal pl-reveal">
          <div class="pa-universal__copy">
            <p class="pa-label"><span>01</span> RUNS WITH ANY HARNESS</p>
            <h2>One profession.<br /><em>Every harness.</em></h2>
            <div class="pa-universal__lede">
              <p>A coding agent can write code. A professional agent knows how the work should be done — on whichever harness your team already runs.</p>
              <p>ProAgents compiles one canonical profile into each environment's native mechanisms — skills, rules, hooks, MCP — and reports what a harness cannot enforce. New harness? Recompile, don't rewrite.</p>
            </div>
            <p class="pa-universal__foot">9 native targets · <code>generic-cli</code> covers everything else</p>
          </div>
          <div class="pa-orbit" aria-hidden="true">
            <!-- Radial spokes: the connection core → each harness. -->
            <svg class="pa-orbit__spokes" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line
                v-for="(h, i) in ORBIT"
                :key="h.name"
                x1="50"
                y1="50"
                :x2="(50 + 50 * Math.cos((i * (360 / ORBIT.length) - 90) * (Math.PI / 180))).toFixed(2)"
                :y2="(50 + 50 * Math.sin((i * (360 / ORBIT.length) - 90) * (Math.PI / 180))).toFixed(2)"
              />
            </svg>
            <div class="pa-orbit__ring">
              <span
                v-for="(h, i) in ORBIT"
                :key="h.name"
                class="pa-orbit__slot"
                :style="{ '--a': `${i * (360 / ORBIT.length)}deg` }"
              >
                <span class="pa-orbit__chip" :style="{ '--dot': h.color }">
                  <img v-if="h.icon" :src="LINKS.harnessIcon(h.icon)" alt="" width="16" height="16" />
                  <b v-else aria-hidden="true">&gt;_</b>
                  <small>{{ h.name }}</small>
                </span>
              </span>
            </div>
            <div class="pa-orbit__core">
              <canvas ref="coreCanvas" class="pa-orbit__core-field" aria-hidden="true"></canvas>
              <img :src="LINKS.bot" alt="" width="46" height="46" />
            </div>
          </div>
        </div>
      </section>

      <!-- ===================== 02 PROFILE ANATOMY ===================== -->
      <section class="pa-section">
        <div class="pa-container">
          <div class="pa-secthead pl-reveal">
            <div>
              <p class="pa-label"><span>02</span> PROFILE / JSON REGISTRY</p>
              <h2>What a profession<br /><em>is made of.</em></h2>
            </div>
            <p>A profile is a folder of modular JSON sections behind one <code>manifest.json</code>. The same paths feed loaders, validators, adapters and CI.</p>
          </div>
          <div class="pa-layers pl-reveal">
            <ol>
              <li
                v-for="([number, name, copy]) in LAYERS"
                :key="name"
                :class="{ 'is-active': selectedLayers.has(name) }"
              >
                <button type="button" @click="selectLayer(name)" :aria-pressed="selectedLayers.has(name)">
                  <span>{{ number }}</span><strong>{{ name }}</strong><small>{{ copy }}</small><b aria-hidden="true">{{ selectedLayers.has(name) ? '−' : '+' }}</b>
                </button>
              </li>
            </ol>
            <div class="pa-manifest" :class="{ 'is-typing': typingActive }">
              <p class="pa-manifest__title">manifest.json<span v-if="selectedLayers.size" class="pa-manifest__chip">{{ selectedLayers.size }} layer{{ selectedLayers.size === 1 ? '' : 's' }}</span>
                <button class="pa-manifest__explain" type="button" :aria-pressed="explainMode" :title="explainMode ? 'Show file paths' : 'Explain each section'" @click="toggleExplain">?</button>
              </p>
              <!-- eslint-disable-next-line vue/no-v-html -- content is local constants + a deterministic escape -->
              <pre aria-label="manifest.json preview" v-html="manifestHtml"></pre>
              <p class="pa-manifest__status"><span class="pa-live-mark"></span> {{ explainMode ? 'what each section carries' : 'paths hydrated / prose not parsed' }}</p>
            </div>
          </div>
          <p class="pa-foot">Full schema in <a :href="LINKS.profileGuide">Profile schema</a> · scaffold one with <code>proagent profile create</code></p>
        </div>
      </section>

      <!-- ===================== 03 THE EQUATION ===================== -->
      <section class="pa-section pa-section--tint">
        <div class="pa-container">
          <div class="pa-secthead pl-reveal">
            <div>
              <p class="pa-label"><span>03</span> THE EQUATION</p>
              <h2>One profile.<br /><em>Every harness.</em></h2>
            </div>
            <p>The canonical profile compiles into the harness your team already runs. Same profession, native mechanisms — limitations reported, never hidden.</p>
          </div>
          <div class="pa-eq pl-reveal">
            <div class="pa-eq__term pa-eq__term--profile">
              <span class="pa-eq__kind">CANONICAL PROFILE</span>
              <strong>security-engineer</strong>
              <small>registry / profile.v1 — one JSON source of truth</small>
            </div>
            <div class="pa-eq__op" aria-hidden="true">+</div>
            <div class="pa-eq__term pa-eq__term--harness">
              <span class="pa-eq__kind">AGENT HARNESS</span>
              <div class="pa-eq__harness">
                <img v-if="pickedOrbit?.icon" :src="LINKS.harnessIcon(pickedOrbit.icon)" alt="" width="20" height="20" />
                <b v-else aria-hidden="true">&gt;_</b>
                <strong>{{ pickedHarness }}</strong>
              </div>
              <small>the environment your team already runs</small>
            </div>
            <div class="pa-eq__op pa-eq__op--eq" aria-hidden="true">=</div>
            <div class="pa-eq__term pa-eq__term--result">
              <span class="pa-eq__kind">PROFESSIONAL AGENT</span>
              <div class="pa-eq__result">
                <img class="pa-eq__bot" :src="LINKS.bot" alt="" width="40" height="40" />
                <strong>proagent</strong>
              </div>
              <small>same agent — now with a profession</small>
            </div>
          </div>
          <div class="pa-eq__compile pl-reveal">
            <code>proagent equip security-engineer --target {{ pickedSlug }}</code>
            <span class="pa-eq__compile-note">one command compiles the profile into the selected harness</span>
          </div>
          <div class="pa-eq__pick pl-reveal">
            <button
              v-for="h in ORBIT"
              :key="h.name"
              type="button"
              :aria-pressed="h.name === pickedHarness"
              :class="{ 'is-picked': h.name === pickedHarness }"
              @click="pickedHarness = h.name"
            >
              <img v-if="h.icon" :src="LINKS.harnessIcon(h.icon)" alt="" width="16" height="16" />
              <b v-else aria-hidden="true">&gt;_</b>
              <small>{{ h.name }}</small>
            </button>
          </div>
        </div>
      </section>

      <!-- ===================== 04 EVIDENCE ===================== -->
      <section class="pa-section pa-section--paper">
        <div class="pa-container">
          <div class="pa-secthead pl-reveal">
            <div>
              <p class="pa-label"><span>04</span> VALIDATION / EVIDENCE</p>
              <h2>A professional<br /><em>leaves evidence.</em></h2>
            </div>
            <p>No black box. Deterministic checks gate install, publish and resolution so a broken profession cannot quietly enter the system.</p>
          </div>
          <div class="pa-proof pl-reveal">
            <div ref="termEl" class="pa-proof__term">
              <div class="pa-proof__bar" aria-hidden="true"><i></i><i></i><i></i><span>proagent — validate</span></div>
              <p><span aria-hidden="true">$</span> {{ typedCmd }}<span v-if="termPlaying && termProgress < 2" class="pa-proof__caret" aria-hidden="true"></span></p>
              <p
                v-for="(line, i) in TERM_LINES.slice(1)"
                :key="line.text"
                v-show="termProgress >= i + 2"
                :class="line.kind"
              >{{ line.text }} <small v-if="line.note">{{ line.note }}</small></p>
            </div>
            <table>
              <thead><tr><th>code</th><th>scope</th><th>catches</th></tr></thead>
              <tbody>
                <tr v-for="([code, scope, text]) in VALIDATION" :key="code"><td>{{ code }}</td><td>{{ scope }}</td><td>{{ text }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ===================== 05 CLOSE ===================== -->
      <section class="pa-close">
        <div class="pa-container pa-close__grid">
          <div class="pl-reveal">
            <p class="pa-label"><span>05</span> START HERE</p>
            <h2>Give the work<br /><em>a standard.</em></h2>
            <p class="pa-close__lede">Install the CLI, pick a profession, and keep the harness your team already trusts. The compiler does the porting — verification does the proof.</p>
            <div class="pa-close__stats" role="list">
              <span role="listitem"><b>25</b><small>professions</small></span>
              <span role="listitem"><b>8</b><small>crews</small></span>
              <span role="listitem"><b>9</b><small>harness targets</small></span>
              <span role="listitem"><b>MIT</b><small>open source</small></span>
            </div>
          </div>
          <div class="pa-install pl-reveal">
            <div class="pa-install__bar" aria-hidden="true"><i></i><i></i><i></i><span>quickstart</span></div>
            <button
              v-for="cmd in INSTALL_COMMANDS"
              :key="cmd"
              class="pa-install__line"
              :class="{ 'is-copied': copied === cmd }"
              type="button"
              :aria-label="`Copy: ${cmd}`"
              @click="copyInstall(cmd)"
            >
              <span aria-hidden="true">$</span><code>{{ cmd }}</code><em aria-hidden="true">{{ copied === cmd ? 'copied ✓' : 'copy' }}</em>
            </button>
            <p class="ok">profile compiled / verification required</p>
            <div class="pa-install__actions">
              <a class="pa-button pa-button--light" :href="LINKS.gettingStarted">Read the quickstart</a>
              <a class="pa-textlink pa-textlink--light" :href="LINKS.cli">CLI reference <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </div>
        <div class="pa-ramp" aria-hidden="true"></div>
        <footer class="pa-footer">
          <div class="pa-container pa-footer__inner">
            <a class="pa-logo" :href="LINKS.whatIs"><img :src="LINKS.logoLight" alt="ProAgents" width="126" height="35" /></a>
            <nav aria-label="Footer navigation">
              <a :href="LINKS.whatIs">What is ProAgents?</a>
              <a :href="LINKS.registry">Registry</a>
              <a :href="LINKS.json">JSON interface</a>
              <a href="https://github.com/EnzoVezzaro/proagents">GitHub</a>
            </nav>
            <small>MIT / open source / 2026</small>
          </div>
        </footer>
      </section>
    </main>
  </div>
</template>
