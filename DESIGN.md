# ProAgents — DESIGN.md

> **Status:** Shipped design system v1.2 (2026-09-20) — §5.2 **Logo Ramp** is
> **ratified and fully implemented**: landing, docs theme, 404, and the Studio SPA
> all run the same tokens, sampled from `branding/logo.png` (violet → blue → sky →
> cyan; navy dark mode). Light is the default mode. The v1.0 "Proposed" rationale
> below is retained; where it conflicts with §5.2, §5.2 wins. (v1.1's Phosphor Ink
> — §5.1 — was shipped and then superseded the same day: the brand pulled back to
> the logo's own palette, and purple/cyan are wanted again.)
> **Product:** ProAgents
> **Surfaces:** Public landing page + VitePress documentation site
> **Scope:** Visual language, interaction language, layout, typography, components, responsive behavior, motion, and VitePress theming
> **Out of scope:** Studio UI, CLI UX, profile schemas, agent runtime architecture, registry data models, application behavior

---

## 0. DESIGN.md Authoring Protocol

This document follows the `DESIGN.md` model used by VoltAgent's `awesome-design-md`: a plain-text visual source of truth for AI design/coding agents. The reference format explicitly covers visual theme, semantic color roles, typography, component styling, layout, depth/elevation, do/don't guardrails, responsive behavior, and an agent prompt guide. citeturn930726view0

### Implementation rule

Before changing the landing page or documentation UI:

1. Read this `DESIGN.md` completely enough to understand the visual system.
2. Inspect the **Preferred Reference Gallery** below when a visual decision is ambiguous.
3. Reuse existing ProAgents tokens and components before inventing new ones.
4. Prefer composition, typography, spacing, and structural diagrams over decorative graphics.
5. Validate the result against the **DO / DO NOT** sections before considering the UI complete.

### Reference interpretation rule

The supplied references are **inspiration sources**. They are not instructions to copy another company's identity, logo, artwork, exact typography, illustrations, or proprietary assets. Borrow their **design principles** and translate them into the ProAgents system.

### Source-of-truth hierarchy

When design inputs conflict, resolve them in this order:

```text
DESIGN.md ProAgents tokens / rules
            ↓
Preferred reference directions
            ↓
Supporting reference patterns
            ↓
Generic framework defaults
```

Never introduce a framework-default component simply because VitePress or a UI library provides one when it conflicts with this document.

---

## 1. Design North Star

### Core idea

**Give your coding agent a profession.**

The site should feel like a serious developer tool that has been designed by people who understand compilers, terminals, source code, documentation systems, and professional workflows.

ProAgents is visually positioned between:

- a technical instrument
- an editorial developer publication
- a compiler/control surface
- an open-source infrastructure project

It must **not** look like:

- a generic AI SaaS landing page
- a chatbot product
- a prompt marketplace
- an enterprise dashboard
- a crypto/Web3 site
- a futuristic “AI brain” concept

### Emotional target

`precise` · `professional` · `technical` · `editorial` · `quietly futuristic` · `open-source` · `agent-native`

The desired reaction is:

> “This is infrastructure for serious AI-assisted software development.”

not:

> “This is another AI startup landing page.”

---

# 2. Surface Strategy

The site consists of two connected but visually distinct surfaces:

```text
PUBLIC LANDING
    ↓
introduces the concept
    ↓
explains the model
    ↓
shows the transformation
    ↓
sends users into docs

DOCUMENTATION
    ↓
explains how to use it
    ↓
keeps the same visual language
    ↓
becomes denser and more functional
```

### Landing page

The landing page is **editorial, cinematic, diagrammatic, and spacious**.

It should tell one story from top to bottom:

```text
Existing coding agent
        +
Professional Profile
        ↓
Professional Agent
```

### Documentation

The documentation is **dense, navigable, readable, and implementation-first**.

It should feel like the same product, not a separate documentation template.

The docs should retain:

- the same type system
- the same dark/light surfaces
- the same signal color
- the same technical labels
- the same border language
- the same code styling
- the same diagram language

But documentation should use **less cinematic spacing and less decorative motion**.

---

# 3. Reference Synthesis

The visual direction combines the strongest repeatable ideas from the supplied references rather than reproducing a single website.

## Preferred references

### TypeSafe AI

Use as inspiration for the feeling of a **live computational system**: technical metadata, experimental presentation, system-oriented visual storytelling, and motion that makes the product feel active.

Reference: https://typesafe.ai/

### Refero — New Form

Strongest lesson: **editorial typography can make technical content feel premium without adding visual noise**.

Use:

- monumental headlines
- small technical labels
- near-monochrome surfaces
- one bright green accent
- generous whitespace
- hairline rules

Reference: https://styles.refero.design/style/1a519123-071a-449f-b5df-0def73ed7f35

### Refero — Modal

Strongest lesson: **dark terminal aesthetics can feel polished when surfaces remain flat and typography does the hierarchy work**.

Use:

- near-black canvas
- phosphor-like signal color
- code/terminal motifs
- high contrast
- sparse UI chrome

Reference: https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8

### Refero — Antimetal

Strongest lesson: **quiet editorial authority** through warm neutrals, large typography, numbered sections, and restrained rules.

Reference: https://styles.refero.design/style/9f9a4a4f-1a27-47ca-a65b-68b9850a84e4

### Refero — Adaline

Strongest lesson: **technical journal / field-notes vocabulary**: tiny labels, specimen-like blocks, restrained colors, and information that looks intentionally catalogued.

Reference: https://styles.refero.design/style/312423bf-72ea-42fb-b8f5-ab0104e778f3

### Refero — Dovetail

Strongest lesson: **dark command-center structure** with subtle surfaces, fine borders, tight utility typography, and controlled density.

Reference: https://styles.refero.design/style/108e2695-6970-47d5-b5b0-eea8fc34e048

## Supporting references

Use these as secondary references for isolated patterns, not as templates:

- https://styles.refero.design/style/ee403055-480e-4bd4-9216-07c9ae2dde2e
- https://styles.refero.design/style/34baa524-5d5b-4165-bbab-d01f05e6d6b9
- https://styles.refero.design/style/21cfe0c1-778d-4613-9f47-a5718eb929b3
- https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6
- https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9
- https://styles.refero.design/style/e1f18a7e-5af1-46b3-8f89-bce6c78b80d4
- https://styles.refero.design/style/ac53825c-1e06-4ae0-8489-cace5c5e0339
- https://styles.refero.design/style/18a75348-513a-49d8-94f5-e2df8c118b6b
- https://styles.refero.design/style/d018e81d-6bb6-4445-86d7-39fd6be7e74d
- https://styles.refero.design/style/56cd3725-3ff0-459e-894d-5da58d1fc549
- https://styles.refero.design/style/859f6be7-9d2d-4da6-a9b7-baa658172696

## Reference Direction — How to Use the Preferred Aesthetics

These references are **design inputs**, not templates to copy. The implementation must synthesize their visual grammar into a ProAgents-specific system.

The preferred references establish four complementary directions:

```text
TYPE / EDITORIAL
New Form + Antimetal + Adaline
            │
            ├── typography as the primary visual asset
            ├── generous whitespace
            ├── paper / print vocabulary
            └── restrained chromatic punctuation

SYSTEM / TERMINAL
TypeSafe + Modal + Dovetail
            │
            ├── computational storytelling
            ├── dark system surfaces
            ├── technical metadata
            ├── code / diagnostic language
            └── state-driven accent color

PROAGENTS
            │
            ▼
EDITORIAL AUTHORITY + TERMINAL PRECISION
```

### 1. TypeSafe — use the product-storytelling approach

**Reference:** https://typesafe.ai/

TypeSafe should influence **how the landing page explains a technical idea**, not simply its colors or components. The current site repeatedly turns technical claims into visual proof, contrasts, benchmarks, and structured facts rather than relying on generic AI illustrations. citeturn327892search0

Translate that into ProAgents as:

- explain the product through **visible transformations** rather than abstract marketing copy;
- use real commands, profile fragments, architecture diagrams, and verification evidence;
- turn important concepts into measurable/inspectable visual objects;
- give each major section a clear technical thesis;
- let the interface itself demonstrate that ProAgents is an infrastructure layer.

Use the TypeSafe reference especially for:

```text
hero narrative
technical proof
section sequencing
visualized concepts
machine-oriented language
```

Do **not** copy TypeSafe's specific illustrations, typography, or branding.

### 2. New Form / Home — use the editorial scale

**Reference:** https://styles.refero.design/style/1a519123-071a-449f-b5df-0def73ed7f35

The reference describes an editorial broadsheet: monumental display type, small-caps micro-labels, a nearly monochrome canvas, one vivid green accent, and generous magazine-like spacing. Its measured system uses extremely large display sizes and tight tracking. citeturn647762view0turn550400view4

Translate into ProAgents as:

- use **oversized headlines** as the dominant visual element;
- use tiny uppercase/mono labels as navigation and section markers;
- use green like a **highlighter or signal**, never as a general theme color;
- allow typography to occupy large uninterrupted areas;
- use hairlines instead of card chrome;
- use occasional full-width or full-bleed color bands as section punctuation;
- prefer rectangular media/diagram inserts rather than decorative floating cards.

For ProAgents, the scale should be adapted downward from the reference. The goal is the **feeling of monumental type**, not literal 155–295px text everywhere.

### 3. Modal — use the terminal-native night mode

**Reference:** https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8

Modal's visual language is a near-black canvas, phosphor-green text/accent, code windows, generous negative space, and extremely rationed color. Its reference system explicitly uses green as an LED-like status indicator and favors flat/borderless surfaces with hairline green-tinted boundaries. citeturn180347view0turn550400view0

Translate into ProAgents as:

- make the **dark system canvas** the primary high-impact landing mode;
- use the signal green as a status light, not decoration;
- build architecture diagrams like console output or compiler traces;
- make command snippets first-class visual content;
- keep dark panels close in luminance so hierarchy comes from type, borders, and state;
- give important system objects abundant negative space.

Avoid copying Modal's 3D icon language. ProAgents should use **diagrams, source fragments, compiler traces, and structured UI primitives** instead.

### 4. Antimetal — use quiet editorial authority

**Reference:** https://styles.refero.design/style/9f9a4a4f-1a27-47ca-a65b-68b9850a84e4

Antimetal uses warm cream paper, restrained serif typography, tracked monospace section numbering, dashed hairlines, and almost no chromatic noise. The reference explicitly derives its authority from typographic restraint and generous breathing room. citeturn180347view1turn550400view1

Translate into ProAgents as:

- use a **warm paper mode** for documentation and selected landing sections;
- use serif typography very selectively for editorial emphasis;
- number major concepts as `01`, `02`, `03` using monospace;
- use dashed or faint rules for secondary divisions;
- keep documentation surfaces calm and paper-like;
- make trust and authority come from structure and precision, not visual effects.

The ProAgents serif is an accent role only. The page must remain recognizably developer-oriented.

### 5. Adaline — use field-notes / specimen language

**Reference:** https://styles.refero.design/style/312423bf-72ea-42fb-b8f5-ab0104e778f3

Adaline combines a warm linen surface, neo-grotesque UI typography, an editorial serif, and tracked monospace tags. Its system uses flat surfaces, hairline borders, and content that feels catalogued like specimen sheets. citeturn180347view2turn550400view2

Translate into ProAgents as:

- treat profiles, methods, skills, and verification as **specimens to inspect**;
- use mono labels for metadata such as `PROFILE`, `METHOD`, `SKILL`, `VERIFY`;
- make long lists feel curated and indexed rather than dashboard-like;
- use subtle tonal paper surfaces to distinguish related technical material;
- use editorial image/diagram plates only where they explain something.

Do not introduce Adaline's botanical palette. ProAgents retains one primary signal color.

### 6. Dovetail — use the technical information-density model

**Reference:** https://styles.refero.design/style/108e2695-6970-47d5-b5b0-eea8fc34e048

Dovetail provides the clearest reference for the **documentation-side density**: near-black canvas, faint blueprint grid, compact information architecture, subtle luminance-based surfaces, Inter for reading, monospace for categorical labels, and an accent used as functional punctuation. citeturn180347view3turn550400view3

Translate into ProAgents as:

- use a faint technical grid only behind diagrams, hero system stages, and selected documentation surfaces;
- keep documentation information dense but calm;
- use small monospace labels to identify system states;
- create hierarchy through surface luminance rather than heavy shadows;
- reserve accent color for active links, diagram nodes, verification states, and key metrics.

---

## Preferred Reference Recipe

When an AI coding agent has to make a visual decision that is not already specified by this document, use this order of interpretation:

```text
1. TypeSafe
   Ask: does this explain the technical idea through evidence or a visible system?

2. New Form / Home
   Ask: can typography and spacing carry more of the design?

3. Modal
   Ask: can this be simpler, darker, more terminal-native, and more state-driven?

4. Antimetal
   Ask: can the interface feel quieter and more editorial?

5. Adaline
   Ask: can technical information feel curated and inspectable?

6. Dovetail
   Ask: can density be improved without adding visual noise?
```

This is a **decision hierarchy**, not permission to mix every visible trait from every reference.

### The visual balance we want

```text
                PROAGENTS
                    │
        ┌───────────┴───────────┐
        │                       │
   EDITORIAL                  SYSTEM
     55%                        45%
        │                       │
        ├─ large type           ├─ dark canvas
        ├─ whitespace            ├─ mono labels
        ├─ paper surfaces        ├─ grids
        ├─ numbered sections    ├─ code blocks
        └─ hairlines            └─ state signals
```

The landing page should lean toward **editorial spectacle + technical proof**.

The documentation should lean toward **editorial reading + technical density**.

---

# 3A. Preferred Reference Gallery

These links must remain in `DESIGN.md` so an AI coding agent can inspect them directly when visual drift occurs.

## Preferred

1. https://typesafe.ai/
2. https://styles.refero.design/style/1a519123-071a-449f-b5df-0def73ed7f35
3. https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8
4. https://styles.refero.design/style/9f9a4a4f-1a27-47ca-a65b-68b9850a84e4
5. https://styles.refero.design/style/312423bf-72ea-42fb-b8f5-ab0104e778f3
6. https://styles.refero.design/style/108e2695-6970-47d5-b5b0-eea8fc34e048

## Secondary / Supporting

Use these references only when solving a specific visual problem. They do not override the preferred direction.

- https://styles.refero.design/style/ee403055-480e-4bd4-9216-07c9ae2dde2e — brutalist/editorial scale, physicality, hard blocks
- https://styles.refero.design/style/34baa524-5d5b-4165-bbab-d01f05e6d6b9 — literary/editorial AI presentation
- https://styles.refero.design/style/21cfe0c1-778d-4613-9f47-a5718eb929b3 — cinematic dark mode and atmospheric depth
- https://styles.refero.design/style/4e3b4717-84c8-4599-baaf-a343c3d619b6 — developer-tool warmth, parchment, restrained typography
- https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9 — motion-driven typography and category color
- https://styles.refero.design/style/e1f18a7e-5af1-46b3-8f89-bce6c78b80d4 — premium dark technical atmosphere
- https://styles.refero.design/style/ac53825c-1e06-4ae0-8489-cace5c5e0339 — editorial light/dark section alternation
- https://styles.refero.design/style/18a75348-513a-49d8-94f5-e2df8c118b6b — dense technical control-room UI
- https://styles.refero.design/style/d018e81d-6bb6-4445-86d7-39fd6be7e74d — atmospheric hero gradients and dark workspace composition
- https://styles.refero.design/style/56cd3725-3ff0-459e-894d-5da58d1fc549 — tactile desktop/document metaphors and 4px utility geometry
- https://styles.refero.design/style/859f6be7-9d2d-4da6-a9b7-baa658172696 — pure editorial grid, hard rules, zero decoration

### Supporting-reference rule

Use a secondary reference to solve a **specific pattern** only. Examples:

```text
Need a motion language?          → GSAP
Need developer-tool warmth?     → Cursor
Need dense control-room UI?     → LaunchDarkly
Need tactile documentation?     → PostHog
Need strict editorial grid?     → mono
```

Do not let a secondary reference introduce a new brand color, new radius philosophy, or new typography system unless this document explicitly permits it.

---

### Synthesis rule

Do not make ProAgents look like a collage of these references.

The resulting system should feel like **one coherent developer product** with:

```text
editorial typography
        +
terminal precision
        +
compiler diagrams
        +
open-source documentation
```

---

# 4. Brand Personality

## Keywords

`professional` `precise` `portable` `inspectable` `reproducible` `systematic` `open` `agent-native`

## Signature metaphors

Use these concepts visually:

- forge
- compile
- compose
- equip
- inspect
- verify
- transform
- route
- profile
- capability

Do **not** illustrate the forge literally with anvils, hammers, sparks, or fantasy imagery.

The “forge” metaphor is expressed through:

```text
layers
assembly
connections
transformation
signal
verification
```

---

# 5. Color System

The palette is intentionally narrow. Color should communicate state and hierarchy rather than decorate every section.

## 5.2 Primary tokens — SHIPPED (Logo Ramp)

The palette is **the logo itself** (`branding/logo.png`), pixel-sampled: the wordmark
carries a violet → blue → sky → cyan gradient (`#5d2de2 → #0e4bec → #13a6e0 → #0cced4`),
and the bot's body is deep navy (`#000828`). Light mode is the default (cool editorial
paper `#f7f8fd`); dark mode is the navy bot-world. The 4-stop ramp is a rationed brand
moment — the hero word-mark emphasis and the footer band — never buttons, never body
text fills, never headline text elsewhere. Interactive color is the ramp core blue.

