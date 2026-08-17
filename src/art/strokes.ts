/** A paint dab. `x`/`y`/`radius` are normalized to the source image (0–1). */
export type Stroke = {
  x: number;
  y: number;
  color: string;
  radius: number;
};

export type StrokeSet = {
  strokes: Stroke[];
  /** Source image width / height, for cover-fitting on the canvas. */
  aspect: number;
};

const SAMPLE_LONG_EDGE = 280;

type Layer = {
  step: number;
  radiusScale: number;
  jitter: number;
  /** Keep only cells whose color differs from a coarser pass. */
  residual?: boolean;
  /** Keep only high-contrast (edge / detail) cells. */
  edges?: boolean;
};

const LAYERS: Layer[] = [
  { step: 28, radiusScale: 0.72, jitter: 0.22 },
  { step: 14, radiusScale: 0.7, jitter: 0.28 },
  { step: 7, radiusScale: 0.68, jitter: 0.32, residual: true },
  { step: 4, radiusScale: 0.62, jitter: 0.35, edges: true },
];

const strokeCache = new Map<string, Promise<StrokeSet>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load artwork image: ${src}`));
    img.src = src;
  });
}

/**
 * Sample a bundled painting into ordered dabs: large color blocks first, detail last.
 * Results are cached per `imagePath`.
 */
export function extractStrokes(imagePath: string): Promise<StrokeSet> {
  const cached = strokeCache.get(imagePath);
  if (cached) return cached;
  const pending = buildStrokes(imagePath).catch((err) => {
    strokeCache.delete(imagePath);
    throw err;
  });
  strokeCache.set(imagePath, pending);
  return pending;
}

async function buildStrokes(imagePath: string): Promise<StrokeSet> {
  const img = await loadImage(imagePath);
  const scale =
    img.width >= img.height
      ? SAMPLE_LONG_EDGE / img.width
      : SAMPLE_LONG_EDGE / img.height;
  const sampleW = Math.max(8, Math.round(img.width * scale));
  const sampleH = Math.max(8, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not create 2D context for stroke extraction");
  }
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;

  const rand = mulberry32(hashString(imagePath));
  const minDim = Math.min(sampleW, sampleH);
  const coarseColor = new Float32Array(sampleW * sampleH * 3);
  const strokes: Stroke[] = [];

  for (const layer of LAYERS) {
    const layerStrokes: Stroke[] = [];
    for (let cy = layer.step / 2; cy < sampleH; cy += layer.step) {
      for (let cx = layer.step / 2; cx < sampleW; cx += layer.step) {
        const cellX0 = Math.max(0, Math.floor(cx - layer.step / 2));
        const cellY0 = Math.max(0, Math.floor(cy - layer.step / 2));
        const cellX1 = Math.min(sampleW, Math.ceil(cx + layer.step / 2));
        const cellY1 = Math.min(sampleH, Math.ceil(cy + layer.step / 2));
        const [r, g, b] = averageCell(pixels, sampleW, cellX0, cellY0, cellX1, cellY1);

        if (layer.residual) {
          const [cr, cg, cb] = sampleCoarse(coarseColor, sampleW, sampleH, cx, cy);
          if (colorDist(r, g, b, cr, cg, cb) < 28) continue;
        }

        if (layer.edges && localContrast(pixels, sampleW, sampleH, cx, cy) < 22) {
          continue;
        }

        const jx = (rand() - 0.5) * layer.jitter * layer.step;
        const jy = (rand() - 0.5) * layer.jitter * layer.step;
        const x = clamp01((cx + jx) / sampleW);
        const y = clamp01((cy + jy) / sampleH);
        const radius = ((layer.step * layer.radiusScale) / minDim) * (0.9 + rand() * 0.2);

        layerStrokes.push({
          x,
          y,
          color: toHex(r, g, b),
          radius,
        });

        if (!layer.edges) {
          stampCoarse(coarseColor, sampleW, sampleH, cx, cy, layer.step, r, g, b);
        }
      }
    }
    shuffleInPlace(layerStrokes, rand);
    strokes.push(...layerStrokes);
  }

  return { strokes, aspect: img.width / img.height };
}

function averageCell(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (n === 0) return [0, 0, 0];
  return [r / n, g / n, b / n];
}

function stampCoarse(
  field: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  step: number,
  r: number,
  g: number,
  b: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - step / 2));
  const y0 = Math.max(0, Math.floor(cy - step / 2));
  const x1 = Math.min(width, Math.ceil(cx + step / 2));
  const y1 = Math.min(height, Math.ceil(cy + step / 2));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 3;
      field[i] = r;
      field[i + 1] = g;
      field[i + 2] = b;
    }
  }
}

function sampleCoarse(
  field: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
): [number, number, number] {
  const x = clamp(Math.round(cx), 0, width - 1);
  const y = clamp(Math.round(cy), 0, height - 1);
  const i = (y * width + x) * 3;
  return [field[i], field[i + 1], field[i + 2]];
}

function localContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
): number {
  const x = clamp(Math.round(cx), 0, width - 1);
  const y = clamp(Math.round(cy), 0, height - 1);
  const center = luma(data, width, x, y);
  let maxDiff = 0;
  for (let dy = -2; dy <= 2; dy += 2) {
    for (let dx = -2; dx <= 2; dx += 2) {
      if (dx === 0 && dy === 0) continue;
      const nx = clamp(x + dx, 0, width - 1);
      const ny = clamp(y + dy, 0, height - 1);
      maxDiff = Math.max(maxDiff, Math.abs(center - luma(data, width, nx, ny)));
    }
  }
  return maxDiff;
}

function luma(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
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

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}
