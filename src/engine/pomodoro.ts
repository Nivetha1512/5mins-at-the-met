import { DISSOLVE_MS } from "../shared";
import type {
  EngineCallbacks,
  PomodoroPhase,
  TickPayload,
  TimerConfig,
} from "../shared";

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  studySeconds: 25 * 60,
  breakSeconds: 5 * 60,
};

export const CONFIG_STORAGE_KEY = "moma-pomodoro:timer-config";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const DEFAULT_TICK_INTERVAL_MS = 1_000;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type EngineClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type PomodoroEngineOptions = {
  /**
   * Included on phase changes once known. A function is invoked when entering
   * `break` so the host can pick the next painting; the same id is reused for
   * `dissolving`.
   */
  nextArtworkId?: string | (() => string | undefined);
  clock?: EngineClock;
  /** Pass `null` to disable persistence (unit tests). */
  storage?: StorageLike | null;
  /** How often to emit `onTick` during a timed phase. Default 1000ms. */
  tickIntervalMs?: number;
};

function createDefaultClock(): EngineClock {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}

function resolveStorage(storage: StorageLike | null | undefined): StorageLike | null {
  if (storage === null) {
    return null;
  }
  if (storage) {
    return storage;
  }
  try {
    const g = globalThis as typeof globalThis & { window?: { localStorage?: StorageLike } };
    // Avoid Node's experimental localStorage getter; only use a real browser window.
    const local = g.window?.localStorage;
    if (local && typeof local.getItem === "function" && typeof local.setItem === "function") {
      return local;
    }
  } catch {
    // Node, or storage blocked (private mode / tests).
  }
  return null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function pickSeconds(value: number | undefined, fallback: number): number {
  return isPositiveFinite(value) ? value : fallback;
}

/**
 * Reads a duration in seconds, falling back to the pre-seconds `*Minutes` key so
 * configs persisted by older builds keep working.
 */
function readSeconds(
  record: Record<string, unknown>,
  secondsKey: string,
  minutesKey: string,
): number | undefined {
  const seconds = record[secondsKey];
  if (isPositiveFinite(seconds)) {
    return seconds;
  }
  const minutes = record[minutesKey];
  if (isPositiveFinite(minutes)) {
    return minutes * SECONDS_PER_MINUTE;
  }
  return undefined;
}

function loadStoredConfig(storage: StorageLike | null): Partial<TimerConfig> {
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const out: Partial<TimerConfig> = {};
    const studySeconds = readSeconds(record, "studySeconds", "studyMinutes");
    if (studySeconds !== undefined) {
      out.studySeconds = studySeconds;
    }
    const breakSeconds = readSeconds(record, "breakSeconds", "breakMinutes");
    if (breakSeconds !== undefined) {
      out.breakSeconds = breakSeconds;
    }
    return out;
  } catch {
    return {};
  }
}

function saveConfig(storage: StorageLike | null, config: TimerConfig): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // quota exceeded / private mode
  }
}

function isTimedPhase(phase: PomodoroPhase): boolean {
  return phase === "studying" || phase === "break" || phase === "dissolving";
}

function nextPhase(from: PomodoroPhase): PomodoroPhase {
  switch (from) {
    case "idle":
      return "studying";
    case "studying":
      return "break";
    case "break":
      return "breakComplete";
    case "breakComplete":
      return "dissolving";
    case "dissolving":
      return "studying";
  }
}

function secondsToMs(seconds: number): number {
  return Math.round(seconds * MS_PER_SECOND);
}

/**
 * Pure pomodoro state machine. No DOM, window, Tauri, canvas, or React.
 */
export class PomodoroEngine {
  private config: TimerConfig;
  private readonly callbacks: EngineCallbacks;
  private readonly clock: EngineClock;
  private readonly storage: StorageLike | null;
  private readonly tickIntervalMs: number;
  private nextArtworkId: string | (() => string | undefined) | undefined;

  private phase: PomodoroPhase = "idle";
  private paused = false;
  private totalMs = 0;
  private frozenRemainingMs = 0;
  private deadlineAt = 0;
  private sessionArtworkId: string | undefined;
  private phaseTimer: unknown = null;
  private tickTimer: unknown = null;

  constructor(
    config: Partial<TimerConfig>,
    callbacks: EngineCallbacks,
    options: PomodoroEngineOptions = {},
  ) {
    this.callbacks = callbacks;
    this.clock = options.clock ?? createDefaultClock();
    this.storage = resolveStorage(options.storage);
    this.tickIntervalMs = Math.max(1, options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS);
    this.nextArtworkId = options.nextArtworkId;

    const stored = loadStoredConfig(this.storage);
    this.config = {
      studySeconds: pickSeconds(
        config.studySeconds,
        pickSeconds(stored.studySeconds, DEFAULT_TIMER_CONFIG.studySeconds),
      ),
      breakSeconds: pickSeconds(
        config.breakSeconds,
        pickSeconds(stored.breakSeconds, DEFAULT_TIMER_CONFIG.breakSeconds),
      ),
    };
    saveConfig(this.storage, this.config);
  }

