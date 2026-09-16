import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { emptyProfile, slugify, type ProfileManifest, type ProfileMcpServer } from "../../types.js";
import { profileIssueBody, profileIssueTitle } from "../../proposal.js";
import { validateProfileDraft, checkMcpHealth, type McpHealth } from "../../profile-draft.js";
import { CATALOG_URL } from "../../catalog.js";

/**
 * Profile builder — the primary creation flow. A guided walkthrough:
 * identity → expertise & rules → tools (native, MCP, registry packages) →
 * skills (registry or written) → verification → ship. The output is the
 * canonical ProfileManifest JSON the CLI already equips.
 */

const btn: React.CSSProperties = { background: "var(--lime)", color: "#000", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 };
const btnDanger: React.CSSProperties = { background: "transparent", color: "#ff7b72", border: "1px solid #ff7b72", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--cream-dim)", marginBottom: 4, marginTop: 10, textTransform: "uppercase" as const, letterSpacing: 0.4 };
const hint: React.CSSProperties = { color: "var(--cream-dim)", fontSize: 12, lineHeight: 1.55, marginTop: 8 };

/** The five walkthrough steps. Each declares what makes it complete. */
const STEPS = [
  { id: "identity", title: "Identity", blurb: "Who is this professional?", complete: (p: ProfileManifest) => Boolean(p.profile.name && p.profile.slug && p.profile.description && p.profile.author) },
  { id: "expertise", title: "Expertise & rules", blurb: "What do they know, what do they never do?", complete: (p: ProfileManifest) => p.expertise.length > 0 && (p.rules ?? []).length > 0 },
  { id: "tools", title: "Tools & MCP", blurb: "What must the environment provide?", complete: (p: ProfileManifest) => p.tools.required.length > 0 },
  { id: "skills", title: "Skills", blurb: "Compose existing skills or write your own.", complete: () => true },
  { id: "verification", title: "Verification", blurb: "How is the work proven?", complete: (p: ProfileManifest) => p.verification.required.length > 0 },
] as const;

type StepId = (typeof STEPS)[number]["id"] | "ship";

