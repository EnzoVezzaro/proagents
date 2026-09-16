import React, { useEffect, useMemo, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ItemCard, EmptyState, ErrorNote } from "../cards.js";
import type { MarketplaceCatalog } from "../../types.js";

/** Path of the Git-backed catalog relative to the app (site root). */
import { CATALOG_URL } from "../../catalog.js";

export function CatalogPage(_props: { ctx: AppCtx }): React.JSX.Element {
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`catalog fetch failed: HTTP ${r.status}`);
        return r.json() as Promise<MarketplaceCatalog>;
      })
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of catalog?.items ?? []) for (const t of item.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [catalog]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.items ?? []).filter((i) => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q));
      const matchesTag = !tag || i.tags.includes(tag);
      return matchesQ && matchesTag;
    });
  }, [catalog, query, tag]);

  if (error) {
    return (
      <div>
        <h1>Catalog</h1>
        <ErrorNote message={`Could not load the marketplace catalog (${error}). If the site was just deployed, wait a minute and reload — otherwise open an issue at github.com/EnzoVezzaro/proagents.`} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.02em" }}>
          Professional specs, ready to equip
        </h1>
      </div>
      <p style={{ color: "var(--cream-dim)", fontSize: 14, maxWidth: 640, lineHeight: 1.6, margin: "6px 0 0" }}>
        Profile and crew <strong style={{ color: "var(--cream)", fontWeight: 600 }}>specs</strong> your coding agent
        executes — equip one with <code style={{ color: "var(--cyan)" }}>npx proagent equip &lt;slug&gt;</code>, or
        compose a crew from professions. Free · MIT · every listing is a reviewable JSON file in the open repo.
      </p>

      <div style={{ display: "flex", gap: 10, margin: "22px 0 6px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search profiles, crews, tags…"
          aria-label="Search the marketplace"
          style={{ flex: 1, minWidth: 240, background: "var(--ink-2)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}
        />
        <a
          href="#/build-profile"
          style={{ background: "transparent", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          + Build a profile
        </a>
        <a
          href="#/build"
          style={{ background: "var(--grad)", color: "#ffffff", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          + Build a crew
        </a>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 24px" }}>
        <TagChip label="all" active={tag === null} onClick={() => setTag(null)} />
        {tags.map(([t, count]) => (
          <TagChip key={t} label={`${t} (${count})`} active={tag === t} onClick={() => setTag(t)} />
        ))}
      </div>

      {catalog === null ? (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }} aria-label="Loading">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, minHeight: 148 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={query || tag ? "No matches" : "The catalog is empty"}
          body={
            query || tag
              ? "Try a different search or clear the tag filter — or build the crew you wish existed."
              : "Be the first: build a crew in minutes and file a proposal — publishing is a GitHub issue away."
          }
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TagChip(props: { label: string; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      style={{
        background: props.active ? "var(--accent-soft)" : "var(--ink-2)",
        color: props.active ? "var(--cyan)" : "var(--cream-dim)",
        border: `1px solid ${props.active ? "var(--cyan)" : "var(--line)"}`,
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}
