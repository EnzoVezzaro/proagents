<script setup lang="ts">
// The site-wide footer — the landing's navy close (Landing.vue §05), adapted
// to the docs chrome: the 4px logo-ramp band (the sanctioned brand moment),
// the light lockup, mono nav links and the MIT line. Rendered through the
// layout-bottom slot in theme/index.ts; the old VitePress text footer
// (themeConfig.footer) is retired — one footer across both surfaces.
// Home is excluded via its `footer: false` frontmatter (the landing owns it).
import { useData, withBase } from "vitepress";
import { useSidebar } from "vitepress/theme-without-fonts";
import { computed } from "vue";

// VitePress's own footer hides on sidebar pages because the fixed sidebar
// (z-index above the footer) covers the left part of the band. This footer
// keeps the landing's close everywhere: on wide screens it indents past the
// sidebar (mirroring VPContent's padding math) instead of hiding.
// The home landing is excluded via its `footer: false` frontmatter — it
// renders its own §05 close.
const { hasSidebar } = useSidebar();
const { frontmatter } = useData();
const visible = computed(() => frontmatter.value.footer !== false);
</script>

<template>
  <div v-if="visible" class="pa-site-footer" :class="{ 'has-sidebar': hasSidebar }">
    <div class="pa-site-footer__ramp" aria-hidden="true"></div>
    <footer class="pa-site-footer__band">
      <div class="pa-site-footer__inner">
        <a class="pa-site-footer__logo" :href="withBase('/guide/what-is-proagents')">
          <img src="/logo.png" alt="ProAgents" width="126" height="35" />
        </a>
        <nav aria-label="Footer navigation">
          <a :href="withBase('/guide/what-is-proagents')">What is ProAgents?</a>
          <a :href="withBase('/registry/')">Registry</a>
          <a :href="withBase('/cli/json')">JSON interface</a>
          <a href="https://github.com/EnzoVezzaro/proagents">GitHub</a>
        </nav>
        <a
          class="pa-site-footer__ph"
          href="https://www.producthunt.com/products/proagents?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-proagents"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="ProAgents on Product Hunt"
        >
          <img
            alt="ProAgents - Give your coding agent a profession. | Product Hunt"
            width="160"
            height="35"
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1257611&amp;theme=light&amp;t=1790033178328"
            loading="lazy"
          />
        </a>
        <small>MIT / open source / 2026</small>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* The logo-ramp band — same 4px strip as the landing's .pa-ramp. */
.pa-site-footer__ramp {
  height: 4px;
  background: linear-gradient(90deg, var(--pa-violet), var(--pa-blue) 25%, var(--pa-sky) 50%, var(--pa-cyan) 75%, var(--pa-violet));
  background-size: 300% 100%;
  animation: pa-site-footer-ramp 9s linear infinite;
}
@keyframes pa-site-footer-ramp {
  to { background-position: 300% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pa-site-footer__ramp { animation: none; }
}

/* The navy close — .pa-footer voice from the landing. */
.pa-site-footer__band {
  border-top: 1px solid rgba(238, 241, 251, 0.14);
  background: var(--pa-navy);
  color: #b5c0df;
  font-family: var(--pa-font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
html.dark .pa-site-footer__band { background: #060d33; }

.pa-site-footer__inner {
  display: flex;
  align-items: center;
  min-height: 90px;
  gap: 25px;
  width: min(1200px, calc(100% - 64px));
  margin: 0 auto;
}
.pa-site-footer__logo { display: flex; flex-shrink: 0; }
.pa-site-footer__logo img { display: block; width: 126px; height: auto; }
.pa-site-footer__inner nav {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-left: auto;
}
.pa-site-footer__inner nav a {
  color: #eef1fb;
  text-decoration: none;
}
.pa-site-footer__inner nav a:hover { color: var(--pa-cyan); }
/* Product Hunt featured badge — a third-party chip, like the harness icons.
 * The SVG scales cleanly; rendered ~160px so it reads as a footer chip,
 * not a banner. */
.pa-site-footer__ph {
  display: flex;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
}
.pa-site-footer__ph img { display: block; width: 160px; height: auto; }
.pa-site-footer__inner small {
  color: #7180a6;
  font: 9px var(--pa-font-mono);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

/* Sidebar pages ≥960px: clear the fixed sidebar with the same padding VPContent
 * applies to its content (band keeps full bleed; only the inner row indents).
 * <960px the sidebar is an overlay — no indent. */
@media (min-width: 960px) {
  .pa-site-footer.has-sidebar .pa-site-footer__band {
    padding-left: var(--vp-sidebar-width);
  }
}
@media (min-width: 1440px) {
  .pa-site-footer.has-sidebar .pa-site-footer__band {
    padding-right: calc((100vw - var(--vp-layout-max-width)) / 2);
    padding-left: calc((100vw - var(--vp-layout-max-width)) / 2 + var(--vp-sidebar-width));
  }
}
/* Narrow sidebar viewports: the row can't fit logo + nav + MIT — stack like
 * the landing's small-screen footer (logo+MIT row, nav full-width below). */
@media (min-width: 960px) and (max-width: 1240px) {
  .pa-site-footer.has-sidebar .pa-site-footer__inner {
    flex-wrap: wrap;
    padding: 22px 0;
  }
  .pa-site-footer.has-sidebar .pa-site-footer__inner nav {
    order: 3;
    width: 100%;
    margin: 0;
  }
  .pa-site-footer__ph { order: 4; margin: 6px 0 0; }
}

@media (max-width: 900px) {
  .pa-site-footer__inner {
    flex-wrap: wrap;
    width: min(1200px, calc(100% - 48px));
    padding: 22px 0;
  }
  .pa-site-footer__inner nav { order: 3; width: 100%; margin: 0; }
  .pa-site-footer__ph { order: 4; margin: 6px 0 0; }
  .pa-site-footer__inner small { margin-left: auto; }
}
</style>
