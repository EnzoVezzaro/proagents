import type { ProfileManifest, ProfileMcpServer } from "./types.js";

/**
 * Profile-draft logic — the pure, testable core of the profile builder
 * wizard: the client-side PA03x mirror that gates the Ship tab.
 */

const SLUG_OK = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const REGISTRY_REF = /^(npm|github):\S+$/;

/** Client-side mirror of the deterministic profile validator (PA03x subset). */
export function validateProfileDraft(p: ProfileManifest, takenSlugs?: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (!p.profile.slug || !SLUG_OK.test(p.profile.slug)) problems.push("Slug must be a lowercase kebab-case slug (PA031).");
  if (!p.profile.name) problems.push("Name is required (PA030).");
  if (!/^\d+\.\d+\.\d+/.test(p.version)) problems.push("Profile version must be semver (PA032).");
  if (!p.identity.title) problems.push("Identity title is required (PA030).");
  if (!p.expertise || p.expertise.length === 0) problems.push("Add at least one expertise area (PA033).");
  if (!p.tools.required || p.tools.required.length === 0) problems.push("Add at least one required tool (PA034).");
  if (!p.verification.required || p.verification.required.length === 0) problems.push("Add at least one verification requirement (PA035).");
  const forbidden = new Set(p.tools.forbidden ?? []);
  for (const t of p.tools.required) {
    if (forbidden.has(t)) problems.push(`Tool "${t}" is both required and forbidden (PA036).`);
  }
  // PA039 — MCP servers (client-side mirror of the core validator).
  const mcpNames = new Set<string>();
  for (const [i, s] of (p.tools.mcp ?? []).entries()) {
    const label = s?.name || `mcp[${i}]`;
    if (s?.name && mcpNames.has(s.name)) {
      problems.push(`Duplicate MCP server name: "${s.name}" (PA039).`);
      continue;
    }
    if (s?.name) mcpNames.add(s.name);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s?.name ?? "")) problems.push(`MCP server "${label}" needs a lowercase kebab-case name (PA039).`);
    if (!s?.transport) problems.push(`MCP server "${label}" needs a transport (PA039).`);
    else if (s.transport === "stdio" && !s.command) problems.push(`MCP server "${s.name}" uses stdio but has no command (PA039).`);
    else if (s.transport !== "stdio" && !s.url) problems.push(`MCP server "${s.name}" uses ${s.transport} but has no url (PA039).`);
  }
  // PA040 — registry refs (tools.packages and registry-shaped skills).
  for (const [i, pkg] of (p.tools.packages ?? []).entries()) {
    if (!REGISTRY_REF.test(pkg?.registry ?? "")) problems.push(`Package ${i + 1}: "${pkg?.registry ?? ""}" is not a registry ref — use npm:<pkg>[@v] or github:owner/repo (PA040).`);
  }
  for (const [i, sk] of (p.skills ?? []).entries()) {
    if (sk.includes(":") && !REGISTRY_REF.test(sk)) problems.push(`skills[${i}] "${sk}" looks like a registry ref but is not npm:/github: (PA040).`);
  }
  // Marketplace collision — a slug that already exists cannot be published.
  if (takenSlugs?.has(p.profile.slug)) problems.push(`Slug "${p.profile.slug}" already exists in the marketplace — pick another (PA038).`);
  return problems;
}

export type McpHealth = { ok: boolean; detail: string };

/**
 * Health-check a configured MCP server from the browser: stdio commands are
 * only shape-checked (browsers cannot spawn processes), while http/sse
 * servers get a real fetch probe with a hard timeout.
 */
export async function checkMcpHealth(server: ProfileMcpServer): Promise<McpHealth> {
  if (server.transport === "stdio") {
    return server.command
      ? { ok: true, detail: `command present: ${server.command} (executable not probed from the browser)` }
      : { ok: false, detail: "stdio server has no command" };
  }
  const url = server.url;
  if (!url) return { ok: false, detail: `${server.transport} server has no url` };
  const probe = /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(probe, { method: "GET", mode: "no-cors", signal: controller.signal });
    clearTimeout(timer);
    // no-cors gives an opaque response (status 0) — reaching it at all means the host answers.
    return { ok: res.type === "opaque" || res.ok, detail: res.type === "opaque" ? "host reachable (opaque CORS probe)" : `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, detail: (err as Error).name === "AbortError" ? "timed out after 8s" : (err as Error).message };
  }
}
