import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import {
  emptyCrew,
  slugify,
  type CrewContext,
  type CrewDefinition,
  type CrewMcpServer,
  type CrewPermissions,
  type CrewWorker,
  type MarketplaceCatalog,
} from "../../types.js";
import { CATALOG_URL } from "../../catalog.js";
import { issueBody, issueTitle } from "../../proposal.js";
import { newWorker, renameMcpServer, stripEmptyContexts, validateCrewDraft } from "../../crew-draft.js";
import { btnSoft } from "../tokens.js";
import { ListField } from "../ListField.js";

/**
 * Crew builder — the GUI counterpart of the CLI interview. Agentic-first:
 * every worker gets an explicit permission model, MCP bindings, context
 * scopes and a handoff graph; the output is the same CrewDefinition JSON the
 * CLI installs, so a crew built here runs anywhere `proagent crew install`
 * runs.
 */

const btn: React.CSSProperties = { background: "var(--grad)", color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--cream-dim)", marginBottom: 4, marginTop: 10, textTransform: "uppercase" as const, letterSpacing: 0.4 };

/** Client-side mirror of crewProblems lives in crew-draft.ts (tested). */

export function BuilderPage(props: { ctx: AppCtx }): React.JSX.Element {
  const { settings, navigate } = props.ctx;
  const [crew, setCrew] = useState<CrewDefinition>(() => {
    // A draft from the build-entry (repo analysis) lands here via sessionStorage;
    // otherwise restore the in-progress draft so reloads don't lose work.
    try {
      const incoming = sessionStorage.getItem("proagents-builder-draft");
      if (incoming) {
        sessionStorage.removeItem("proagents-builder-draft");
        sessionStorage.removeItem("proagents-crew-draft");
        const parsed = JSON.parse(incoming) as CrewDefinition;
        if (parsed && Array.isArray(parsed.workers) && parsed.workers.length > 0) return parsed;
      }
      const saved = sessionStorage.getItem("proagents-crew-draft");
      if (saved) {
        const parsed = JSON.parse(saved) as CrewDefinition;
        if (parsed && Array.isArray(parsed.workers)) return parsed;
      }
    } catch {
      /* fall through to empty */
    }
    return emptyCrew("");
  });
  const [tab, setTab] = useState<"identity" | "workers" | "mcp" | "graph" | "ship">(() => {
    // With a prefilled draft, land the user on Identity to confirm name/author first.
    try {
      if (sessionStorage.getItem("proagents-builder-draft")) return "identity";
    } catch { /* ignore */ }
    return "identity";
  });
  const [problems, setProblems] = useState<string[] | null>(null);
  const [publishState, setPublishState] = useState<string>("");

  // Draft persistence — a reload or accidental navigation must not lose work.
  const draftKey = "proagents-crew-draft";
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(crew));
    } catch { /* storage unavailable */ }
  }, [crew]);

  const update = (patch: Partial<CrewDefinition>) => setCrew((c) => ({ ...c, ...patch, updatedAt: new Date().toISOString() }));
  const updateWorker = (id: string, patch: Partial<CrewWorker>) =>
    setCrew((c) => ({ ...c, workers: c.workers.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));

  const startOver = () => {
    if (!window.confirm("Discard this draft and start a new crew?")) return;
    try { sessionStorage.removeItem(draftKey); sessionStorage.removeItem("proagents-builder-draft"); } catch { /* ignore */ }
    setCrew(emptyCrew(crew.author));
    setTab("identity");
    setProblems(null);
    setPublishState("");
  };

  const exportJson = () => {
    // Downloading an invalid spec just ships the problem downstream (the CLI
    // rejects it on the next step) — validate first and surface problems.
    const errs = validateCrewDraft(crew);
    setProblems(errs);
    if (errs.length > 0) return;
    // Drop context bindings with no scope — an empty placeholder row would
    // ship a meaningless binding (and older drafts still carry one).
    const clean = stripEmptyContexts(crew);
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${crew.id || "crew"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Publish = file a marketplace proposal issue on the catalog repo. The
   * repository's CI validates the embedded JSON instantly; a maintainer merge
   * comment (`/publish`) commits it to the catalog and Pages serves it.
   */
  const publish = async () => {
    const errs = validateCrewDraft(crew);
    setProblems(errs);
    if (errs.length > 0) return;
    if (!settings.githubToken) {
      setPublishState("Sign in with GitHub in Settings to publish — publishing files a proposal issue on the catalog repo.");
      return;
    }
    setPublishState("Filing marketplace proposal…");
    try {
      const { createIssue } = await import("../../github.js");
      const repo = (import.meta.env.VITE_MARKET_REPO as string | undefined) ?? "EnzoVezzaro/proagents";
      const res = await createIssue(settings.githubToken, repo, issueTitle(crew), issueBody(crew), ["crew-proposal"]);
      setPublishState(`✓ Proposal filed: ${res.html_url}\nCI validates it within seconds. A maintainer merges it with /publish and it appears in the marketplace.`);
    } catch (err) {
      const msg = (err as Error).message;
      setPublishState(
        msg.includes("422") || msg.includes("410")
          ? `Could not file the issue (${msg.slice(0, 120)}). The repo may have issues disabled — export the JSON and attach it to a proposal manually.`
          : `Publish failed: ${msg}`,
      );
    }
  };

  const tabs: Array<[typeof tab, string]> = [
    ["identity", "1 · Identity"],
    ["workers", `2 · Workers (${crew.workers.length})`],
    ["mcp", `3 · MCP (${crew.mcpServers.length})`],
    ["graph", "4 · Handoffs"],
    ["ship", "5 · Ship"],
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Build your crew</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        You are building a <strong>crew spec</strong> — workers with a profession, permissions,
        MCP servers, context scopes and a handoff graph. Not the agent itself: your harness
        (Claude Code, Codex, …) executes it. The CLI hands the spec over: <code>npx proagent crew install</code>.
      </p>

      <div style={{ display: "flex", gap: 6, margin: "20px 0", flexWrap: "wrap", alignItems: "center" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...(id === tab ? btnSoft : btnGhost), borderColor: id === tab ? "var(--blue-bright)" : "var(--line)", color: id === tab ? "var(--cream)" : "var(--cream-dim)" }}>
            {label}
          </button>
        ))}
        <button onClick={startOver} style={{ ...btnGhost, marginLeft: "auto", color: "var(--danger)", borderColor: "var(--danger)" }}>
          Start over
        </button>
      </div>

      {tab === "identity" && <IdentityTab crew={crew} update={update} />}
      {tab === "workers" && <WorkersTab crew={crew} update={update} updateWorker={updateWorker} />}
      {tab === "mcp" && <McpTab crew={crew} update={update} />}
      {tab === "graph" && <GraphTab crew={crew} update={update} />}
      {tab === "ship" && <ShipTab crew={crew} problems={problems} publish={publish} publishState={publishState} exportJson={exportJson} navigate={navigate} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function IdentityTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={label}>Name</label>
          <input style={field} value={crew.name} onChange={(e) => update({ name: e.target.value, id: crew.id || slugify(e.target.value) })} placeholder="Incident Response" />
        </div>
        <div>
          <label style={label}>Id (slug)</label>
          <input style={field} value={crew.id} onChange={(e) => update({ id: slugify(e.target.value) })} placeholder="incident-response" />
        </div>
        <div>
          <label style={label}>Version (semver)</label>
          <input style={field} value={crew.version} onChange={(e) => update({ version: e.target.value })} />
        </div>
        <div>
          <label style={label}>Author</label>
          <input style={field} value={crew.author} onChange={(e) => update({ author: e.target.value })} placeholder="your-github-handle" />
        </div>
      </div>
      <label style={label}>Description</label>
      <textarea style={{ ...field, minHeight: 70 }} value={crew.description} onChange={(e) => update({ description: e.target.value })} placeholder="What does this crew do, for whom, and what does it refuse to do?" />
      <label style={label}>Tags (comma-separated)</label>
      <ListField separator="," style={field} value={crew.tags} onChange={(tags) => update({ tags })} />
    </Card>
  );
}

