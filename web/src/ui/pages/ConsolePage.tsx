import React, { useRef, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { card, field, btnGhost, interactive, focusProps, type } from "../tokens.js";
import {
  parseConsoleReport,
  codeInfo,
  type ParseResult,
  type Finding,
} from "../../console.js";
import type { ConsoleReport } from "../../console-types.js";

/**
 * Studio Console — read-only viewer for the CLI's `--json` introspection
 * output (doctor, audit, list-installed, memory list/compile). The Studio is
 * a browser-only island; it cannot read the local repo, so you run the
 * command in your checkout and paste (or load) its JSON here. Everything
 * renders from the pasted bytes + the pinned DG/AU code tables — the browser
 * never fabricates repository state. Read-only, deterministic, no network.
 */

type TabId = "doctor" | "audit" | "installed" | "memory";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "doctor", label: "doctor" },
  { id: "audit", label: "audit" },
  { id: "installed", label: "list-installed" },
  { id: "memory", label: "memory" },
];

/** The exact CLI invocation to produce each report — the empty-state teacher. */
const COMMAND_HINT: Record<TabId, { command: string; note: string }> = {
  doctor: { command: "proagent doctor --json", note: "Verifies installed profiles, crews and instruction blocks against provenance. Exit 0 healthy · 1 warnings · 2 errors." },
  audit: { command: "proagent audit --json", note: "Deterministic security scan of the repo — secrets, remote-exec, MCP, permissions. Exit 0 clean · 1 warnings · 2 errors." },
  installed: { command: "proagent list-installed --json", note: "Inventory of everything ProAgents owns in this repo — profiles, crews, instruction blocks with ownership markers." },
  memory: { command: "proagent memory list --json", note: "Explicit project memory. Paste `memory list --json` to view records, or `memory compile --json` to preview a compiled block." },
};

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  error: "error",
  warning: "warning",
};

export function ConsolePage(_props: { ctx: AppCtx }): React.JSX.Element {
  const [tab, setTab] = useState<TabId>("doctor");
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const hint = COMMAND_HINT[tab];

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await f.text();
    setPasted(raw);
    setResult(parseConsoleReport(raw, tab === "audit" ? "audit" : "doctor"));
    if (fileRef.current) fileRef.current.value = "";
  };

  const active = result?.ok ? result.report : null;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: "0 0 6px" }}>Console</h1>
        <div role="tablist" aria-label="Report type" style={{ display: "flex", gap: 6 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setResult(null);
                setPasted("");
              }}
              {...focusProps()}
              style={{
                ...interactive,
                background: tab === t.id ? "var(--accent-soft)" : "var(--ink-2)",
                color: tab === t.id ? "var(--cyan)" : "var(--cream-dim)",
                border: `1px solid ${tab === t.id ? "var(--cyan)" : "var(--line)"}`,
                borderRadius: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <p style={{ ...type.body, maxWidth: 660, marginTop: 6 }}>
        The Studio runs entirely in your browser, so it cannot read your checkout. Run the command below in your repo
        and paste (or load) its <code>--json</code> output here. Findings render against the pinned code tables.
      </p>

      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            style={{ display: "none" }}
            aria-hidden
            tabIndex={-1}
          />
          <button onClick={() => fileRef.current?.click()} {...focusProps()} style={{ ...btnGhost, padding: "8px 14px" }}>
            Load JSON file…
          </button>
          <span style={{ color: "var(--cream-dim)", fontSize: 13 }}>or paste:</span>
        </div>
        <textarea
          value={pasted}
          onChange={(e) => {
            setPasted(e.target.value);
            setResult(e.target.value.trim() ? parseConsoleReport(e.target.value, tab === "audit" ? "audit" : "doctor") : null);
          }}
          placeholder={`${hint.command}\n\n${hint.note}`}
          spellCheck={false}
          rows={10}
          style={{ ...field, marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, resize: "vertical", whiteSpace: "pre" }}
        />
        <p style={{ ...type.small, marginTop: 8 }}>
          <code style={{ background: "var(--ink-3)", borderRadius: 4, padding: "2px 6px" }}>{hint.command}</code> — {hint.note}
        </p>
      </div>

      {pasted.trim() && !result?.ok && result && (
        <div style={{ marginTop: 12 }}>
          <ErrorNote message={result.errors.join("")} />
        </div>
      )}

      {active && tab !== "memory" && <DoctorOrAuditView report={active as Extract<ConsoleReport, { kind: "doctor" | "audit" }>} />}
      {active && tab === "installed" && <InstalledView report={active as Extract<ConsoleReport, { kind: "list-installed" }>} />}
      {active && tab === "memory" && <MemoryView report={active as Extract<ConsoleReport, { kind: "memory-list" | "memory-compile" }>} />}
    </div>
  );
}

