import React, { useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { emptyProfile, slugify, type ProfileManifest } from "../../types.js";
import { profileIssueBody, profileIssueTitle } from "../../proposal.js";

/**
 * Profile builder — the primary creation flow. Deliberately simple: a
 * profession is identity + expertise + rules + tools + verification. The
 * output is the canonical ProfileManifest JSON the CLI already equips, so
 * anything built here installs with `proagent equip <slug>` and any crew
 * worker can declare it as its profession.
 */

const btn: React.CSSProperties = { background: "var(--lime)", color: "#000", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--cream-dim)", marginBottom: 4, marginTop: 10, textTransform: "uppercase" as const, letterSpacing: 0.4 };

/** Client-side mirror of the deterministic profile validator (PA03x subset). */
function validate(p: ProfileManifest): string[] {
  const problems: string[] = [];
  const idOk = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!p.profile.slug || !idOk.test(p.profile.slug)) problems.push("Slug must be a lowercase kebab-case slug (PA031).");
  if (!p.profile.name) problems.push("Name is required (PA030).");
  if (!/^\d+\.\d+\.\d+/.test(p.profile.version)) problems.push("Profile version must be semver (PA032).");
  if (!p.identity.title) problems.push("Identity title is required (PA030).");
  if (!p.expertise || p.expertise.length === 0) problems.push("Add at least one expertise area (PA033).");
  if (!p.tools.required || p.tools.required.length === 0) problems.push("Add at least one required tool (PA034).");
  if (!p.verification.required || p.verification.required.length === 0) problems.push("Add at least one verification requirement (PA035).");
  const forbidden = new Set(p.tools.forbidden ?? []);
  for (const t of p.tools.required) {
    if (forbidden.has(t)) problems.push(`Tool \"${t}\" is both required and forbidden (PA036).`);
  }
  return problems;
}

export function ProfileBuilderPage(props: { ctx: AppCtx }): React.JSX.Element {
  const { settings, navigate } = props.ctx;
  const [profile, setProfile] = useState<ProfileManifest>(() => emptyProfile());
  const [tab, setTab] = useState<"identity" | "expertise" | "boundaries" | "ship">("identity");
  const [problems, setProblems] = useState<string[] | null>(null);
  const [publishState, setPublishState] = useState("");

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
    const errs = validate(profile);
    setProblems(errs);
    if (errs.length > 0) return;
    if (!settings.githubToken) {
      setPublishState("Sign in with GitHub (header) to publish — publishing files a proposal issue on the catalog repo.");
      return;
    }
    setPublishState("Filing marketplace proposal…");
    try {
      const { createIssue } = await import("../../github.js");
      const repo = (import.meta.env.VITE_MARKET_REPO as string | undefined) ?? "EnzoVezzaro/proagents";
      const res = await createIssue(settings.githubToken, repo, profileIssueTitle(profile), profileIssueBody(profile), ["profile-proposal"]);
      setPublishState(`✓ Proposal filed: ${res.html_url}\nCI validates it within seconds. A maintainer merges it with /publish and it appears in the marketplace.`);
    } catch (err) {
      setPublishState(`Publish failed: ${(err as Error).message}`);
    }
  };

  const tabs: Array<[typeof tab, string]> = [
    ["identity", "1 · Identity"],
    ["expertise", "2 · Expertise & rules"],
    ["boundaries", "3 · Tools & verification"],
    ["ship", "4 · Ship"],
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Build a profile</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        You are writing a <strong>profile spec</strong> — identity, expertise, methods, rules,
        tools and verification — not the agent itself. Your harness executes it: the proagent
        CLI hands the spec to your coding agent (<code>npx proagent equip</code>), and crew
        workers can carry it as their profession.
      </p>

      <div style={{ display: "flex", gap: 6, margin: "20px 0", flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...(id === tab ? btn : btnGhost), background: id === tab ? "var(--lime)" : "transparent", color: id === tab ? "#000" : "var(--cream-dim)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "identity" && <IdentityTab profile={profile} update={update} />}
      {tab === "expertise" && <ExpertiseTab profile={profile} update={update} />}
      {tab === "boundaries" && <BoundariesTab profile={profile} update={update} />}
      {tab === "ship" && <ShipTab profile={profile} problems={problems} publish={publish} publishState={publishState} exportJson={exportJson} navigate={navigate} />}
    </div>
  );
}

function IdentityTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  const p = profile.profile;
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={label}>Profession name</label>
          <input style={field} value={p.name} onChange={(e) => update({ profile: { ...p, name: e.target.value, slug: p.slug || slugify(e.target.value) }, identity: { ...profile.identity, title: e.target.value } })} placeholder="Security Engineer" />
        </div>
        <div>
          <label style={label}>Slug (kebab-case)</label>
          <input style={field} value={p.slug} onChange={(e) => update({ profile: { ...p, slug: slugify(e.target.value) } })} placeholder="security-engineer" />
        </div>
        <div>
          <label style={label}>Version (semver)</label>
          <input style={field} value={p.version} onChange={(e) => update({ profile: { ...p, version: e.target.value } })} />
        </div>
        <div>
          <label style={label}>Tags (comma-separated)</label>
          <input style={field} value={(p.tags ?? []).join(", ")} onChange={(e) => update({ profile: { ...p, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} />
        </div>
      </div>
      <label style={label}>Identity summary — how should the agent operate?</label>
      <textarea style={{ ...field, minHeight: 90 }} value={profile.identity.summary ?? ""} onChange={(e) => update({ identity: { ...profile.identity, summary: e.target.value } })} placeholder="You operate as a… You assume… You never…" />
      <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 10 }}>
        The summary becomes the opening of every equipped SKILL.md — one paragraph, second person.
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
      <label style={label}>Standards (one per line)</label>
      <input style={field} value={(profile.standards ?? []).join(", ")} onChange={(e) => update({ standards: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="OWASP" />
    </Card>
  );
}

function BoundariesTab(props: { profile: ProfileManifest; update: (p: Partial<ProfileManifest>) => void }): React.JSX.Element {
  const { profile, update } = props;
  const csv = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <Card>
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
      <label style={label}>Verification — required before the agent claims completion (one per line)</label>
      <textarea style={{ ...field, minHeight: 90 }} value={profile.verification.required.join("\n")} onChange={(e) => update({ verification: { required: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } })} placeholder={"tests pass\nno new lint errors"} />
      <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 10 }}>
        Verification is what makes a profile enforceable: these become required-before-completion steps in every equipped agent (PA035).
      </p>
    </Card>
  );
}

function ShipTab(props: {
  profile: ProfileManifest;
  problems: string[] | null;
  publish: () => void;
  publishState: string;
  exportJson: () => void;
  navigate: (to: string) => void;
}): React.JSX.Element {
  const { profile, problems, publish, publishState, exportJson, navigate } = props;
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
        <label style={label}>1 · Use it right now</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 10px" }}>
          Drop the JSON into <code>profiles/</code> in your repo (or publish it below), then equip it:
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
        <label style={label}>2 · Share it on the marketplace</label>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "4px 0 12px" }}>
          Free and MIT-licensed, like everything in the marketplace. Publishing files a{" "}
          <strong>proposal issue</strong> — CI validates it automatically and a maintainer merge
          (<code>/publish</code>) lists it. Once published, any crew builder can use it as a
          worker's profession.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={publish} style={btn}>File marketplace proposal</button>
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
