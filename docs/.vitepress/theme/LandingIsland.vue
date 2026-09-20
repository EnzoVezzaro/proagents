<script setup lang="ts">
// Client-only mount for the scroll-craft landing (the docs home).
// The scrollcraft engine + landing styles are imported here so the initial
// VitePress payload stays doc-sized: the landing bundle only loads when a
// visitor actually lands on "/". Mirrors AppIsland.vue's lazy-island pattern,
// but the landing is authored markup (no React, no generated DOM).
import { onMounted, onBeforeUnmount, ref } from "vue";
// Styles are static imports: Vite extracts them into this component's chunk
// CSS, so they load with the island. (A dynamic CSS import would emit a chunk
// with the same name as the JS chunk and the two would clobber each other.)
import "../../../scrollcraft/builds/proagents-home/engine/scrollcraft.css";
import "../../../scrollcraft/builds/proagents-home/sc-landing.css";

const ready = ref(false);
let dispose: (() => void) | null = null;

onMounted(async () => {
  // Engine first (defines window.ScrollCraft), then the landing behaviour.
  await import("../../../scrollcraft/builds/proagents-home/engine/scrollcraft.js");
  await import("../../../scrollcraft/builds/proagents-home/sc-landing.js");
  const root = document.getElementById("sc-main");
  if (root && (window as unknown as { ScrollCraft: { mount: (r: HTMLElement) => void } }).ScrollCraft) {
    (window as unknown as { ScrollCraft: { mount: (r: HTMLElement) => void } }).ScrollCraft.mount(root);
  }
  ready.value = true;
  dispose = () => {};
});

onBeforeUnmount(() => {
  dispose?.();
  dispose = null;
});
</script>

<template>
  <div class="pa-landing-island" :class="{ 'is-ready': ready }">
    <slot />
    <noscript>
      <p class="pa-landing-noscript">
        The interactive landing needs JavaScript. The docs are static:
        start at <a href="/guide/what-is-proagents">What is ProAgents?</a>
      </p>
    </noscript>
  </div>
</template>

<style scoped>
.pa-landing-island {
  min-height: 60vh;
}
.pa-landing-noscript {
  padding: 48px 24px;
  text-align: center;
  color: var(--pa-cyan, #0a9ea8);
}
</style>
