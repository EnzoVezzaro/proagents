import React from "react";

/**
 * Design tokens — the Studio SPA's craft floor. Everything interactive
 * gets: keyboard focus rings, hover/active feedback, transition curves, and
 * a consistent type ramp.
 *
 * World: Logo Ramp (DESIGN.md §5.2, ratified 2026-09-20) — cool paper /
 * navy canvases, hairline borders, flat surfaces, and the ramp core as the
 * single accent (--blue/--cyan/--grad aliases resolve to it in the docs
 * theme's custom.css). Hierarchy comes from type, space and luminance.
 * The 4-stop brand gradient is reserved for thin brand rules, never text
 * fills or buttons.
 */

export const focusRing: React.CSSProperties["outline"] = undefined;

/** Spread onto any interactive element for a11y focus + consistent cursor. */
export const interactive = {
  cursor: "pointer",
  transition: "border-color .15s ease, background .15s ease, color .15s ease, transform .1s ease, box-shadow .15s ease",
  outline: "none",
} as const;

export function focusStyle(e: React.FocusEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = "0 0 0 2px var(--ink), 0 0 0 4px var(--cyan)";
}
export function blurStyle(e: React.FocusEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = "none";
}

/** Consistent focus handling for buttons/links/inputs. */
export function focusProps(): {
  onFocus: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  tabIndex?: number;
} {
  return { onFocus: focusStyle, onBlur: blurStyle };
}

/** Primary action — solid ramp blue, white text, rectangular 6px. */
export const btnPrimary: React.CSSProperties = {
  ...interactive,
  background: "var(--grad)", // resolves to the solid ramp core (see custom.css)
  color: "var(--pa-on-accent, #fff)",
  border: "1px solid transparent",
  borderRadius: 6,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  fontFamily: "inherit",
};

/** Secondary/ghost button. */
export const btnGhost: React.CSSProperties = {
  ...interactive,
  background: "transparent",
  color: "var(--cream-dim)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: 13,
  fontFamily: "inherit",
};

/** Tertiary: soft accent fill for on-rail selected states. */
export const btnSoft: React.CSSProperties = {
  ...interactive,
  background: "var(--accent-soft)",
  color: "var(--cream)",
  border: "1px solid var(--pa-accent)",
  borderRadius: 6,
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: 13,
  fontFamily: "inherit",
};

export const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ink-3)",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  transition: "border-color .15s ease",
};

export const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--cream-dim)",
  marginBottom: 5,
  marginTop: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  fontWeight: 600,
};

export const card: React.CSSProperties = {
  background: "var(--ink-2)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: 20,
};

/** Type ramp. Headings inherit Geist; hero/page titles opt into
 * `display` (Nunito — the logo wordmark's face) from AppShell per DESIGN.md. */
export const type = {
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" } as React.CSSProperties,
  h2: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: "28px 0 10px" } as React.CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, margin: "0 0 8px" } as React.CSSProperties,
  body: { fontSize: 14, lineHeight: 1.65, color: "var(--cream-dim)" } as React.CSSProperties,
  small: { fontSize: 12.5, lineHeight: 1.55, color: "var(--cream-dim)" } as React.CSSProperties,
};

/** Status dot for live/active states — flat, no glow. State also carries
 * a text twin in the UI. */
export const signalDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "var(--pa-cyan)",
  display: "inline-block",
};
