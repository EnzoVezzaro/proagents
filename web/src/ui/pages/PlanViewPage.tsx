import React, { useMemo } from "react";
import type { AppCtx } from "../AppShell.js";
import { EmptyState } from "../cards.js";
import { card, btnGhost, focusProps, type } from "../tokens.js";
import { buildPlanSections, planStatus, planNextSteps } from "../../plan-view.js";
import { serializeSpecYaml, validateSpecClient, downloadText } from "../../project-spec.js";
import { CATALOG_URL } from "../../catalog.js";
import type { MarketplaceCatalog, SpecDocument } from "../../types.js";

/**
 * Plan view — read-only render of a project spec (the Build flow's
 * proagents.yaml), with PA5xx findings and the next CLI steps. The Studio is
 * browser-only, so the spec draft travels here via sessionStorage, written
 * by ProjectBuilderPage on its export step. Everything rendered is computed
 * deterministically in-browser from the draft bytes — no network, no writes.
 */

/** The handoff channel ProjectBuilderPage writes on "View plan". */
export const SPEC_DRAFT_KEY = "proagents-spec-draft";

export function loadSpecDraft(): SpecDocument | null {
  const raw = sessionStorage.getItem(SPEC_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SpecDocument;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.project?.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function PlanViewPage(props: { ctx: AppCtx; navigate: (to: string) => void }): React.JSX.Element {
  const { navigate } = props;
  const [catalog, setCatalog] = React.useState<MarketplaceCatalog | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => r.json() as Promise<MarketplaceCatalog>)
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const spec = useMemo(() => loadSpecDraft(), []);
  const findings = useMemo(() => (spec ? validateSpecClient(spec, catalog?.items ?? []) : []), [spec, catalog]);
  const status = useMemo(() => planStatus(findings), [findings]);

  if (!spec) {
    return (
      <div>
        <h1 style={{ margin: "0 0 6px" }}>Plan</h1>
        <div style={{ marginTop: 14 }}>
          <EmptyState
            title="No plan draft yet"
            body="Build a project spec first — the plan view renders the Build flow's proagents.yaml as a browsable, read-only plan."
          />
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => navigate("build-environment")}
              {...focusProps()}
              style={{ ...btnGhost, cursor: "pointer" }}
            >
              Open the Build flow →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sections = buildPlanSections(spec);
  const yaml = serializeSpecYaml(spec);
  const steps = planNextSteps(spec);
  const { errors, warnings } = status;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>{spec.project.name} — plan</h1>
          <p style={{ ...type.small, margin: 0 }}>Read-only render of the project spec ({yaml.split("\n")[0]})</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => downloadText("proagents.yaml", yaml)}
            {...focusProps()}
            style={{ ...btnGhost, cursor: "pointer", padding: "8px 14px" }}
          >
            Download proagents.yaml
          </button>
          <button
            onClick={() => navigate("build-environment")}
            {...focusProps()}
            style={{ ...btnGhost, cursor: "pointer", padding: "8px 14px" }}
          >
            Edit in Build →
          </button>
        </div>
      </div>

      <div
        style={{
          ...card,
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: 0.5,
            color: status.state === "ready" ? "var(--ok)" : status.state === "reviewable" ? "#ffd88f" : "#ffb3ba",
            border: `1px solid ${status.state === "ready" ? "var(--ok)" : status.state === "reviewable" ? "rgba(255,190,90,0.5)" : "var(--danger)"}`,
            borderRadius: 999,
            padding: "3px 12px",
          }}
        >
          {status.state}{errors > 0 || warnings > 0 ? ` · ${errors} error(s), ${warnings} warning(s)` : " · PA5xx clean"}
        </span>
        {sections.filter((s) => s.kind !== "project").reduce((n, s) => n + s.items.length, 0)} artifact(s) picked
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14 }}>
        {sections.filter((s) => s.kind !== "project").map((s) => (
          <div key={s.kind} style={{ ...card, padding: 14 }}>
            <div style={{ ...type.h3 }}>{s.title}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
              {s.items.map((item) => (
                <span key={item} style={{ background: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 10px", color: "var(--cream-dim)" }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {findings.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h2 style={{ ...type.h2 }}>Findings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {findings.map((f, i) => (
              <div key={i} style={{ ...card, padding: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: f.severity === "error" ? "rgba(255,107,122,0.1)" : "rgba(255,190,90,0.1)",
                      border: `1px solid ${f.severity === "error" ? "var(--danger)" : "rgba(255,190,90,0.5)"}`,
                      color: f.severity === "error" ? "#ffb3ba" : "#ffd88f",
                      borderRadius: 999,
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {f.severity} {f.code}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{f.message}</span>
                </div>
                {f.suggestion && <div style={{ fontSize: 12.5, color: "var(--cream-dim)", marginTop: 4 }}>→ {f.suggestion}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h2 style={{ ...type.h2 }}>Next steps</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((s) => (
            <div key={s.command} style={{ ...card, padding: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>{s.command}</code>
              <span style={{ fontSize: 12.5, color: "var(--cream-dim)" }}>{s.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2 style={{ ...type.h2 }}>proagents.yaml</h2>
        <pre style={{ ...card, overflowX: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
          {yaml}
        </pre>
      </div>
    </div>
  );
}