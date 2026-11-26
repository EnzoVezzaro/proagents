<script setup lang="ts">
// Wrapper for the docs home (the landing). The landing itself is a static Vue
// component that VitePress server-renders — this wrapper only provides:
//   1. the html.pl-home class as a no-:has() fallback for hiding the docs
//      chrome (landing.css does the same via html:has(.pa-landing-island)
//      before hydration), and
//   2. a <noscript> path into the docs.
// The stylesheet is imported here so it lands in the same chunk as the
// landing markup.
import { onMounted, onBeforeUnmount, ref } from "vue";
import { withBase } from "vitepress";
import "./landing/landing.css";

const ready = ref(false);
const docsHome = withBase("/guide/what-is-proagents");

onMounted(() => {
  document.documentElement.classList.add("pl-home");
  ready.value = true;
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("pl-home");
});
</script>

<template>
  <div class="pa-landing-island" :class="{ 'is-ready': ready }">
    <slot />
    <noscript>
      <p class="pa-landing-noscript">
        The landing needs JavaScript for its reveal animation only — the
        content is all here. The docs are static:
        start at <a :href="docsHome">What is ProAgents?</a>
      </p>
    </noscript>
  </div>
</template>

<style scoped>
.pa-landing-island {
  min-height: 100vh;
}
.pa-landing-noscript {
  padding: 48px 24px;
  text-align: center;
  color: var(--pa-accent, #0e4bec);
}
</style>
