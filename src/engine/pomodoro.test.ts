import { describe, expect, it } from "vitest";
import type { EngineCallbacks, PhaseChangePayload, TickPayload } from "../shared";
import {
  CONFIG_STORAGE_KEY,
  DEFAULT_TIMER_CONFIG,
  PomodoroEngine,
  type EngineClock,
  type StorageLike,
} from "./pomodoro";

type Scheduled = {
  id: number;
  fireAt: number;
  callback: () => void;
};

function createFakeClock(start = 0) {
  let now = start;
  let nextId = 1;
  const timers: Scheduled[] = [];

  const clock: EngineClock = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.push({ id, fireAt: now + Math.max(0, delayMs), callback });
      return id;
    },
    clearTimeout: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
  };

  function advance(ms: number) {
    const target = now + ms;
    let steps = 0;
    while (steps++ < 100_000) {
      let next: Scheduled | undefined;
      for (const timer of timers) {
        if (timer.fireAt > target) {
          continue;
        }
        if (
          !next ||
          timer.fireAt < next.fireAt ||
          (timer.fireAt === next.fireAt && timer.id < next.id)
        ) {
          next = timer;
        }
      }
      if (!next) {
        now = target;
        return;
      }
      now = next.fireAt;
      const index = timers.indexOf(next);
      if (index >= 0) {
        timers.splice(index, 1);
      }
      next.callback();
    }
    throw new Error("FakeClock: too many timers (possible infinite loop)");
  }

  return { clock, advance, getNow: () => now };
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function createEngine(
  config: { studySeconds?: number; breakSeconds?: number },
  extras: {
    clock?: EngineClock;
    storage?: StorageLike | null;
    nextArtworkId?: string | (() => string | undefined);
    tickIntervalMs?: number;
  } = {},
) {
  const phases: PhaseChangePayload[] = [];
  const ticks: TickPayload[] = [];
  const callbacks: EngineCallbacks = {
    onTick: (payload) => {
      ticks.push(payload);
    },
    onPhaseChange: (payload) => {
      phases.push(payload);
    },
  };
  const engine = new PomodoroEngine(config, callbacks, {
    clock: extras.clock,
    storage: extras.storage ?? null,
    nextArtworkId: extras.nextArtworkId,
    tickIntervalMs: extras.tickIntervalMs ?? 60_000,
  });
  return { engine, phases, ticks };
}