export function ProfileBuilderPage(props: { ctx: AppCtx }): React.JSX.Element {
  const { settings, navigate } = props.ctx;
  const [profile, setProfile] = useState<ProfileManifest>(() => {
    // Restore an in-progress draft across reloads/accidental navigation.
    try {
      const raw = sessionStorage.getItem("proagents-profile-draft");
      if (raw) return JSON.parse(raw) as ProfileManifest;
    } catch { /* ignore */ }
    return emptyProfile();
  });
  const [step, setStep] = useState<StepId>(() => {
    const saved = sessionStorage.getItem("proagents-profile-step");
    return (STEPS.some((s) => s.id === saved) ? saved : "identity") as StepId;
  });
  const [, setProblems] = useState<string[] | null>(null);
  const [publishState, setPublishState] = useState("");
  const [takenSlugs, setTakenSlugs] = useState<ReadonlySet<string>>(() => new Set());

  const draftKey = "proagents-profile-draft";
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(profile));
      sessionStorage.setItem("proagents-profile-step", step);
    } catch { /* storage unavailable */ }
  }, [profile, step]);

  // Load the marketplace catalog once so slug collisions are caught at typing
  // time (block a slug that already exists — publishing would collide).
  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((c: { items: Array<{ id: string }> }) => {
        if (!cancelled) setTakenSlugs(new Set(c.items.map((i) => i.id)));
      })
      .catch(() => { /* catalog unavailable — offline check only */ });
    return () => { cancelled = true; };
  }, []);

  const startOver = () => {
    if (!window.confirm("Discard this draft and start a new profile?")) return;
    try {
      sessionStorage.removeItem(draftKey);
      sessionStorage.removeItem("proagents-profile-step");
    } catch { /* ignore */ }
    setProfile(emptyProfile());
    setStep("identity");
    setProblems(null);
    setPublishState("");
  };

  const update = (patch: Partial<ProfileManifest>) => setProfile((p) => ({ ...p, ...patch }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.profile.slug || "profile"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const publish = async () => {
    const errs = validateProfileDraft(profile, takenSlugs);
    setProblems(errs);
    if (errs.length > 0) return;
    if (!settings.githubToken) {
      setPublishState("Sign in with GitHub (header) to publish — publishing opens a pull request on the marketplace repo.");
      return;
    }
    setPublishState("Opening a publish PR on the marketplace repo…");
    try {
      const { publishProfileAsPr } = await import("../../github.js");
      const repo = (import.meta.env.VITE_MARKET_REPO as string | undefined) ?? "EnzoVezzaro/proagents";
      // Re-read the live catalog for the index merge (the boot-time copy may be stale).
      const cat = await fetch(CATALOG_URL).then((r) => (r.ok ? r.json() : { items: [] }));
      const existing = (cat.items ?? []).filter((i: { id: string }) => i.id !== profile.profile.slug);
      const entry = {
        id: profile.profile.slug,
        name: profile.identity.title,
        version: profile.profile.version,
        description: profile.profile.description ?? profile.identity.summary ?? "",
        author: profile.profile.author ?? "community",
        tags: ["profile", ...(profile.profile.tags ?? [])],
        kind: "profile",
        downloads: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const catalogJson = JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: [...existing, entry].sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)) }, null, 2) + "\n";
      const res = await publishProfileAsPr(settings.githubToken, repo, profile.profile.slug, JSON.stringify(profile, null, 2) + "\n", catalogJson);
      setPublishState(`✓ Publish PR opened: ${res.url}\nCI validates it; a maintainer merge publishes it to the marketplace. Until then, use the downloaded JSON locally (npx proagent equip).`);
    } catch (err) {
      setPublishState(`Publish failed: ${(err as Error).message}\n\nFallback: download the JSON and file a proposal issue instead.`);
    }
  };

  const fileIssue = async () => {
    const errs = validateProfileDraft(profile, takenSlugs);
    setProblems(errs);
    if (errs.length > 0) return;
    if (!settings.githubToken) {
      setPublishState("Sign in with GitHub (header) to file a proposal issue.");
      return;
    }
    setPublishState("Filing marketplace proposal issue…");
    try {
      const { createIssue } = await import("../../github.js");
      const repo = (import.meta.env.VITE_MARKET_REPO as string | undefined) ?? "EnzoVezzaro/proagents";
      const res = await createIssue(settings.githubToken, repo, profileIssueTitle(profile), profileIssueBody(profile), ["profile-proposal"]);
      setPublishState(`✓ Proposal filed: ${res.html_url}\nCI validates it within seconds. A maintainer merges it with /publish and it appears in the marketplace.`);
    } catch (err) {
      setPublishState(`Proposal failed: ${(err as Error).message}`);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const errs = validateProfileDraft(profile, takenSlugs);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Build a profile</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        You are writing a <strong>profile spec</strong> — identity, expertise, methods, rules,
        tools and verification — not the agent itself. Your harness executes it: the proagent
        CLI hands the spec to your coding agent (<code>npx proagent equip</code>), and crew
        workers can carry it as their profession.
      </p>

      <div style={{ display: "flex", gap: 20, margin: "20px 0", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Walkthrough rail */}
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8, minWidth: 220 }}>
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = s.complete(profile);
            return (
              <li key={s.id}>
                <button
                  onClick={() => setStep(s.id)}
                  style={{
                    ...btnGhost,
                    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                    borderColor: active ? "var(--lime)" : "var(--line)",
                    color: active ? "var(--cream)" : "var(--cream-dim)",
                    background: active ? "rgba(185,251,29,0.08)" : "transparent",
                  }}
                  aria-current={active ? "step" : undefined}
                >
                  <span style={{
                    width: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    background: done ? "var(--lime)" : "transparent",
                    color: done ? "#000" : "var(--cream-dim)",
                    border: done ? "1px solid var(--lime)" : "1px solid var(--line)",
                  }}>{done ? "✓" : i + 1}</span>
                  <span>
                    <span style={{ display: "block", fontSize: 13, fontWeight: active ? 700 : 400 }}>{s.title}</span>
                    <span style={{ display: "block", fontSize: 11 }}>{s.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Step content */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {step === "identity" && <IdentityTab profile={profile} update={update} takenSlugs={takenSlugs} problems={errs} />}
          {step === "expertise" && <ExpertiseTab profile={profile} update={update} />}
          {step === "tools" && <ToolsTab profile={profile} update={update} />}
          {step === "skills" && <SkillsTab profile={profile} update={update} />}
          {step === "verification" && <VerificationTab profile={profile} update={update} />}
          {step === "ship" && <ShipTab profile={profile} problems={errs} publish={publish} fileIssue={fileIssue} publishState={publishState} exportJson={exportJson} navigate={navigate} />}

          {/* Next / Back walkthrough controls */}
          {step !== "ship" && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              {stepIndex > 0 && <button onClick={() => setStep(STEPS[stepIndex - 1].id)} style={btnGhost}>← Back</button>}
              <button onClick={() => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id)} style={btn}>
                Next: {STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].title} →
              </button>
              {stepIndex === STEPS.length - 1 && <button onClick={() => setStep("ship")} style={btn}>Ship it →</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={startOver} style={btnDanger}>Start over</button>
        {step !== "ship" && <button onClick={() => setStep("ship")} style={btnGhost}>Skip to ship</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IdentityTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void; takenSlugs: ReadonlySet<string>; problems: string[] }): React.JSX.Element {
  const { profile, update, takenSlugs, problems } = props;
  const p = profile.profile;
  const slugTaken = p.slug !== "" && takenSlugs.has(p.slug);
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={label}>Profession name</label>
          <input style={field} value={p.name} onChange={(e) => update({ profile: { ...p, name: e.target.value, slug: p.slug || slugify(e.target.value), description: p.description || `${e.target.value} — professional operating profile.` }, identity: { ...profile.identity, title: e.target.value } })} placeholder="Security Engineer" />
        </div>
        <div>
          <label style={label}>Slug (kebab-case)</label>
          <input style={field} value={p.slug} onChange={(e) => update({ profile: { ...p, slug: slugify(e.target.value) } })} placeholder="security-engineer" aria-invalid={slugTaken} />
          {slugTaken && (
            <p style={{ color: "#ff7b72", fontSize: 12, margin: "4px 0 0" }}>
              ⛔ “{p.slug}” already exists in the marketplace — pick another (PA038).
            </p>
          )}
        </div>
        <div>
          <label style={label}>Version (semver)</label>
          <input style={field} value={p.version} onChange={(e) => update({ profile: { ...p, version: e.target.value } })} />
        </div>
        <div>
          <label style={label}>Tags (comma-separated)</label>
          <input style={field} value={(p.tags ?? []).join(", ")} onChange={(e) => update({ profile: { ...p, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} />
        </div>
        <div>
          <label style={label}>Author (GitHub handle)</label>
          <input style={field} value={p.author ?? ""} onChange={(e) => update({ profile: { ...p, author: e.target.value } })} placeholder="your-github-handle" />
        </div>
        <div>
          <label style={label}>One-line description</label>
          <input style={field} value={p.description ?? ""} onChange={(e) => update({ profile: { ...p, description: e.target.value } })} placeholder="Shown in the marketplace catalog" />
        </div>
      </div>
      <label style={label}>Identity summary — how should the agent operate?</label>
      <textarea style={{ ...field, minHeight: 90 }} value={profile.identity.summary ?? ""} onChange={(e) => update({ identity: { ...profile.identity, summary: e.target.value } })} placeholder="You operate as a… You assume… You never…" />
      {problems.filter((x) => x.includes("PA030") || x.includes("PA031") || x.includes("PA038")).length > 0 && (
        <div style={{ marginTop: 10 }}><ErrorNote message={problems.filter((x) => x.includes("PA030") || x.includes("PA031") || x.includes("PA038")).join(" ")} /></div>
      )}
      <p style={hint}>
        The summary becomes the opening of every equipped SKILL.md — one paragraph, second person.
        The slug is your profession's address: <code>proagent equip &lt;slug&gt;</code>.
      </p>
    </Card>
  );
}

function ExpertiseTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <Card>
      <label style={label}>Expertise (one per line)</label>
      <textarea style={{ ...field, minHeight: 90 }} value={profile.expertise.join("\n")} onChange={(e) => update({ expertise: lines(e.target.value) })} placeholder={"application security\nthreat modeling"} />
      <label style={label}>Methods (one per line, kebab-case)</label>
      <textarea style={{ ...field, minHeight: 80 }} value={(profile.methods ?? []).join("\n")} onChange={(e) => update({ methods: lines(e.target.value) })} placeholder={"threat-modeling\nroot-cause-analysis"} />
      <label style={label}>Rules — normative, enforced where the harness allows (one per line)</label>
      <textarea style={{ ...field, minHeight: 110 }} value={(profile.rules ?? []).join("\n")} onChange={(e) => update({ rules: lines(e.target.value) })} placeholder={"Never expose secrets.\nRequire security verification before claiming completion."} />
      <label style={label}>Standards followed (one per line — add as many as apply)</label>
      <textarea style={{ ...field, minHeight: 70 }} value={(profile.standards ?? []).join("\n")} onChange={(e) => update({ standards: lines(e.target.value) })} placeholder={"OWASP ASVS\nISO 27001\nNIST SSDF"} />
      <p style={hint}>Standards are free-form: bodies, frameworks, or specific revisions. Each renders as a bullet in the equipped SKILL.md.</p>
    </Card>
  );
}

function ToolsTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
  const mcp = profile.tools.mcp ?? [];
  const packages = profile.tools.packages ?? [];

  const setMcp = (next: ProfileMcpServer[]) => update({ tools: { ...profile.tools, mcp: next } });
  const updateMcp = (i: number, patch: Partial<ProfileMcpServer>) => setMcp(mcp.map((s, x) => (x === i ? { ...s, ...patch } : s)));
  const removeMcp = (i: number) => setMcp(mcp.filter((_, x) => x !== i));

  return (
    <Card>
      <p style={{ ...hint, marginTop: 0 }}>
        Everything the profession needs its environment to provide: native tools, MCP servers,
        and registry packages. MCP servers merge into the harness <code>.mcp.json</code> at equip time.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={label}>Required tools (comma-separated)</label>
          <input style={field} value={profile.tools.required.join(", ")} onChange={(e) => update({ tools: { ...profile.tools, required: csv(e.target.value) } })} placeholder="filesystem, shell, git" />
        </div>
        <div>
          <label style={label}>Forbidden tools</label>
          <input style={field} value={(profile.tools.forbidden ?? []).join(", ")} onChange={(e) => update({ tools: { ...profile.tools, forbidden: csv(e.target.value) } })} placeholder="leave empty if none" />
        </div>
      </div>

      <label style={label}>MCP servers — connected at equip time (with health check)</label>
      {mcp.map((s, i) => (
        <McpServerCard key={i} server={s} onChange={(patch) => updateMcp(i, patch)} onRemove={() => removeMcp(i)} />
      ))}
      <button onClick={() => setMcp([...mcp, { name: `server-${mcp.length + 1}`, transport: "stdio", command: "" }])} style={{ ...btnGhost, marginTop: 8 }}>
        + Add MCP server
      </button>

      <label style={label}>Registry packages — skills/tooling from npm or GitHub</label>
      {packages.map((pkg, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, marginBottom: 8 }}>
          <input style={field} value={pkg.registry} onChange={(e) => update({ tools: { ...profile.tools, packages: packages.map((p, x) => (x === i ? { ...p, registry: e.target.value } : p)) } })} placeholder="npm:@org/skill-pack" aria-label={`Package ${i + 1} registry ref`} />
          <input style={field} value={pkg.reason ?? ""} onChange={(e) => update({ tools: { ...profile.tools, packages: packages.map((p, x) => (x === i ? { ...p, reason: e.target.value } : p)) } })} placeholder="why this package is needed" aria-label={`Package ${i + 1} reason`} />
          <button onClick={() => update({ tools: { ...profile.tools, packages: packages.filter((_, x) => x !== i) } })} style={{ ...btnGhost, padding: "6px 10px" }}>✕</button>
        </div>
      ))}
      <button onClick={() => update({ tools: { ...profile.tools, packages: [...packages, { registry: "" }] } })} style={{ ...btnGhost, marginTop: 4 }}>
        + Add package
      </button>
      <p style={hint}>Refs are <code>npm:&lt;package&gt;[@version]</code> or <code>github:owner/repo[@ref]</code> (PA040). Equip declares them; your environment installs them.</p>
    </Card>
  );
}

