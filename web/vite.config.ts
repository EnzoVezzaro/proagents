import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: the app is served from /proagents/app/.
// envDir points at the repo root so one .env file serves both the CLI
// (secrets, gitignored) and the web build (only VITE_* vars are embedded —
// they must never hold secrets).

// Dev-only middleware: the catalog is Git-backed at the repo root
// (.marketplace/) and production Pages serves it one level above the app
// base — exactly what web/src/catalog.ts derives from BASE_URL. vite dev
// serves nothing there, so mirror the Pages layout locally.
function marketplaceDevServer(): Plugin {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
        const file = path.normalize(
          path.join(marketDir, decodeURIComponent(url.slice(prefix.length))),
        );
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

export default defineConfig({
  base: "/proagents/app/",
  envDir: "..",
  envPrefix: "VITE_",
  plugins: [react(), marketplaceDevServer()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