describe("PomodoroEngine", () => {
  it("runs study → break → breakComplete → studying on start next session", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine(
      { studySeconds: 60, breakSeconds: 60 },
      { clock, nextArtworkId: "met-123" },
    );

    expect(engine.getPhase()).toBe("idle");
    engine.start();
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot()).toMatchObject({
      remainingMs: 60_000,
      elapsedMs: 0,
      totalMs: 60_000,
    });

    advance(60_000);
    expect(engine.getPhase()).toBe("break");
    expect(engine.snapshot().totalMs).toBe(60_000);

    advance(60_000);
    expect(engine.getPhase()).toBe("breakComplete");
    expect(engine.snapshot().remainingMs).toBe(0);

    engine.start();
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot()).toMatchObject({
      remainingMs: 60_000,
      totalMs: 60_000,
    });

    expect(phases.map((p) => `${p.from}->${p.to}`)).toEqual([
      "idle->studying",
      "studying->break",
      "break->breakComplete",
      "breakComplete->studying",
    ]);
    expect(phases[1]?.artworkId).toBe("met-123");
  });

  it("pause/resume does not skip time incorrectly", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine({ studySeconds: 60, breakSeconds: 60 }, { clock });

    engine.start();
    advance(20_000);
    expect(engine.snapshot().remainingMs).toBe(40_000);
    expect(engine.snapshot().elapsedMs).toBe(20_000);

    engine.pause();
    expect(engine.isPaused()).toBe(true);

    // Wall clock continues past the original study end (20s + 50s > 60s).
    advance(50_000);
    expect(engine.getPhase()).toBe("studying");
    expect(engine.isPaused()).toBe(true);
    expect(engine.snapshot().remainingMs).toBe(40_000);
    expect(engine.snapshot().elapsedMs).toBe(20_000);

    engine.resume();
    expect(engine.isPaused()).toBe(false);
    expect(engine.snapshot().remainingMs).toBe(40_000);

    advance(39_000);
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot().remainingMs).toBe(1_000);

    advance(1_000);
    expect(engine.getPhase()).toBe("break");
    expect(phases.map((p) => p.to)).toEqual(["studying", "break"]);
  });

  it("skip jumps to the next phase in the chain", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine({ studySeconds: 25 * 60, breakSeconds: 5 * 60 }, { clock });

    engine.start();
    advance(1_000);
    expect(engine.getPhase()).toBe("studying");

    engine.skip();
    expect(engine.getPhase()).toBe("break");

    engine.skip();
    expect(engine.getPhase()).toBe("breakComplete");

    engine.skip();
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot().totalMs).toBe(25 * 60_000);

    expect(phases.map((p) => `${p.from}->${p.to}`)).toEqual([
      "idle->studying",
      "studying->break",
      "break->breakComplete",
      "breakComplete->studying",
    ]);
  });

  it("stop returns to idle from a running study session", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine({ studySeconds: 25 * 60, breakSeconds: 5 * 60 }, { clock });

    engine.start();
    advance(5_000);
    engine.pause();
    engine.stop();

    expect(engine.getPhase()).toBe("idle");
    expect(engine.isPaused()).toBe(false);
    expect(engine.snapshot().remainingMs).toBe(0);
    expect(phases[phases.length - 1]).toMatchObject({ from: "studying", to: "idle" });

    engine.stop();
    expect(engine.getPhase()).toBe("idle");
  });

  it("resumeWork jumps from break back to studying", () => {
    const { clock } = createFakeClock();
    const { engine, phases } = createEngine({ studySeconds: 25 * 60, breakSeconds: 5 * 60 }, { clock });

    engine.start();
    engine.skip();
    expect(engine.getPhase()).toBe("break");

    engine.resumeWork();
    expect(engine.getPhase()).toBe("studying");
    expect(phases[phases.length - 1]).toMatchObject({ from: "break", to: "studying" });

    engine.resumeWork();
    expect(engine.getPhase()).toBe("studying");
  });

  it("resumeWork jumps from break to studying and skips the rest of the break", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine(
      { studySeconds: 25 * 60, breakSeconds: 5 * 60 },
      { clock, nextArtworkId: "met-123" },
    );

    engine.start();
    engine.skip();
    expect(engine.getPhase()).toBe("break");
    advance(1_000);

    engine.resumeWork();
    expect(engine.getPhase()).toBe("studying");
    expect(engine.isPaused()).toBe(false);
    expect(engine.snapshot().totalMs).toBe(25 * 60_000);
    expect(phases[phases.length - 1]).toMatchObject({ from: "break", to: "studying" });
    expect(phases.map((p) => `${p.from}->${p.to}`)).not.toContain("break->breakComplete");
  });

  it("resumeWork from breakComplete enters studying; no-op in idle", () => {
    const { clock } = createFakeClock();
    const { engine, phases } = createEngine({ studySeconds: 60, breakSeconds: 60 }, { clock });

    engine.resumeWork();
    expect(engine.getPhase()).toBe("idle");
    expect(phases).toEqual([]);

    engine.start();
    engine.skip(); // break
    engine.skip(); // breakComplete
    engine.resumeWork();
    expect(engine.getPhase()).toBe("studying");
    expect(phases[phases.length - 1]).toMatchObject({ from: "breakComplete", to: "studying" });
  });

  it("start from breakComplete enters studying", () => {
    const { clock } = createFakeClock();
    const { engine } = createEngine({ studySeconds: 60, breakSeconds: 60 }, { clock });

    engine.start();
    engine.skip(); // break
    engine.skip(); // breakComplete
    engine.start();
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot().totalMs).toBe(60_000);
  });

  it("uses custom study and break durations", () => {
    const { clock, advance } = createFakeClock();
    const { engine } = createEngine({ studySeconds: 2 * 60, breakSeconds: 3 * 60 }, { clock });

    expect(engine.getConfig()).toEqual({ studySeconds: 120, breakSeconds: 180 });

    engine.start();
    expect(engine.snapshot().totalMs).toBe(2 * 60_000);

    advance(2 * 60_000 - 1);
    expect(engine.getPhase()).toBe("studying");

    advance(1);
    expect(engine.getPhase()).toBe("break");
    expect(engine.snapshot().totalMs).toBe(3 * 60_000);

    advance(3 * 60_000 - 1);
    expect(engine.getPhase()).toBe("break");

    advance(1);
    expect(engine.getPhase()).toBe("breakComplete");
  });

  it("honors sub-minute durations exactly", () => {
    const { clock, advance } = createFakeClock();
    const { engine } = createEngine(
      { studySeconds: 30, breakSeconds: 90 },
      { clock, tickIntervalMs: 1_000 },
    );

    engine.start();
    expect(engine.snapshot().totalMs).toBe(30_000);

    advance(29_999);
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot().remainingMs).toBe(1);

    advance(1);
    expect(engine.getPhase()).toBe("break");
    expect(engine.snapshot().totalMs).toBe(90_000);

    advance(90_000);
    expect(engine.getPhase()).toBe("breakComplete");
    engine.dispose();
  });

  it("defaults to 25 minutes study and 5 minutes break", () => {
    expect(DEFAULT_TIMER_CONFIG).toEqual({ studySeconds: 1_500, breakSeconds: 300 });

    const { clock } = createFakeClock();
    const { engine } = createEngine({}, { clock });
    engine.start();
    expect(engine.snapshot().totalMs).toBe(25 * 60_000);
    engine.dispose();
  });

  it("persists last config to injectable storage", () => {
    const storage = createMemoryStorage();
    const { clock } = createFakeClock();
    const first = createEngine({ studySeconds: 40 * 60, breakSeconds: 8 * 60 }, { clock, storage });
    expect(JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}")).toEqual({
      studySeconds: 2_400,
      breakSeconds: 480,
    });
    first.engine.dispose();

    const second = createEngine({}, { clock, storage });
    expect(second.engine.getConfig()).toEqual({ studySeconds: 2_400, breakSeconds: 480 });
    second.engine.dispose();
  });

  it("migrates legacy minute-based persisted config", () => {
    const storage = createMemoryStorage({
      [CONFIG_STORAGE_KEY]: JSON.stringify({ studyMinutes: 45, breakMinutes: 7 }),
    });
    const { clock, advance } = createFakeClock();
    const { engine } = createEngine({}, { clock, storage });

    expect(engine.getConfig()).toEqual({ studySeconds: 45 * 60, breakSeconds: 7 * 60 });

    engine.start();
    expect(engine.snapshot().totalMs).toBe(45 * 60_000);

    advance(45 * 60_000);
    expect(engine.getPhase()).toBe("break");
    expect(engine.snapshot().totalMs).toBe(7 * 60_000);
    engine.dispose();
  });

  it("ignores unusable persisted config and falls back to defaults", () => {
    const storage = createMemoryStorage({
      [CONFIG_STORAGE_KEY]: JSON.stringify({ studyMinutes: 0, breakSeconds: "nope" }),
    });
    const { clock } = createFakeClock();
    const { engine } = createEngine({}, { clock, storage });

    expect(engine.getConfig()).toEqual(DEFAULT_TIMER_CONFIG);
    engine.dispose();
  });

  it("survives missing localStorage in Node", () => {
    expect(() => {
      const engine = new PomodoroEngine(
        { studySeconds: 25 * 60, breakSeconds: 5 * 60 },
        { onTick: () => {}, onPhaseChange: () => {} },
      );
      engine.dispose();
    }).not.toThrow();
  });
});
