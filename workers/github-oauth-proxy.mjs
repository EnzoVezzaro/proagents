/**
 * CORS proxy for the ProAgents Studio's GitHub device-flow login.
 *
 * `github.com/login/*` sends no CORS headers, so the browser SPA cannot call
 * it directly ("Failed to fetch"). `api.github.com` DOES allow CORS and is
 * called directly by the SPA — only these two login endpoints need relaying.
 *
 * Deploy, then set VITE_OAUTH_PROXY_URL to the Worker URL at build time:
 *
 *   cd workers && npx wrangler deploy github-oauth-proxy.mjs --name proagents-oauth --compatibility-date 2026-01-01
 *
 * No secrets involved: the device flow needs only the public Client ID, which
 * the SPA already embeds. The proxy strictly allow-lists the two endpoints
 * (anything else → 404) so it cannot be abused as a general-purpose relay.
 */

const ALLOWED_PATHS = new Set(["/login/device/code", "/login/oauth/access_token"]);

/** Accept the bare path (recommended) or the dev-proxy-style prefix. */
function targetPath(pathname) {
  return pathname.startsWith("/github-oauth/") ? pathname.slice("/github-oauth".length) : pathname;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }
    const path = targetPath(url.pathname);
    if (request.method !== "POST" || !ALLOWED_PATHS.has(path)) {
      return cors(new Response("not found", { status: 404 }));
    }

    const upstream = await fetch(`https://github.com${path}`, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/x-www-form-urlencoded",
        accept: request.headers.get("accept") ?? "application/json",
        "user-agent": "proagents-oauth-proxy",
      },
      body: await request.text(),
    });
    return cors(
      new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      }),
    );
  },
};

function cors(res) {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type, accept");
  res.headers.set("cache-control", "no-store");
  return res;
}
