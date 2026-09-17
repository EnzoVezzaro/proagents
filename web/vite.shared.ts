/**
 * Shared Vite config pieces for the merged site: the marketplace SPA lives at
 * web/ (site root /proagents/), the docs at web/docs (base /proagents/docs/)
 * and the git-backed catalog is served next to the SPA in production.
 *
 * Imported by web/vite.config.ts (app dev/build), web/vitest.config.ts
 * (component tests) and scripts/assemble-site.mjs (docs build via VitePress).
 * Keeping plugins/aliases here means dev, tests and CI assemble the exact same
 * artifact graph.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Repo root (this file is at web/vite.shared.ts). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `@/` → web/src. Lets SPA modules and tests import without ../../ chains.
 */
export const aliases = [{ find: "@", replacement: path.join(repoRoot, "web/src") }];

/**
 * Dev-only middleware: the catalog is Git-backed at the repo root
 * (.marketplace/) and production Pages serves it one level above the app
 * base — exactly what web/src/catalog.ts derives from BASE_URL. vite dev
 * serves nothing there, so mirror the Pages layout locally.
 */
export function marketplaceDevServer(): Plugin {
  const marketDir = path.join(repoRoot, ".marketplace");
  // Production Pages serves the catalog one level above the app base
  // (/proagents/.marketplace/…); serve that plus the site-root form.
  const prefixes = ["/.marketplace/", "/proagents/.marketplace/"];
  return {
    name: "proagents-marketplace-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0]!;
        const prefix = prefixes.find((p) => url.startsWith(p));
        if (!prefix) return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          return res.end();
        }
        const file = path.normalize(path.join(marketDir, decodeURIComponent(url.slice(prefix.length))));
        if (!file.startsWith(marketDir + path.sep)) {
          res.statusCode = 403;
          return res.end();
        }
        fs.readFile(file, (err, data) => {
          if (err) {
            res.statusCode = 404;
            return res.end("catalog file not found");
          }
          res.setHeader("content-type", "application/json");
          res.end(data);
        });
      });
    },
  };
}

/** Plugins for the app build (react + the catalog dev middleware). */
export const appPlugins = [react(), marketplaceDevServer()];