/** One MCP server config with a live health check. */
function McpServerCard(props: { server: ProfileMcpServer; onChange: (patch: Partial<ProfileMcpServer>) => void; onRemove: () => void }): React.JSX.Element {
  const { server, onChange, onRemove } = props;
  const [health, setHealth] = useState<McpHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async () => {
    setChecking(true);
    setHealth(null);
    const h = await checkMcpHealth(server);
    setHealth(h);
    setChecking(false);
    onChange({ healthy: h.ok });
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 10, background: "var(--ink)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px auto auto", gap: 8, alignItems: "end" }}>
        <div>
          <label style={label}>Server name</label>
          <input style={field} value={server.name} onChange={(e) => onChange({ name: slugify(e.target.value) })} placeholder="context7" aria-label="MCP server name" />
        </div>
        <div>
          <label style={label}>Transport</label>
          <select style={field} value={server.transport} onChange={(e) => onChange({ transport: e.target.value as ProfileMcpServer["transport"] })} aria-label="MCP transport">
            <option value="stdio">stdio</option>
            <option value="http">http</option>
            <option value="sse">sse</option>
          </select>
        </div>
        <button onClick={run} disabled={checking} style={{ ...btnGhost, padding: "8px 12px" }}>{checking ? "Checking…" : "Health check"}</button>
        <button onClick={onRemove} style={{ ...btnGhost, padding: "8px 10px", borderColor: "#ff7b72", color: "#ff7b72" }} aria-label="Remove MCP server">✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {server.transport === "stdio" ? (
          <div>
            <label style={label}>Command</label>
            <input style={field} value={server.command ?? ""} onChange={(e) => onChange({ command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-memory" aria-label="MCP command" />
          </div>
        ) : (
          <div>
            <label style={label}>URL</label>
            <input style={field} value={server.url ?? ""} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://mcp.example.com/sse" aria-label="MCP URL" />
          </div>
        )}
        <div>
          <label style={label}>Health check {server.transport === "stdio" ? "(endpoint, optional)" : "(endpoint)"}</label>
          <input style={field} value={server.healthCheck ?? ""} onChange={(e) => onChange({ healthCheck: e.target.value })} placeholder={server.transport === "stdio" ? "/health" : "https://mcp.example.com/health"} aria-label="MCP health check endpoint" />
        </div>
      </div>
      {health && (
        <p style={{ fontSize: 12, margin: "8px 0 0", color: health.ok ? "var(--lime)" : "#ff7b72" }}>
          {health.ok ? "✓" : "✕"} {health.detail}
        </p>
      )}
    </div>
  );
}

function SkillsTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  const skills = profile.skills ?? [];
  const bodies = profile.skillBodies ?? {};
  const isRegistryRef = (s: string) => s.startsWith("npm:") || s.startsWith("github:");

  const addRegistry = (ref: string) => update({ skills: [...skills, ref] });
  const addWritten = () => {
    const name = `skill-${Object.keys(bodies).length + 1}`;
    update({ skills: [...skills, name], skillBodies: { ...bodies, [name]: { description: "", body: "" } } });
  };
  const renameWritten = (oldName: string, nextRaw: string) => {
    const next = slugify(nextRaw);
    if (!next || next === oldName || skills.includes(next)) return;
    const b = { ...bodies };
    b[next] = b[oldName];
    delete b[oldName];
    update({ skills: skills.map((s) => (s === oldName ? next : s)), skillBodies: b });
  };
  const removeSkill = (s: string) => {
    const b = { ...bodies };
    delete b[s];
    update({ skills: skills.filter((x) => x !== s), skillBodies: b });
  };

  return (
    <Card>
      <p style={{ ...hint, marginTop: 0 }}>
        Skills compose into the equipped agent. Install from a registry (<code>npm:</code> / <code>github:</code>)
        or write your own inline — written skills install as standalone <code>.agents/skills/&lt;name&gt;/SKILL.md</code>.
      </p>

      <label style={label}>Install from a package registry</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={field} placeholder="npm:@modelcontextprotocol/skills or github:owner/repo" onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
            addRegistry((e.target as HTMLInputElement).value.trim());
            (e.target as HTMLInputElement).value = "";
          }
        }} aria-label="Registry skill ref" />
        <span style={{ color: "var(--cream-dim)", fontSize: 12, alignSelf: "center" }}>⏎ to add</span>
      </div>
      {skills.filter(isRegistryRef).map((s) => (
        <div key={s} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <code style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>{s}</code>
          <button onClick={() => removeSkill(s)} style={{ ...btnGhost, padding: "2px 8px" }}>✕</button>
        </div>
      ))}

      <label style={label}>Write your own</label>
      {Object.entries(bodies).map(([name, b]) => (
        <div key={name} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 10, background: "var(--ink)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <div>
              <label style={label}>Skill name (kebab-case)</label>
              <input style={field} value={name} onChange={(e) => renameWritten(name, e.target.value)} aria-label="Written skill name" />
            </div>
            <button onClick={() => removeSkill(name)} style={{ ...btnGhost, padding: "8px 10px", borderColor: "#ff7b72", color: "#ff7b72" }} aria-label="Remove written skill">✕</button>
          </div>
          <label style={label}>Description (one line)</label>
          <input style={field} value={b.description} onChange={(e) => update({ skillBodies: { ...bodies, [name]: { ...b, description: e.target.value } } })} placeholder="What this skill does and when to use it" aria-label="Written skill description" />
          <label style={label}>Skill body (markdown instructions)</label>
          <textarea style={{ ...field, minHeight: 120, fontFamily: "ui-monospace, monospace" }} value={b.body} onChange={(e) => update({ skillBodies: { ...bodies, [name]: { ...b, body: e.target.value } } })} placeholder={"1. Do the thing.\n2. Verify the result."} aria-label="Written skill body" />
        </div>
      ))}
      <button onClick={addWritten} style={{ ...btnGhost, marginTop: 4 }}>+ Write a skill</button>
    </Card>
  );
}

function VerificationTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  return (
    <Card>
      <label style={label}>Verification — required before the agent claims completion (one per line)</label>
      <textarea style={{ ...field, minHeight: 90 }} value={profile.verification.required.join("\n")} onChange={(e) => update({ verification: { required: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } })} placeholder={"tests pass\nno new lint errors"} />
      <label style={label}>Optional verification (when relevant)</label>
      <textarea style={{ ...field, minHeight: 60 }} value={(profile.verification.optional ?? []).join("\n")} onChange={(e) => update({ verification: { ...profile.verification, optional: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } })} placeholder={"coverage did not decrease"} />
      <p style={hint}>
        Verification is what makes a profile enforceable: these become required-before-completion steps in every equipped agent (PA035).
      </p>
    </Card>
  );
}

function ShipTab(props: {
  profile: ProfileManifest;
  problems: string[] | null;
  publish: () => void;
  fileIssue: () => void;
  publishState: string;
  exportJson: () => void;
  navigate: (to: string) => void;
}): React.JSX.Element {
  const { profile, problems, publish, fileIssue, publishState, exportJson, navigate } = props;
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
  const equipCommand = `npx proagent equip ${profile.profile.slug || "my-profile"}`;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {problems && problems.length > 0 && (
        <div>
          <ErrorNote message={problems.join(" ")} />
        </div>
      )}
      <Card>
        <label style={label}>1 · Use it right now (local)</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 10px" }}>
          Drop the JSON into <code>profiles/</code> in your repo, then equip it — no publishing needed:
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={exportJson} style={btn}>Download {profile.profile.slug || "profile"}.json</button>
          <button onClick={() => copy(equipCommand, "cli")} style={btnGhost}>{copied === "cli" ? "✓ Copied" : "Copy equip command"}</button>
        </div>
        <pre style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, fontSize: 13, overflowX: "auto", marginTop: 12 }}>
          <code>{equipCommand}</code>
        </pre>
      </Card>
      <Card>
        <label style={label}>2 · Publish it (so <code>npx proagent equip</code> works for everyone)</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 12px" }}>
          Remote equip resolves from the marketplace repo — your profile only works remotely after it is
          merged there. Publishing opens a <strong>pull request</strong> adding it to the catalog
          (GitHub sign-in required): CI validates the PR, and a maintainer merge publishes it. MIT-licensed, like everything here.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={publish} style={btn}>Publish via pull request</button>
          <button onClick={fileIssue} style={btnGhost}>File proposal issue instead</button>
          <button onClick={() => copy(profileIssueBody(profile), "json")} style={btnGhost}>{copied === "json" ? "✓ Copied proposal" : "Copy proposal markdown"}</button>
          <button onClick={() => navigate("catalog")} style={btnGhost}>Back to catalog</button>
        </div>
        {publishState && (
          <p style={{ marginTop: 12, fontSize: 13, color: publishState.startsWith("✓") ? "var(--lime)" : "var(--cream-dim)", whiteSpace: "pre-wrap" }}>
            {publishState.includes("http") ? (
              <>
                {publishState.split(/(https:\/\/[^\s)]+)/).map((part, i) =>
                  part.startsWith("https://") ? (
                    <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: "var(--lime)", fontWeight: 700 }}>{part}</a>
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
