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
import { DOCS_URL, SOURCE_URL, docsUrl, assetUrl } from "../links.js";
import { getAuthenticatedUser, refreshAccessToken } from "../github.js";

export interface AppCtx {
  settings: AppSettings;
  navigate: (to: string) => void;
}

/**
 * The marketplace app runs as a client-only island inside VitePress: VitePress
 * owns the document chrome (navbar, dark mode), this shell owns the app
 * surface below it. Routing is hash-based — VitePress owns real URLs — so
 * the app works under any base path and never fights the host router.
 */
export function AppIsland(): React.JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, "") || "catalog");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, "") || "catalog");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = `#/${to}`;
  }, []);
  return <AppShell route={route} navigate={navigate} />;
}

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
        color: route === to || route.startsWith(to + "/") ? "var(--vp-c-brand-1)" : "var(--vp-c-text-2)",
        textDecoration: "none",
        fontWeight: route === to || route.startsWith(to + "/") ? 700 : 400,
      }}
    >
      {label}
    </a>
  );

  return (
    <div
      className="pa-app"
      style={{
        minHeight: "60vh",
        color: "var(--vp-c-text-1)",
        fontFamily: "var(--vp-font-family-base)",
      }}
    >
      {/* App rail — the VitePress navbar stays above; this is the app's own
          sub-navigation (same pattern as the docs' local nav). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--vp-c-divider)",
          background: "var(--vp-c-bg-alt)",
        }}
      >
        <a href="#/catalog" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img
            src={assetUrl("logo-dark.png")}
            alt="ProAgents"
            width={88}
            height={28}
            className="pa-app-logo"
            style={{ display: "block" }}
          />
        </a>
        <nav aria-label="Marketplace" style={{ display: "flex", gap: 16, fontSize: 14 }}>
          {nav("catalog", "Catalog")}
          {nav("dashboard", "Dashboard")}
          <a
            href={DOCS_URL}
            style={{ color: "var(--vp-c-text-2)", textDecoration: "none" }}
          >
            Docs
          </a>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="https://github.com/sponsors/EnzoVezzaro"
            target="_blank"
            rel="noreferrer"
            className="pa-app-chip"
            style={{ textDecoration: "none" }}
          >
            Donate
          </a>
          <button onClick={openSettings} className="pa-app-chip" style={{ cursor: "pointer" }}>
            Settings
          </button>
        </div>
      </div>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 88px" }}>{page}</main>
      <footer
        style={{
          borderTop: "1px solid var(--vp-c-divider)",
          padding: "22px 28px",
          color: "var(--vp-c-text-2)",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        ProAgents Marketplace · fully open source (MIT) · runs entirely in your browser ·{" "}
        <a href={docsUrl("guide/marketplace")} style={{ color: "var(--vp-c-brand-1)", textDecoration: "none" }}>
          docs
        </a>{" "}
        ·{" "}
        <a href={SOURCE_URL} style={{ color: "var(--vp-c-brand-1)", textDecoration: "none" }}>
          source
        </a>{" "}
        ·{" "}
        <a href="https://github.com/sponsors/EnzoVezzaro" style={{ color: "var(--vp-c-brand-1)", textDecoration: "none" }}>
          Sponsor
        </a>
      </footer>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} user={user} />}
    </div>
  );
}
