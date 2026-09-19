/**
 * Assembles the GitHub Pages artifact from the single VitePress build.
 *
 * The site base is /proagents/ — the whole VitePress output (island home at
 * the root, docs beside it) maps 1:1 onto the Pages URL space, and VitePress
 * copies docs/public/ verbatim (branded 404.html with the old-/docs/-URL
 * redirect, the /app/ shim). The only assembly work left is the git-backed
 * catalog, copied beside the emitted index.html where the island's
 * catalog.ts derives it from BASE_URL.
 *
 * `npm run site:build` and .github/workflows/pages.yml run exactly this
 * script, so a local build and a CI build are byte-for-byte comparable.
 *
 * Usage: node scripts/assemble-site.mjs [--out site]
 * (run after `npm run docs:build`)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const outArg = process.argv.indexOf("--out");
const SITE = outArg === -1 ? "site" : (process.argv[outArg + 1] ?? "site");
const DOCS_DIST = "docs/.vitepress/dist";

function mustExist(dir, label) {
  if (!existsSync(dir)) {
    console.error(`assemble-site: ${label} not found at ${dir} — run its build first.`);
    process.exit(1);
  }
}

mustExist(DOCS_DIST, "docs build output");
mustExist(join(DOCS_DIST, "index.html"), "home page (docs/index.md)");
mustExist(join(DOCS_DIST, "studio.html"), "Studio island page (docs/studio.md)");
mustExist(join(DOCS_DIST, "404.html"), "branded 404 (docs/public/404.html)");
mustExist(join(DOCS_DIST, "app/index.html"), "/app/ shim (docs/public/app/index.html)");

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

// The whole VitePress output IS the site:
//   index.html      → hero + features
//   studio.html     → the Studio island page
//   guide/ cli/ …   → the docs pages
//   404.html        → branded catch-all + stale-URL redirects (from public/)
//   app/            → old-URL redirect shim → /studio (from public/)
//   assets/         → one bundle (docs + app code together)
cpSync(DOCS_DIST, SITE, { recursive: true });

// Git-backed catalog data → served at /proagents/registry/*.
// Items may carry subdirectories (knowledge references), so copy recursively.
// capabilities/index.json feeds the Studio Build mode's capability picker.
mkdirSync(join(SITE, "registry"), { recursive: true });
cpSync("registry/catalog.json", join(SITE, "registry/catalog.json"));
cpSync("registry/profiles", join(SITE, "registry/profiles"), { recursive: true });
cpSync("registry/crews", join(SITE, "registry/crews"), { recursive: true });
cpSync("registry/capabilities", join(SITE, "registry/capabilities"), { recursive: true });

console.log(`assemble-site: wrote ${resolve(SITE)} (VitePress site + Studio page + catalog)`);
