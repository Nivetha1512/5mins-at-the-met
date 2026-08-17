import { DISSOLVE_MS, type PainterCommand } from "../shared/types";
import { getArtwork } from "./catalog";
import { extractStrokes, type Stroke } from "./strokes";

type DestRect = { x: number; y: number; w: number; h: number };

type Scatter = { dx: number; dy: number; spin: number };

type ActiveStroke = { index: number; t: number };

/** Mask nibs run wider than the visible paint so neighbouring strokes overlap. */
const MASK_NIB_SCALE = 1.7;

/** Progress at which the artwork starts bleeding through the gaps strokes missed. */
const GAP_FILL_START = 0.92;

/** Time to draw one stroke path from 0→1. */
const STROKE_DRAW_MS = 320;

/**
 * Canvas 2D painter. Construct expands a radial frontier from the center;
 * each stroke animates along its path while the mask reveals the real artwork.
 */
export class ArtPainter {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private runId = 0;
  private raf = 0;
  private artworkId: string | null = null;
  private strokes: Stroke[] = [];
  private strokeDistances: number[] = [];
  private maxStrokeDist = 1;
  private activeStrokes: ActiveStroke[] = [];
  private finalizedStrokeIndices = new Set<number>();
  private aspect = 1;
  private image: HTMLImageElement | null = null;
  private scatter: Scatter[] = [];
  private cssWidth = 0;
  private cssHeight = 0;
  private wantsCompleted = false;
  /** Accumulated stroke coverage; alpha only. */
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  /** Scratch layer: source image clipped to the mask. */
  private revealCanvas: HTMLCanvasElement | null = null;
  private revealCtx: CanvasRenderingContext2D | null = null;
  private layerPixelW = 0;
  private layerPixelH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create 2D canvas context");
    }
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /**
   * Paint the artwork from the center outward, then reveal the source image.
   * `progress = elapsed / durationMs`.
   */
  async construct(artworkId: string, durationMs: number): Promise<void> {
    const artwork = getArtwork(artworkId);
    if (!artwork) {
      throw new Error(`Unknown artwork: ${artworkId}`);
    }
    const runId = ++this.runId;
    this.wantsCompleted = false;
    const set = await extractStrokes(artwork.imagePath);
    this.artworkId = artworkId;
    this.strokes = set.strokes;
    this.aspect = set.aspect;
    this.image = set.image;
    this.scatter = [];
    this.computeStrokeDistances();
    this.resetConstructState();
    this.resetLayers();
    if (runId !== this.runId) {
      if (this.wantsCompleted) this.drawCompleted();
      return;
    }
    await this.animate(runId, durationMs, (progress, dtMs) => {
      this.drawConstruct(progress, dtMs);
    });
  }

  /**
   * Fade the completed painting (image over residual dabs). Defaults to `DISSOLVE_MS` (30s).
   */
  async dissolve(durationMs: number = DISSOLVE_MS): Promise<void> {
    const runId = ++this.runId;
    this.wantsCompleted = false;
    this.scatter = this.makeScatter();
    await this.animate(runId, durationMs, (progress) => {
      this.drawDissolve(progress);
    });
  }

  /** Stop in-flight animation and show the completed source image (skip during break). */
  hold(): void {
    this.runId += 1;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.wantsCompleted = true;
    this.drawCompleted();
  }

  /** Empty the canvas and cancel any in-flight animation. */
  clear(): void {
    this.runId += 1;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.strokes = [];
    this.strokeDistances = [];
    this.scatter = [];
    this.artworkId = null;
    this.image = null;
    this.wantsCompleted = false;
    this.resetConstructState();
    this.resetLayers();
    this.fitCanvas();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  async handleCommand(command: PainterCommand): Promise<void> {
    switch (command.type) {
      case "construct":
        await this.construct(command.artworkId, command.durationMs);
        return;
      case "dissolve":
        await this.dissolve(command.durationMs);
        return;
      case "clear":
        this.clear();
        return;
    }
  }

  /** Stop animations (unmount). */
  destroy(): void {
    this.clear();
  }

  get currentArtworkId(): string | null {
    return this.artworkId;
  }

  private animate(
    runId: number,
    durationMs: number,
    draw: (progress: number, dtMs: number) => void,
  ): Promise<void> {
    const duration = Math.max(1, durationMs);
    return new Promise((resolve) => {
      const start = performance.now();
      let previous = start;
      const tick = (now: number) => {
        if (runId !== this.runId) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - start) / duration);
        const dtMs = Math.max(0, Math.min(250, now - previous));
        previous = now;
        draw(progress, dtMs);
        if (progress >= 1) {
          resolve();
          return;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  private fitCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    const pixelW = Math.round(this.cssWidth * dpr);
    const pixelH = Math.round(this.cssHeight * dpr);
    if (this.canvas.width !== pixelW) this.canvas.width = pixelW;
    if (this.canvas.height !== pixelH) this.canvas.height = pixelH;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private destRect(): DestRect {
    const viewW = this.cssWidth;
    const viewH = this.cssHeight;
    const viewAspect = viewW / viewH;
    if (viewAspect > this.aspect) {
      const w = viewW;
      const h = viewW / this.aspect;
      return { x: 0, y: (viewH - h) / 2, w, h };
    }
    const h = viewH;
    const w = viewH * this.aspect;
    return { x: (viewW - w) / 2, y: 0, w, h };
  }

  private fillBackdrop(): void {
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = "#0b0b0b";
    this.ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }

  private drawConstruct(progress: number, dtMs: number): void {
    this.fitCanvas();
    if (progress >= 1) {
      this.drawCompleted();
      return;
    }
    const dest = this.destRect();
    const resized = this.ensureLayers();
    if (resized) this.resetConstructState();

    const frontier = easeOutCubic(progress) * this.maxStrokeDist;
    this.enqueueEligibleStrokes(frontier);

    const maskCtx = this.maskCtx;
    if (maskCtx) {
      for (const active of this.activeStrokes) {
        active.t = Math.min(1, active.t + dtMs / STROKE_DRAW_MS);
        stampPartialMask(maskCtx, this.strokes[active.index], dest, active.t);
      }
    }

    this.activeStrokes = this.activeStrokes.filter((active) => {
      if (active.t >= 1) {
        this.finalizedStrokeIndices.add(active.index);
        return false;
      }
      return true;
    });

    this.compose(dest, progress);
  }

  private enqueueEligibleStrokes(frontier: number): void {
    const activeIndices = new Set(this.activeStrokes.map((s) => s.index));
    for (let i = 0; i < this.strokes.length; i++) {
      if (this.finalizedStrokeIndices.has(i) || activeIndices.has(i)) continue;
      if (this.strokeDistances[i] <= frontier) {
        this.activeStrokes.push({ index: i, t: 0 });
        activeIndices.add(i);
      }
    }
  }

  /** Backdrop, then artwork clipped to the growing mask, with late gap-fill. */
  private compose(dest: DestRect, progress: number): void {
    this.fillBackdrop();
    this.drawSourceImage(gapFillAlpha(progress));
    const reveal = this.revealCtx;
    if (this.image && reveal && this.maskCanvas && this.revealCanvas) {
      reveal.save();
      reveal.globalCompositeOperation = "source-over";
      reveal.clearRect(0, 0, this.cssWidth, this.cssHeight);
      reveal.imageSmoothingEnabled = true;
      reveal.imageSmoothingQuality = "high";
      reveal.drawImage(this.image, dest.x, dest.y, dest.w, dest.h);
      reveal.globalCompositeOperation = "destination-in";
      reveal.drawImage(this.maskCanvas, 0, 0, this.cssWidth, this.cssHeight);
      reveal.restore();
      this.ctx.drawImage(this.revealCanvas, 0, 0, this.cssWidth, this.cssHeight);
    }
  }

  /** (Re)build the offscreen layers when the canvas size changes. Returns true if rebuilt. */
  private ensureLayers(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.max(1, Math.round(this.cssWidth * dpr));
    const pixelH = Math.max(1, Math.round(this.cssHeight * dpr));
    if (this.maskCanvas && this.layerPixelW === pixelW && this.layerPixelH === pixelH) {
      return false;
    }
    this.layerPixelW = pixelW;
    this.layerPixelH = pixelH;
    const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelW;
      canvas.height = pixelH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create 2D layer context");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [canvas, ctx];
    };
    [this.maskCanvas, this.maskCtx] = make();
    [this.revealCanvas, this.revealCtx] = make();
    return true;
  }

  private resetLayers(): void {
    this.maskCanvas = null;
    this.maskCtx = null;
    this.revealCanvas = null;
    this.revealCtx = null;
    this.layerPixelW = 0;
    this.layerPixelH = 0;
  }

  private resetConstructState(): void {
    this.activeStrokes = [];
    this.finalizedStrokeIndices = new Set();
  }

  private computeStrokeDistances(): void {
    this.strokeDistances = this.strokes.map((stroke) => {
      const dx = stroke.x - 0.5;
      const dy = stroke.y - 0.5;
      return Math.hypot(dx, dy);
    });
    this.maxStrokeDist = Math.max(...this.strokeDistances, 0.001);
  }

  private drawDissolve(progress: number): void {
    this.fitCanvas();
    this.fillBackdrop();
    const dest = this.destRect();
    const fade = 1 - progress;
    const scatterT = progress * progress;
    const minSide = Math.min(dest.w, dest.h);

    if (progress > 0) {
      for (let i = 0; i < this.strokes.length; i++) {
        const s = this.scatter[i];
        if (!s) continue;
        this.paintStrokeOn(
          this.ctx,
          this.strokes[i],
          dest,
          fade * 0.85,
          s.dx * scatterT * minSide,
          s.dy * scatterT * minSide,
          1 - 0.45 * progress,
          s.spin * progress,
        );
      }
    }

    this.drawSourceImage(fade);
  }

  private drawCompleted(): void {
    if (!this.image) return;
    this.fitCanvas();
    this.fillBackdrop();
    this.drawSourceImage(1);
  }

  private drawSourceImage(alpha: number): void {
    if (!this.image || alpha <= 0) return;
    const dest = this.destRect();
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.drawImage(this.image, dest.x, dest.y, dest.w, dest.h);
    this.ctx.restore();
  }

  /**
   * One calligraphic brush-pen mark: a short curved path, thin→thick→thin,
   * plus a second overlapping edge so it reads as ink rather than a stamped oval.
   */
  private paintStrokeOn(
    ctx: CanvasRenderingContext2D,
    stroke: Stroke,
    dest: DestRect,
    alpha: number,
    ox: number,
    oy: number,
    radiusScale = 1,
    spin = 0,
  ): void {
    const x = dest.x + stroke.x * dest.w + ox;
    const y = dest.y + stroke.y * dest.h + oy;
    const { width, length } = strokeGeometry(stroke, dest, radiusScale);
    const bodyAlpha = Math.max(0, alpha * stroke.alpha);
    const path = brushPath(length, stroke.curve, stroke.wobble);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(stroke.angle + spin);

    ctx.globalAlpha = bodyAlpha;
    ctx.fillStyle = stroke.color;
    fillBrushNib(ctx, path, width, stroke.pressure);

    ctx.globalAlpha = bodyAlpha * 0.42;
    ctx.fillStyle = shiftHex(stroke.color, stroke.edge * 34);
    ctx.save();
    ctx.translate(length * 0.03, stroke.edge * width * 0.18);
    fillBrushNib(ctx, path, width * 0.46, stroke.pressure);
    ctx.restore();

    ctx.globalAlpha = bodyAlpha * 0.55;
    ctx.strokeStyle = shiftHex(stroke.color, stroke.edge * -16);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.55, width * 0.16);
    strokeBrushSpine(ctx, path);

    ctx.restore();
  }

  private makeScatter(): Scatter[] {
    const seed = hashString(this.artworkId ?? "dissolve");
    const rand = mulberry32(seed ^ 0x9e3779b9);
    return this.strokes.map(() => {
      const angle = rand() * Math.PI * 2;
      const speed = 0.14 + rand() * 0.55;
      return {
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        spin: (rand() - 0.5) * 1.4,
      };
    });
  }
}

type PathSample = { x: number; y: number; nx: number; ny: number };

/** Cubic centerline: two-segment wobble along +X, sampled with unit normals. */
function brushPath(length: number, curve: number, wobble: number): PathSample[] {
  const steps = length > 14 ? 10 : 7;
  const half = length / 2;
  const x0 = -half;
  const y0 = 0;
  const x1 = -half * 0.32;
  const y1 = curve * length;
  const x2 = half * 0.32;
  const y2 = wobble * length;
  const x3 = half;
  const y3 = 0;
  const samples: PathSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, y, dx, dy } = cubicPoint(t, x0, y0, x1, y1, x2, y2, x3, y3);
    const mag = Math.hypot(dx, dy) || 1;
    samples.push({ x, y, nx: -dy / mag, ny: dx / mag });
  }
  return samples;
}

