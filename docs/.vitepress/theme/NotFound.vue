<script setup lang="ts">
// Branded not-found view (replaces VitePress's default "keep looking" quote).
// Also recovers stale URLs: pre-merge bookmarks like /proagents/docs/guide/…
// land here (no such file) and are redirected into the merged URL space.
import { onMounted } from "vue";

// Runtime binding (not a static src) so Vue's asset pipeline leaves the
// base-prefixed public path alone.
const logo = "/proagents/logo.png";

onMounted(() => {
  const m = window.location.pathname.match(/^\/(?:proagents\/)?docs\/(.*)$/);
  if (m) window.location.replace(`/proagents/${m[1]}`);
});
</script>

<template>
  <div class="pa-404">
    <img class="pa-404-logo" :src="logo" alt="ProAgents" width="120" height="39" />
    <p class="pa-404-code">404</p>
    <h1>Page not found</h1>
    <p class="pa-404-copy">
      The page you asked for does not exist — but the marketplace and the docs do.
    </p>
    <div class="pa-404-actions">
      <a class="pa-404-cta" href="/proagents/">Open the marketplace</a>
      <a class="pa-404-alt" href="/proagents/guide/getting-started">Read the docs</a>
    </div>
  </div>
</template>

<style scoped>
.pa-404 {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  padding: 48px 24px;
}
.pa-404-code {
  margin: 18px 0 0;
  font-family: var(--pa-font-mono);
  font-size: 13px;
  letter-spacing: 0.2em;
  color: var(--pa-cyan-bright);
}
.pa-404 h1 {
  margin: 0;
  font-family: var(--pa-font-display);
  font-size: 40px;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  border: none;
  padding: 0;
}
.pa-404-copy {
  margin: 6px 0 0;
  max-width: 480px;
  color: var(--vp-c-text-2);
  font-size: 15px;
}
.pa-404-actions {
  display: flex;
  gap: 12px;
  margin-top: 22px;
  flex-wrap: wrap;
  justify-content: center;
}
.pa-404-cta {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: 9px;
  background-image: var(--pa-grad);
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}
.pa-404-cta:hover {
  color: #ffffff;
  filter: brightness(1.12);
}
.pa-404-alt {
  display: inline-flex;
  align-items: center;
  padding: 9px 18px;
  border-radius: 9px;
  border: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-1);
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}
.pa-404-alt:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
@media (prefers-reduced-motion: no-preference) {
  .pa-404 { transition: opacity 0.15s ease; }
}
</style>
