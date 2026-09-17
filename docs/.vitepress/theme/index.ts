// Custom theme: ProAgents brand — the logo's deep-space navy world with the
// shared type pairing (Bricolage Grotesque / Geist / JetBrains Mono).
// `theme-without-fonts` drops VitePress's bundled Inter; the brand fonts are
// imported here as JS modules (Fontsource) because VitePress's CSS pipeline
// does not resolve bare-specifier @import in custom CSS.
import DefaultTheme from "vitepress/theme-without-fonts";
import { h } from "vue";
import AppIsland from "./AppIsland.vue";
import NotFound from "./NotFound.vue";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // Branded not-found view (and stale-/docs/-URL recovery) — replaces
      // VitePress's default 404.
      "not-found": () => h(NotFound),
    });
  },
  enhanceApp({ app }) {
    app.component("AppIsland", AppIsland);
  },
};
