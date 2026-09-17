import React, { useCallback, useEffect, useState } from "react";
import { CatalogPage } from "./pages/CatalogPage.js";
import { CrewDetailPage } from "./pages/CrewDetailPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { BuildEntryPage } from "./pages/BuildEntryPage.js";
import { BuilderPage } from "./pages/BuilderPage.js";
import { ProfileBuilderPage } from "./pages/ProfileBuilderPage.js";
import { PreviewPage } from "./pages/PreviewPage.js";
import { SettingsModal } from "./SettingsModal.js";
import { loadSettings, saveSettings, githubTokenNeedsRefresh, githubRefreshExpired, type AppSettings } from "../settings.js";
import { DOCS_URL, SOURCE_URL } from "../links.js";
import { getAuthenticatedUser, refreshAccessToken } from "../github.js";

export interface AppCtx {
  settings: AppSettings;
  navigate: (to: string) => void;
}

/** Display type (DESIGN.md): Bricolage Grotesque, tight tracking. Spread onto
 * hero names and page titles; headline text renders solid — the gradient is
 * reserved for CTA fills and the logo mark (hallmark "no gradient-clipped
 * text" gate). */
export const display = { fontFamily: "var(--font-display)", letterSpacing: "-0.02em" } as const;

export function AppShell(props: { route: string; navigate: (to: string) => void }): React.JSX.Element {
  const { route, navigate } = props;
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);

  useEffect(() => {
    const onChange = () => setSettings(loadSettings());
    window.addEventListener("proagents-settings-changed", onChange);
    // "Clear cache" wiped localStorage + drafts; reload so no stale in-memory
    // state (catalog cache, wizard steps) survives the wipe.
    const onCacheCleared = () => window.location.reload();
    window.addEventListener("proagents-app-cache-cleared", onCacheCleared);
    return () => {
      window.removeEventListener("proagents-settings-changed", onChange);
      window.removeEventListener("proagents-app-cache-cleared", onCacheCleared);
    };
  }, []);

  // Session ensure: verify the stored GitHub token, refresh it proactively
  // when it is near/past expiry (GitHub App user tokens expire — default 8h),
  // and recover silently via the refresh token after any 401. Only a missing
  // or expired refresh token forces a fresh device-flow sign-in.
  useEffect(() => {
    let cancelled = false;
    const s = loadSettings();
    if (!s.githubToken) {
      setUser(null);
      return;
    }
    const verify = (token: string): Promise<void> =>
      getAuthenticatedUser(token)
        .then((u) => {
          if (!cancelled) setUser({ login: u.login, avatar_url: u.avatar_url });
        })
        .catch(async (err: Error) => {
          if (cancelled) return;
          const unauthorized = /HTTP 40[13]/.test(err.message);
          if (unauthorized && !githubRefreshExpired(s)) {
            const refreshed = await refreshAccessToken(s.githubRefreshToken);
            if (refreshed.status === "granted" && !cancelled) {
              saveSettings({
                ...loadSettings(),
                githubToken: refreshed.token,
                githubTokenExpiresAt: refreshed.expiresAt,
                githubRefreshToken: refreshed.refreshToken,
                githubRefreshExpiresAt: refreshed.refreshExpiresAt,
              });
              return verify(refreshed.token);
            }
          }
          if (!cancelled) setUser(null);
        });
    if (githubTokenNeedsRefresh(s) && !githubRefreshExpired(s)) {
      // Proactive: swap in a fresh token before the old one dies.
      refreshAccessToken(s.githubRefreshToken)
        .then((r) => {
          if (r.status !== "granted" || cancelled) return;
          saveSettings({
            ...loadSettings(),
            githubToken: r.token,
            githubTokenExpiresAt: r.expiresAt,
            githubRefreshToken: r.refreshToken,
            githubRefreshExpiresAt: r.refreshExpiresAt,
          });
          return verify(r.token);
        })
        .catch(() => {
          if (!cancelled) verify(s.githubToken);
        });
    } else {
      verify(s.githubToken);
    }
    return () => {
      cancelled = true;
    };
  }, [settings.githubToken]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const ctx: AppCtx = { settings, navigate };

  let page: React.JSX.Element;
  if (route.startsWith("item/")) {
    page = <CrewDetailPage id={decodeURIComponent(route.slice("item/".length))} ctx={ctx} />;
  } else if (route.startsWith("preview/")) {
    page = <PreviewPage id={decodeURIComponent(route.slice("preview/".length))} ctx={ctx} />;
  } else if (route === "dashboard") {
    page = <DashboardPage ctx={ctx} user={user} onOpenSettings={openSettings} />;
  } else if (route === "build") {
    page = <BuildEntryPage ctx={ctx} navigate={navigate} />;
  } else if (route === "builder") {
    page = <BuilderPage ctx={ctx} />;
  } else if (route === "build-profile") {
    page = <ProfileBuilderPage ctx={ctx} />;
  } else {
    page = <CatalogPage ctx={ctx} />;
  }

  const nav = (to: string, label: string) => (
    <a
      href={`#/${to}`}
      aria-current={route === to || route.startsWith(to + "/") ? "page" : undefined}
      style={{
        color: route === to || route.startsWith(to + "/") ? "var(--cyan)" : "var(--cream-dim)",
        textDecoration: "none",
        fontWeight: route === to || route.startsWith(to + "/") ? 700 : 400,
      }}
    >
      {label}
    </a>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--cream)", fontFamily: "var(--font-body)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "14px 28px",
          borderBottom: "1px solid transparent",
          background: "rgba(0, 0, 36, 0.72)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "inset 0 -1px 0 var(--line), 0 8px 24px rgba(0, 0, 12, 0.35)",
        }}
      >
        <a href="#/catalog" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--cream)" }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="ProAgents" width={88} height={28} style={{ display: "block" }} />
        </a>
        <nav aria-label="Primary" style={{ display: "flex", gap: 18, fontSize: 14 }}>
          {nav("catalog", "Catalog")}
          {nav("dashboard", "Dashboard")}
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--cream-dim)", textDecoration: "none" }}
          >
            Docs
          </a>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <a
            href="https://github.com/sponsors/EnzoVezzaro"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--cream)", textDecoration: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}
          >
            <span style={{ color: "var(--cyan)", fontWeight: 700 }}>Donate</span>
          </a>
          <button
            onClick={openSettings}
            style={{
              background: "transparent",
              color: "var(--cream-dim)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Settings
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 88px" }}>{page}</main>
      <footer style={{ borderTop: "1px solid var(--line)", padding: "22px 28px", color: "var(--cream-dim)", fontSize: 12, textAlign: "center", background: "rgba(0, 0, 24, 0.5)" }}>
        ProAgents Marketplace · fully open source (MIT) · runs entirely in your browser on GitHub Pages ·{" "}
        <a href={DOCS_URL} style={{ color: "var(--cyan)", textDecoration: "none" }}>
          docs
        </a>{" "}·{" "}
        <a href={SOURCE_URL} style={{ color: "var(--cyan)", textDecoration: "none" }}>
          source
        </a>{" "}·{" "}
        <a href="https://github.com/sponsors/EnzoVezzaro" style={{ color: "var(--cyan)", textDecoration: "none" }}>Sponsor</a>{" "}·{" "}
        <a href="https://ko-fi.com/enzojuniorvezzaro" style={{ color: "var(--cyan)", textDecoration: "none" }}>Ko-fi</a>
      </footer>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} user={user} />}
    </div>
  );
}