function WorkersTab(props: {
  crew: CrewDefinition;
  update: (p: Partial<CrewDefinition>) => void;
  updateWorker: (id: string, p: Partial<CrewWorker>) => void;
}): React.JSX.Element {
  const { crew, update, updateWorker } = props;

  // Load the catalog once so workers can pick a profession (profile spec)
  // from the marketplace. Profiles are the atoms; workers reference them.
  const [catalog, setCatalog] = React.useState<MarketplaceCatalog | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => (r.ok ? (r.json() as Promise<MarketplaceCatalog>) : null))
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        /* offline: chips stay empty, free-text input still works */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const profileSpecs = (catalog?.items ?? []).filter((i) => i.kind === "profile");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        A worker is a role in the pipeline plus a <strong>profession</strong>. Pick a profile spec
        from the marketplace (or type a built-in slug like <code>security-engineer</code>) and the
        profession's expertise, methods, rules and verification are wired in at install time —
        no hand-crafted agent config needed.
      </p>
      {crew.workers.map((w, i) => (
        <Card key={w.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{i + 1}. {w.name || "unnamed"}</strong>
            <button
              onClick={() => update({ workers: crew.workers.filter((x) => x.id !== w.id) })}
              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13 }}
            >
              remove
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
            <div>
              <label style={label}>Name</label>
              <input style={field} value={w.name} onChange={(e) => updateWorker(w.id, { name: e.target.value })} />
            </div>
            <div>
              <label style={label}>Id (slug)</label>
              <input style={field} value={w.id} onChange={(e) => updateWorker(w.id, { id: slugify(e.target.value) || w.id })} />
            </div>
            <div>
              <label style={label}>Role</label>
              <select style={field} value={w.role} onChange={(e) => updateWorker(w.id, { role: e.target.value })}>
                {["researcher", "writer", "reviewer", "operator", "debugger", "planner"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <label style={label}>Description</label>
          <input style={field} value={w.description} onChange={(e) => updateWorker(w.id, { description: e.target.value })} placeholder="What does this worker do in the pipeline?" />

          <label style={label}>Profession (profile spec)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {profileSpecs.map((p) => (
              <button
                key={p.id}
                onClick={() => updateWorker(w.id, { profile: p.id })}
                style={{
                  ...btnGhost,
                  padding: "5px 10px",
                  fontSize: 12,
                  ...(w.profile === p.id ? { borderColor: "var(--cyan)", color: "var(--cyan)" } : {}),
                }}
              >
                {p.id}{w.profile === p.id ? " ✓" : ""}
              </button>
            ))}
          </div>
          <input
            style={field}
            value={w.profile ?? ""}
            onChange={(e) => updateWorker(w.id, { profile: slugify(e.target.value) || undefined })}
            placeholder="or type a profile slug — built-in (security-engineer), marketplace, or local profiles/"
          />
          {w.profile && (
            <p style={{ color: "var(--warn)", fontSize: 12, margin: "8px 0 0" }}>
              Operates as <strong>{w.profile}</strong> — expertise, methods, rules and verification come from the profile spec at install time.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label style={label}>MCP servers</label>
              <select
                multiple
                style={{ ...field, minHeight: 64 }}
                value={w.mcpServers}
                onChange={(e) => updateWorker(w.id, { mcpServers: Array.from(e.target.selectedOptions).map((o) => o.value) })}
              >
                {crew.mcpServers.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Receives from (upstream workers)</label>
              <select
                multiple
                style={{ ...field, minHeight: 64 }}
                value={w.receivesFrom}
                onChange={(e) => updateWorker(w.id, { receivesFrom: Array.from(e.target.selectedOptions).map((o) => o.value) })}
              >
                {crew.workers.filter((x) => x.id !== w.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={label}>Emits — artifacts this worker hands downstream (comma-separated)</label>
          <ListField separator="," style={field} value={w.emits} onChange={(emits) => updateWorker(w.id, { emits })} placeholder="e.g. draft-docs, review-notes" />

          <label style={label}>Context bindings — where this worker retrieves knowledge (NOT artifacts)</label>
          {w.context.map((c, ci) => (
            <div key={ci} style={{ display: "grid", gridTemplateColumns: "160px 1fr 32px", gap: 8, marginBottom: 6 }}>
              <div>
                <label style={{ ...label, marginTop: 0 }}>Framework</label>
                <input style={field} value={c.framework} onChange={(e) => updateWorker(w.id, { context: w.context.map((x, xi) => (xi === ci ? { ...x, framework: e.target.value } : x)) })} placeholder="filesystem | git | acc" aria-label={`Worker ${w.id} context framework ${ci + 1}`} />
              </div>
              <div>
                <label style={{ ...label, marginTop: 0 }}>Scope</label>
                <input style={field} value={c.scope ?? ""} onChange={(e) => updateWorker(w.id, { context: w.context.map((x, xi) => (xi === ci ? { ...x, scope: e.target.value } : x)) })} placeholder="scope, e.g. src/auth/**" aria-label={`Worker ${w.id} context scope ${ci + 1}`} />
              </div>
              <button onClick={() => updateWorker(w.id, { context: w.context.filter((_, xi) => xi !== ci) })} style={{ ...btnGhost, padding: "6px", alignSelf: "end" }}>✕</button>
            </div>
          ))}
          <button onClick={() => updateWorker(w.id, { context: [...w.context, { framework: "filesystem", scope: "" }] as CrewContext[] })} style={{ ...btnGhost, marginTop: 4 }}>
            + context binding
          </button>

          <label style={label}>Permissions (scope the profession to this worker's job)</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {([
              ["read", ["none", "repo", "scoped", "world"]],
              ["write", ["none", "repo", "scoped"]],
              ["production", ["none", "read", "write"]],
              ["secrets", ["none", "named", "all"]],
            ] as const).map(([key, levels]) => (
              <div key={key}>
                <label style={label} htmlFor={`perm-${w.id}-${key}`}>{key}</label>
                <select id={`perm-${w.id}-${key}`} style={field} value={w.permissions[key]} onChange={(e) => updateWorker(w.id, { permissions: { ...w.permissions, [key]: e.target.value } as CrewPermissions })}>
                  {levels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <label style={label}>Tools — allowlist for this worker (comma-separated)</label>
          <ListField separator="," style={field} value={w.permissions.tools} onChange={(tools) => updateWorker(w.id, { permissions: { ...w.permissions, tools } })} placeholder="e.g. filesystem, shell, git" aria-label={`Worker ${w.id} tool allowlist`} />

          <label style={label}>Extra instructions — optional with a profession (SKILL.md body)</label>
          <textarea
            style={{ ...field, minHeight: 90, fontFamily: "var(--font-mono)" }}
            value={w.instructions}
            onChange={(e) => updateWorker(w.id, { instructions: e.target.value })}
            placeholder={w.profile ? "Optional — the profession supplies the operating model. Add only pipeline-specific steps." : "Required without a profession: 1. Read inputs. 2. Do the bounded job. 3. Emit artifacts."}
          />
        </Card>
      ))}
      <button onClick={() => update({ workers: [...crew.workers, newWorker(crew.workers.length)] })} style={{ ...btn, justifySelf: "start" }}>
        + Add worker
      </button>
    </div>
  );
}

function McpTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  const setServer = (name: string, patch: Partial<CrewMcpServer>) =>
    update({ mcpServers: crew.mcpServers.map((m) => (m.name === name ? { ...m, ...patch } : m)) });
  // Renaming must move every worker reference too — the name IS the key
  // workers bind to, and "server-1" leaking into .mcp.json is useless.
  const renameServer = (oldName: string, raw: string) => update(renameMcpServer(crew, oldName, raw));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {crew.mcpServers.map((m) => (
        <Card key={m.name}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ ...label, marginTop: 0 }}>Server name — workers bind to this (lowercase slug)</label>
              <input style={field} value={m.name} onChange={(e) => renameServer(m.name, e.target.value)} aria-label={`MCP server name (${m.name})`} />
            </div>
            <button onClick={() => update({ mcpServers: crew.mcpServers.filter((x) => x.name !== m.name) })} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13 }}>remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={label}>Transport</label>
              <select style={field} value={m.transport} onChange={(e) => setServer(m.name, { transport: e.target.value as CrewMcpServer["transport"] })}>
                <option value="stdio">stdio (local)</option>
                <option value="http">http (remote)</option>
                <option value="sse">sse (remote)</option>
              </select>
            </div>
            <div>
              <label style={label}>{m.transport === "stdio" ? "Command" : "URL"}</label>
              {m.transport === "stdio" ? (
                <input style={field} value={m.command ?? ""} onChange={(e) => setServer(m.name, { command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-github" />
              ) : (
                <input style={field} value={m.url ?? ""} onChange={(e) => setServer(m.name, { url: e.target.value })} placeholder="https://…" />
              )}
            </div>
          </div>
          <label style={label}>Allowed tools (empty = all)</label>
          <ListField separator="," style={field} value={m.allowedTools ?? []} onChange={(allowedTools) => setServer(m.name, { allowedTools })} />
        </Card>
      ))}
      <button
        onClick={() => update({ mcpServers: [...crew.mcpServers, { name: `server-${crew.mcpServers.length + 1}`, transport: "stdio", command: "", args: [] }] })}
        style={{ ...btn, justifySelf: "start" }}
      >
        + Add MCP server
      </button>
    </div>
  );
}

function GraphTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  return (
    <Card>
      <label style={label}>Entry points</label>
      <select multiple style={{ ...field, minHeight: 80 }} value={crew.entryPoints} onChange={(e) => update({ entryPoints: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
        {crew.workers.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      <label style={label}>Handoffs</label>
      {crew.handoffs.map((h, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 32px", gap: 8, marginBottom: 6 }}>
          <select style={field} value={h.from} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, from: e.target.value } : x)) })}>
            {crew.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select style={field} value={h.to} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, to: e.target.value } : x)) })}>
            {crew.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <input style={field} value={h.artifact} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, artifact: e.target.value } : x)) })} placeholder="artifact name" />
          <button onClick={() => update({ handoffs: crew.handoffs.filter((_, xi) => xi !== i) })} style={{ ...btnGhost, padding: "6px" }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => update({ handoffs: [...crew.handoffs, { from: crew.workers[0]?.id ?? "", to: crew.workers[1]?.id ?? "", artifact: "" }] })}
        style={{ ...btnGhost, marginTop: 8 }}
        disabled={crew.workers.length < 2}
      >
        + Add handoff
      </button>
      <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 12 }}>
        Handoffs must pass artifacts the sender actually emits. The graph must stay acyclic — that is what makes a crew installable and runnable.
      </p>
    </Card>
  );
}

