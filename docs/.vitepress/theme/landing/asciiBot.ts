/*
 * The signature hero: a futuristic ASCII field rendered on canvas
 * (DESIGN.md §5.2 "Signature hero" / presskit-ascii move). Full-width band
 * under the headline — no figure, no image. Three layered, deterministic
 * motions keep it alive:
 *
 *   1. INTERFERENCE — two drifting sine waves gate an ambient halftone, so
 *      the field breathes in organic, slowly-moving interference patterns.
 *   2. PULSE RINGS — concentric rings expand from deterministic origins,
 *      lifting glyph density as their crest passes (the "sonar" depth cue).
 *   3. RAMP SWEEP — the brand ramp (violet→cyan) travels diagonally as a
 *      soft band, tinting the cells it crosses.
 *
 * The cursor etches density into the cells it passes (the "etch trail").
 * Deterministic core: no Math.random, no timestamps in output — every frame
 * is a pure function of (grid, time, pointer). Under prefers-reduced-motion
 * the field renders one static frame; the loop pauses off-screen and on
 * hidden tabs.
 */

import { withBase } from "vitepress";

/** The 10-step density ramp, blank → densest. */
const RAMP = " .:-=+*#%@";

/** Default cell box in CSS pixels (the character is centered in the box). */
const CELL_W = 8;
const CELL_H = 11;

/** Diagonal sweep speed in cell-columns per second. */
const SWEEP_SPEED = 22;

/** Interference wave speeds (rad/s) — slow enough to read as breathing. */
const WAVE_A_SPEED = 0.55;
const WAVE_B_SPEED = 0.34;

/** Pulse rings: one every N seconds (staggered), expanding at px/s. */
const RING_PERIOD = 7;
const RING_SPEED = 90;

interface RGB {
  r: number;
  g: number;
  b: number;
}

const INK: RGB = { r: 13, g: 17, b: 40 }; // --pa-text on paper
const INK_MUTED: RGB = { r: 91, g: 100, b: 128 }; // --pa-text-muted

export interface AsciiBotOptions {
  /** CSS color stops for the sweep, dark → light (violet → cyan). */
  ramp?: readonly string[];
  cellW?: number;
  cellH?: number;
}

