/**
 * GitHub integration for the marketplace SPA.
 *
 * Auth: OAuth Device Flow with the ProAgents GitHub App's Client ID.
 * Device flow is designed for input-limited clients and — importantly for a
 * static site — requires NO client secret, so it is safe to ship.
 * The user opens github.com/login/device, enters the code, and we poll.
 */

/**
 * Client ID of the ProAgents GitHub App — public by design (device flow needs
 * no secret). Overridable via VITE_GITHUB_APP_CLIENT_ID at build time (see
 * .env.example) so forks can ship their own app without code changes.
 */
export const GITHUB_APP_CLIENT_ID: string =
  (import.meta.env.VITE_GITHUB_APP_CLIENT_ID as string | undefined) ?? "Iv23liXnwihcnEIdrvJl";
const API = "https://api.github.com";

/**
 * The device-flow endpoints live on github.com, which sends NO CORS headers —
 * a browser fetch from the app origin always fails with "Failed to fetch"
 * (api.github.com does allow CORS, so every other call stays direct).
 * Login calls therefore go through a same-origin base:
 *   dev:  vite.config.ts proxies /github-oauth/* → https://github.com/*
 *   prod: deploy workers/github-oauth-proxy.mjs and set VITE_OAUTH_PROXY_URL
 * The base keeps the final path segments identical so a proxy only rewrites
 * its prefix.
 */
const OAUTH_BASE =
  ((import.meta.env.VITE_OAUTH_PROXY_URL as string | undefined) ?? "").replace(/\/+$/, "") || "/github-oauth";
const DEVICE_CODE_URL = `${OAUTH_BASE}/login/device/code`;
const TOKEN_URL = `${OAUTH_BASE}/login/oauth/access_token`;

/** fetch with a clear error when the CORS proxy is missing/misconfigured. */
async function oauthFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Error(
      "Could not reach the GitHub sign-in endpoint (network/CORS). " +
        "In dev the Vite proxy must serve /github-oauth; in production set VITE_OAUTH_PROXY_URL " +
        `to a deployed workers/github-oauth-proxy.mjs. Underlying error: ${(err as Error).message}`,
    );
  }
}

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
}

export async function startDeviceFlow(): Promise<DeviceFlowStart> {
  const res = await oauthFetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: GITHUB_APP_CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`device flow start failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  };
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    interval: body.interval ?? 5,
    expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
  };
}

export type DeviceFlowResult =
  | { status: "pending"; retryAfter?: number }
  | { status: "granted"; token: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number }
  | { status: "denied"; reason: string };

export async function pollDeviceFlow(flow: DeviceFlowStart): Promise<DeviceFlowResult> {
  const res = await oauthFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_APP_CLIENT_ID,
      device_code: flow.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (!res.ok) return { status: "pending" };
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (body.access_token) {
    return {
      status: "granted",
      token: body.access_token,
      refreshToken: body.refresh_token ?? "",
      expiresAt: Date.now() + (body.expires_in ?? 0) * 1000,
      refreshExpiresAt: Date.now() + (body.refresh_token_expires_in ?? 0) * 1000,
    };
  }
  // slow_down: GitHub demands the poll interval grow by 5s. Surface it so the
  // caller can back off instead of hammering toward an authorization_blocked.
  if (body.error === "slow_down") return { status: "pending", retryAfter: 5 };
  if (body.error === "authorization_pending") return { status: "pending" };
  if (body.error === "expired_token") return { status: "denied", reason: "The device code expired — try again." };
  if (body.error) return { status: "denied", reason: body.error_description ?? body.error };
  return { status: "pending" };
}

/** Exchange a refresh token for a fresh user access token (silent re-auth). */
export async function refreshAccessToken(refreshToken: string): Promise<DeviceFlowResult> {
  if (!refreshToken) return { status: "denied", reason: "no refresh token stored" };
  const res = await oauthFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_APP_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return { status: "denied", reason: `refresh failed: HTTP ${res.status}` };
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (body.access_token) {
    return {
      status: "granted",
      token: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (body.expires_in ?? 0) * 1000,
      refreshExpiresAt: Date.now() + (body.refresh_token_expires_in ?? 0) * 1000,
    };
  }
  return { status: "denied", reason: body.error_description ?? body.error ?? "refresh rejected" };
}

// ---------------------------------------------------------------------------
// Authenticated API helpers
// ---------------------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "proagents-marketplace",
  };
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string; name: string | null; avatar_url: string }> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GitHub user fetch failed: HTTP ${res.status}`);
  return (await res.json()) as { login: string; name: string | null; avatar_url: string };
}

export interface RepoInfo {
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  permissions: { push?: boolean };
}

/** Repos the user can push to (affiliation filter keeps the list usable). */
export async function listUserRepos(token: string): Promise<RepoInfo[]> {
  const out: RepoInfo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${API}/user/repos?affiliation=owner,collaborator&per_page=100&sort=pushed&page=${page}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`repo list failed: HTTP ${res.status}`);
    const batch = (await res.json()) as RepoInfo[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => r.permissions?.push !== false);
}

/** Read a file from the user's repo (returns null when missing). */
export async function getRepoFile(token: string, repo: string, path: string, ref?: string): Promise<{ content: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`file read failed: HTTP ${res.status}`);
  const body = (await res.json()) as { content: string; sha: string; encoding: string };
  return {
    content: body.encoding === "base64" ? atob(body.content.replace(/\n/g, "")) : body.content,
    sha: body.sha,
  };
}

/** Commit (create/update) a file in the user's repo via the Contents API. */
export async function putRepoFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha: string | null,
  branch?: string,
): Promise<void> {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: encoded,
      sha: sha ?? undefined,
      branch: branch ?? undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`commit failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/** Create an issue on a repository (used for marketplace proposals). */
export async function createIssue(token: string, repo: string, title: string, body: string, labels: string[]): Promise<{ number: number; html_url: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`issue creation failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { number: number; html_url: string };
}

