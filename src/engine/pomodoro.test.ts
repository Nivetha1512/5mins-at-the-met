import { describe, expect, it } from "vitest";
import { DISSOLVE_MS } from "../shared";
import type { EngineCallbacks, PhaseChangePayload, TickPayload } from "../shared";
import {
  CONFIG_STORAGE_KEY,
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
  config: { studyMinutes?: number; breakMinutes?: number },
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
  it("runs study → break → breakComplete → dissolving (30s) → studying", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine(
      { studyMinutes: 1, breakMinutes: 1 },
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
    expect(engine.getPhase()).toBe("dissolving");
    expect(engine.snapshot()).toMatchObject({
      remainingMs: DISSOLVE_MS,
      totalMs: DISSOLVE_MS,
    });

    advance(DISSOLVE_MS - 1);
    expect(engine.getPhase()).toBe("dissolving");

    advance(1);
    expect(engine.getPhase()).toBe("studying");
    expect(engine.snapshot().totalMs).toBe(60_000);

    expect(phases.map((p) => `${p.from}->${p.to}`)).toEqual([
      "idle->studying",
      "studying->break",
      "break->breakComplete",
      "breakComplete->dissolving",
      "dissolving->studying",
    ]);
    expect(phases[1]?.artworkId).toBe("met-123");
    expect(phases[3]?.artworkId).toBe("met-123");
  });

  it("pause/resume does not skip time incorrectly", () => {
    const { clock, advance } = createFakeClock();
    const { engine, phases } = createEngine({ studyMinutes: 1, breakMinutes: 1 }, { clock });

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
    const { engine, phases } = createEngine({ studyMinutes: 25, breakMinutes: 5 }, { clock });

    engine.start();
    advance(1_000);
    expect(engine.getPhase()).toBe("studying");

    engine.skip();
    expect(engine.getPhase()).toBe("break");

    engine.skip();
    expect(engine.getPhase()).toBe("breakComplete");

    engine.skip();
    expect(engine.getPhase()).toBe("dissolving");
    expect(engine.snapshot().totalMs).toBe(DISSOLVE_MS);

    engine.skip();
    expect(engine.getPhase()).toBe("studying");

    expect(phases.map((p) => `${p.from}->${p.to}`)).toEqual([
      "idle->studying",
      "studying->break",
      "break->breakComplete",
      "breakComplete->dissolving",
      "dissolving->studying",
    ]);
  });

  it("start from breakComplete begins dissolving", () => {
    const { clock } = createFakeClock();
    const { engine } = createEngine({ studyMinutes: 1, breakMinutes: 1 }, { clock });

    engine.start();
    engine.skip(); // break
    engine.skip(); // breakComplete
    engine.start();
    expect(engine.getPhase()).toBe("dissolving");
    expect(engine.snapshot().totalMs).toBe(DISSOLVE_MS);
  });

  it("uses custom study and break minutes", () => {
    const { clock, advance } = createFakeClock();
    const { engine } = createEngine({ studyMinutes: 2, breakMinutes: 3 }, { clock });

    expect(engine.getConfig()).toEqual({ studyMinutes: 2, breakMinutes: 3 });

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

  it("persists last config to injectable storage", () => {
    const storage = createMemoryStorage();
    const { clock } = createFakeClock();
    const first = createEngine({ studyMinutes: 40, breakMinutes: 8 }, { clock, storage });
    expect(JSON.parse(storage.getItem(CONFIG_STORAGE_KEY) ?? "{}")).toEqual({
      studyMinutes: 40,
      breakMinutes: 8,
    });
    first.engine.dispose();

    const second = createEngine({}, { clock, storage });
    expect(second.engine.getConfig()).toEqual({ studyMinutes: 40, breakMinutes: 8 });
    second.engine.dispose();
  });

  it("survives missing localStorage in Node", () => {
    expect(() => {
      const engine = new PomodoroEngine(
        { studyMinutes: 25, breakMinutes: 5 },
        { onTick: () => {}, onPhaseChange: () => {} },
      );
      engine.dispose();
    }).not.toThrow();
  });
});
