import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "ProAgents",
  description:
    "Professional profiles for existing coding agents — equip Claude Code, Codex, OpenCode and friends with professional expertise, methods, rules and verification.",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "ProAgents" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Professional profiles for existing coding agents.",
      },
    ],
    ["meta", { property: "og:image", content: "/og-image.png" }],
    ["meta", { name: "theme-color", content: "#b9fb1d" }],
  ],
  base: "/proagents/",
  cleanUrls: true,
  themeConfig: {
    logo: "/logo.png",
    siteTitle: "ProAgents",
    nav: [
      { text: "Docs", link: "/guide/what-is-proagents", activeMatch: "/guide/" },
      { text: "Marketplace", link: "/app/" },
      { text: "CLI", link: "/cli/", activeMatch: "/cli/" },
      {
        text: "Context",
        link: "/context/",
        activeMatch: "/context/",
      },
      { text: "npm", link: "https://www.npmjs.com/package/proagent" },
      {
        text: "GitHub",
        link: "https://github.com/EnzoVezzaro/proagents",
      },
      {
        text: "❤ Sponsor",
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
          text: "Marketplace",
          items: [
            { text: "Marketplace & crews", link: "/guide/marketplace" },
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
    footer: {
      message:
        'Released under the <a href="/proagents/LICENSE.md">MIT License</a> · <a href="https://github.com/sponsors/EnzoVezzaro">❤ Sponsor on GitHub</a> · <a href="https://ko-fi.com/enzojuniorvezzaro">☕ Ko-fi</a>',
      copyright: "Copyright © 2026 ProAgents contributors",
    },
    outline: { level: [2, 3], label: "On this page" },
    docFooter: { prev: "Previous", next: "Next" },
    lastUpdated: true,
  },
});