function cubicPoint(
  t: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): { x: number; y: number; dx: number; dy: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const x = uu * u * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + tt * t * x3;
  const y = uu * u * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + tt * t * y3;
  const dx = 3 * uu * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * tt * (x3 - x2);
  const dy = 3 * uu * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * tt * (y3 - y2);
  return { x, y, dx, dy };
}

/** Half-width envelope: pointed tips, pressure peak off-center. */
function nibHalfWidth(t: number, width: number, pressure: number): number {
  const peak = Math.max(0.28, Math.min(0.72, pressure));
  const span = t < peak ? peak : 1 - peak;
  const u = span <= 1e-6 ? 0 : Math.min(1, Math.abs(t - peak) / span);
  const envelope = Math.cos((u * Math.PI) / 2);
  return (width / 2) * (0.07 + 0.93 * envelope * envelope);
}

function fillBrushNib(
  ctx: CanvasRenderingContext2D,
  path: PathSample[],
  width: number,
  pressure: number,
): void {
  const last = path.length - 1;
  ctx.beginPath();
  for (let i = 0; i <= last; i++) {
    const hw = nibHalfWidth(i / last, width, pressure);
    const p = path[i];
    const x = p.x + p.nx * hw;
    const y = p.y + p.ny * hw;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = last; i >= 0; i--) {
    const hw = nibHalfWidth(i / last, width, pressure);
    const p = path[i];
    ctx.lineTo(p.x - p.nx * hw, p.y - p.ny * hw);
  }
  ctx.closePath();
  ctx.fill();
}

