import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal.js";
import { GitHubUserMenu, type GitHubUser } from "./GitHubAuth.js";
import { clearAllAppCache, clearGithubSession, loadSettings, DEFAULT_SETTINGS } from "../settings.js";

/**
 * SETTINGS (component) — the Settings modal is now the home of GitHub auth:
 * sign-in when signed out, an avatar hover-menu (sign out / clear cache) when
 * signed in. Also pins the storage-clearing helpers the menu relies on.
 */

const user: GitHubUser = { login: "octocat", avatar_url: "https://example.com/a.png" };

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("SettingsModal GitHub account (SETTINGS-AUTH)", () => {
  it("SETTINGS-AUTH-001: signed out → device-flow sign-in UI, no PAT stored", () => {
    render(<SettingsModal onClose={() => {}} user={null} />);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
    const saved = loadSettings();
    expect(saved.githubToken).toBe("");
  });

  it("SETTINGS-AUTH-002: signed in → avatar menu opens with sign out + clear cache", () => {
    render(<SettingsModal onClose={() => {}} user={user} />);
    const trigger = screen.getByRole("button", { name: /octocat/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /Sign out & clear cache/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("SETTINGS-AUTH-003: PAT field left empty keeps the existing session on save", () => {
    localStorage.setItem(
      "proagents-marketplace-settings-v1",
      JSON.stringify({ ...DEFAULT_SETTINGS, githubToken: "ghp_existing" }),
    );
    render(<SettingsModal onClose={() => {}} user={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    expect(loadSettings().githubToken).toBe("ghp_existing");
  });
});

describe("GitHubUserMenu actions (SETTINGS-MENU)", () => {
  it("SETTINGS-MENU-001: sign out clears only GitHub credentials", () => {
    localStorage.setItem(
      "proagents-marketplace-settings-v1",
      JSON.stringify({ ...DEFAULT_SETTINGS, githubToken: "tok", githubRefreshToken: "r", provider: { ...DEFAULT_SETTINGS.provider, apiKey: "sk-keep" } }),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false); // not the clear-cache path
    render(<GitHubUserMenu user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /octocat/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    const s = loadSettings();
    expect(s.githubToken).toBe("");
    expect(s.githubRefreshToken).toBe("");
    expect(s.provider.apiKey).toBe("sk-keep"); // provider settings survive
    confirmSpy.mockRestore();
  });

  it("SETTINGS-MENU-002: clear cache wipes settings AND builder drafts", () => {
    sessionStorage.setItem("proagents-profile-draft", "{}");
    sessionStorage.setItem("proagents-crew-draft", "{}");
    localStorage.setItem("proagents-marketplace-settings-v1", JSON.stringify({ ...DEFAULT_SETTINGS, githubToken: "tok" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const reloaded = vi.fn();
    window.addEventListener("proagents-app-cache-cleared", reloaded, { once: true });

    render(<GitHubUserMenu user={user} />);
    fireEvent.click(screen.getByRole("button", { name: /octocat/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /clear cache/ }));

    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(sessionStorage.getItem("proagents-profile-draft")).toBeNull();
    expect(sessionStorage.getItem("proagents-crew-draft")).toBeNull();
    expect(reloaded).toHaveBeenCalledTimes(1); // AppShell listens and reloads
    confirmSpy.mockRestore();
  });
});

describe("storage helpers (SETTINGS-CLEAR)", () => {
  it("SETTINGS-CLEAR-001: clearAllAppCache removes drafts + settings, fires event", () => {
    sessionStorage.setItem("proagents-profile-step", "tools");
    localStorage.setItem("proagents-marketplace-settings-v1", JSON.stringify({ ...DEFAULT_SETTINGS, githubToken: "x" }));
    const spy = vi.fn();
    window.addEventListener("proagents-app-cache-cleared", spy, { once: true });
    clearAllAppCache();
    expect(sessionStorage.getItem("proagents-profile-step")).toBeNull();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("SETTINGS-CLEAR-002: clearGithubSession preserves non-GitHub settings", () => {
    localStorage.setItem(
      "proagents-marketplace-settings-v1",
      JSON.stringify({ ...DEFAULT_SETTINGS, githubToken: "tok", provider: { ...DEFAULT_SETTINGS.provider, apiKey: "k" } }),
    );
    const next = clearGithubSession();
    expect(next.githubToken).toBe("");
    expect(next.provider.apiKey).toBe("k");
  });
});
