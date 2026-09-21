<script setup lang="ts">
// The Registry listing page body (/registry): every installable artifact in
// the catalog, each with its CLI install command. Client-only — the catalog
// is fetched from /registry/catalog.json (the repo IS the database). The
// page header, noscript fallback and machines-footer live in the markdown
// so they server-render; this component renders the three kind sections.
import { onMounted, ref } from "vue";

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  kind: "profile" | "crew" | "agent";
  tags?: string[];
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

const catalog = ref<Catalog | null>(null);
const failed = ref(false);
const copied = ref<string | null>(null);

onMounted(async () => {
  try {
    const res = await fetch("/registry/catalog.json");
    if (!res.ok) throw new Error(String(res.status));
    catalog.value = (await res.json()) as Catalog;
  } catch {
    failed.value = true;
  }
});

function itemsOf(kind: CatalogItem["kind"]): CatalogItem[] {
  const items = catalog.value?.items.filter((i) => i.kind === kind) ?? [];
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function countOf(kind: CatalogItem["kind"]): number {
  return itemsOf(kind).length;
}

function commandFor(item: CatalogItem): string {
  return COMMANDS[item.kind] + item.id;
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
  <p v-else-if="!catalog" class="pa-reg-noscript" aria-busy="true">Loading the catalog…</p>

  <template v-if="catalog">
    <section v-for="s in SECTIONS" :key="s.kind" class="pa-reg-section">
      <p class="pa-reg-label"><span>{{ s.num }}</span> {{ s.title }} — {{ countOf(s.kind) }}</p>
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
