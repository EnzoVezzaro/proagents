<script setup lang="ts">
// The Registry listing page body (/registry): every installable artifact in
// the catalog, each with its CLI install command, live search and harness
// compatibility filtering. Client-only — the catalog is fetched from
// /registry/catalog.json (the repo IS the database). The page header,
// noscript fallback and machines-footer live in the markdown so they
// server-render; this component renders the toolbar + the kind sections.
//
// Harness ids/names mirror HARNESS_SPECS (src/adapters/index.ts) +
// KNOWN_HARNESSES (src/registry/spec.ts); marks are the same Simple Icons
// the landing orbit uses (docs/public/harness/).
import { computed, onMounted, ref } from "vue";

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  kind: "profile" | "crew" | "agent";
  tags?: string[];
  /** Harness ids the artifact compiles for (catalog `compatibility`). */
  compatibility?: string[];
}

interface Catalog {
  items: CatalogItem[];
}

const SECTIONS: Array<{
  kind: CatalogItem["kind"];
  num: string;
  title: string;
  blurb: string;
  hint: string;
}> = [
  {
    kind: "profile",
    num: "01",
    title: "Profiles",
    blurb:
      "A profession for your coding agent: identity, expertise, methods, rules and verification, compiled into your harness's native mechanisms.",
    hint: "proagent equip <slug>",
  },
  {
    kind: "crew",
    num: "02",
    title: "Crews",
    blurb:
      "Multi-agent systems: specialized workers wired together by a handoff graph, installed with one command.",
    hint: "proagent crew install <id>",
  },
  {
    kind: "agent",
    num: "03",
    title: "Agents",
    blurb: "Single-purpose agents with one job done precisely.",
    hint: "proagent install agent:<id>",
  },
];

const COMMANDS: Record<CatalogItem["kind"], string> = {
  profile: "proagent equip ",
  crew: "proagent crew install ",
  agent: "proagent install agent:",
};

/** Mirror of HARNESS_SPECS + generic-cli — same ids, same marks as the landing. */
const HARNESSES: Array<{ id: string; name: string; icon: string | null }> = [
  { id: "claude-code", name: "Claude Code", icon: "anthropic.svg" },
  { id: "codex", name: "Codex", icon: "openai.svg" },
  { id: "opencode", name: "OpenCode", icon: "opencode.svg" },
  { id: "cursor", name: "Cursor", icon: "cursor.svg" },
  { id: "gemini-cli", name: "Gemini CLI", icon: "googlegemini.svg" },
  { id: "copilot", name: "GitHub Copilot", icon: "githubcopilot.svg" },
  { id: "openclaude", name: "OpenClaude", icon: "openclaude.png" },
  { id: "freebuff", name: "Freebuff", icon: "freebuff.png" },
  { id: "generic-cli", name: "Any CLI", icon: null },
];

const catalog = ref<Catalog | null>(null);
const failed = ref(false);
const copied = ref<string | null>(null);
const query = ref("");
const harness = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch("/registry/catalog.json");
    if (!res.ok) throw new Error(String(res.status));
    catalog.value = (await res.json()) as Catalog;
  } catch {
    failed.value = true;
  }
});

function supportsHarness(item: CatalogItem, id: string): boolean {
  return !item.compatibility || item.compatibility.length === 0 || item.compatibility.includes(id);
}

function matches(item: CatalogItem): boolean {
  if (harness.value && !supportsHarness(item, harness.value)) return false;
  const q = query.value.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.name, item.id, item.description, ...(item.tags ?? [])].join(" ").toLowerCase();
  // Every whitespace-separated token must appear somewhere.
  return q.split(/\s+/).every((t) => haystack.includes(t));
}

function itemsOf(kind: CatalogItem["kind"]): CatalogItem[] {
  const items = catalog.value?.items.filter((i) => i.kind === kind) ?? [];
  return items.filter(matches).sort((a, b) => a.name.localeCompare(b.name));
}

function totalOf(kind: CatalogItem["kind"]): number {
  return catalog.value?.items.filter((i) => i.kind === kind).length ?? 0;
}

