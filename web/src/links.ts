/**
 * Cross-surface links for the Studio app — which lives INSIDE the
 * VitePress site as a client-only island. "Docs" is no longer another origin:
 * the app navigates between app routes and doc pages with plain relative
 * hrefs resolved against the shared base (the domain root in production —
 * proagents.reposell.dev — and the vitepress dev server root in development).
 *
 * VITE_DOCS_URL, if set, overrides the doc route prefix (forks serving docs
 * elsewhere) — see .env.example.
 */

/** The docs route prefix — the site base itself in the merged site. */
export const DOCS_BASE: string =
  (import.meta.env.VITE_DOCS_URL as string | undefined)?.trim().replace(/\/+$/, "") ||
  import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Doc pages (relative to the site base). */
export const docsUrl = (route: string): string => `${DOCS_BASE}/${route.replace(/^\/+/, "")}`;

/** Home doc page, for the nav "Docs" link. */
export const DOCS_URL = docsUrl("guide/what-is-proagents");

/** The repo. */
export const SOURCE_URL = "https://github.com/EnzoVezzaro/proagents";

/** Site-base-resolved asset path (logo lockup etc.). */
export const assetUrl = (name: string): string =>
  `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
