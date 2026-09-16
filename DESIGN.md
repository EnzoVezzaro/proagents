# ProAgents Design System

The visual world is **derived from the brand assets in `branding/`** — the
source of truth for every logo surface (regenerate derived copies from here,
never edit `docs/public` / `web/public` assets by hand):

| Asset | Content | Use on |
|---|---|---|
| `branding/logo.png` | gradient mark + white wordmark | dark surfaces |
| `branding/logo-black.png` | gradient mark + ink wordmark | light surfaces |
| `branding/logo-bot-icon.png` | gradient mark only | **both** (favicons, avatars) |
| `branding/logo-text.png` | white wordmark | dark surfaces |
| `branding/logo-black-text.png` | ink wordmark | light surfaces |

Derived copies: `web/public/` (favicon 32/48, trimmed header lockup),
`docs/public/` (favicon, `logo.png` dark-mode navbar, `logo-dark.png`
light-mode navbar, `bot-icon.png` hero, composed `og-image.png`), root
`logo.png` (README). A blue → violet gradient mark on deep space anchors every
color decision below.
Methodology: **Impeccable** (impeccable.style) for visual craft, **Design with
Intent** (designwithintent.ai) for UX strategy.

## The world

| Token | Value | Role |
|---|---|---|
| `--ink` | `#000024` | Page canvas — deep-space navy |
| `--ink-2` / `--ink-3` | `#040a33` / `#0a1445` | Raised surfaces, fields & code |
| `--cream` / `--cream-dim` | `#f4f7ff` / `#9aa6cf` | Text (ice white / periwinkle grey) |
| `--blue` / `--blue-bright` / `--accent-deep` | `#0048e4` / `#2e6bff` / `#0036b3` | Primary hue + hover/active |
| `--violet` | `#5424e4` | Gradient far end, secondary tints |
| `--cyan` | `#0ccccc` | **Signal only** — focus rings, active nav, live states |
| `--grad` | blue → violet 120° | Primary CTAs, wordmark, hero moments — **never decoration** |
| `--line` | `#17245c` | Hairlines — navy-tinted, never grey |
| `--danger` / `--ok` / `--warn` | `#ff6b7a` / `#3ddc97` / `#ffc857` | Semantics |

Docs mirrors these as `--pa-*` vars in both light (ice paper + navy text) and
dark (the native world) variants: `docs/.vitepress/theme/custom.css`.

## Grammar

- **One gradient, used with discipline.** Primary action buttons, the
  wordmark glow, hero numerals. If a gradient appears anywhere the user can't
  click or read, delete it.
- **Cyan whispers, blue acts.** Cyan marks state (active nav item, focus,
  health "live"); blue/gradient performs action. Never swap them.
- **Depth = navy, not black.** Elevation lightens toward blue
  (`--ink → --ink-2 → --ink-3`); page ambient is two fixed radial glows
  (blue top-left, violet top-right).
- **White on brand.** All gradient/blue fills use `#ffffff` text (AA at both
  gradient ends). Black-on-accent is banned in this world.
- **Hairlines are tinted.** Borders and dividers use `--line`, so structure
  belongs to the canvas. No pure `#000`/grey lines.
- **Motion is felt, not seen.** 150–180ms ease on border/transform/shadow;
  card hover lifts 2px with deep-navy shadow; `prefers-reduced-motion`
  collapses everything.
- **Header = glass.** Sticky `rgba(0,0,36,.72)` + 14px backdrop blur + inset
  hairline. Content column maxes at 1180px.

## Modes

- **Marketplace SPA — Operate.** Scanability and task completion outrank
  expression; brand lives in precise details (chips, badges, focus rings).
- **Docs — Read.** VitePress structure untouched; tokens re-skinned in both
  modes; code blocks on navy-tinted surfaces.

## Component vocabulary (SPA)

Shared tokens in `web/src/ui/tokens.ts` — `btnPrimary` (gradient),
`btnGhost`, `btnSoft` (on-rail selected), `field`, `label`, `card`, `type`
ramp, `gradText`, `signalDot`. Page-local styles may compose these but must
not introduce new fills outside the token table.

## Accessibility floor

- Focus: 2px cyan `:focus-visible` ring + offset 2, everywhere.
- Text: ice-on-navy ≥ 12:1; dim-on-navy ≥ 5.5:1; white-on-gradient ≥ 5.4:1.
- Cyan is never the only carrier of meaning (pair with position/labels).
- `prefers-reduced-motion` respected globally.

## Verification ritual

Bounded passes: build → structural snapshot (headings, actions, states) →
contrast math on new pairs → one fix batch → stop. No open-ended polishing.