const hasMatches = computed(() => SECTIONS.some((s) => itemsOf(s.kind).length > 0));
const filtering = computed(() => query.value.trim().length > 0 || harness.value !== null);

function clearFilters() {
  query.value = "";
  harness.value = null;
}

function countLabel(kind: CatalogItem["kind"]): string {
  const shown = itemsOf(kind).length;
  const total = totalOf(kind);
  return shown === total ? String(total) : `${shown} of ${total}`;
}

function commandFor(item: CatalogItem): string {
  return COMMANDS[item.kind] + item.id;
}

function markSrc(icon: string): string {
  return `/harness/${icon}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = text;
    setTimeout(() => {
      if (copied.value === text) copied.value = null;
    }, 1200);
  } catch {
    /* clipboard unavailable — the command is selectable regardless */
  }
}
</script>

<template>
  <p v-if="failed" class="pa-reg-noscript">
    The catalog could not be fetched. List the registry from the CLI instead:
    <code>proagent profile list</code> · <code>proagent crew list</code>
  </p>

  <template v-if="catalog">
    <div class="pa-reg-toolbar">
      <label class="pa-reg-search">
        <span>Filter</span>
        <input
          v-model="query"
          type="search"
          placeholder="name, tag, capability…"
          spellcheck="false"
          autocomplete="off"
        />
      </label>
      <div class="pa-reg-chips" role="group" aria-label="Filter by harness">
        <button
          v-for="h in HARNESSES"
          :key="h.id"
          type="button"
          class="pa-reg-chip"
          :class="{ 'is-active': harness === h.id }"
          :aria-pressed="harness === h.id"
          :title="h.name"
          @click="harness = harness === h.id ? null : h.id"
        >
          <img v-if="h.icon" :src="markSrc(h.icon)" alt="" width="14" height="14" />
          <span v-else class="pa-reg-chip-cli">CLI</span>
          {{ h.name }}
        </button>
        <button v-if="filtering" type="button" class="pa-reg-clear" @click="clearFilters">Clear ×</button>
      </div>
    </div>

    <p v-if="!hasMatches" class="pa-reg-noscript">
      Nothing matches. <button type="button" class="pa-reg-clear" @click="clearFilters">Clear the filters</button>
    </p>

    <section v-for="s in SECTIONS" v-show="itemsOf(s.kind).length > 0" :key="s.kind" class="pa-reg-section">
      <p class="pa-reg-label"><span>{{ s.num }}</span> {{ s.title }} — {{ countLabel(s.kind) }}</p>
      <p class="pa-reg-note">
        {{ s.blurb }}
        <code>{{ s.hint }}</code>
      </p>
      <div class="pa-reg-grid">
        <article v-for="item in itemsOf(s.kind)" :key="item.kind + ':' + item.id" class="pa-reg-card">
          <p class="pa-reg-name">{{ item.name }}</p>
          <p class="pa-reg-desc">{{ item.description }}</p>
          <p class="pa-reg-tags">
            <span v-for="tag in (item.tags || []).filter((t) => t !== item.kind).slice(0, 4)" :key="tag">{{ tag }}</span>
          </p>
          <p class="pa-reg-compat" aria-label="Compatible harnesses">
            <span
              v-for="h in HARNESSES"
              :key="h.id"
              class="pa-reg-mark"
              :class="{ 'is-off': !supportsHarness(item, h.id) }"
              :title="supportsHarness(item, h.id) ? h.name : `${h.name}: not declared`"
            >
              <img v-if="h.icon" :src="markSrc(h.icon)" alt="" width="12" height="12" />
              <span v-else class="pa-reg-mark-cli">CLI</span>
            </span>
          </p>
          <code
            class="pa-reg-cmd"
            :class="{ 'is-copied': copied === commandFor(item) }"
            role="button"
            tabindex="0"
            title="Click to copy"
            @click="copy(commandFor(item))"
            @keydown.enter.prevent="copy(commandFor(item))"
            @keydown.space.prevent="copy(commandFor(item))"
          >{{ commandFor(item) }}</code>
        </article>
      </div>
    </section>
  </template>
</template>
