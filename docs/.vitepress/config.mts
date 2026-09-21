import { defineConfig, type HeadConfig } from "vitepress";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * Dev-only: serve the git-backed catalog (repo registry/) at the same
 * URLs production uses. In production `scripts/assemble-site.mjs` copies the
 * files into the artifact; in dev there is no assembly step, so Vite's
 * history fallback would otherwise answer these requests with index.html.
 */
function catalogDevServer() {
  return {
    name: "proagents-catalog-dev",
    // Typing kept loose on purpose: Vite's plugin types pull Connect/Node
    // request types into this config, which VitePress's esbuild config
    // loader chokes on. The logic is 15 lines and dev-only.
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: () => void) => {
        const m = (req.url ?? "").split("?")[0].match(/^\/registry\/(.+)$/);
        if (!m) return next();
        const root = resolve(process.cwd(), "registry");
        const file = resolve(root, decodeURIComponent(m[1]));
        if (!file.startsWith(root + sep)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        // Missing files fall through to VitePress's pipeline: the router loads
        // the page module itself at /registry/index.md (docs/registry/index.md),
        // which must NOT be answered from the data folder.
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(file));
      });
    },
  };
}

/**
 * Per-page social/SEO head. The static `head` block below is site-wide only —
 * every page used to emit the same og:title/description and a RELATIVE og:image
 * (which crawlers drop, so shares rendered bare). transformHead derives the
 * real title/description per page and emits absolute-URL og/twitter/canonical
 * tags. Runs for both SSG and dev; the static og:* block was removed so tags
 * are never duplicated.
 */
const SITE_URL = "https://proagents.reposell.dev";
const DEFAULT_DESCRIPTION =
  "Professional profiles for existing coding agents — equip Claude Code, Codex, OpenCode and friends with professional expertise, methods, rules and verification.";

function pageHead(context: {
  pageData: { title?: string; description?: string; relativePath?: string; frontmatter?: Record<string, unknown> };
}): HeadConfig[] {
  const fm = context.pageData.frontmatter ?? {};
  // Redirect stubs (/marketplace) and JS-only app pages don't need cards;
  // 404 is rendered from a virtual page with no relativePath.
  if (fm.layout === false || fm.head?.some((t: unknown[]) => t[1]?.['http-equiv'] === 'refresh')) return [];
  const description = context.pageData.description || DEFAULT_DESCRIPTION;
  // VitePress pageData.title is already the composed H1/title.
  const title = context.pageData.title || "ProAgents";
  const isHome = context.pageData.relativePath === "index.md";
  const ogTitle = isHome ? "ProAgents — professional profiles for coding agents" : title;
  const path = (context.pageData.relativePath ?? "").replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
  const url = `${SITE_URL}/${path}`.replace(/\/$/, "/");
  const image = `${SITE_URL}/og-image.png`;
  return [
    ["link", { rel: "canonical", href: url }],
    ["meta", { property: "og:url", content: url }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "ProAgents" }],
    ["meta", { property: "og:title", content: ogTitle }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:image", content: image }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: ogTitle }],
    ["meta", { name: "twitter:description", content: description }],
    ["meta", { name: "twitter:image", content: image }],
  ];
}

