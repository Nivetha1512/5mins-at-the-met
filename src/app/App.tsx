import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArtPainter,
  getArtwork,
  getCatalog,
  LAST_ARTWORK_STORAGE_KEY,
  randomArtwork,
} from "../art";
import { DEFAULT_TIMER_CONFIG, PomodoroEngine } from "../engine";
import type { Artwork, PomodoroPhase, TimerConfig } from "../shared";
import {
  BackToWork,
  BreakComplete,
  BreakTimer,
  Settings,
  StudyChip,
  useTimerHotkeys,
} from "../ui";
import "./App.css";
import { closeOverlay, setWindowMode, type WindowMode } from "./windowBridge";

const CANVAS_PHASES: ReadonlySet<PomodoroPhase> = new Set([
  "break",
  "breakComplete",
  "dissolving",
]);

function windowModeFor(phase: PomodoroPhase): WindowMode {
  switch (phase) {
    case "idle":
      return "idle";
    case "studying":
      return "compact";
    case "break":
    case "breakComplete":
      return "fullscreen";
    case "dissolving":
      return "dissolve";
  }
}

function readStoredLastArtworkId(): string | undefined {
  try {
    const stored = localStorage.getItem(LAST_ARTWORK_STORAGE_KEY);
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredLastArtworkId(id: string): void {
  try {
    localStorage.setItem(LAST_ARTWORK_STORAGE_KEY, id);
  } catch {
    // Ignore quota / privacy-mode failures.
  }
}

function drivePainter(
  phase: PomodoroPhase,
  artworkId: string | undefined,
  painter: ArtPainter,
  breakDurationMs: number,
): void {
  switch (phase) {
    case "idle":
    case "studying":
      painter.clear();
      return;
    case "break":
      if (artworkId) {
        void painter.construct(artworkId, breakDurationMs);
      }
      return;
    case "breakComplete":
      painter.hold();
      return;
    case "dissolving":
      void painter.dissolve();
      return;
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PomodoroEngine | null>(null);
  const lastArtworkIdRef = useRef<string | undefined>(readStoredLastArtworkId());

  const [config, setConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);
  const [phase, setPhase] = useState<PomodoroPhase>("idle");
  const [remainingMs, setRemainingMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [artwork, setArtwork] = useState<Artwork | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const painter = new ArtPainter(canvas);

    // Smoke-test later: 1 min study / 1 min break in Settings (Esc skips study or break).
    const engine = new PomodoroEngine(
      {},
      {
        onTick: (tick) => {
          setRemainingMs(tick.remainingMs);
          setPaused(engine.isPaused());
        },
        onPhaseChange: (payload) => {
          setPhase(payload.to);
          if (payload.to === "break" && payload.artworkId) {
            lastArtworkIdRef.current = payload.artworkId;
            writeStoredLastArtworkId(payload.artworkId);
            setArtwork(getArtwork(payload.artworkId) ?? getCatalog()[0] ?? null);
          }
          void setWindowMode(windowModeFor(payload.to));
          drivePainter(
            payload.to,
            payload.artworkId,
            painter,
            engine.getConfig().breakSeconds * 1_000,
          );
        },
      },
      {
        nextArtworkId: () => {
          const previous = lastArtworkIdRef.current ?? readStoredLastArtworkId();
          return randomArtwork(previous).id;
        },
      },
    );

    engineRef.current = engine;
    setConfig(engine.getConfig());
    void setWindowMode("idle");
    painter.clear();

    return () => {
      engine.dispose();
      engineRef.current = null;
      painter.destroy();
    };
  }, []);

  const handlePause = useCallback(() => {
    if (engineRef.current?.getPhase() !== "studying") {
      return;
    }
    engineRef.current.pause();
  }, []);

  const handleResume = useCallback(() => {
    if (engineRef.current?.getPhase() !== "studying") {
      return;
    }
    engineRef.current.resume();
  }, []);

  const handleSkip = useCallback(() => {
    engineRef.current?.skip();
  }, []);

  const handleEnd = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const handleClose = useCallback(() => {
    void closeOverlay();
  }, []);

  const handleBackToWork = useCallback(() => {
    engineRef.current?.resumeWork();
  }, []);

  useTimerHotkeys({
    paused,
    onPause: handlePause,
    onResume: handleResume,
    onSkip: handleSkip,
    enabled: phase === "studying" || phase === "break",
  });

  function handleConfigChange(next: TimerConfig) {
    setConfig(next);
    engineRef.current?.setConfig(next);
  }

  function handleStart() {
    engineRef.current?.start();
  }

  const showCanvas = CANVAS_PHASES.has(phase);
  const appClass =
    phase === "idle"
      ? "app app--idle"
      : phase === "studying"
        ? "app app--compact"
        : "app app--stage";

  return (
    <main className={appClass}>
      <canvas
        ref={canvasRef}
        className={showCanvas ? "app__canvas" : "app__canvas app__canvas--hidden"}
        aria-hidden={!showCanvas}
      />
      <div className="app__ui">
        {phase === "idle" ? (
          <Settings config={config} onChange={handleConfigChange} onStart={handleStart} />
        ) : null}
        {phase === "studying" ? (
          <StudyChip
            remainingMs={remainingMs}
            paused={paused}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            onClose={handleClose}
          />
        ) : null}
        {phase === "break" ? (
          <>
            <BackToWork onBackToWork={handleBackToWork} />
            <BreakTimer remainingMs={remainingMs} />
          </>
        ) : null}
        {phase === "breakComplete" && artwork ? (
          <BreakComplete artwork={artwork} onStartNext={handleStart} />
        ) : null}
      </div>
    </main>
  );
}

export default App;
