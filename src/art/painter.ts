import { DISSOLVE_MS, type PainterCommand } from "../shared/types";
import { getArtwork } from "./catalog";
import { extractStrokes, type Stroke } from "./strokes";

type DestRect = { x: number; y: number; w: number; h: number };

type Scatter = { dx: number; dy: number; spin: number };

/**
 * Canvas 2D painter: construct reveals dabs by elapsed/duration;
 * dissolve scatters and fades them (default 30s).
 */
export class ArtPainter {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private runId = 0;
  private raf = 0;
  private artworkId: string | null = null;
  private strokes: Stroke[] = [];
  private aspect = 1;
  private scatter: Scatter[] = [];
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create 2D canvas context");
    }
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /**
   * Paint the artwork from large color blocks to detail.
   * `progress = elapsed / durationMs`.
   */
  async construct(artworkId: string, durationMs: number): Promise<void> {
    const artwork = getArtwork(artworkId);
    if (!artwork) {
      throw new Error(`Unknown artwork: ${artworkId}`);
    }
    const runId = ++this.runId;
    const set = await extractStrokes(artwork.imagePath);
    if (runId !== this.runId) return;
    this.artworkId = artworkId;
    this.strokes = set.strokes;
    this.aspect = set.aspect;
    this.scatter = [];
    await this.animate(runId, durationMs, (progress) => {
      this.drawConstruct(progress);
    });
  }

  /**
   * Scatter and fade the current strokes. Defaults to `DISSOLVE_MS` (30s).
   */
  async dissolve(durationMs: number = DISSOLVE_MS): Promise<void> {
    const runId = ++this.runId;
    this.scatter = this.makeScatter();
    await this.animate(runId, durationMs, (progress) => {
      this.drawDissolve(progress);
    });
  }

  /** Stop in-flight animation and keep the last frame (skip during break). */
  hold(): void {
    this.runId += 1;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** Empty the canvas and cancel any in-flight animation. */
  clear(): void {
    this.runId += 1;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.strokes = [];
    this.scatter = [];
    this.artworkId = null;
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
    draw: (progress: number) => void,
  ): Promise<void> {
    const duration = Math.max(1, durationMs);
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (runId !== this.runId) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - start) / duration);
        draw(progress);
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

  private drawConstruct(progress: number): void {
    this.fitCanvas();
    this.fillBackdrop();
    const dest = this.destRect();
    const count = Math.floor(this.strokes.length * progress);
    for (let i = 0; i < count; i++) {
      this.paintStroke(this.strokes[i], dest, 1, 0, 0, 1);
    }
  }

  private drawDissolve(progress: number): void {
    this.fitCanvas();
    this.fillBackdrop();
    const dest = this.destRect();
    const fade = 1 - progress;
    const scatterT = progress * progress;
    const minSide = Math.min(dest.w, dest.h);
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.scatter[i];
      if (!s) continue;
      this.paintStroke(
        this.strokes[i],
        dest,
        fade,
        s.dx * scatterT * minSide,
        s.dy * scatterT * minSide,
        1 - 0.45 * progress,
        s.spin * progress,
      );
    }
  }

  private paintStroke(
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
    const radius = Math.max(0.6, stroke.radius * Math.min(dest.w, dest.h) * radiusScale);
    this.ctx.save();
    this.ctx.globalAlpha = Math.max(0, alpha);
    this.ctx.fillStyle = stroke.color;
    this.ctx.translate(x, y);
    if (spin) this.ctx.rotate(spin);
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, radius, radius * 0.86, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
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
