import React, { useEffect, useRef, useState } from "react";
import { pollDeviceFlow, startDeviceFlow, type DeviceFlowStart } from "../github.js";
import { clearAllAppCache, clearGithubSession } from "../settings.js";

/**
 * GitHub account UI. The header stays calm — everything auth-related lives in
 * the Settings modal:
 *
 * - GitHubSignIn — OAuth Device Flow button + live code/poll state. Login
 *   endpoints go through the same-origin /github-oauth proxy (github.com
 *   sends no CORS headers; see ../github.ts for the production Worker).
 * - GitHubUserMenu — avatar + hover menu: profile link, sign out, and
 *   "sign out & clear cache" (wipes settings and builder drafts).
 */

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

/** Device-flow sign-in, rendered inside the Settings modal. */
export function GitHubSignIn(): React.JSX.Element {
  const [flow, setFlow] = useState<DeviceFlowStart | null>(null);
  const [status, setStatus] = useState<string>("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current);
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  const start = async () => {
    try {
      const f = await startDeviceFlow();
      setFlow(f);
      setStatus(`Enter the code at ${f.verificationUri}`);
      window.open(f.verificationUri, "_blank");
      let intervalMs = f.interval * 1000;
      const tick = async () => {
        const result = await pollDeviceFlow(f);
        if (result.status === "granted") {
          stopPolling();
          const { saveSettings, loadSettings } = await import("../settings.js");
          saveSettings({
            ...loadSettings(),
            githubToken: result.token,
            githubTokenExpiresAt: result.expiresAt,
            githubRefreshToken: result.refreshToken,
            githubRefreshExpiresAt: result.refreshExpiresAt,
          });
          setFlow(null);
          setStatus("");
        } else if (result.status === "denied") {
          stopPolling();
          setStatus(result.reason);
          setFlow(null);
        } else {
          // slow_down tells us to grow the interval by 5s per RFC 8628.
          if (result.retryAfter) intervalMs += result.retryAfter * 1000;
          timer.current = window.setTimeout(tick, intervalMs);
        }
      };
      timer.current = window.setTimeout(tick, intervalMs);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={start}
          disabled={!!flow}
          style={{
            background: "var(--grad)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          Sign in with GitHub
        </button>
        {flow?.userCode && (
          <code
            style={{
              background: "var(--ink-3)",
              border: "1px solid var(--cyan)",
              color: "var(--cyan)",
              padding: "4px 10px",
              borderRadius: 6,
              letterSpacing: 2,
              fontSize: 14,
            }}
          >
            {flow.userCode}
          </code>
        )}
        {flow && (
          <button
            onClick={() => {
              stopPolling();
              setFlow(null);
              setStatus("");
            }}
            style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
          >
            cancel
          </button>
        )}
      </div>
      {(status || flow) && <div style={{ color: "var(--cream-dim)", fontSize: 12 }}>{status}</div>}
      {!flow && !status && (
        <div style={{ color: "var(--cream-dim)", fontSize: 12 }}>
          Opens github.com/login/device in a new tab — one code entry, no token pasting. Works without a client secret.
        </div>
      )}
    </div>
  );
}

/** Avatar + hover menu for a signed-in user (also shown in the modal). */
export function GitHubUserMenu(props: { user: GitHubUser; compact?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const openNow = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };
  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  return (
    <div style={{ position: "relative", display: "inline-block" }} onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "5px 10px 5px 6px",
          cursor: "pointer",
          color: "var(--cream)",
          fontSize: 13,
        }}
      >
        <img src={props.user.avatar_url} alt="" width={24} height={24} style={{ borderRadius: "50%", display: "block" }} />
        <span>{props.user.login}</span>
        <span style={{ color: "var(--cream-dim)", fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div role="menu" aria-label="GitHub account" className="gh-menu">
          <a role="menuitem" href={`https://github.com/${props.user.login}`} target="_blank" rel="noreferrer">
            View GitHub profile
          </a>
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              clearGithubSession();
            }}
          >
            Sign out
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              if (!window.confirm("Sign out and clear ALL local data?\n\nThis wipes settings (model keys, GitHub login) and builder drafts from this browser.")) return;
              setOpen(false);
              clearAllAppCache();
            }}
          >
            Sign out & clear cache
          </button>
        </div>
      )}
    </div>
  );
}
