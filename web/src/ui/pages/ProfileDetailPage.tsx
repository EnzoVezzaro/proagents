import React from "react";
import type { ProfileManifest } from "../../types.js";

/** Detail renderer for catalog items of kind "profile" (a ProfileManifest). */
export function ProfileDetail(props: { manifest: ProfileManifest }): React.JSX.Element {
  const m = props.manifest;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ margin: "0 0 8px" }}>{m.identity.title}</h1>
          {m.identity.summary && <p style={{ color: "var(--cream-dim)", lineHeight: 1.6, margin: 0 }}>{m.identity.summary}</p>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {(m.profile.tags ?? []).map((t) => (
              <span key={t} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 12px", fontSize: 12, color: "var(--cream-dim)" }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, minWidth: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ok)", textDecoration: "none" }}>Free · MIT</div>
          <div style={{ color: "var(--cream-dim)", fontSize: 12, marginBottom: 14 }}>v{m.version} · by {m.profile.author ?? "community"}</div>
          <p style={{ color: "var(--cream-dim)", fontSize: 12, margin: "0 0 10px" }}>Equip the coding agent you already use with this profession:</p>
          <pre style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 13, margin: 0, overflowX: "auto" }}>
            <code>proagent equip {m.profile.slug}</code>
          </pre>
        </div>
      </div>

      <Section title="Expertise" items={m.expertise} />
      {m.methods && m.methods.length > 0 && <Section title="Methods" items={m.methods} />}
      {m.skills && m.skills.length > 0 && <Section title="Skills" items={m.skills} />}
      {m.standards && m.standards.length > 0 && <Section title="Standards" items={m.standards} />}

      {m.rules && m.rules.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Rules (normative)</h2>
          <ul style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.8 }}>
            {m.rules.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Tools &amp; verification</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        {(m.tools.required ?? []).map((t) => <Chip key={t}>tool: {t}</Chip>)}
        {(m.tools.optional ?? []).map((t) => <Chip key={t} dim>optional: {t}</Chip>)}
        {(m.verification.required ?? []).map((v) => <Chip key={v}>verify: {v}</Chip>)}
        {(m.verification.optional ?? []).map((v) => <Chip key={v} dim>verify optional: {v}</Chip>)}
      </div>

      <h2 style={{ marginTop: 32 }}>Equip into your repo</h2>
      <p style={{ color: "var(--cream-dim)", fontSize: 14 }}>
        One command in the repo root — compiles the profile to your detected harness (skills, instructions, rule enforcement):
      </p>
      <pre style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 13, overflowX: "auto" }}>
        <code>npx proagent equip {m.profile.slug}</code>
      </pre>
    </div>
  );
}

function Section(props: { title: string; items: string[] }): React.JSX.Element {
  if (props.items.length === 0) return <></>;
  return (
    <>
      <h2 style={{ marginTop: 32 }}>{props.title}</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        {props.items.map((i) => <Chip key={i}>{i}</Chip>)}
      </div>
    </>
  );
}

function Chip(props: { children: React.ReactNode; dim?: boolean }): React.JSX.Element {
  return (
    <span style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 12px", color: props.dim ? "var(--cream-dim)" : "var(--cream)" }}>
      {props.children}
    </span>
  );
}