```css
:root {
  --pa-violet: #5d2de2;
  --pa-blue: #0e4bec;   /* interactive accent, both modes */
  --pa-sky: #13a6e0;
  --pa-cyan: #0cced4;   /* live/ok status */
  --pa-navy: #000828;   /* dark canvas */

  /* light mode (default) */
  --pa-bg: #f7f8fd;
  --pa-bg-soft: #eef1f9;
  --pa-card: #ffffff;
  --pa-text: #0d1128;
  --pa-text-soft: #3c4360;
  --pa-text-muted: #5b6480;
  --pa-line: rgba(13, 17, 40, 0.12);
  --pa-accent-strong: #0b3fc9; /* AA text on paper */

  /* dark mode (html.dark) */
  --pa-dark-bg: #060d33;
  --pa-dark-bg-elv: #0b1338;
  --pa-dark-text: #eef1fb;
  --pa-dark-accent: #6b93ff; /* ramp blue lifted for navy */

  --pa-ramp: linear-gradient(90deg, #5d2de2 0%, #0e4bec 38%, #13a6e0 72%, #0cced4 100%);
}
```

**Signature hero (the ASCII bot).** The landing hero renders the ProAgents bot
(`branding/logo-bot-icon.png`) as **ASCII art** on a canvas — the presskit-ascii /
awwwards move: a 10-step density ramp (` .:-=+*#%@`), a responsive grid (~8×11 CSS px
cells; 60+ columns even on a phone), converted from the bot's alpha×darkness with
per-cell dithering so the icon's tones spread across the whole ramp (never a solid
slab). A sparse deterministic halftone plus a faint presence field keep the band alive
edge-to-edge (browserbase-etch style). A diagonal band sweeps the logo ramp across the
art; the cursor raises density and pulls cells toward the ramp color. Under
`prefers-reduced-motion` the field renders one static frame; the loop pauses off-screen
and on hidden tabs. In dark mode the ink flips to paper on navy.

