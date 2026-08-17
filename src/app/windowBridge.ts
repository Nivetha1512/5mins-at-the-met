import { isTauri as detectTauri } from "@tauri-apps/api/core";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalPosition,
  LogicalSize,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";

/** Idle settings vs study chip vs break overlay vs click-through dissolve. */
export type WindowMode = "idle" | "compact" | "fullscreen" | "dissolve";

export const COMPACT_WIDTH = 220;
export const COMPACT_HEIGHT = 80;

/** Settings panel — large enough for study/break fields; not the 220×80 chip. */
export const IDLE_WIDTH = 420;
export const IDLE_HEIGHT = 380;

const COMPACT_MARGIN = 16;

type TauriWindow = ReturnType<typeof getCurrentWindow>;

let queue: Promise<void> = Promise.resolve();

/**
 * True when running inside the Tauri webview (not a plain browser `vite` tab).
 */
export function isTauri(): boolean {
  return detectTauri();
}

/**
 * Switch the overlay chrome.
 *
 * - `idle` — ~420×380 settings, frameless, always-on-top, clicks on, centered
 * - `compact` — ~220×80 study chip, frameless, always-on-top, top-right
 * - `fullscreen` — cover the monitor so break UI / Start next session is clickable
 * - `dissolve` — keep covering the monitor, `ignoreCursorEvents` so clicks pass through
 *
 * No-ops in a non-Tauri browser so Agent 0 can still call this from `App.tsx`.
 */
export async function setWindowMode(mode: WindowMode): Promise<void> {
  const run = () => applyWindowMode(mode);
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function applyWindowMode(mode: WindowMode): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const win = getCurrentWindow();

  switch (mode) {
    case "idle":
      await applyIdle(win);
      return;
    case "compact":
      await applyCompact(win);
      return;
    case "fullscreen":
      await applyCover(win, false);
      return;
    case "dissolve":
      await applyCover(win, true);
      return;
  }
}

async function applyIdle(win: TauriWindow): Promise<void> {
  await win.setIgnoreCursorEvents(false);
  await win.setAlwaysOnTop(true);
  await win.setDecorations(false);
  await exitCover(win);
  await win.setSize(new LogicalSize(IDLE_WIDTH, IDLE_HEIGHT));
  try {
    await win.center();
  } catch {
    await placeTopRight(win);
  }
}

async function applyCompact(win: TauriWindow): Promise<void> {
  await win.setIgnoreCursorEvents(false);
  await win.setAlwaysOnTop(true);
  await win.setDecorations(false);
  await exitCover(win);
  await win.setSize(new LogicalSize(COMPACT_WIDTH, COMPACT_HEIGHT));
  await placeTopRight(win);
}

/**
 * Cover the monitor without a native macOS Space when possible.
 * Native `setFullscreen(true)` would steal a desktop and break click-through dissolve.
 */
async function applyCover(win: TauriWindow, ignoreCursor: boolean): Promise<void> {
  await win.setAlwaysOnTop(true);
  await win.setDecorations(false);
  // Avoid native Space-fullscreen so dissolve can click through to other apps.
  await win.setFullscreen(false);
  try {
    await win.setSimpleFullscreen(true);
  } catch {
    // Permission or platform may not support simple-fullscreen.
  }
  try {
    await coverMonitor(win);
  } catch {
    // Simple-fullscreen may already own the size; covering is best-effort.
  }

  await win.setIgnoreCursorEvents(ignoreCursor);
}

async function exitCover(win: TauriWindow): Promise<void> {
  try {
    await win.setSimpleFullscreen(false);
  } catch {
    // Older runtimes or platforms without simple-fullscreen.
  }
  await win.setFullscreen(false);
}

async function coverMonitor(win: TauriWindow): Promise<void> {
  const monitor = await resolveMonitor();
  if (!monitor) {
    return;
  }
  const { x, y, width, height } = logicalBounds(monitor);
  await win.setSize(new LogicalSize(width, height));
  await win.setPosition(new LogicalPosition(x, y));
}

async function placeTopRight(win: TauriWindow): Promise<void> {
  const monitor = await resolveMonitor();
  if (!monitor) {
    return;
  }
  const scale = monitor.scaleFactor || 1;
  const work = monitor.workArea;
  const workPos = toLogicalPoint(work.position, scale);
  const workSize = toLogicalExtent(work.size, scale);
  await win.setPosition(
    new LogicalPosition(
      workPos.x + workSize.width - COMPACT_WIDTH - COMPACT_MARGIN,
      workPos.y + COMPACT_MARGIN,
    ),
  );
}

async function resolveMonitor(): Promise<Monitor | null> {
  return (await currentMonitor()) ?? (await primaryMonitor());
}

function logicalBounds(monitor: Monitor): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const scale = monitor.scaleFactor || 1;
  const pos = toLogicalPoint(monitor.position, scale);
  const size = toLogicalExtent(monitor.size, scale);
  return { x: pos.x, y: pos.y, width: size.width, height: size.height };
}

function toLogicalExtent(
  size: { width: number; height: number; toLogical?: (scale: number) => { width: number; height: number } },
  scale: number,
): { width: number; height: number } {
  if (typeof size.toLogical === "function") {
    return size.toLogical(scale);
  }
  return { width: size.width / scale, height: size.height / scale };
}

function toLogicalPoint(
  position: { x: number; y: number; toLogical?: (scale: number) => { x: number; y: number } },
  scale: number,
): { x: number; y: number } {
  if (typeof position.toLogical === "function") {
    return position.toLogical(scale);
  }
  return { x: position.x / scale, y: position.y / scale };
}
