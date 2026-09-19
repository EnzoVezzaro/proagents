/**
 * Settings store — user-provided configuration kept in localStorage.
 * Nothing here is a server secret: LLM keys and GitHub tokens live in the
 * operator's browser only. The modal exists precisely so no credentials are
 * ever baked into the deployed bundle.
 */

export type LlmProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export interface ProviderSettings {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  /** For provider === "custom": an OpenAI-compatible chat-completions base URL. */
  baseUrl?: string;
}

export interface AppSettings {
  provider: ProviderSettings;
  githubToken: string;
 /** GitHub App user-token expiry (epoch ms). 0 = unknown/no expiry (PAT). */
  githubTokenExpiresAt: number;
  /** GitHub App refresh token — exchanges for a fresh access token silently. */
  githubRefreshToken: string;
  /** Refresh-token expiry (epoch ms). Refresh tokens live ~6 months. */
  githubRefreshExpiresAt: number;
}

// Key deliberately keeps the pre-rename "marketplace" token: changing the
// localStorage key would silently wipe every returning user's saved settings.
const KEY = "proagents-marketplace-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  provider: { provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "" },
  githubToken: "",
  githubTokenExpiresAt: 0,
  githubRefreshToken: "",
  githubRefreshExpiresAt: 0,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      provider: { ...DEFAULT_SETTINGS.provider, ...(parsed.provider ?? {}) },
      githubToken: parsed.githubToken ?? "",
      githubTokenExpiresAt: parsed.githubTokenExpiresAt ?? 0,
      githubRefreshToken: parsed.githubRefreshToken ?? "",
      githubRefreshExpiresAt: parsed.githubRefreshExpiresAt ?? 0,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("proagents-settings-changed"));
}

/** Storage keys the app owns beyond settings (builder drafts & wizard step). */
const DRAFT_STORAGE_KEYS = [
  "proagents-crew-draft",
  "proagents-builder-draft",
  "proagents-profile-draft",
  "proagents-profile-step",
] as const;

/** Sign out: drop GitHub credentials, keep every other setting. */
export function clearGithubSession(): AppSettings {
  const next: AppSettings = {
    ...loadSettings(),
    githubToken: "",
    githubTokenExpiresAt: 0,
    githubRefreshToken: "",
    githubRefreshExpiresAt: 0,
  };
  saveSettings(next);
  return next;
}

/**
 * Sign out AND wipe everything the app stored in this browser: settings,
 * builder drafts, wizard state. Dispatches `proagents-app-cache-cleared`
 * (AppShell reloads on it) so in-memory state cannot resurrect stale data.
 */
export function clearAllAppCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  for (const k of DRAFT_STORAGE_KEYS) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  saveSettings({ ...DEFAULT_SETTINGS });
  window.dispatchEvent(new CustomEvent("proagents-app-cache-cleared"));
}

/**
 * True when the GitHub App user token is expired or expires within `slack` ms
 * (GitHub App tokens expire — default 8h; PATs report no expiry → 0).
 */
export function githubTokenNeedsRefresh(s: AppSettings, slackMs = 5 * 60 * 1000): boolean {
  if (!s.githubToken) return false;
  if (!s.githubTokenExpiresAt) return false; // no expiry recorded (PAT or legacy)
  return Date.now() >= s.githubTokenExpiresAt - slackMs;
}

/** True when the refresh token itself is gone/expired — re-auth is required. */
export function githubRefreshExpired(s: AppSettings): boolean {
  if (!s.githubRefreshToken) return true;
  return s.githubRefreshExpiresAt !== 0 && Date.now() >= s.githubRefreshExpiresAt;
}


export const PROVIDER_PRESETS: Record<Exclude<LlmProvider, "custom">, { label: string; models: string[] }> = {
  openai: { label: "OpenAI", models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o4-mini"] },
  anthropic: { label: "Anthropic", models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"] },
  google: { label: "Google AI", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  openrouter: { label: "OpenRouter", models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro"] },
};
