import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import type { CrewDefinition, MarketplaceCatalog, ProfileManifest } from "../../types.js";
import { catalogUrl } from "../../catalog.js";
import { hydrateProfile } from "../../profile-hydrate.js";
import { hydrateCrew } from "../../crew-hydrate.js";
import { ProfileDetail } from "./ProfileDetailPage.js";

function itemUrl(id: string): string {
  // Profile folder standard (profiles/<id>/profile.json).
  return catalogUrl(`profiles/${id}/profile.json`);
}

function crewUrl(id: string): string {
  // Crew folder standard (crews/<id>/crew.json).
  return catalogUrl(`crews/${id}/crew.json`);
}

export function CrewDetailPage(props: { id: string; ctx: AppCtx }): React.JSX.Element {
  const { id } = props;
  const [crew, setCrew] = useState<CrewDefinition | null>(null);
  const [profile, setProfile] = useState<ProfileManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Kind dispatch: the catalog index names the kind; the item file is a
    // profile manifest (profiles/<id>/profile.json) or a crew definition
    // (crews/<id>/crew.json).
    const loadItem = async (): Promise<{ item: unknown; base: string }> => {
      for (const url of [itemUrl(id), crewUrl(id)]) {
        const res = await fetch(url);
        if (res.ok) return { item: await res.json(), base: url.replace(/[^/]*$/, "") };
        if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
      }
      throw new Error("item not found");
    };
    Promise.all([
      fetch(catalogUrl("catalog.json")).then((r) => (r.ok ? (r.json() as Promise<MarketplaceCatalog>) : null)),
      loadItem(),
    ])
      .then(async ([catalog, loaded]) => {
        if (cancelled) return;
        const { item, base } = loaded;
        const meta = catalog?.items.find((i) => i.id === id);
        const isProfile = meta?.kind === "profile" || (typeof item === "object" && item !== null && "profile" in item);
        if (isProfile) {
          // Folder-standard manifests hold section paths — hydrate to content
          // (relative to items/<id>/) before rendering.
          const manifest = await hydrateProfile(item as ProfileManifest, base);
          if (!cancelled) setProfile(manifest);
        } else {
          // Crew folder manifests hold worker/mcp/graph paths — hydrate the
          // same way before rendering.
          const def = await hydrateCrew(item as Parameters<typeof hydrateCrew>[0], base);
          if (!cancelled) setCrew(def);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load "${id}" (${(err as Error).message}).`);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <a href="#/catalog" style={{ color: "var(--cyan)", fontSize: 13, textDecoration: "none" }}>← back to catalog</a>
        <div style={{ marginTop: 16 }}>
          <ErrorNote message={error} />
        </div>
      </div>
    );
  }
  if (profile) {
    return (
      <div>
        <a href="#/catalog" style={{ color: "var(--cyan)", fontSize: 13, textDecoration: "none" }}>← back to catalog</a>
        <ProfileDetail manifest={profile} />
      </div>
    );
  }
  if (!crew) return <p style={{ color: "var(--cream-dim)" }}>Loading…</p>;

  return (
    <div>
      <a href="#/catalog" style={{ color: "var(--cyan)", fontSize: 13, textDecoration: "none" }}>← back to catalog</a>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ margin: "0 0 8px" }}>{crew.name}</h1>
          <p style={{ color: "var(--cream-dim)", lineHeight: 1.6, margin: 0 }}>{crew.description}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {crew.tags.map((t) => (
              <span key={t} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 12px", fontSize: 12, color: "var(--cream-dim)" }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, minWidth: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ok)", textDecoration: "none" }}>Free · MIT</div>
          <div style={{ color: "var(--cream-dim)", fontSize: 12, marginBottom: 14 }}>v{crew.version} · by {crew.author} · {crew.workers.length} worker{crew.workers.length === 1 ? "" : "s"}</div>
          <a
            href={`#/preview/${encodeURIComponent(crew.id)}`}
            style={{ display: "block", textAlign: "center", background: "var(--grad)", color: "#ffffff", borderRadius: 10, padding: "11px 0", fontWeight: 700, textDecoration: "none", fontSize: 14 }}
          >
            Preview on your repo
          </a>
          <a
            href="https://github.com/sponsors/EnzoVezzaro"
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", textAlign: "center", marginTop: 10, border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 10, padding: "10px 0", textDecoration: "none", fontSize: 13 }}
          >
            Support the project
          </a>
        </div>
      </div>

      <h2 style={{ marginTop: 36 }}>Workers</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {crew.workers.map((w) => (
          <div key={w.id} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong>{w.name} <span style={{ color: "var(--cream-dim)", fontWeight: 400 }}>· {w.role}</span></strong>
              <span style={{ fontSize: 12, color: "var(--cream-dim)" }}>
                reads: {w.receivesFrom.join(", ") || "—"} → emits: {w.emits.join(", ") || "—"}
              </span>
            </div>
            <p style={{ color: "var(--cream-dim)", fontSize: 13, margin: "8px 0" }}>{w.description}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
              <Badge tone={w.permissions.write === "none" ? "safe" : "warn"}>write: {w.permissions.write}</Badge>
              <Badge tone={w.permissions.production === "write" ? "warn" : "safe"}>production: {w.permissions.production}</Badge>
              <Badge tone={w.permissions.secrets === "none" ? "safe" : "warn"}>secrets: {w.permissions.secrets}</Badge>
              {w.permissions.approvalGates && w.permissions.approvalGates.length > 0 && (
                <Badge tone="gate">approval: {w.permissions.approvalGates.join(", ")}</Badge>
              )}
              {w.mcpServers.map((m) => (
                <Badge key={m} tone="mcp">mcp: {m}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {crew.mcpServers.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>MCP servers</h2>
          <ul style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.8 }}>
            {crew.mcpServers.map((m) => (
              <li key={m.name}>
                <code style={{ color: "var(--cyan)" }}>{m.name}</code> — {m.transport}
                {m.url ? ` · ${m.url}` : m.command ? ` · ${m.command} ${(m.args ?? []).join(" ")}` : ""}
                {m.allowedTools && m.allowedTools.length > 0 ? ` · tools: ${m.allowedTools.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Install into your repo</h2>
      <p style={{ color: "var(--cream-dim)", fontSize: 14 }}>One command in the repo root — pulls the crew, writes skills and merges .mcp.json:</p>
      <pre style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 13, overflowX: "auto" }}>
        <code>npx proagent crew install {crew.id}</code>
      </pre>
      <p style={{ color: "var(--cream-dim)", fontSize: 12 }}>
        Or install from this page with GitHub sign-in: open the item and press <strong>Install to repo</strong> in the preview flow.
      </p>
    </div>
  );
}

function Badge(props: { children: React.ReactNode; tone: "safe" | "warn" | "gate" | "mcp" }): React.JSX.Element {
  const colors: Record<string, { fg: string; bg: string }> = {
    safe: { fg: "var(--ok)", bg: "rgba(61,220,151,0.08)" },
    warn: { fg: "#ffb454", bg: "rgba(255,180,84,0.08)" },
    gate: { fg: "#79c0ff", bg: "rgba(121,192,255,0.08)" },
    mcp: { fg: "var(--cyan)", bg: "rgba(12,204,204,0.08)" },
  };
  const c = colors[props.tone];
  return (
    <span style={{ color: c.fg, background: c.bg, border: `1px solid ${c.fg}33`, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>
      {props.children}
    </span>
  );
}