### Type (shipped pairing)

Nunito is the display face — chosen to match the logo wordmark (`branding/logo.png`:
heavy rounded geometric sans, single-story `g`). Geist carries body/UI, JetBrains
Mono carries labels, code and categorical tags. Self-hosted via `@fontsource-variable/*`.

```css
:root {
  --pa-font-display: "Nunito Variable", ui-rounded, system-ui, sans-serif;
  --pa-font-body: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --pa-font-mono: "JetBrains Mono Variable", ui-monospace, "SFMono-Regular", monospace;
}
```

## 5.1 Primary tokens — SHIPPED (Phosphor Ink) — SUPERSEDED 2026-09-20

Implemented in `docs/.vitepress/theme/landing/landing.css` (landing) and adopted by
the docs theme + Studio SPA. Verified against typesafe.ai's actual palette
(`#FEFEFE` paper / `#1E1E1E` ink / near-monochrome + one rationed accent): the
ink/paper monochrome carries identity; the lime signal is a status light, never a
theme color. Zero violet, zero cyan, zero purple by design decision (2026-09-20).

```css
:root {
  --pa-bg: #0a0b0a;
  --pa-bg-raised: #0f1110;
  --pa-bg-panel: #151816;
  --pa-bg-elevated: #1b1f1b;

  --pa-paper: #f5f6f0;
  --pa-paper-soft: #eceee7;

  --pa-text: #f5f6f0;
  --pa-text-soft: #c8ccc5;
  --pa-text-muted: #858c84;
  --pa-text-faint: #5f665f;

  --pa-line: rgba(245, 246, 240, 0.12);
  --pa-line-strong: rgba(245, 246, 240, 0.22);

  --pa-signal: #b7f36a;
  --pa-signal-bright: #d5ff94;
  --pa-signal-dim: #6f9141;

  --pa-success: #9fe870;
  --pa-warning: #efbd68;
  --pa-danger: #ff7474;
  --pa-info: #8eb6ff;
}
```

