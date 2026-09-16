#!/usr/bin/env node
/**
 * Get (or refresh) a GitHub App user access token via the OAuth Device Flow.
 *
 *   npm run gh:token        # prints a code → authorize at github.com/login/device
 *
 * Writes to `.env` (gitignored):
 *   GITHUB_TOKEN              — user access token (API calls)
 *   GITHUB_TOKEN_EXPIRES_AT   — epoch seconds (0 when the app never expires)
 *   GITHUB_REFRESH_TOKEN      — silent re-auth when the access token expires
 *   GITHUB_REFRESH_EXPIRES_AT — epoch seconds
 *
 * If a valid GITHUB_REFRESH_TOKEN already exists in .env, this script
 * refreshes silently and exits — no browser round-trip. App user tokens
 * expire (8h by default); the refresh token (≈6 months) keeps both the CLI
 * and the SPA session alive without re-authorizing.
 */
import fs from "node:fs";
import path from "node:path";

const CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || "Iv23liXnwihcnEIdrvJl";
const ENV_FILE = path.join(process.cwd(), ".env");

const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

/** Upsert one KEY=value line in the .env text. */
function upsert(env, key, value) {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env}\n${line}\n`;
}

function writeEnv(env) {
  fs.writeFileSync(ENV_FILE, env, { mode: 0o600 });
  fs.chmodSync(ENV_FILE, 0o600);
}

function persist(token, expiresAt, refreshToken, refreshExpiresAt) {
  let env = "";
  try {
    env = fs.readFileSync(ENV_FILE, "utf8");
  } catch {
    console.warn("warning: no .env found — creating one from .env.example is recommended");
  }
  env = upsert(env, "GITHUB_TOKEN", token);
  env = upsert(env, "GITHUB_TOKEN_EXPIRES_AT", String(expiresAt));
  env = upsert(env, "GITHUB_REFRESH_TOKEN", refreshToken);
  env = upsert(env, "GITHUB_REFRESH_EXPIRES_AT", String(refreshExpiresAt));
  writeEnv(env);
}

async function verifyIdentity(token) {
  const me = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  }).then((r) => r.json());
  if (!me.login) throw new Error("token failed identity check");
  return me.login;
}

// ---------------------------------------------------------------------------
// Fast path: an existing refresh token exchanges silently.
// ---------------------------------------------------------------------------
let env = "";
try {
  env = fs.readFileSync(ENV_FILE, "utf8");
} catch {
  /* no .env yet — full flow below */
}
const storedRefresh = /^GITHUB_REFRESH_TOKEN=(.+)$/m.exec(env)?.[1]?.trim();

if (storedRefresh) {
  const res = await post("https://github.com/login/oauth/access_token", {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: storedRefresh,
  });
  if (res.access_token) {
    const who = await verifyIdentity(res.access_token);
    const accessExpires = Math.floor(Date.now() / 1000 + (res.expires_in ?? 0));
    const refreshExpires = Math.floor(Date.now() / 1000 + (res.refresh_token_expires_in ?? 0));
    persist(res.access_token, accessExpires, res.refresh_token ?? storedRefresh, refreshExpires);
    console.log(`✓ Refreshed silently as ${who}`);
    console.log(`✓ .env updated (access expires ${res.expires_in ? new Date(accessExpires * 1000).toISOString() : "never"})`);
    process.exit(0);
  }
  console.log(`refresh token rejected (${res.error ?? "unknown"}) — falling back to the device flow`);
}

// ---------------------------------------------------------------------------
// Full device flow.
// ---------------------------------------------------------------------------
const start = await post("https://github.com/login/device/code", { client_id: CLIENT_ID });
if (start.error) {
  console.error(`device flow unavailable: ${start.error} ${start.error_description ?? ""}`);
  console.error("Check that the GitHub App has Device Flow enabled.");
  process.exit(1);
}

console.log(`\n1. Open:  ${start.verification_uri}`);
console.log(`2. Code:  ${start.user_code}\n`);

let intervalMs = (start.interval ?? 5) * 1000;
const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
let token = null;
while (Date.now() < deadline && !token) {
  await new Promise((r) => setTimeout(r, intervalMs));
  const res = await post("https://github.com/login/oauth/access_token", {
    client_id: CLIENT_ID,
    device_code: start.device_code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (res.access_token) {
    token = res.access_token;
    var accessExpires = Math.floor(Date.now() / 1000 + (res.expires_in ?? 0));
    var refreshExpires = Math.floor(Date.now() / 1000 + (res.refresh_token_expires_in ?? 0));
    var refreshToken = res.refresh_token ?? "";
  } else if (res.error === "slow_down") {
    intervalMs += 5000; // RFC 8628: back off 5s per slow_down
  } else if (res.error && !["authorization_pending"].includes(res.error)) {
    console.error(`error: ${res.error} ${res.error_description ?? ""}`);
    process.exit(1);
  }
}
if (!token) {
  console.error("error: device code expired before authorization");
  process.exit(1);
}

const who = await verifyIdentity(token);
persist(token, accessExpires, refreshToken, refreshExpires);

console.log(`✓ Authorized as ${who}`);
console.log(`✓ .env updated (access expires ${accessExpires ? new Date(accessExpires * 1000).toISOString() : "never"})`);
console.log(`  Re-run npm run gh:token any time — it refreshes silently when possible.`);
