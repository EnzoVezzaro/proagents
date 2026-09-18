import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote, EmptyState } from "../cards.js";
import type { CrewDefinition, CrewDefinitionSource, MarketplaceCatalog } from "../../types.js";
import { hydrateCrew } from "../../crew-hydrate.js";

import { CATALOG_URL, catalogUrl } from "../../catalog.js";

export function DashboardPage(props: { ctx: AppCtx; user: { login: string } | null; onOpenSettings: () => void }): React.JSX.Element {
  const { user } = props;
  const [mine, setMine] = useState<CrewDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(CATALOG_URL)
      .then((r) => r.json() as Promise<MarketplaceCatalog>)
      .then(async (catalog) => {
        if (!user) return;
        // Authors see their own listings (catalog is public; authorship filter
        // is by author name until a server-side identity layer exists).
        const definitions = await Promise.all(
          catalog.items
            .filter((i) => i.author.toLowerCase() === user.login.toLowerCase())
            .map(async (i) => {
              // Folder standard first (crew.json for crews, profile.json for
              // profiles), flat legacy fallback.
              const base = catalogUrl(`items/${i.id}/`);
              for (const rel of ["crew.json", "profile.json", `../${i.id}.json`]) {
                const res = await fetch(new URL(rel, base).href);
                if (!res.ok) continue;
                const json = (await res.json()) as CrewDefinitionSource | { profile?: unknown };
                if ("profile" in json) return null; // profile item — not a crew listing
                return hydrateCrew(json as CrewDefinitionSource, base);
              }
              return null;
            }),
        );
        setMine(definitions.filter((c): c is NonNullable<typeof c> => c !== null));
      })
      .catch((err) => setError((err as Error).message));
  }, [user]);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Dashboard</h1>
      {!user ? (
        <>
          <p style={{ color: "var(--cream-dim)" }}>Sign in with GitHub to manage your crews.</p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "10px 0 4px" }}>
            <button
              onClick={props.onOpenSettings}
              style={{ background: "var(--grad)", color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            >
              Sign in with GitHub
            </button>
            <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>opens Settings → GitHub account</span>
          </div>
          <ErrorNote message="Not signed in — publishing crews requires a token with repo write access." />
        </>
      ) : (
        <p style={{ color: "var(--cream-dim)" }}>Signed in as <strong style={{ color: "var(--cream)" }}>{user.login}</strong></p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, margin: "24px 0" }}>
        <a href="#/builder" style={{ background: "var(--grad)", color: "#ffffff", borderRadius: 14, padding: 24, textDecoration: "none", boxShadow: "0 8px 28px rgba(0, 72, 228, 0.35)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>Build your crew</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.88)" }}>Assemble workers, permissions, MCP servers and context — then publish to the marketplace or export the JSON.</p>
        </a>
        <a href="#/preview" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 14, padding: 24, textDecoration: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Preview on a repo</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--cream-dim)", lineHeight: 1.5 }}>Run any marketplace crew against one of your repositories with your own provider/model.</p>
        </a>
        <button onClick={props.onOpenSettings} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 14, padding: 24, textAlign: "left", cursor: "pointer" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Settings</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--cream-dim)", lineHeight: 1.5 }}>Provider & model keys and your GitHub login — stored only in this browser.</p>
        </button>
      </div>

      <h2 style={{ fontSize: 18 }}>Your published crews</h2>
      {error && <ErrorNote message={error} />}
      {mine.length === 0 ? (
        <EmptyState title="Nothing published yet" body="Build a crew in the GUI, then publish it — the marketplace is a Git-backed catalog in the open repo, so publishing is a commit anyone can audit." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {mine.map((c) => (
            <a key={c.id} href={`#/item/${encodeURIComponent(c.id)}`} style={{ display: "flex", justifyContent: "space-between", background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, textDecoration: "none", color: "var(--cream)", flexWrap: "wrap", gap: 8 }}>
              <span><strong>{c.name}</strong> <span style={{ color: "var(--cream-dim)" }}>· v{c.version} · {c.workers.length} workers</span></span>
              <span style={{ color: "var(--ok)", fontSize: 13 }}>free · MIT</span>
            </a>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Install any crew from your terminal</h2>
      <pre style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 13, overflowX: "auto" }}>
        <code>npx proagent crew install &lt;crew-id&gt;</code>
      </pre>
    </div>
  );
}