## 5.4 Light editorial surface (v1.1 rationale)

Use light sections sparingly on the landing page and naturally throughout documentation where long-form reading benefits from it.

```css
:root {
  --pa-paper-bg: #f5f6f0;
  --pa-paper-text: #101310;
  --pa-paper-muted: #666d65;
  --pa-paper-line: rgba(16, 19, 16, 0.14);
  --pa-paper-signal: #5c782f;
}
```

## 5.5 Color ratio

Approximate visual ratio on the landing page:

```text
75–82% dark / neutral surfaces
15–20% warm text / paper surfaces
 2–5% signal color
```

## 5.6 Signal rule (v1.1 rationale)

The lime signal should have **one primary job in each visual region**.

Good:

- active step
- primary CTA
- active diagram node
- verification marker
- current navigation state

Bad:

- every button is green
- every border is green
- every icon is green
- every card has a green glow

The signal should feel like a **status light**.

---

# 6. Typography

Typography is the primary visual identity.

## 6.1 Font families

Preferred stack:

```css
--font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-display: "Inter Tight", Inter, ui-sans-serif, sans-serif;
--font-mono: "Geist Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
--font-editorial: Newsreader, Georgia, serif;
```

The exact licensed font is less important than preserving the roles.

### Roles

**Display Sans**

- hero headline
- section headlines
- major statements

**UI Sans**

- body
- navigation
- buttons
- cards
- documentation prose

**Mono**

- labels
- commands
- paths
- version strings
- technical metadata
- diagram annotations

**Editorial Serif**

Use only as a rare accent for one phrase or supporting statement. It must never dominate the entire site.

## 6.2 Type scale

```text
Display 2: 88–112px / 0.90–0.96 / -0.055em
Display 1: 64–84px  / 0.92–0.98 / -0.045em
H1:        48–60px  / 0.98–1.05 / -0.035em
H2:        34–44px  / 1.02–1.10 / -0.025em
H3:        24–30px  / 1.10–1.18 / -0.015em
Lead:      20–22px  / 1.45–1.55 / -0.006em
Body:      16px     / 1.60–1.70 / -0.003em
Small:     14px     / 1.50–1.60
Label:     11–12px  / 1.20       / +0.10em
Mono:      11–13px  / 1.35–1.50 / +0.01em
```

## 6.3 Typography rules

- Prefer scale over boldness.
- Use tight tracking only on large headlines.
- Use uppercase sparingly, mostly for mono labels.
- Long documentation prose should stay around 65–75 characters per line.
- Do not mix more than three type roles in one viewport.
- Avoid all-caps paragraphs.

