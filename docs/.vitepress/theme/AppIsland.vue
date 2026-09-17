<script setup lang="ts">
// Client-only mount point for the React marketplace island (web/src/ui).
// React and Vue can't share a component tree, so this wrapper mounts the
// React root imperatively on a plain div. The island is loaded lazily: the
// initial VitePress payload stays doc-sized and the React bundle only loads
// when a visitor lands on a page that renders it.
import { onMounted, onBeforeUnmount, ref } from "vue";

const ready = ref(false);
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const host = ref<HTMLElement | null>(null);
let root: Root | null = null;
let dispose: (() => void) | null = null;

onMounted(async () => {
  if (!host.value) return;
  const { AppIsland } = await import("../../../web/src/ui/AppShell.js");
  if (!host.value) return; // unmounted while the chunk loaded
  root = createRoot(host.value);
  root.render(createElement(AppIsland));
  ready.value = true;
  dispose = () => root?.unmount();
});

onBeforeUnmount(() => {
  dispose?.();
  dispose = null;
  root = null;
});
</script>

<template>
  <div class="pa-app-island">
    <div ref="host" class="pa-app-host" />
    <div v-show="!ready" class="pa-app-loading" aria-live="polite">
      <span class="pa-app-loading-dot" aria-hidden="true" />
      Loading the marketplace…
    </div>
  </div>
</template>

<style scoped>
.pa-app-island {
  position: relative;
  z-index: 1;
}
.pa-app-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  padding: 48px 0;
  color: var(--vp-c-text-3);
  font-size: 14px;
}
.pa-app-loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pa-cyan-bright);
  animation: pa-pulse 1.1s ease-in-out infinite;
}
@keyframes pa-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .pa-app-loading-dot { animation: none; }
}
</style>
