// Custom theme: ProAgents brand — the logo's deep-space navy world with the
// hallmark type pairing (Bricolage Grotesque / Geist / JetBrains Mono).
// `theme-without-fonts` drops VitePress's bundled Inter; the brand fonts are
// imported here as JS modules (the same Fontsource files the SPA imports in
// web/src/main.tsx) because VitePress's CSS pipeline does not resolve
// bare-specifier @import in custom CSS.
import DefaultTheme from "vitepress/theme-without-fonts";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./custom.css";

export default DefaultTheme;