---

# 7. Shape Language

ProAgents should be **mostly rectangular and structural**.

## Radius

```text
0px  diagrams / rules / major panels
4px  technical controls
6px  buttons / code blocks
8px  documentation callouts
10px small cards
9999px only status dots / true pills
```

Avoid the common AI-SaaS visual language of large 24–32px rounded cards everywhere.

## Borders

Use hairline borders as the primary method of structure.

```css
border: 1px solid var(--pa-line);
```

Hover:

```css
border-color: var(--pa-line-strong);
```

Signal:

```css
border-color: color-mix(in srgb, var(--pa-signal) 65%, transparent);
```

## Shadows

Shadows should be rare.

Prefer luminance contrast and borders.

When required:

```css
box-shadow: 0 18px 60px rgba(0, 0, 0, 0.24);
```

Never use giant colored AI glows as the primary visual effect.

---

# 8. Grid and Layout

## Global container

```text
max-width: 1280px
wide-max-width: 1400px
mobile gutter: 20px
small desktop gutter: 32px
large desktop gutter: 48–64px
```

## Landing-page grid

Use a 12-column layout on desktop.

Recommended compositions:

```text
Hero             8 / 4 or 9 / 3
Concept          5 / 7
Profile anatomy  4 / 8
Architecture    12 / 12 (diagram stage)
Workflow         4 / 8
Harnesses        3 / 3 / 3 / 3
Crew composition 4 / 8
Final CTA        7 / 5
```

Do not turn every section into cards.

## Documentation grid

```text
left rail:    240–280px
content:      680–760px
right rail:   200–240px
```

On wide screens, the page should visually read:

```text
[SIDEBAR] [DOCUMENT]                 [OUTLINE]
```

The documentation page should never feel like the marketing page squeezed into a docs shell.

---

# 9. Navigation

## Landing navigation

Minimal and transparent over the hero.

```text
PROAGENTS      Profiles   Crews   Docs   GitHub          Get started →
```

Rules:

- height approximately 68–76px
- no giant pill container
- no thick shadow
- hairline bottom rule appears after scroll
- GitHub is treated as an important open-source destination
- primary CTA is rectangular with subtle 4–6px radius

### Active treatment

Do not create bright filled nav tabs.

Use:

```text
text emphasis
+ 1px signal underline
```

## Documentation navigation

Navigation should become more functional:

```text
PROAGENTS

GETTING STARTED
  Introduction
  Installation
  Quickstart

CONCEPTS
  Professional Profiles
  Skills
  Composition
  Verification

CLI
  Commands
  Configuration

GUIDES
  Existing Repositories
  Harnesses
  Crews
  Benchmarking
```

Use compact mono section labels and comfortable document links.

VitePress supports customizable `nav` and `sidebar` configuration, so these structures should be implemented with the native theme configuration rather than recreating navigation unnecessarily. citeturn984240search1turn984240search4

---

# 10. Landing Page — Visual Narrative

The landing page should not simply reproduce the README.

It should compress the product into a visual argument.

## Section 01 — Hero

### Goal

Explain the product in under five seconds.

### Layout

Top:

```text
[PROAGENTS]                     [DOCS] [GITHUB]
```

Main:

```text
GIVE YOUR
CODING AGENT
A PROFESSION.
```

Supporting copy:

```text
ProAgents equips existing coding-agent harnesses with
professional expertise, methods, skills, rules, tools,
knowledge, and verification.
```

CTA row:

```text
[ Get started ]   [ Read the docs → ]
```

Then a large visual transformation:

```text
EXISTING CODING AGENT
            +
PROFESSIONAL PROFILE
            ↓
       PROFILE COMPILER
            ↓
 ┌─────────┬─────────┬─────────┐
 ▼         ▼         ▼
CLAUDE    CODEX    OPENCODE
 └─────────┴─────────┴─────────┘
            ↓
   PROFESSIONAL AGENT
```

### Hero visual treatment

Use a dark system canvas with very faint grid lines.

Each node is a real typographic object—not a decorative floating card.

Suggested visual states:

```text
inactive   text muted / line dim
active     signal green text or border
compiled   signal node + thin connection
verified   tiny signal marker
```

The animation should communicate **compilation**, not “AI magic.”

---

# 11. Landing Page — Section System

## Section 02 — The missing layer

Large statement:

> A coding agent can write code. A professional agent knows how the work should be done.

Composition:

```text
GENERIC TASK                    PROFESSIONAL METHOD

find the bug                    understand boundary
                                reproduce
                                analyze attack surface
                                determine root cause
                                remediate
                                verify
                                report evidence
```

Use one large vertical rule to separate the two worlds.

No card grid.

## Section 03 — Profile anatomy

Show the Professional Profile as a stacked, inspectable system.

```text
01  IDENTITY
02  EXPERTISE
03  KNOWLEDGE
04  METHODS
05  SKILLS
06  RULES
07  POLICIES
08  STANDARDS
09  TOOLS
10  VERIFICATION
```

Visual style:

- numbered mono labels
- full-width rows
- hairline separators
- active row highlighted with signal color
- subtle hover expansion

This should visually communicate **composition and inspectability**.

## Section 04 — Same intelligence. Different operating model.

Use a two-lane comparison.

```text
GENERIC CODING AGENT
read → change → test → done

PROFESSIONAL AGENT
understand → method → execute → verify → evidence
```

Do not visually imply a different model or a smarter brain. The product promise is a different **operating model**.

## Section 05 — Portable across harnesses

This is the second major graphic after the hero.

```text
                 CANONICAL PROFILE
                         │
                         ▼
                  PROFILE COMPILER
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
        CLAUDE CODE     CODEX      OPENCODE
            │            │            │
            └────────────┼────────────┘
                         ▼
                 SAME PROFESSION
```

Harness names should be rendered as neutral endpoints, not branded giant logos.

## Section 06 — Progressive disclosure

Use a vertical trace:

```text
TASK
 ↓
INTENT
 ↓
RELEVANT SKILLS
 ↓
METHOD
 ↓
KNOWLEDGE
 ↓
TOOLS
 ↓
RULES
 ↓
EXECUTE
 ↓
VERIFY
```