function strokeBrushSpine(ctx: CanvasRenderingContext2D, path: PathSample[]): void {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
}

/** Opaque nib along the first `t` fraction of the path, widening for mask overlap. */
function stampPartialMask(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  dest: DestRect,
  t: number,
): void {
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT <= 0) return;

  const geom = strokeGeometry(stroke, dest);
  ctx.save();
  ctx.translate(dest.x + stroke.x * dest.w, dest.y + stroke.y * dest.h);
  ctx.rotate(stroke.angle);
  const path = brushPath(geom.length * 1.08, stroke.curve, stroke.wobble);
  const last = path.length - 1;
  const endIdx = Math.max(1, Math.ceil(clampedT * last));
  const partialPath = path.slice(0, endIdx + 1);

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  fillBrushNib(ctx, partialPath, geom.width * MASK_NIB_SCALE, stroke.pressure);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = geom.width * 0.9;
  strokeBrushSpine(ctx, partialPath);
  ctx.restore();
}

function shiftHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const shift = (v: number) => Math.max(0, Math.min(255, v + amount));
  const r = shift((n >> 16) & 255);
  const g = shift((n >> 8) & 255);
  const b = shift(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function gapFillAlpha(progress: number): number {
  if (progress <= GAP_FILL_START) return 0;
  const t = (progress - GAP_FILL_START) / (1 - GAP_FILL_START);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Shared nib sizing so the mask and the visible paint stay in step. */
function strokeGeometry(
  stroke: Stroke,
  dest: DestRect,
  radiusScale = 1,
): { width: number; length: number } {
  const minSide = Math.min(dest.w, dest.h);
  const width = Math.max(0.8, stroke.width * minSide * radiusScale);
  const length = Math.max(width * 2, Math.min(width * 5, stroke.length * minSide * radiusScale));
  return { width, length };
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
