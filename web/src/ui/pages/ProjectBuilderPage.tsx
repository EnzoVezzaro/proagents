import React, { useEffect, useMemo, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { btnPrimary, btnGhost, btnSoft, field, label as labelTok, card, type as typeTok } from "../tokens.js";
import type { MarketplaceCatalog, MarketplaceItem, SpecDocument, SpecFinding } from "../../types.js";
import { CATALOG_URL, catalogUrl } from "../../catalog.js";
import { deriveCapabilities, serializeSpecYaml, toggleIn, validateSpecClient, downloadText, type CapabilityDef } from "../../project-spec.js";

/**
 * ProjectBuilderPage — the Studio BUILD mode (NEW_CHANGES.md §10):
 *
 *   intent → capabilities → artifacts → policies → validate → export
 *
 * The primary Studio experience. Discover (CatalogPage) is secondary and
 * feeds this via "Use in Project". Output is the universal proagents.yaml —
 * harness-agnostic by construction; `proagent setup` compiles it per target.
 */

/** The seed capability taxonomy, served beside the catalog. */
const TAXONOMY_URL = catalogUrl("capabilities/index.json");

/** Seed harness targets offered in the compatibility picker. */
const HARNESS_TARGETS = ["claude-code", "codex", "opencode", "cursor", "gemini-cli", "copilot", "generic-cli"] as const;

type StepId = "intent" | "capabilities" | "artifacts" | "policies" | "export";

const STEPS: Array<{ id: StepId; title: string; hint: string }> = [
  { id: "intent", title: "Intent", hint: "What are you building?" },
  { id: "capabilities", title: "Capabilities", hint: "Abstract abilities the environment needs" },
  { id: "artifacts", title: "Artifacts", hint: "Profiles, crews and skills from the registry" },
  { id: "policies", title: "Policies", hint: "Filesystem and network boundaries" },
  { id: "export", title: "Export", hint: "proagents.yaml — the source of truth" },
];

/** Default capability picks for a native catalog hit (provides → chips). */
function capabilitiesOfItems(items: MarketplaceItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.provides ?? []))].sort();
}