/** Count matching workers, needed by the preview prompt builder. */
export async function listRepoTree(token: string, repo: string, ref?: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${ref ?? "HEAD"}?recursive=1`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`tree fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return body.tree.filter((e) => e.type === "blob").map((e) => e.path);
}

// ---------------------------------------------------------------------------
// Marketplace publishing — a PR, not a direct commit.
//
// The marketplace is a Git repository; publishing means getting the profile
// JSON INTO that repository, and the reviewable path is a pull request:
// branch → commit items/<slug>.json + catalog.json → open PR.
// CI validates the PR; maintainers merge to publish.
// ---------------------------------------------------------------------------

/** True when the marketplace already has an item with this slug. */
export async function slugExistsInMarketplace(repo: string, slug: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/.marketplace/items/${encodeURIComponent(slug)}.json`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "proagents-marketplace" },
  });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`slug check failed: HTTP ${res.status}`);
}

export interface CreatePrResult {
  url: string;
  branch: string;
  number: number;
}

/**
 * Publish a profile by opening a PR against the marketplace repo:
 * creates a branch, commits the item + catalog index, opens the PR.
 * Falls back to a fork when the token has no push access to the repo.
 */
export async function publishProfileAsPr(
  token: string,
  repo: string,
  slug: string,
  itemJson: string,
  catalogJson: string,
): Promise<CreatePrResult> {
  const base = await (async () => {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`repo fetch failed: HTTP ${res.status}`);
    return (await res.json()) as { default_branch: string; permissions?: { push?: boolean } };
  })();
  const branch = `proagent-profile/${slug}`;
  const refUrl = `https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;

  // Does the branch already exist (a retry)?
  const existingRef = await fetch(refUrl, { headers: authHeaders(token) });
  const branchExists = existingRef.ok;

  if (!branchExists) {
    let headRepo = repo;
    // No push access → create a fork and branch there.
    if (base.permissions?.push === false) {
      const forkRes = await fetch(`https://api.github.com/repos/${repo}/forks`, {
        method: "POST",
        headers: { ...authHeaders(token), "content-type": "application/json" },
        body: "{}",
      });
      if (!forkRes.ok) throw new Error(`fork creation failed: HTTP ${forkRes.status}`);
      const me = await getAuthenticatedUser(token);
      headRepo = `${me.login}/${repo.split("/")[1]}`;
    }
    const headRes = await fetch(`https://api.github.com/repos/${headRepo}/git/ref/heads/${base.default_branch}`, {
      headers: authHeaders(token),
    });
    if (!headRes.ok) throw new Error(`head ref fetch failed: HTTP ${headRes.status}`);
    const head = (await headRes.json()) as { object: { sha: string } };
    const createRef = await fetch(`https://api.github.com/repos/${headRepo}/git/refs`, {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: head.object.sha }),
    });
    if (!createRef.ok) {
      const t = await createRef.text();
      throw new Error(`branch creation failed: HTTP ${createRef.status} ${t.slice(0, 200)}`);
    }
    if (headRepo !== repo) {
      // Cross-repo PRs commit to the fork; putRepoFile handles fork paths too.
      await putRepoFile(token, headRepo, `.marketplace/items/${slug}.json`, itemJson, `profile: publish ${slug}`, null, branch);
      await putRepoFile(token, headRepo, ".marketplace/catalog.json", catalogJson, `profile: update catalog index for ${slug}`, null, branch);
    } else {
      await putRepoFile(token, repo, `.marketplace/items/${slug}.json`, itemJson, `profile: publish ${slug}`, null, branch);
      await putRepoFile(token, repo, ".marketplace/catalog.json", catalogJson, `profile: update catalog index for ${slug}`, null, branch);
    }
  } else {
    // Retry: update the existing branch files.
    const item = await getRepoFile(token, repo, `.marketplace/items/${slug}.json`, branch);
    await putRepoFile(token, repo, `.marketplace/items/${slug}.json`, itemJson, `profile: update ${slug}`, item?.sha ?? null, branch);
    const cat = await getRepoFile(token, repo, ".marketplace/catalog.json", branch);
    await putRepoFile(token, repo, ".marketplace/catalog.json", catalogJson, `profile: update catalog index for ${slug}`, cat?.sha ?? null, branch);
  }

  // Open the PR (idempotent-ish: reuse the existing PR when present).
  const prSearch = await fetch(`https://api.github.com/repos/${repo}/pulls?head=${repo.split("/")[0]}:${branch}&state=open`, {
    headers: authHeaders(token),
  });
  if (prSearch.ok) {
    const existing = (await prSearch.json()) as Array<{ number: number; html_url: string }>;
    if (existing.length > 0) return { url: existing[0].html_url, branch, number: existing[0].number };
  }
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      title: `[profile] add ${slug}`,
      head: branch,
      base: base.default_branch,
      body: [
        `Automated profile proposal via the [ProAgents marketplace builder](https://enzovezzaro.github.io/proagents/app/).`,
        ``,
        `Adds \`.marketplace/items/${slug}.json\` + catalog index entry. The deterministic validator runs on this PR.`,
        `Maintainers: verify the profession is sound, then merge to publish.`,
      ].join("\n"),
    }),
  });
  if (!prRes.ok) {
    const t = await prRes.text();
    throw new Error(`PR creation failed: HTTP ${prRes.status} ${t.slice(0, 200)}`);
  }
  const pr = (await prRes.json()) as { number: number; html_url: string };
  return { url: pr.html_url, branch, number: pr.number };
}
