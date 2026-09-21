// Custom theme: ProAgents brand — the logo's world with the shared type
// pairing (Nunito display, matching the logo wordmark / Geist body / JetBrains
// Mono code). `theme-without-fonts` drops VitePress's bundled Inter; the brand
// fonts are imported here as JS modules (Fontsource) because VitePress's CSS
// pipeline does not resolve bare-specifier @import in custom CSS.
import DefaultTheme from "vitepress/theme-without-fonts";
import { h } from "vue";
import AppIsland from "./AppIsland.vue";
import DocsNavExtras from "./DocsNavExtras.vue";
import NotFound from "./NotFound.vue";
import RegistryPage from "./RegistryPage.vue";
import SiteFooter from "./SiteFooter.vue";
import "@fontsource-variable/nunito";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./custom.css";
// Registry listing page (/registry) — card grid + install-command styles.
import "./registry.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // Branded not-found view (and stale-/docs/-URL recovery) — replaces
      // VitePress's default 404.
      "not-found": () => h(NotFound),
      // Landing-parity navbar: the "/ professional agent infrastructure"
      // readout beside the lockup (hidden on small screens), and the
      // Get-started CTA + compact ASCII core on the right.
      "nav-bar-title-after": () =>
        h("span", { class: "pa-docs-readout" }, "/ professional agent infrastructure"),
      "nav-bar-content-after": () => h(DocsNavExtras),
      // The landing's navy close on every docs page (the ramp band + logo +
      // mono nav). The home landing renders its own §05 footer; SiteFooter
      // hides itself there via the `footer: false` frontmatter.
      "layout-bottom": () => h(SiteFooter),
    });
  },
  enhanceApp({ app }) {
    app.component("AppIsland", AppIsland);
    app.component("RegistryPage", RegistryPage);
  },
};
