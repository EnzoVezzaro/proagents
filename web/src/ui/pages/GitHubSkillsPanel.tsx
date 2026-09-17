import React, { useEffect, useState } from "react";
import {
  installCommand,
  parseFrontmatter,
  parseRepoRef,
  rawFileUrl,
  repoTreeUrl,
  skillsFromTree,
  type DiscoveredSkill,
} from "../../githubSkills.js";

/**
 * Marketplace panel for installing skills from any GitHub repo that ships
 * agent skills (a nested-SKILL.md collection). Entered by pasting a repo URL
 * into the marketplace search (Enter). Everything runs client-side against
 * api.github.com / raw.githubusercontent.com — no backend, no sign-in.
 */

interface SkillPreview {
  skill: DiscoveredSkill;
  description: string;
}

export function GitHubSkillsPanel(props: { input: string; onDone: () => void }): React.JSX.Element {
  const ref = parseRepoRef(props.input);
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; skills: SkillPreview[]; treeTruncated: boolean }
  >({ phase: "loading" });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    setState({ phase: "loading" });
    fetch(repoTreeUrl(ref))
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "repo or branch not found" : `HTTP ${r.status}`);
        return r.json() as Promise<{ tree: Array<{ path: string; type: string }>; truncated?: boolean }>;
      })
      .then(async (tree) => {
        const discovered = skillsFromTree(tree.tree ?? [], ref);
        if (cancelled) return;
        if (discovered.length === 0) {
          setState({
            phase: "error",
            message:
              "No skills found — no file named SKILL.md exists in this repo. Skills live in folders like skills/<name>/SKILL.md.",
          });
          return;
        }
        // Preview up to 12 skills (description from each SKILL.md frontmatter).
        const previews: SkillPreview[] = [];
        for (const skill of discovered.slice(0, 12)) {
          try {
            const md = await fetch(rawFileUrl(ref, skill.path)).then((r) => (r.ok ? r.text() : ""));
            const meta = parseFrontmatter(md);
            previews.push({ skill, description: meta.description ?? meta.name ?? "" });
          } catch {
            previews.push({ skill, description: "" });
          }
          if (cancelled) return;
        }
        if (!cancelled) setState({ phase: "ready", skills: previews, treeTruncated: Boolean(tree.truncated) });
      })
      .catch((err) => {
        if (!cancelled) setState({ phase: "error", message: `Could not load the repo (${(err as Error).message}).` });
      });
    return () => {
      cancelled = true;
    };
  }, [props.input]);

  if (!ref) {
    return (
      <div style={{ margin: "14px 0", color: "var(--cream-dim)", fontSize: 13 }}>
        Could not read that as a GitHub repo reference (try <code>owner/repo</code> or a full URL).
      </div>
    );
  }

  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  };

  return (
    <div
      style={{
        background: "var(--ink-2)",
        border: "1px solid var(--cyan)",
        borderRadius: 14,
        padding: 20,
        margin: "16px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Skills from{" "}
          <a
            href={`https://github.com/${ref.owner}/${ref.repo}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--cyan)", textDecoration: "none" }}
          >
            {ref.owner}/{ref.repo}
          </a>
        </h2>
        <button
          onClick={props.onDone}
          style={{ background: "none", border: "none", color: "var(--cream-dim)", cursor: "pointer", fontSize: 13 }}
          aria-label="Close the GitHub skills panel"
        >
          ✕ close
        </button>
      </div>

      {state.phase === "loading" && <p style={{ color: "var(--cream-dim)", fontSize: 13 }}>Reading the repo…</p>}

      {state.phase === "error" && (
        <p style={{ color: "var(--cream-dim)", fontSize: 13, maxWidth: 640, lineHeight: 1.6 }}>
          {state.message}
          <br />
          <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>
            Not every repo ships skills this way — the marketplace catalog lists curated, reviewable specs you can equip directly.
          </span>
        </p>
      )}

      {state.phase === "ready" && (
        <>
          {state.treeTruncated && (
            <p style={{ color: "var(--cream-dim)", fontSize: 12 }}>
              Large repo — the listing was truncated; showing the first skills found.
            </p>
          )}
          <p style={{ color: "var(--cream-dim)", fontSize: 13, margin: "8px 0 14px" }}>
            These are community agent skills from the repo (not marketplace-reviewed). Install with the{" "}
            <code style={{ color: "var(--cyan)" }}>skills</code> CLI — it copies each skill into{" "}
            <code>.agents/skills/</code> where your harness discovers it.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {state.skills.map(({ skill, description }) => (
              <div
                key={skill.name}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--cream)" }}>{skill.name}</div>
                  {description && (
                    <div
                      style={{
                        color: "var(--cream-dim)",
                        fontSize: 12,
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => copy(installCommand(ref, skill.name), skill.name)}
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--cyan)",
                    border: "1px solid var(--cyan)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  aria-label={`Copy the install command for ${skill.name}`}
                >
                  {copied === skill.name ? "✓ copied" : "Copy install command"}
                </button>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>Install everything:</span>
            <code style={{ color: "var(--cyan)", fontSize: 12 }}>{installCommand(ref)}</code>
            <button
              onClick={() => copy(installCommand(ref), "__all__")}
              style={{
                background: "none",
                color: "var(--cyan)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {copied === "__all__" ? "✓ copied" : "Copy"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