function ShipTab(props: {
  crew: CrewDefinition;
  problems: string[] | null;
  publish: () => void;
  publishState: string;
  exportJson: () => void;
  navigate: (to: string) => void;
}): React.JSX.Element {
  const { crew, problems, publish, publishState, exportJson, navigate } = props;
  const [copied, setCopied] = useState("");
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  };
  const cliCommand = `proagent crew build . --file ${crew.id || "my-crew"}.json`;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {problems && problems.length > 0 && (
        <div>
          <ErrorNote message={problems.join(" ")} />
        </div>
      )}

      <Card>
        <label style={label}>1 · Use it right now (local install)</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 10px" }}>
          Export the JSON and hand it to the CLI — it installs the crew into whatever repo you
          run it in (skills, agent contracts, merged <code>.mcp.json</code>):
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={exportJson} style={btn}>Download {crew.id || "crew"}.json</button>
          <button onClick={() => copy(cliCommand, "cli")} style={btnGhost}>{copied === "cli" ? "✓ Copied" : "Copy CLI command"}</button>
        </div>
        <pre style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, fontSize: 13, overflowX: "auto", marginTop: 12 }}>
          <code>{cliCommand}</code>
        </pre>
      </Card>

      <Card>
        <label style={label}>2 · Share it on the marketplace</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 12px" }}>
          Everything published here is <strong style={{ color: "var(--ok)", textDecoration: "none" }}>free and MIT-licensed</strong>.
          Publishing files a <strong>proposal issue</strong> on the ProAgents repo — CI validates
          your crew automatically, and a maintainer merge (<code>/publish</code>) puts it in the
          marketplace. Nothing goes live without a human review.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={publish} style={btn}>File marketplace proposal</button>
          <button onClick={() => copy(issueBody(crew), "json")} style={btnGhost}>{copied === "json" ? "✓ Copied proposal" : "Copy proposal markdown"}</button>
          <button onClick={() => navigate("catalog")} style={btnGhost}>Back to catalog</button>
        </div>
        {publishState && (
          <p style={{ marginTop: 12, fontSize: 13, color: publishState.startsWith("✓") ? "var(--ok)" : "var(--cream-dim)", whiteSpace: "pre-wrap" }}>
            {publishState.includes("http") ? (
              <>
                {publishState.split(/(https:\/\/[^\s)]+)/).map((part, i) =>
                  part.startsWith("https://") ? (
                    <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)", fontWeight: 700 }}>{part}</a>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
              </>
            ) : (
              publishState
            )}
          </p>
        )}
        <div style={{ display: "flex", gap: 14, fontSize: 12, marginTop: 14 }}>
          <a href="https://github.com/sponsors/EnzoVezzaro" target="_blank" rel="noreferrer" style={{ color: "var(--cream-dim)" }}>Sponsor the project</a>
          <a href="https://ko-fi.com/enzojuniorvezzaro" target="_blank" rel="noreferrer" style={{ color: "var(--cream-dim)" }}>Ko-fi</a>
        </div>
      </Card>
    </div>
  );
}

function Card(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
      {props.children}
    </div>
  );
}
