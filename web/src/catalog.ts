/**
 * Catalog URLs — derived from Vite's BASE_URL instead of fragile
 * window.location relative-path math.
 *
 * The app is mounted inside the single VitePress site (base /proagents/), and
 * the Git-backed catalog is copied beside the emitted index.html:
 *
 *   prod: BASE_URL "/proagents/"  →  /proagents/.marketplace/…
 *   dev:  same base, served by vitepress dev from docs/public
 *   test: BASE_URL "/"            →  /.marketplace/… (jsdom origin)
 */

const SITE_ROOT = new URL(import.meta.env.BASE_URL, window.location.href).href;

/** Full URL of a catalog file: "catalog.json" or "items/<id>.json". */
export function catalogUrl(file: string): string {
  return new URL(`.marketplace/${file}`, SITE_ROOT).href;
}

export const CATALOG_URL = catalogUrl("catalog.json");