Animate the current step with the lime signal.

## Section 07 — Professional agent systems

Introduce composition without making “multi-agent” the headline.

```text
             STAFF ENGINEER
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
    BACKEND      SECURITY       QA
```

The visual should emphasize distinct responsibilities and clean handoffs.

## Section 08 — Evidence

Show a compact verification stack:

```text
IMPLEMENTATION
      ↓
TYPECHECK
      ↓
TESTS
      ↓
BUILD
      ↓
RUNTIME VALIDATION
      ↓
EVIDENCE
```

This section should have the strongest “instrument panel” feel.

## Section 09 — Install

Bring the page back to simplicity.

```text
npm install -g proagent
```

Then:

```text
proagent detect
proagent list
proagent equip security-engineer
```

The install area should resemble a polished terminal specimen, not a generic code card.

## Footer

Use a darker visual close with:

- logo
- GitHub
- Documentation
- Registry
- License
- Sponsor
- version

A single signal-green horizontal rule or small band may close the page.

---

# 12. Diagram Language

Diagrams are a major part of the identity.

## Rules

1. Prefer typography + lines over illustrations.
2. Use monospaced labels for system entities.
3. Keep connections thin.
4. Highlight only the active concept.
5. Keep node shapes rectangular or minimally rounded.
6. Use whitespace as part of the diagram.
7. Avoid decorative arrows that do not communicate data or control flow.

## Connection style

```css
stroke: rgba(245,246,240,.20);
stroke-width: 1px;
```

Active connection:

```css
stroke: var(--pa-signal);
stroke-width: 1px;
```

## Node style

```text
┌─────────────────────────────┐
│  PROFILE COMPILER            │
│  canonical → harness-native  │
└─────────────────────────────┘
```

Use all-caps mono for the primary label and a quieter sans/mono line for metadata.

## Forbidden diagram styles

- neon 3D spheres
- generic neural-network graphs
- fake blockchain nodes
- cartoon agents
- glowing brains
- random constellation graphics
- decorative “AI” circuitry

---

# 13. Components

## Primary button

```text
[ GET STARTED → ]
```

Characteristics:

- dark text on signal background
- 4–6px radius
- 44–48px minimum height
- compact horizontal padding
- no giant pill
- restrained hover lift

## Secondary button

```text
[ READ THE DOCS → ]
```

Transparent background.

1px border.

Uses text + arrow, not an icon-only control.

## Text link

Minimal underline or small signal transition on hover.

## Mono label

```text
01 / PROFILE ANATOMY
```

Small uppercase mono.

Signal color may mark only the number.

## Technical panel

Rectangular dark panel with:

- header line
- tiny mono metadata
- content body
- optional status marker

## Profile row

```text
01       EXPERTISE                         →
         discipline-specific capability
```

Use vertical alignment and borders rather than cards.

## Code specimen

A code block should feel like a **source artifact**, not a decorative IDE mockup.

Header:

```text
PROAGENT / QUICKSTART             COPY
```

Content:

```bash
npm install -g proagent
proagent equip security-engineer
```

Footer may display:

```text
exit 0    profile validated    12 capabilities
```

Only show metadata when meaningful.

## Callout

Documentation callouts use the same structural system as technical panels.

```text
NOTE
────────────────────────────
Relevant explanation.
```

Avoid giant colored alert boxes.

---

# 14. Documentation Visual System

The documentation should retain the landing-page identity while behaving like documentation.

## Principle

**Less cinematic. More readable. Same DNA.**

## Document header

Every major doc page may begin with:

```text
GUIDE / PROFILES

Professional Profiles

A portable definition of how an agent operates as a professional.
```

Use:

- mono breadcrumb label
- strong sans heading
- muted lead
- thin rule

## Headings

H2 and H3 should be distinctly visible in the left reading flow.

Avoid extremely oversized headings in docs.

Recommended documentation H1:

```text
48–56px desktop
36–42px mobile
```

## Body

Keep documentation copy readable and relatively compact.

```text
16–17px
line-height: 1.65
max-width: 72ch
```

## Code blocks

Dark rectangular blocks, even when the surrounding page is light.

Do not use rainbow syntax coloring.

Use a restrained syntax palette:

```text
keywords     signal / light accent
strings      warm neutral
comments     muted gray
numbers      pale blue or neutral
plain text   warm white
```

No more than one semantic accent per syntactic role.

## Inline code

Use a small muted background rather than a border-heavy badge.

```text
`proagent equip security-engineer`
```

## Tables

Tables should look like technical records.

- thin horizontal rules
- no zebra striping by default
- compact headers
- mono for keys / commands
- left-aligned text

## Tabs

Use tabs only when content genuinely has variants such as:

```text
Claude Code | Codex | OpenCode
```

Do not use tabs for arbitrary information grouping.

## Admonitions

Use VitePress admonitions, but skin them as part of the ProAgents system:

- no oversized rounded boxes
- no gradients
- subtle background tint
- strong left rule
- compact title

---

# 15. VitePress Theme Direction

The documentation should **extend the VitePress default theme rather than replace its information architecture wholesale**.

VitePress supports overriding CSS variables, custom theme files, and layout slots while retaining the default documentation behavior. It also supports `home`, `page`, and `doc` layouts, with `page` suited to fully custom page styling. citeturn984240search0turn984240search3turn984240search5

## Recommended structure

```text
.vitepress/
├── config.ts
└── theme/
    ├── index.ts
    ├── custom.css
    └── components/
        ├── ProAgentsHero.vue
        ├── ProAgentsDiagram.vue
        ├── ProAgentsSection.vue
        └── TechnicalPanel.vue
```

## Landing page

Prefer a dedicated custom landing surface.

Recommended options:

```yaml
---
layout: page
---
```

or a dedicated custom home layout when more control is needed.

The landing page should not inherit the normal documentation article styling.

## Documentation pages

Use the normal VitePress `doc` layout and override the visual system through theme CSS and small targeted components.

This keeps:

- outline behavior
- sidebar behavior
- prev/next navigation
- Markdown rendering
- accessibility semantics
- documentation conventions