export function ProjectBuilderPage(_props: { ctx: AppCtx }): React.JSX.Element {
  const [step, setStep] = useState<StepId>("intent");
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [taxonomy, setTaxonomy] = useState<CapabilityDef[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The draft spec — single source of state for the whole flow.
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [crews, setCrews] = useState<string[]>([]);
  const [workspaceOnly, setWorkspaceOnly] = useState(true);
  const [networkAllowed, setNetworkAllowed] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`catalog fetch failed: HTTP ${r.status}`);
        return r.json() as Promise<MarketplaceCatalog>;
      })
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        // "Use in Project" handoff from Discover (sessionStorage channel —
        // the same mechanism the crew draft uses). Picks land in the spec's
        // environment sections; unknown ids are ignored silently.
        try {
          const raw = sessionStorage.getItem("proagents-project-picks");
          if (raw) {
            sessionStorage.removeItem("proagents-project-picks");
            const refs = JSON.parse(raw) as string[];
            for (const ref of Array.isArray(refs) ? refs : []) {
              const [kind, id] = String(ref).split(":");
              const item = c.items.find((i) => i.id === id && i.kind === kind);
              if (!item) continue;
              if (item.kind === "profile") setProfiles((cur) => (cur.includes(id) ? cur : [...cur, id]));
              if (item.kind === "crew") setCrews((cur) => (cur.includes(id) ? cur : [...cur, id]));
              for (const cap of item.provides ?? []) setCapabilities((cur) => (cur.includes(cap) ? cur : [...cur, cap]));
            }
          }
        } catch {
          /* malformed picks — start clean */
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError((err as Error).message);
      });
    fetch(TAXONOMY_URL)
      .then((r) => (r.ok ? (r.json() as Promise<CapabilityDef[]>) : []))
      .then((t) => {
        if (!cancelled) setTaxonomy(Array.isArray(t) ? t : []);
      })
      .catch(() => {
        /* taxonomy is optional — the chips fall back to catalog provides */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const spec: SpecDocument = useMemo(
    () => ({
      schema: "proagents/v1",
      project: { name: name.trim() || "my-project" },
      environment: {
        ...(profiles.length > 0 ? { profiles } : {}),
        ...(crews.length > 0 ? { crews } : {}),
        ...(capabilities.length > 0 ? { capabilities } : {}),
      },
      ...(workspaceOnly || networkAllowed.trim().length > 0
        ? {
            policies: {
              ...(workspaceOnly ? { filesystem: { "workspace-only": true } } : {}),
              ...(networkAllowed.trim().length > 0
                ? { network: { allowed: networkAllowed.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) } }
                : {}),
            },
          }
        : {}),
      ...(targets.length > 0 ? { harness: { mode: "compatible" as const, compatibility: targets } } : {}),
    }),
    [name, profiles, crews, capabilities, workspaceOnly, networkAllowed, targets],
  );

  const findings: SpecFinding[] = useMemo(
    () => validateSpecClient(spec, catalog?.items ?? []),
    [spec, catalog],
  );

  const suggested = useMemo(
    () => (intent.trim().length > 3 ? deriveCapabilities(intent, taxonomy) : []),
    [intent, taxonomy],
  );

  /** Catalog items providing any selected capability, plus manual picks. */
  const suggestedItems = useMemo(() => {
    const items = catalog?.items ?? [];
    if (capabilities.length === 0) return [];
    return items
      .filter((i) => (i.provides ?? []).some((p) => capabilities.includes(p)))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  }, [catalog, capabilities]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const stepDone = (id: StepId): boolean => {
    switch (id) {
      case "intent":
        return name.trim().length > 0 && intent.trim().length > 0;
      case "capabilities":
        return capabilities.length > 0;
      case "artifacts":
        return profiles.length > 0 || crews.length > 0;
      case "policies":
        return true; // policies are optional by design
      case "export":
        return exported;
    }
  };

  if (loadError && !catalog) {
    return (
      <div>
        <h1 style={typeTok.h1}>Build an environment</h1>
        <ErrorNote message={`Could not load the registry catalog (${loadError}).`} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 30, letterSpacing: "-0.02em" }}>Build an environment</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6, margin: "0 0 4px" }}>
        Don't pick agents — engineer the agent environment your project needs. The output is a
        portable <code>proagents.yaml</code> any compatible harness can consume via{" "}
        <code>proagent setup</code>.
      </p>

      {/* Step rail */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0 22px" }} role="tablist" aria-label="Build steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={step === s.id}
            onClick={() => setStep(s.id)}
            style={{
              ...(step === s.id ? btnPrimary : btnSoft),
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
            title={s.hint}
          >
            {stepDone(s.id) ? "✓ " : `${i + 1}. `}
            {s.title}
          </button>
        ))}
      </div>

      {/* Step: intent */}
      {step === "intent" && (
        <section style={{ ...card, maxWidth: 760 }}>
          <h2 style={typeTok.h2}>What are you building?</h2>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6 }}>
            Describe the project in one or two sentences. ProAgents suggests the capabilities your
            environment needs — you stay in control of every pick.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div>
              <label htmlFor="pb-name" style={labelTok}>Project name</label>
              <input
                id="pb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-saas"
                style={field}
              />
            </div>
            <div>
              <label htmlFor="pb-intent" style={labelTok}>Intent</label>
              <textarea
                id="pb-intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                rows={4}
                placeholder="Build a production SaaS application with React, Node.js, PostgreSQL and automated testing."
                style={{ ...field, resize: "vertical" }}
              />
            </div>
            {suggested.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  Suggested capabilities ({suggested.length})
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {suggested.slice(0, 12).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCapabilities((cur) => toggleIn(cur, c.id))}
                      style={{
                        ...btnSoft,
                        borderRadius: 999,
                        padding: "5px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        ...(capabilities.includes(c.id) ? { borderColor: "var(--blue-bright)", color: "var(--cream)" } : {}),
                      }}
                      aria-pressed={capabilities.includes(c.id)}
                      title={c.description ?? c.id}
                    >
                      {capabilities.includes(c.id) ? "✓ " : "+ "}
                      {c.title ?? c.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <button
                onClick={() => setStep("capabilities")}
                style={{ ...btnPrimary, cursor: "pointer" }}
                disabled={!name.trim() || !intent.trim()}
              >
                Next: Capabilities →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step: capabilities */}
      {step === "capabilities" && (
        <section style={{ ...card, maxWidth: 860 }}>
          <h2 style={typeTok.h2}>Required capabilities</h2>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6 }}>
            Capabilities are abstract abilities — <code>browser-automation</code>, not Playwright.
            The resolver picks implementations later (native catalog first, federated sources next).
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {(taxonomy.length > 0
              ? taxonomy
              : capabilitiesOfItems(catalog?.items ?? []).map((id): CapabilityDef => ({ id, title: id }))
            ).map((c) => (
              <button
                key={c.id}
                onClick={() => setCapabilities((cur) => toggleIn(cur, c.id))}
                aria-pressed={capabilities.includes(c.id)}
                title={c.description ?? c.id}
                style={{
                  ...btnSoft,
                  borderRadius: 999,
                  padding: "6px 13px",
                  fontSize: 12.5,
                  cursor: "pointer",
                  ...(capabilities.includes(c.id) ? { borderColor: "var(--blue-bright)", color: "var(--cream)", background: "var(--ink-3)" } : {}),
                }}
              >
                {capabilities.includes(c.id) ? "✓ " : ""}
                {c.title ?? c.id}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setStep("intent")} style={{ ...btnGhost, cursor: "pointer" }}>← Back</button>
            <button onClick={() => setStep("artifacts")} style={{ ...btnPrimary, cursor: "pointer" }} disabled={capabilities.length === 0}>
              Next: Artifacts →
            </button>
          </div>
        </section>
      )}

      {/* Step: artifacts */}
      {step === "artifacts" && (
        <section style={{ ...card, maxWidth: 860 }}>
          <h2 style={typeTok.h2}>Artifacts from the registry</h2>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6 }}>
            Native catalog items that provide your selected capabilities. Selections here become the
            spec's <code>profiles</code> / <code>crews</code> sections.
          </p>
          {suggestedItems.length === 0 ? (
            <p style={{ color: "var(--cream-dim)", fontSize: 13, marginTop: 14 }}>
              No native items provide the selected capabilities yet — they may resolve from federated
              sources at <code>proagent resolve</code> time. You can continue to policies.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {suggestedItems.map((item) => {
                const isProfile = item.kind === "profile";
                const selected = isProfile ? profiles.includes(item.id) : crews.includes(item.id);
                const toggle = () => {
                  if (isProfile) setProfiles((cur) => toggleIn(cur, item.id));
                  else if (item.kind === "crew") setCrews((cur) => toggleIn(cur, item.id));
                };
                const canToggle = isProfile || item.kind === "crew";
                return (
                  <div
                    key={`${item.kind}:${item.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      border: selected ? "1px solid var(--blue-bright)" : "1px solid var(--line)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      background: "var(--ink-2)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {item.name}{" "}
                        <span style={{ color: "var(--cream-dim)", fontWeight: 400, fontSize: 12 }}>
                          · {item.kind} · v{item.version}
                        </span>
                      </div>
                      <div style={{ color: "var(--cream-dim)", fontSize: 12.5, marginTop: 2 }}>{item.description}</div>
                    </div>
                    {canToggle ? (
                      <button onClick={toggle} aria-pressed={selected} style={{ ...(selected ? btnPrimary : btnSoft), borderRadius: 10, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}>
                        {selected ? "✓ In environment" : "Add to environment"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>capability provider</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setStep("capabilities")} style={{ ...btnGhost, cursor: "pointer" }}>← Back</button>
            <button onClick={() => setStep("policies")} style={{ ...btnPrimary, cursor: "pointer" }}>Next: Policies →</button>
          </div>
        </section>
      )}

      {/* Step: policies */}
      {step === "policies" && (
        <section style={{ ...card, maxWidth: 760 }}>
          <h2 style={typeTok.h2}>Policies &amp; harness targets</h2>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6 }}>
            Policies compile into harness enforcement where the target supports it; the setup report
            states limitations honestly. Harness compatibility is metadata, not a pin — leave empty
            for <code>mode: compatible</code>.
          </p>
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={workspaceOnly} onChange={(e) => setWorkspaceOnly(e.target.checked)} />
              Filesystem: workspace-only
            </label>
            <div>
              <label htmlFor="pb-network" style={labelTok}>Network allowlist (comma-separated hostnames)</label>
              <input
                id="pb-network"
                value={networkAllowed}
                onChange={(e) => setNetworkAllowed(e.target.value)}
                placeholder="github.com, api.example.com"
                style={field}
              />
            </div>
            <div>
              <div style={{ ...labelTok, marginBottom: 8 }}>Harness compatibility targets</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {HARNESS_TARGETS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setTargets((cur) => toggleIn(cur, h))}
                    aria-pressed={targets.includes(h)}
                    style={{
                      ...btnSoft,
                      borderRadius: 999,
                      padding: "5px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      ...(targets.includes(h) ? { borderColor: "var(--blue-bright)", color: "var(--cream)" } : {}),
                    }}
                  >
                    {targets.includes(h) ? "✓ " : ""}
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setStep("artifacts")} style={{ ...btnGhost, cursor: "pointer" }}>← Back</button>
            <button onClick={() => setStep("export")} style={{ ...btnPrimary, cursor: "pointer" }}>Next: Export →</button>
          </div>
        </section>
      )}

      {/* Step: export */}
      {step === "export" && (
        <section style={{ ...card, maxWidth: 860 }}>
          <h2 style={typeTok.h2}>Export proagents.yaml</h2>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6 }}>
            The spec is the source of truth — commit it to the repo root next to your code. Then:
          </p>
          <pre style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, overflow: "auto" }}>
{`proagent resolve    # capability → implementation graph
proagent lock       # persist the resolution
proagent setup      # install the environment for your harness`}
          </pre>

          {findings.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {findings.map((f, i) => (
                <div key={i} style={{ color: f.severity === "error" ? "var(--danger, #ff6b6b)" : "var(--cream-dim)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 6 }}>
                  {f.severity === "error" ? "✗" : "⚠"} [{f.code}] {f.message}
                  {f.suggestion ? <div style={{ marginLeft: 18, color: "var(--cream-dim)" }}>→ {f.suggestion}</div> : null}
                </div>
              ))}
            </div>
          )}

          <pre
            aria-label="proagents.yaml preview"
            style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 12.5, lineHeight: 1.55, overflow: "auto", marginTop: 12 }}
          >
            {serializeSpecYaml(spec)}
          </pre>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                downloadText("proagents.yaml", serializeSpecYaml(spec));
                setExported(true);
              }}
              style={{ ...btnPrimary, cursor: "pointer" }}
            >
              Download proagents.yaml
            </button>
            <button onClick={() => setStep("policies")} style={{ ...btnGhost, cursor: "pointer" }}>← Back</button>
          </div>
        </section>
      )}

      {/* Progress footer */}
      <div style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 18 }}>
        Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex]!.hint}
      </div>
    </div>
  );
}
