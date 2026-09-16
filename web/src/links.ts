/**
 * Cross-surface links for the marketplace SPA.
 *
 * DOCS_URL is environment-aware: while developing the SPA, the nav should hit
 * the locally running VitePress docs (`npm run docs:build && npm run
 * docs:preview` serves http://localhost:4173/proagents/docs/); the production
 * bundle points at the deployed docs site. VITE_DOCS_URL overrides both —
 * useful for forks that deploy their own docs (see .env.example).
 */
const PROD_DOCS_URL = "https://enzovezzaro.github.io/proagents/docs/";
const DEV_DOCS_URL = "http://localhost:4173/proagents/docs/";

export const DOCS_URL: string =
  (import.meta.env.VITE_DOCS_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? DEV_DOCS_URL : PROD_DOCS_URL);

export const SOURCE_URL = "https://github.com/EnzoVezzaro/proagents";
