import { defineConfig, mergeConfig } from "vite";
import { aliases, appPlugins } from "./vite.shared.js";

// The marketplace SPA is the site root (/proagents/); the docs live at
// web/docs (base /proagents/docs/) and share this package's dev tooling —
// `npm run dev` runs the core watcher and both servers together. envDir
// points at the repo root so one .env file serves the CLI and the web build
// (only VITE_* vars are embedded; they must never hold secrets).

/** Dev-only proxy: github.com sends no CORS headers, so the SPA reaches the
 * OAuth device flow through this proxy. Production uses a Worker instead —
 * see workers/github-oauth-proxy.mjs + VITE_OAUTH_PROXY_URL (.env.example). */
const githubOAuthProxy = {
  server: {
    proxy: {
      "/github-oauth": {
        target: "https://github.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p: string) => p.replace(/^\/github-oauth/, ""),
      },
    },
  },
};

export default mergeConfig(
  defineConfig({
    base: "/proagents/",
    envDir: "..",
    envPrefix: "VITE_",
    plugins: appPlugins,
    resolve: { alias: aliases },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  }),
  defineConfig(githubOAuthProxy),
);
