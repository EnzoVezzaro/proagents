/**
 * Assembles the complete GitHub Pages artifact into site/ — the marketplace
 * SPA at the site root, the docs under /docs/, the git-backed catalog next to
 * the SPA, the /app/ redirect shim and the branded 404 with stale-URL
 * recovery. `npm run site:build` and .github/workflows/pages.yml run exactly
 * this script, so a local build and a CI build are byte-for-byte comparable.
 *
 * Usage: node scripts/assemble-site.mjs [--out site]
 * (run after `npm run app:build` and `npm run docs:build`)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const outArg = process.argv.indexOf("--out");
const SITE = outArg === -1 ? "site" : (process.argv[outArg + 1] ?? "site");
const APP_DIST = "web/dist";
const DOCS_DIST = "web/docs/.vitepress/dist";

function mustExist(dir, label) {
  if (!existsSync(dir)) {
    console.error(`assemble-site: ${label} not found at ${dir} — run its build first.`);
    process.exit(1);
  }
}

mustExist(APP_DIST, "SPA build output");
mustExist(DOCS_DIST, "docs build output");

rmSync(SITE, { recursive: true, force: true });
mkdirSync(join(SITE, "docs"), { recursive: true });

// SPA at the artifact root.
cpSync(APP_DIST, SITE, { recursive: true });
// Docs under /docs/.
cpSync(DOCS_DIST, join(SITE, "docs"), { recursive: true });

// Git-backed catalog data → served at /.marketplace/* next to the SPA
// (copied from the source of truth).
mkdirSync(join(SITE, ".marketplace", "items"), { recursive: true });
cpSync(".marketplace/catalog.json", join(SITE, ".marketplace/catalog.json"));
for (const item of existsSync(".marketplace/items") ? readdirSync(".marketplace/items") : []) {
  cpSync(join(".marketplace/items", item), join(SITE, ".marketplace/items", item));
}

// Redirect shim: old /proagents/app/<path> links (READMEs, published PRs,
// search engines) land on the same hash route in the new root location.
// Keep byte-identical to the copy in .github/workflows/pages.yml.
mkdirSync(join(SITE, "app"), { recursive: true });
writeFileSync(
  join(SITE, "app/index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ProAgents Marketplace — moved</title>
    <script>
      (function () {
        var dest = "../";
        if (window.location.hash && window.location.hash !== "#/") dest += window.location.hash;
        window.location.replace(dest);
      })();
    </script>
  </head>
  <body>
    The marketplace moved to the site root. <a href="../">Continue</a>.
  </body>
</html>
`,
);

// Branded 404 for the whole artifact. GitHub Pages serves /404.html for any
// miss while keeping the attempted URL, so stale pre-relocation doc links
// (/proagents/guide/…) redirect into /proagents/docs/… (every old page name
// still exists there); anything else gets the brand page with the two real
// entry points. Keep byte-identical to the copy in .github/workflows/pages.yml.
writeFileSync(
  join(SITE, "404.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#000024" />
    <title>Page not found — ProAgents</title>
    <link rel="icon" type="image/png" href="/proagents/favicon-32.png" />
    <style>
      :root {
        --ink: #000024;
        --cream: #f4f7ff;
        --cream-dim: #9aa6cf;
        --line: #17245c;
        --cyan: #0ccccc;
        --grad: linear-gradient(120deg, #0048e4 0%, #3b2fe0 55%, #5424e4 100%);
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: var(--ink); color: var(--cream); }
      body {
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        padding: 24px;
      }
      main {
        max-width: 560px;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 40px 44px;
        background: #040a33;
      }
      h1 { font-size: 28px; margin: 22px 0 10px; letter-spacing: -0.02em; }
      p { margin: 0 0 8px; color: var(--cream-dim); line-height: 1.55; }
      p code { color: var(--cream); font-size: 0.92em; }
      .actions { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
      .btn {
        display: inline-block;
        padding: 10px 18px;
        border-radius: 9px;
        background: var(--grad);
        color: #ffffff;
        font-weight: 600;
        font-size: 14px;
        text-decoration: none;
      }
      .btn.ghost {
        background: transparent;
        border: 1px solid var(--line);
        color: var(--cream);
        font-weight: 500;
      }
      .btn:hover { filter: brightness(1.12); }
      :focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
      @media (max-width: 560px) { main { padding: 28px 24px; } }
    </style>
    <script>
      (function () {
        var m = location.pathname.match(/^\\/proagents\\/(guide|cli|context|license)(\\/.*)?$/);
        if (m) location.replace("/proagents/docs/" + m[1] + (m[2] || "/"));
      })();
    </script>
  </head>
  <body>
    <main>
      <img src="/proagents/logo.png" alt="ProAgents" width="132" height="42" />
      <h1>Page not found</h1>
      <p>The docs moved from <code>/proagents/</code> to <code>/proagents/docs/</code> — old documentation links redirect there automatically.</p>
      <div class="actions">
        <a class="btn" href="/proagents/">Open the marketplace</a>
        <a class="btn ghost" href="/proagents/docs/">Read the docs</a>
      </div>
    </main>
  </body>
</html>
`,
);

console.log(`assemble-site: wrote ${resolve(SITE)} (SPA root + docs/ + catalog + shim + 404)`);