export default defineConfig({
  lang: "en-US",
  title: "ProAgents",
  description:
    "Professional profiles for existing coding agents — equip Claude Code, Codex, OpenCode and friends with professional expertise, methods, rules and verification.",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    // Marks the runtime as JS-capable before first paint: the landing's
    // reveal animation only hides .pl-reveal nodes under html.js, so
    // no-JS visitors (and reduced-motion) always get the full content.
    ["script", {}, "document.documentElement.classList.add('js')"],
    // og:* / twitter:* / canonical are emitted per page by transformHead
    // (absolute URLs, real per-page titles). Only mode-agnostic tags live here.
    ["meta", { name: "theme-color", content: "#f7f8fd" }],
  ],
  // The site is served from a custom domain root (proagents.reposell.dev),
  // not a project path (enzovezzaro.github.io/proagents/). Base must stay "/"
  // or every hashed asset reference 404s against the custom domain.
  base: "/",
  cleanUrls: true,
  // Crawlability: sitemap.xml at the domain root (hostname must be absolute).
  // The /marketplace redirect stub stays out of the index (item urls are
  // relative — 'marketplace', the hostname is prefixed at write time).
  sitemap: {
    hostname: SITE_URL,
    transformItems: (items) => items.filter((i) => !i.url.replace(/^\//, "").split("/").pop()!.startsWith("marketplace")),
  },
  transformHead: async (context) => {
    return pageHead(context);
  },
  vite: {
    plugins: [catalogDevServer()],
    vue: {
      template: {
        compilerOptions: {
          // React JSX inside web/src is transformed by esbuild (below), not by
          // the Vue compiler — nothing to handle here, but keep the interop
          // explicit for future custom elements.
          isCustomElement: (tag: string) => tag === "root",
        },
      },
    },
    // The Studio island (web/src/ui) is React JSX imported from the Vue
    // theme. VitePress's esbuild config transforms .tsx with the classic JSX
    // factory by default, which would emit bare React.createElement calls
    // without React in scope; the island's pages import React explicitly, so
    // the automatic runtime matches the sources (web/tsconfig.json: react-jsx).
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "react",
    },
  },
  // Code surfaces follow the mode (see theme/custom.css): light mode is the
  // landing's .pa-manifest panel — paper canvas, dark mono text — so the
  // light Shiki theme is github-light; dark mode keeps the navy terminal
  // (.pa-proof__term voice) with github-dark tokens.
  markdown: {
    theme: { light: "github-light", dark: "github-dark" },
  },
  themeConfig: {
    // Light navbar gets the dark-ink lockup; dark mode swaps to the white-text
    // lockup via `.dark img.VPImage` in theme/custom.css.
    logo: "/logo-dark.png",
    // The logo lockup already carries the wordmark; a site title would render
    // "ProAgents ProAgents" next to it.
    siteTitle: false,
    nav: [
      { text: "Docs", link: "/guide/what-is-proagents", activeMatch: "/guide/" },
      { text: "Studio", link: "/studio", activeMatch: "/studio" },
      { text: "Registry", link: "/registry", activeMatch: "/registry" },
      { text: "CLI", link: "/cli/", activeMatch: "/cli/" },
      {
        text: "Context",
        link: "/context/",
        activeMatch: "/context/",
      },
      {
        text: "Sponsor",
        link: "https://github.com/sponsors/EnzoVezzaro",
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is ProAgents?", link: "/guide/what-is-proagents" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Agent operating guide", link: "/guide/agent-guide" },
          ],
        },
        {
          text: "Profiles",
          items: [
            { text: "Professional profiles", link: "/guide/profiles" },
          ],
        },
        {
          text: "Concepts",
          items: [
            { text: "The question engine", link: "/guide/question-engine" },
            { text: "Agent architecture & graphs", link: "/guide/architecture" },
            { text: "Self-improvement", link: "/guide/self-improvement" },
          ],
        },
        {
          text: "Benchmarking",
          items: [
            { text: "Benchmark system", link: "/guide/benchmarking" },
            { text: "Testing the benchmark", link: "/guide/benchmark-testing" },
          ],
        },
        {
          text: "Registry",
          items: [
            { text: "Registry & crews", link: "/guide/registry" },
          ],
        },
      ],
      "/cli/": [
        {
          text: "CLI",
          items: [
            { text: "Overview", link: "/cli/" },
            { text: "JSON interface", link: "/cli/json" },
          ],
        },
      ],
      "/registry": [
        {
          text: "Registry",
          items: [
            { text: "Browse the registry", link: "/registry/" },
            { text: "Registry & crews", link: "/guide/registry" },
          ],
        },
      ],
      "/context/": [
        {
          text: "Context Frameworks",
          items: [
            { text: "Overview", link: "/context/" },
            { text: "Write an adapter", link: "/context/adapters" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/EnzoVezzaro/proagents" },
      { icon: "npm", link: "https://www.npmjs.com/package/proagent" },
    ],
    // The text footer is retired: the site-wide close is the landing's navy
    // band (theme/SiteFooter.vue via the layout-bottom slot) — one footer
    // across both surfaces.
    outline: { level: [2, 3], label: "On this page" },
    docFooter: { prev: "Previous", next: "Next" },
    lastUpdated: true,
  },
});
