/**
 * Settings store — user-provided configuration kept in localStorage.
 * Nothing here is a server secret: LLM keys, GitHub tokens and the Clerk
 * *publishable* key live in the operator's browser only. The modal exists
 * precisely so no credentials are ever baked into the deployed bundle.
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
  /** Clerk publishable key (pk_...) — enables optional Clerk identity UI. */
  clerkPublishableKey: string;
}

const KEY = "proagents-marketplace-settings-v1";

/** Build-time defaults from VITE_* env vars (see .env.example); localStorage wins. */
function envDefaults(): Partial<AppSettings> {
  return {
    clerkPublishableKey: (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "",
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: { provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "" },
  githubToken: "",
  githubTokenExpiresAt: 0,
  githubRefreshToken: "",
  githubRefreshExpiresAt: 0,
  clerkPublishableKey: "",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const defaults = envDefaults();
    return {
      provider: { ...DEFAULT_SETTINGS.provider, ...(parsed.provider ?? {}) },
      githubToken: parsed.githubToken ?? "",
      githubTokenExpiresAt: parsed.githubTokenExpiresAt ?? 0,
      githubRefreshToken: parsed.githubRefreshToken ?? "",
      githubRefreshExpiresAt: parsed.githubRefreshExpiresAt ?? 0,
      clerkPublishableKey: parsed.clerkPublishableKey ?? defaults.clerkPublishableKey ?? "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, ...envDefaults() };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("proagents-settings-changed"));
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