/** The logo ramp by default (DESIGN.md §5.2). */
const DEFAULT_RAMP: readonly string[] = [
  "#5d2de2",
  "#0e4bec",
  "#13a6e0",
  "#0cced4",
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function css({ r, g, b }: RGB): string {
  return `rgb(${r},${g},${b})`;
}

/** Parse `#rrggbb` (the only format the ramp option accepts). */
function hexRGB(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Deterministic hash noise in [0,1) — the field must be reproducible. */
function hash01(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Sample a multi-stop ramp at t ∈ [0,1]. */
function sampleRamp(stops: RGB[], t: number): RGB {
  const c = clamp01(t) * (stops.length - 1);
  const i = Math.min(Math.floor(c), stops.length - 2);
  return mixRGB(stops[i]!, stops[i + 1]!, c - i);
}

export interface AsciiBotInfo {
  cols: number;
  rows: number;
  cells: number;
}

export class AsciiBotField {
  /**
   * Build the field. Resolves `null` when the context is unavailable
   * (caller should collapse the band gracefully — never throw). The
   * `imagePath` argument is kept for call-site compatibility; the futuristic
   * field is pure computation and loads nothing.
   */
  static async create(
    canvas: HTMLCanvasElement,
    _imagePath?: string,
    options: AsciiBotOptions = {},
  ): Promise<AsciiBotField | null> {
    void withBase; // kept: call sites still pass a path; no load happens.
    return new AsciiBotField(canvas, options);
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly rampStops: RGB[];

  private cols = 0;
  private rows = 0;
  /** Base ambient density per cell (before time modulation). */
  private densities: Float32Array = new Float32Array(0);

  private raf = 0;
  private running = false;
  private inView = false;
  private pageHidden = false;
  private reduced = false;

  private pointer = { x: -1e5, y: -1e5 };
  private resizeObs: ResizeObserver | null = null;
  private viewObs: IntersectionObserver | null = null;
  private cleanups: Array<() => void> = [];

  private constructor(canvas: HTMLCanvasElement, options: AsciiBotOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ascii bot: 2d context unavailable");
    this.ctx = ctx;
    this.cellW = options.cellW ?? CELL_W;
    this.cellH = options.cellH ?? CELL_H;
    this.rampStops = (options.ramp ?? DEFAULT_RAMP).map(hexRGB);
  }

  /** Bind observers/listeners and start (or render one static frame). */
  start(): void {
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = reducedMq.matches;
    const onReduced = (e: MediaQueryListEvent): void => {
      this.reduced = e.matches;
      this.restart();
    };
    reducedMq.addEventListener("change", onReduced);
    this.cleanups.push(() => reducedMq.removeEventListener("change", onReduced));

    const onHidden = (): void => {
      this.pageHidden = document.hidden;
      this.restart();
    };
    document.addEventListener("visibilitychange", onHidden);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onHidden));

    const onMove = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // A static frame still etches under the cursor — repaint it.
      if (this.reduced) this.render(0.35);
    };
    const onLeave = (): void => {
      this.pointer = { x: -1e5, y: -1e5 };
      if (this.reduced) this.render(0.35);
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerleave", onLeave);
    this.cleanups.push(() => this.canvas.removeEventListener("pointermove", onMove));
    this.cleanups.push(() => this.canvas.removeEventListener("pointerleave", onLeave));

    this.resizeObs = new ResizeObserver(() => this.rebuild());
    this.resizeObs.observe(this.canvas.parentElement ?? this.canvas);
    this.cleanups.push(() => this.resizeObs?.disconnect());

    this.viewObs = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((e) => e.isIntersecting);
        this.restart();
      },
      { threshold: 0 },
    );
    this.viewObs.observe(this.canvas);
    this.cleanups.push(() => this.viewObs?.disconnect());

    // Rebuild once fonts settle so the mono glyphs measure true.
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.rebuild()).catch(() => {});
    }

    this.rebuild();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  // -- grid ----------------------------------------------------------------

  private rebuild(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const cssW = Math.max(200, Math.floor(host.clientWidth));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // The canvas is the hero background: it fills its layer element, whose
    // size the layout controls.
    const cssH = Math.max(240, Math.floor(host.clientHeight));
    const cols = Math.max(24, Math.floor(cssW / this.cellW));
    const rows = Math.max(12, Math.floor(cssH / this.cellH));

    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cols = cols;
    this.rows = rows;
    this.densities = this.sampleField(cols, rows);
    this.restart();
  }

  /**
   * Base ambient density for the full-width field. Wave-gated halftone
   * across the whole band — denser toward the right edge so the left side
   * (where the headline sits on mobile) stays quiet, but nothing is fully
   * dead: the field must read as one continuous fabric.
   */
  private sampleField(cols: number, rows: number): Float32Array {
    const out = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const wave = Math.sin(c * 0.34 + r * 0.82) + Math.sin(c * 0.11 - r * 0.29);
        const p = wave > 0.6 ? 0.34 : 0.1;
        if (hash01(c, r) < p) out[i] = 0.12 + hash01(c + 31, r + 17) * 0.18;
      }
    }
    return out;
  }

  // -- loop ----------------------------------------------------------------

  private restart(): void {
    const shouldRun = !this.pageHidden && (this.reduced || this.inView);
    if (shouldRun && !this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
    if (this.reduced) this.render(0.35); // one static frame
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    this.render(nowMs / 1000);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Deterministic pulse-ring origins: three across the band. */
  private ringOrigin(k: number, cssW: number, cssH: number): { x: number; y: number } {
    return {
      x: cssW * (0.22 + 0.28 * ((k * 7) % 3) / 2),
      y: cssH * (0.3 + 0.4 * (((k * 5) % 4) / 3)),
    };
  }

  /** Draw one frame at time `t` seconds (deterministic in t). */
  private render(t: number): void {
    const { ctx, cols, rows, densities } = this;
    const cw = this.cellW;
    const ch = this.cellH;
    const cssW = cols * cw;
    const cssH = rows * ch;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = `500 ${ch - 3}px "JetBrains Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Diagonal sweep: one soft band crossing the field, wrapping.
    const projSpan = cols + rows * 0.9;
    const phase = (t * SWEEP_SPEED) % projSpan;
    const bandSigma = 0.05;

    // Interference drift + pulse rings.
    const driftA = t * WAVE_A_SPEED;
    const driftB = t * WAVE_B_SPEED;
    const rings = [0, 1, 2].map((k) => {
      const o = this.ringOrigin(k, cssW, cssH);
      // Staggered phase; radius grows forever, modulated so crests repeat.
      const age = (t / RING_PERIOD + k / 3) % 1;
      return { ...o, r: age * RING_SPEED * RING_PERIOD, w: 34 };
    });

    const cursorR = Math.max(120, cssW * 0.11);
    const px = this.pointer.x;
    const py = this.pointer.y;

    for (let r = 0; r < rows; r++) {
      const cy = r * ch + ch / 2;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        let d = densities[i]!;
        const cx = c * cw + cw / 2;

        // 1. Interference breathing: ambient cells pulse with the drifting
        //    waves — the field shimmers continuously, no allocation.
        const breath = Math.sin(cx * 0.021 + cy * 0.017 - driftA * 2.2) + Math.sin(cx * 0.009 - cy * 0.013 + driftB * 2.2);
        d *= 0.5 + 0.5 * (0.5 + 0.5 * breath);

        // 2. Pulse rings: lift density as a crest passes through the cell.
        for (const ring of rings) {
          const dist = Math.hypot(cx - ring.x, cy - ring.y);
          const crest = Math.exp(-((dist - ring.r) * (dist - ring.r)) / (2 * ring.w * ring.w));
          d += crest * 0.42;
        }

        // 3. Cursor etch: raise density near the pointer.
        const dist = Math.hypot(cx - px, cy - py);
        const prox = dist < cursorR ? 1 - dist / cursorR : 0;
        if (prox > 0) d = Math.min(1, d + prox * 0.38);

        if (d < 0.05) continue;
        d = Math.min(1, d);

        const char = RAMP[Math.min(RAMP.length - 1, Math.floor(d * RAMP.length))]!;
        if (char === " ") continue;

        // Color: muted → ink by density, pulled toward the ramp by the
        // sweep band and the cursor.
        let color = mixRGB(INK_MUTED, INK, Math.min(1, d * 1.25));
        let lift = 0;
        const proj = (c + r * 0.9 - phase) / projSpan;
        const frac = proj - Math.floor(proj);
        const centered = frac - 0.5;
        const band = Math.exp(-(centered * centered) / (2 * bandSigma * bandSigma));
        lift = Math.max(lift, band * 0.92);
        lift = Math.max(lift, prox * 0.85);
        if (lift > 0.02) {
          const rampColor = sampleRamp(this.rampStops, clamp01(0.35 + (cx / cssW) * 0.65));
          color = mixRGB(color, rampColor, lift);
        }

        ctx.fillStyle = css(color);
        ctx.fillText(char, cx, cy);
      }
    }
  }
}

/* ------------------------------------------------------------------------
 * AsciiCore — the compact radial variant that powers the §01 orbit hub.
 * Same contract as the hero field: deterministic in t (no Math.random, no
 * timestamps), one static frame under reduced motion, paused off-screen and
 * on hidden tabs. The motion is a two-arm spiral breathing outward from the
 * center — it reads as an energy core feeding the orbiting harnesses.
 * --------------------------------------------------------------------- */

const CORE_CELL_W = 6;
const CORE_CELL_H = 7;
const CORE_ARMS = 2;

export interface AsciiCoreOptions {
  /**
   * Cell ink, `#rrggbb`. Defaults render dark ink on light paper (the
   * landing); dark surfaces pass a flipped pair (paper ink on navy).
   */
  ink?: string;
  muted?: string;
}

export class AsciiCore {
  /** Resolves `null` when the 2d context is unavailable — never throws. */
  static create(canvas: HTMLCanvasElement, options: AsciiCoreOptions = {}): AsciiCore | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return new AsciiCore(canvas, ctx, options);
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rampStops: RGB[];
  private readonly ink: RGB;
  private readonly muted: RGB;

  private raf = 0;
  private running = false;
  private inView = false;
  private pageHidden = false;
  private reduced = false;
  private size = 0;

  private resizeObs: ResizeObserver | null = null;
  private viewObs: IntersectionObserver | null = null;
  private cleanups: Array<() => void> = [];

  private constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, options: AsciiCoreOptions) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.rampStops = DEFAULT_RAMP.map(hexRGB);
    this.ink = options.ink ? hexRGB(options.ink) : INK;
    this.muted = options.muted ? hexRGB(options.muted) : INK_MUTED;
  }

  start(): void {
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = reducedMq.matches;
    const onReduced = (e: MediaQueryListEvent): void => {
      this.reduced = e.matches;
      this.restart();
    };
    reducedMq.addEventListener("change", onReduced);
    this.cleanups.push(() => reducedMq.removeEventListener("change", onReduced));

    const onHidden = (): void => {
      this.pageHidden = document.hidden;
      this.restart();
    };
    document.addEventListener("visibilitychange", onHidden);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onHidden));

    this.resizeObs = new ResizeObserver(() => this.rebuild());
    this.resizeObs.observe(this.canvas.parentElement ?? this.canvas);
    this.cleanups.push(() => this.resizeObs?.disconnect());

    this.viewObs = new IntersectionObserver(
      (entries) => {
        this.inView = entries.some((e) => e.isIntersecting);
        this.restart();
      },
      { threshold: 0 },
    );
    this.viewObs.observe(this.canvas);
    this.cleanups.push(() => this.viewObs?.disconnect());

    this.rebuild();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  private rebuild(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const cssSize = Math.floor(Math.min(host.clientWidth, host.clientHeight));
    if (cssSize <= 0) return; // hidden (e.g. mobile layout) — nothing to draw
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = cssSize;
    this.canvas.width = Math.floor(cssSize * dpr);
    this.canvas.height = Math.floor(cssSize * dpr);
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.restart();
  }

  private restart(): void {
    const shouldRun = this.size > 0 && !this.pageHidden && (this.reduced || this.inView);
    if (shouldRun && !this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
    if (this.reduced) this.render(0.35); // one static frame
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    this.render(nowMs / 1000);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Draw one frame at time `t` seconds (deterministic in t). */
  private render(t: number): void {
    const { ctx, size } = this;
    if (size <= 0) return;
    const cw = CORE_CELL_W;
    const ch = CORE_CELL_H;
    const cols = Math.floor(size / cw);
    const rows = Math.floor(size / ch);
    const half = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.font = `500 ${ch - 2}px "JetBrains Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let r = 0; r < rows; r++) {
      const cy = r * ch + ch / 2;
      for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2;
        const dx = cx - half;
        const dy = cy - half;
        const rad = Math.min(1, Math.hypot(dx, dy) / half); // 0 center → 1 rim
        const ang = Math.atan2(dy, dx);

        // Density: densest at the core, gated by a slowly rotating
        // two-arm spiral and a radial breath pulsing outward.
        const spiral = 0.5 + 0.5 * Math.sin(CORE_ARMS * ang + rad * 9 - t * 1.1);
        const breath = 0.6 + 0.4 * Math.sin(t * 0.9 - rad * 5);
        let d = (1 - rad) * (0.45 + 0.55 * spiral) * breath;
        d += hash01(c + 7, r + 13) * 0.12; // deterministic sparkle
        if (d < 0.06) continue;
        d = Math.min(1, d);

        const char = RAMP[Math.min(RAMP.length - 1, Math.floor(d * RAMP.length))]!;
        if (char === " ") continue;

        // Color: muted ink at the rim, pulled into the ramp toward the hot
        // center — the hub visibly "feeds" the ring.
        const rampColor = sampleRamp(this.rampStops, clamp01(0.3 + (1 - rad) * 0.7));
        const color = mixRGB(this.muted, rampColor, Math.min(1, d * 1.35));
        ctx.fillStyle = css(color);
        ctx.fillText(char, cx, cy);
      }
    }
  }
}
