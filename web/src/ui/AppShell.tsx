import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CatalogPage } from "./pages/CatalogPage.js";
import { CrewDetailPage } from "./pages/CrewDetailPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { BuildEntryPage } from "./pages/BuildEntryPage.js";
import { BuilderPage } from "./pages/BuilderPage.js";
import { ProfileBuilderPage } from "./pages/ProfileBuilderPage.js";
import { ProjectBuilderPage } from "./pages/ProjectBuilderPage.js";
import { PreviewPage } from "./pages/PreviewPage.js";
import { SettingsModal } from "./SettingsModal.js";
import { loadSettings, saveSettings, githubTokenNeedsRefresh, githubRefreshExpired, type AppSettings } from "../settings.js";
import { getAuthenticatedUser, refreshAccessToken } from "../github.js";

export interface AppCtx {
  settings: AppSettings;
  navigate: (to: string) => void;
  /** The signed-in GitHub account, when the session-ensure has verified one. */
  user: { login: string; avatar_url: string } | null;
}

/**
 * The Studio app (registry frontend) runs as a client-only island inside VitePress: VitePress
 * owns the document chrome (navbar, dark mode), this shell owns the app
 * surface below it. Routing is hash-based — VitePress owns real URLs — so
 * the app works under any base path and never fights the host router.
 */
export function AppIsland(): React.JSX.Element {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, "") || "build-environment");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, "") || "build-environment");
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
  const ctx: AppCtx = { settings, navigate, user };

  // Header actions: the /studio page reserves a slot in its static header
  // row (#pa-mp-actions) — the chips portal into it so title, lede and actions
  // share one row. On any other surface (deep-linked hash routes, tests) the
  // slot is absent and the chips fall back to a local row below the navbar.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionsSlot(document.getElementById("pa-mp-actions"));
  }, []);

  const actionChips = (
    <>
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
    </>
  );

  let page: React.JSX.Element;
  if (route.startsWith("item/")) {
    page = <CrewDetailPage id={decodeURIComponent(route.slice("item/".length))} ctx={ctx} />;
  } else if (route.startsWith("preview/")) {
    page = <PreviewPage id={decodeURIComponent(route.slice("preview/".length))} ctx={ctx} />;
  } else if (route === "dashboard") {
    page = <DashboardPage ctx={ctx} user={user} onOpenSettings={openSettings} />;
  } else if (route === "build-environment") {
    // BUILD — the primary Studio experience (NEW_CHANGES.md §10).
    page = <ProjectBuilderPage ctx={ctx} />;
  } else if (route === "build") {
    page = <BuildEntryPage ctx={ctx} navigate={navigate} />;
  } else if (route === "builder") {
    page = <BuilderPage ctx={ctx} />;
  } else if (route === "build-profile") {
    page = <ProfileBuilderPage ctx={ctx} />;
  } else if (route === "discover") {
    // DISCOVER — secondary; the catalog gains "Use in Project" actions.
    page = <CatalogPage ctx={ctx} />;
  } else {
    // Legacy default (was the catalog) and unknown routes → Build primary.
    page = <ProjectBuilderPage ctx={ctx} />;
  }

  return (
    <div
      className="pa-app"
      style={{
        minHeight: "60vh",
        color: "var(--vp-c-text-1)",
        fontFamily: "var(--vp-font-family-base)",
      }}
    >
      {/* Account actions — portaled into the page header's reserved slot on
          /studio (one row: title left, actions right), local row
          elsewhere. */}
      {actionsSlot ? (
        createPortal(actionChips, actionsSlot, "pa-mp-actions")
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            padding: "10px 2px",
            borderBottom: "1px solid var(--vp-c-divider)",
          }}
        >
          {actionChips}
        </div>
      )}

      <main style={{ padding: "32px 0 24px" }}>{page}</main>
      {/* No island footer: the island only renders on /studio, which is
          a VitePress page and carries the theme's VPFooter — no duplication. */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} user={user} />}
    </div>
  );
}
