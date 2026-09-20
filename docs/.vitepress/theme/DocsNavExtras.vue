<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useData, withBase } from "vitepress";
import { AsciiCore } from "./landing/asciiBot";

/**
 * The landing's nav extras, adapted to the docs chrome: the "Get started"
 * CTA (pa-button--small voice) and a compact ASCII core — the same
 * deterministic engine that powers the landing's orbit hub, with ink flipped
 * for the navy dark mode. One static frame under reduced motion; the loop
 * pauses off-screen and on hidden tabs (engine contract).
 */
const { isDark } = useData();
const canvas = ref<HTMLCanvasElement | null>(null);
let core: AsciiCore | null = null;

const INK_LIGHT = { ink: "#0d1128", muted: "#5b6480" };
const INK_DARK = { ink: "#eef1fb", muted: "#8590b0" };

function mount(): void {
  core?.dispose();
  core = canvas.value ? AsciiCore.create(canvas.value, isDark.value ? INK_DARK : INK_LIGHT) : null;
  core?.start();
}

onMounted(mount);
watch(isDark, mount);
onBeforeUnmount(() => {
  core?.dispose();
  core = null;
});
</script>

<template>
  <div class="pa-docs-nav-extras">
    <a class="pa-docs-cta" :href="withBase('/guide/getting-started')">Get started</a>
    <div class="pa-docs-core" aria-hidden="true">
      <canvas ref="canvas"></canvas>
    </div>
  </div>
</template>