  start(): void {
    if (this.phase === "idle") {
      this.enter("studying");
      return;
    }
    if (this.phase === "breakComplete") {
      // Skip the dissolve overlay — go straight to the compact study chip.
      this.enter("studying");
    }
  }

  pause(): void {
    if (this.paused || !isTimedPhase(this.phase)) {
      return;
    }
    this.frozenRemainingMs = this.remainingNow();
    this.paused = true;
    this.clearTimers();
    this.emitTick();
  }

  resume(): void {
    if (!this.paused || !isTimedPhase(this.phase)) {
      return;
    }
    this.paused = false;
    this.deadlineAt = this.clock.now() + this.frozenRemainingMs;
    this.schedulePhaseEnd();
    this.scheduleTicks();
    this.emitTick();
  }

  skip(): void {
    this.enter(nextPhase(this.phase));
  }

  /**
   * Abort a break (or its aftermath) and resume studying.
   * No-op in idle or while already studying. Does not follow the skip() chain.
   */
  resumeWork(): void {
    if (this.phase === "idle" || this.phase === "studying") {
      return;
    }
    this.enter("studying");
  }

  /** Stop the session and return to idle. No-op if already idle. */
  stop(): void {
    if (this.phase === "idle") {
      return;
    }
    this.enter("idle");
  }

  getPhase(): PomodoroPhase {
    return this.phase;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getConfig(): TimerConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<TimerConfig>): void {
    this.config = {
      studySeconds: pickSeconds(config.studySeconds, this.config.studySeconds),
      breakSeconds: pickSeconds(config.breakSeconds, this.config.breakSeconds),
    };
    saveConfig(this.storage, this.config);
  }

  setNextArtworkId(nextArtworkId: string | (() => string | undefined) | undefined): void {
    this.nextArtworkId = nextArtworkId;
  }

  snapshot(): TickPayload {
    const remainingMs = this.remainingNow();
    return {
      phase: this.phase,
      remainingMs,
      elapsedMs: Math.max(0, this.totalMs - remainingMs),
      totalMs: this.totalMs,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  private remainingNow(): number {
    if (!isTimedPhase(this.phase)) {
      return 0;
    }
    if (this.paused) {
      return this.frozenRemainingMs;
    }
    return Math.max(0, this.deadlineAt - this.clock.now());
  }

  private durationFor(phase: PomodoroPhase): number {
    switch (phase) {
      case "studying":
        return secondsToMs(this.config.studySeconds);
      case "break":
        return secondsToMs(this.config.breakSeconds);
      case "dissolving":
        return DISSOLVE_MS;
      default:
        return 0;
    }
  }

  private readNextArtworkId(): string | undefined {
    const source = this.nextArtworkId;
    if (typeof source === "function") {
      return source();
    }
    return source;
  }

  private artworkIdFor(to: PomodoroPhase): string | undefined {
    if (to === "break") {
      this.sessionArtworkId = this.readNextArtworkId();
    }
    return this.sessionArtworkId;
  }

  private enter(to: PomodoroPhase): void {
    const from = this.phase;
    this.clearTimers();
    this.paused = false;
    this.phase = to;
    this.totalMs = this.durationFor(to);
    this.frozenRemainingMs = this.totalMs;
    this.deadlineAt = this.clock.now() + this.totalMs;

    this.callbacks.onPhaseChange({
      from,
      to,
      artworkId: this.artworkIdFor(to),
    });
    this.emitTick();

    if (isTimedPhase(to)) {
      this.schedulePhaseEnd();
      this.scheduleTicks();
    }
  }

  private completeCurrentPhase(): void {
    if (!isTimedPhase(this.phase)) {
      return;
    }
    this.enter(nextPhase(this.phase));
  }

  private schedulePhaseEnd(): void {
    const remainingMs = this.remainingNow();
    if (remainingMs <= 0) {
      this.completeCurrentPhase();
      return;
    }
    this.phaseTimer = this.clock.setTimeout(() => {
      this.phaseTimer = null;
      this.completeCurrentPhase();
    }, remainingMs);
  }

  private scheduleTicks(): void {
    if (this.paused || !isTimedPhase(this.phase)) {
      return;
    }
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = null;
      if (this.remainingNow() <= 0) {
        this.completeCurrentPhase();
        return;
      }
      this.emitTick();
      this.scheduleTicks();
    }, this.tickIntervalMs);
  }

  private emitTick(): void {
    this.callbacks.onTick(this.snapshot());
  }

  private clearTimers(): void {
    if (this.phaseTimer != null) {
      this.clock.clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    if (this.tickTimer != null) {
      this.clock.clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