while replacing the generic visual shell.

## Navigation

Use VitePress `themeConfig.nav` and `themeConfig.sidebar` for information architecture rather than rebuilding those systems unnecessarily. citeturn984240search1turn984240search4

## Layout slots

Use VitePress layout slots for small additions such as:

- document metadata
- section markers
- contributor metadata
- related pages
- a subtle docs status strip

Do not fill every available slot with custom widgets.

---

# 16. Documentation Sidebar

The sidebar should look like a **technical index**, not a SaaS category menu.

Example:

```text
START HERE
  Introduction
  Installation
  Quickstart

CONCEPTS
  Professional Profiles
  Skills vs Profiles
  Composition
  Verification
  Progressive Disclosure

USING PROAGENTS
  Detect
  Equip
  Inspect
  Validate
  Compile

ADVANCED
  Existing Repositories
  Harness Adapters
  Crews
  Benchmarking
  Self-Improvement

REFERENCE
  CLI
  Configuration
  Manifest
  Project Structure
```

Visual treatment:

- small mono group labels
- 13–14px links
- compact vertical rhythm
- active page gets signal text or a 1px signal marker
- no filled rounded active pills

---

# 17. Documentation Header / Breadcrumbs

Use technical breadcrumbs rather than giant decorative breadcrumbs.

```text
GUIDE / CONCEPTS
```

or:

```text
CLI / COMMANDS / EQUIP
```

Breadcrumb typography:

```text
11px mono
uppercase
+0.10em tracking
muted gray
```

The current segment can use the signal color.

---

# 18. Background System

Background texture should be almost invisible.

## Grid

Use a subtle technical grid only on:

- landing hero
- architecture diagrams
- large system sections

Example:

```css
background-image:
  linear-gradient(rgba(245,246,240,.035) 1px, transparent 1px),
  linear-gradient(90deg, rgba(245,246,240,.035) 1px, transparent 1px);
background-size: 32px 32px;
```

Keep opacity very low.

## Grain

Optional, but only if extremely subtle.

Do not let texture interfere with text rendering or screenshots.

## Glows

Use no generic radial “AI glow” background.

A very small signal bloom may be used behind an active diagram node.

---

# 19. Motion System

Motion communicates **system state**.

It must never feel like decorative startup animation.

## Principles

1. motion follows information flow
2. movement is short and precise
3. transforms and opacity are preferred
4. no constant floating animation
5. no heavy parallax
6. no distracting particles

## Timing

```text
micro interaction: 120–180ms
standard transition: 180–260ms
section reveal:      350–500ms
large transformation: 600–900ms
```

Use ease-out curves.

## Signature landing animation

Hero compiler sequence:

```text
PROFILE
   ↓
COMPILING
   ↓
HARNESS TARGETS
   ↓
EQUIPPED
```

Only one node changes to signal green at a time.

## Scroll reveal

Reveal:

- labels
- diagram nodes
- connecting rules
- headlines

Do not animate every paragraph.

## Hover

Use a maximum of one or two visual changes:

```text
border brightens
+ text shifts slightly
```

Avoid:

- scaling cards aggressively
- blur
- huge shadows
- cursor-following glow

## Reduced motion

Respect `prefers-reduced-motion` and disable non-essential sequence animations.

---

# 20. Responsive Direction

Mobile is not a miniature desktop.

## Mobile landing

Hero becomes:

```text
GIVE YOUR
CODING AGENT
A PROFESSION.
```

Then immediately:

```text
agent
+
profile
↓
professional agent
```

Architecture diagrams should become vertical.

Desktop:

```text
A ───── B ───── C
```

Mobile:

```text
A
│
B
│
C
```

## Mobile navigation

Keep the brand visible.

Use a compact menu with:

- Docs
- Profiles
- Crews
- GitHub

Primary CTA remains visible when feasible.

## Mobile typography

```text
Display: 44–56px
H1:      36–44px
H2:      30–36px
Body:    16px
Labels:  11px
```

## Documentation mobile

Hide the desktop right outline when space is tight.

Keep:

- article content
- mobile docs navigation
- previous/next links

Preserve code overflow rather than shrinking code until unreadable.

---

# 21. Accessibility

Visual identity must not depend on color alone.

## Requirements

- WCAG AA contrast for body text
- visible keyboard focus
- semantic headings
- reduced-motion support
- diagrams need textual equivalents
- links must remain understandable without color
- signal-green state must have another indicator such as icon, text, or position
- code must remain readable in light and dark surfaces

Focus treatment:

```css
outline: 2px solid var(--pa-signal);
outline-offset: 3px;
```

---

# 22. Content / UI Voice

The UI copy should be:

- direct
- technical
- confident
- specific
- restrained

Prefer:

> Compile a professional profile for your coding agent.

Avoid:

> Unlock the future of AI-powered development.

Prefer:

> Same intelligence. Different operating model.

Avoid:

> Supercharge your AI with next-generation intelligence.

Prefer:

> Verify the work. Show the evidence.

Avoid:

> Build with confidence like never before.

---

# 23. Landing Page Content Hierarchy

The landing page should have a strict hierarchy.

## Level 1

**Give your coding agent a profession.**

## Level 2

**Professional Agent Profile**

## Level 3

**Profile Compiler**

## Level 4

**Knowledge / Methods / Skills / Rules / Tools / Verification**

## Level 5

Technical examples, commands, metadata, implementation details.

Never allow low-level CLI syntax to visually compete with the product concept in the hero.

---

# 24. Landing Page Acceptance Criteria

The landing page is visually correct when:

### First 5 seconds

A visitor can understand:

```text
ProAgents
= professional layer
for existing coding agents
```

### First scroll

The visitor sees the transformation:

```text
agent + profile → professional agent
```

### Middle of page

The visitor understands:

```text
profile
→ compose capabilities
→ compile to harness
→ verify
```

### End of page

The visitor knows how to start:

```bash
npm install -g proagent
```

### Visual quality

The page should feel:

- editorial
- technical
- sparse
- intentional
- open-source
- contemporary

It should not feel:

- template-generated
- over-animated
- over-rounded
- gradient-heavy
- “AI generic”

---

# 25. Documentation Acceptance Criteria

Documentation is visually correct when:

1. It is immediately recognizable as ProAgents even without the logo.
2. Reading is more important than decoration.
3. Navigation is faster to scan than the marketing page.
4. Code blocks feel like source artifacts.
5. Diagrams use the same line/node language as the landing page.
6. Headings are strong but not enormous.
7. Sidebar and outline remain useful on large screens.
8. Mobile documentation remains comfortable to read.
9. Dark and light surfaces feel like one design system.
10. The page never looks like unmodified VitePress default theme.

---

# 26. VitePress Token Mapping

Map the ProAgents system to VitePress variables rather than scattering hard-coded colors across components.

Conceptually:

```css
:root {
  --vp-c-brand-1: var(--pa-signal);
  --vp-c-brand-2: var(--pa-signal-bright);
  --vp-c-brand-3: var(--pa-signal-dim);

  --vp-c-bg: var(--pa-bg);
  --vp-c-bg-alt: var(--pa-bg-raised);
  --vp-c-bg-elv: var(--pa-bg-panel);
  --vp-c-bg-soft: var(--pa-bg-panel);

  --vp-c-text-1: var(--pa-text);
  --vp-c-text-2: var(--pa-text-soft);
  --vp-c-text-3: var(--pa-text-muted);

  --vp-c-divider: var(--pa-line);
  --vp-c-gutter: var(--pa-line-strong);

  --vp-font-family-base: var(--font-sans);
  --vp-font-family-mono: var(--font-mono);
}
```

Then layer custom component classes on top.

VitePress explicitly supports root-level CSS variable customization for the default theme. citeturn984240search0

---

# 27. Component Architecture for the Site

Keep the component set small and reusable.

```text
site/
│
├── landing/
│   ├── Hero
│   ├── Statement
│   ├── ProfileAnatomy
│   ├── Comparison
│   ├── CompilerDiagram
│   ├── DisclosureFlow
│   ├── CompositionDiagram
│   ├── VerificationFlow
│   ├── InstallSpecimen
│   └── Footer
│
└── docs/
    ├── DocHeader
    ├── SectionLabel
    ├── TechnicalPanel
    ├── CodeSpecimen
    ├── ArchitectureDiagram
    └── Callout
```

Do not create a separate component for every visual variation.

The design system should stay small enough that an AI coding agent can reason about it consistently.

---

# 28. Design Rules for AI Coding Agents

These rules are intentionally explicit so an AI coding agent can implement the system without guessing.

## DO

- use large typography for major concepts
- use mono labels for system metadata
- use hairline borders
- use the lime signal sparingly
- vary section composition
- make diagrams typographic and structural
- keep code blocks visually important
- use whitespace deliberately
- preserve a coherent dark/light relationship
- make documentation feel native to the same product
- use real content from ProAgents rather than lorem ipsum

## DO NOT

- use purple gradient backgrounds
- use glassmorphism cards
- use giant rounded pills
- use 3D robot illustrations
- use AI brains
- use stock photography
- use floating dashboard screenshots just for decoration
- cover everything in glowing green
- animate every section
- turn the landing page into a documentation page
- turn the documentation into a marketing page

---

# 29. Recommended Hero Copy

## Primary

**Give your coding agent a profession.**

## Supporting

ProAgents equips existing coding-agent harnesses with professional expertise, methods, skills, rules, tools, knowledge, and verification.

## Transformation

```text
Existing Coding Agent
        +
Professional Agent Profile
        ↓
Professional Agent
```

## Secondary statement

**Same intelligence. Different operating model.**

## CTA

**Get started →**

Secondary:

**Read the docs →**

---

# 30. Final Visual Principle

The ProAgents website should feel like **software infrastructure presented with editorial confidence**.

The landing page sells the idea through:

```text
scale
space
diagrams
contrast
motion
```

The documentation teaches the system through:

```text
clarity
navigation
code
examples
structure
```

Both surfaces share one visual grammar:

```text
                    PROAGENTS
                        │
            ┌───────────┴───────────┐
            │                       │
         LANDING                 DOCS
            │                       │
       editorial                functional
       cinematic                readable
       spacious                 dense
            │                       │
            └───────────┬───────────┘
                        │
                 SAME DESIGN DNA
                        │
       ┌────────────────┼────────────────┐
       │                │                │
   typography        signal            diagrams
       │                │                │
       └────────────────┼────────────────┘
                        │
              PROFESSIONAL TOOLING
```

The design should communicate one fundamental thing before the user reads the details:

> **ProAgents is a professional layer for coding agents.**

---

# 31. Reference Sources

- VoltAgent Awesome DESIGN.md: https://github.com/voltagent/awesome-design-md
- VitePress extending the default theme: https://vitepress.dev/guide/extending-default-theme
- VitePress custom themes: https://vitepress.dev/guide/custom-theme
- VitePress layout: https://vitepress.dev/reference/default-theme-layout
- VitePress nav: https://vitepress.dev/reference/default-theme-nav
- VitePress sidebar: https://vitepress.dev/reference/default-theme-sidebar
- TypeSafe AI: https://typesafe.ai/
- Refero New Form: https://styles.refero.design/style/1a519123-071a-449f-b5df-0def73ed7f35
- Refero Modal: https://styles.refero.design/style/68c15685-5db9-4869-b71d-27240568c9d8
- Refero Antimetal: https://styles.refero.design/style/9f9a4a4f-1a27-47ca-a65b-68b9850a84e4
- Refero Adaline: https://styles.refero.design/style/312423bf-72ea-42fb-b8f5-ab0104e778f3
- Refero Dovetail: https://styles.refero.design/style/108e2695-6970-47d5-b5b0-eea8fc34e048
- Supporting Refero references listed in Section 3

---

# 32. Implementation Principle

Treat this document as the **visual contract** for the ProAgents landing page and VitePress documentation.

The coding agent should not improvise a new visual style while implementing individual pages.

When a page requires a new component, extend the existing visual language rather than introducing a new one.
