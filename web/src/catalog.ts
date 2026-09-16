/**
 * Catalog URLs — derived from Vite's BASE_URL instead of fragile
 * window.location relative-path math.
 *
 * The SPA is the Pages site root, so the Git-backed catalog lives beside it:
 *
 *   prod: BASE_URL "/proagents/"    →  /proagents/.marketplace/…
 *   dev:  BASE_URL "/"              →  /.marketplace/…   (vite dev middleware)
 */

const APP_BASE = new URL(import.meta.env.BASE_URL, window.location.href).href;
/** Site root that serves the dist: the app base itself. */
const SITE_ROOT = APP_BASE;

/** Full URL of a catalog file: "catalog.json" or "items/<id>.json". */
export function catalogUrl(file: string): string {
  return new URL(`.marketplace/${file}`, SITE_ROOT).href;
}

export const CATALOG_URL = catalogUrl("catalog.json");