function SeverityBadge(props: { severity: Finding["severity"]; code: string }): React.JSX.Element {
  const { severity, code } = props;
  const err = severity === "error";
  return (
    <span
      style={{
        background: err ? "rgba(255,107,122,0.1)" : "rgba(255,190,90,0.1)",
        border: `1px solid ${err ? "var(--danger)" : "rgba(255,190,90,0.5)"}`,
        color: err ? "#ffb3ba" : "#ffd88f",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap" as const,
      }}
    >
      {SEVERITY_LABEL[severity]} {code}
    </span>
  );
}

function FindingRows(props: { findings: Finding[] }): React.JSX.Element {
  const { findings } = props;
  if (findings.length === 0) {
    return <p style={{ color: "var(--ok)", margin: 0 }}>No findings — this surface is healthy.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {findings.map((f, i) => {
        const fact = codeInfo(f.code);
        return (
          <div key={`${f.code}-${i}`} style={{ ...card, padding: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <SeverityBadge severity={f.severity} code={f.code} />
              {f.file && <code style={{ fontSize: 12, color: "var(--cream-dim)" }}>{f.file}{f.line != null ? `:${f.line}` : ""}</code>}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{f.message}</div>
            {f.suggestion && <div style={{ fontSize: 12.5, color: "var(--cream-dim)", marginTop: 4 }}>→ {f.suggestion}</div>}
            {fact.known && fact.meaning && <div style={{ fontSize: 12, color: "var(--cream-dim)", opacity: 0.8, marginTop: 2 }}>{fact.meaning}</div>}
          </div>
        );
      })}
    </div>
  );
}

function DoctorOrAuditView(props: { report: Extract<ConsoleReport, { kind: "doctor" | "audit" }> }): React.JSX.Element {
  const { report } = props;
  const { errors, warnings } = report.summary;
  const state = errors > 0 ? "errors" : warnings > 0 ? "warnings" : "healthy";
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          ...card,
          padding: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--cream-dim)" }}>
          <strong style={{ color: "var(--cream)" }}>{report.summary.total}</strong> finding(s) ·{" "}
          <strong style={{ color: "var(--cream)" }}>{errors}</strong> error(s) ·{" "}
          <strong style={{ color: "var(--cream)" }}>{warnings}</strong> warning(s)
          {report.root ? ` · ${report.root}` : ""}
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
            color: state === "healthy" ? "var(--ok)" : state === "warnings" ? "#ffd88f" : "#ffb3ba",
            border: `1px solid ${state === "healthy" ? "var(--ok)" : state === "warnings" ? "rgba(255,190,90,0.5)" : "var(--danger)"}`,
            borderRadius: 999,
            padding: "3px 12px",
          }}
        >
          {state} · exit {report.exit}
        </span>
      </div>
      <div style={{ marginTop: 10 }}>
        <FindingRows findings={report.findings} />
      </div>
    </div>
  );
}

function InstalledView(props: { report: Extract<ConsoleReport, { kind: "list-installed" }> }): React.JSX.Element {
  const { report } = props;
  const { profiles, crews, blocks } = report.summary;
  const empty = profiles === 0 && crews === 0 && blocks === 0;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...card, padding: 14, fontSize: 13, color: "var(--cream-dim)" }}>
        <strong style={{ color: "var(--cream)" }}>{profiles}</strong> profile(s) ·{" "}
        <strong style={{ color: "var(--cream)" }}>{crews}</strong> crew(s) ·{" "}
        <strong style={{ color: "var(--cream)" }}>{blocks}</strong> block(s)
        {report.root ? ` · ${report.root}` : ""}
      </div>
      {empty && <div style={{ marginTop: 10 }}><p style={{ color: "var(--cream-dim)" }}>Nothing installed yet — try <code>proagent equip &lt;profile&gt;</code>.</p></div>}
      {!empty && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 10 }}>
          {profiles > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ ...type.h3 }}>Profiles</div>
              {report.profiles.map((p) => (
                <div key={p.dir} style={{ fontSize: 12.5, color: "var(--cream-dim)", marginTop: 6, lineHeight: 1.5 }}>
                  <div style={{ color: "var(--cream)" }}>{p.slug} <span style={{ opacity: 0.7 }}>v{p.version}</span></div>
                  <div>{p.canonical ? "canonical" : "composed"} · {p.hasManifest ? "manifest ✓" : "manifest broken"} · {p.hasSkill ? "skill ✓" : "SKILL.md missing"}</div>
                </div>
              ))}
            </div>
          )}
          {crews > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ ...type.h3 }}>Crews</div>
              {report.crews.map((c) => (
                <div key={c.dir} style={{ fontSize: 12.5, color: "var(--cream-dim)", marginTop: 6, lineHeight: 1.5 }}>
                  <div style={{ color: "var(--cream)" }}>{c.id} <span style={{ opacity: 0.7 }}>v{c.version}</span></div>
                  <div>{c.hasSkill ? "skill ✓" : "SKILL.md missing"}</div>
                </div>
              ))}
            </div>
          )}
          {blocks > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <div style={{ ...type.h3 }}>Instruction blocks</div>
              {report.blocks.map((b) => (
                <div key={`${b.file}-${b.marker}`} style={{ fontSize: 12.5, color: "var(--cream-dim)", marginTop: 6, lineHeight: 1.5 }}>
                  <div style={{ color: "var(--cream)" }}>{b.title || b.marker}</div>
                  <div>{b.file}{b.line != null ? `:${b.line}` : ""} · {b.closed ? "balanced" : "unclosed"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryView(props: { report: Extract<ConsoleReport, { kind: "memory-list" | "memory-compile" }> }): React.JSX.Element {
  const r = props.report;
  if (r.kind === "memory-compile") {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ ...card, padding: 14, fontSize: 13, color: "var(--cream-dim)" }}>
          Compiled for <strong style={{ color: "var(--cream)" }}>{r.target || "detected harness"}</strong> →{" "}
          <code>{r.file}</code> · {r.records.length} record(s)
          {r.note ? ` · ${r.note}` : ""}
        </div>
        {r.block ? (
          <pre
            style={{
              ...card,
              marginTop: 10,
              overflowX: "auto",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap" as const,
            }}
          >
            {r.block}
          </pre>
        ) : (
          <p style={{ color: "var(--cream-dim)", marginTop: 10 }}>No block — nothing compiled.</p>
        )}
      </div>
    );
  }
  const records = r.records;
  const empty = records.length === 0;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...card, padding: 14, fontSize: 13, color: "var(--cream-dim)" }}>
        <strong style={{ color: "var(--cream)" }}>{r.summary.total}</strong> record(s), sorted by key
      </div>
      {empty && <p style={{ color: "var(--cream-dim)", marginTop: 10 }}>No memory recorded yet — add one with <code>proagent memory add</code>.</p>}
      {!empty && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginTop: 10 }}>
          {records.map((rec) => (
            <div key={rec.key} style={{ ...card, padding: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <strong style={{ color: "var(--cyan)", fontSize: 13 }}>{rec.key}</strong>
                <span style={{ fontSize: 11, color: "var(--cream-dim)" }}>v{rec.version}</span>
                {rec.scope && (
                  <span style={{ background: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 8px", fontSize: 11, color: "var(--cream-dim)" }}>{rec.scope}</span>
                )}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{rec.value}</div>
              {(rec.tags.length > 0 || rec.provenance) && (
                <div style={{ fontSize: 11.5, color: "var(--cream-dim)", marginTop: 6 }}>
                  {rec.tags.map((t) => `#${t}`).join(" ")}{rec.provenance ? rec.tags.length > 0 ? " · " : "" : ""}{rec.provenance ? `from ${rec.provenance}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}