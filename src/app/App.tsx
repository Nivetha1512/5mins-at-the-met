import { useCallback, useEffect, useRef, useState } from "react";
import { ArtPainter, getArtwork, getCatalog, nextArtwork } from "../art";
import { DEFAULT_TIMER_CONFIG, PomodoroEngine } from "../engine";
import type { Artwork, PomodoroPhase, TimerConfig } from "../shared";
import { BreakComplete, Settings, StudyChip, useTimerHotkeys } from "../ui";
import "./App.css";
import { setWindowMode, type WindowMode } from "./windowBridge";

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

function drivePainter(
  phase: PomodoroPhase,
  artworkId: string | undefined,
  painter: ArtPainter,
  breakMinutes: number,
  skipped: boolean,
): void {
  switch (phase) {
    case "idle":
    case "studying":
      painter.clear();
      return;
    case "break":
      if (artworkId) {
        void painter.construct(artworkId, breakMinutes * 60_000);
      }
      return;
    case "breakComplete":
      if (skipped) {
        painter.hold();
      }
      return;
    case "dissolving":
      void painter.dissolve();
      return;
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PomodoroEngine | null>(null);
  const lastArtworkIdRef = useRef<string | undefined>(undefined);
  const skipRef = useRef(false);

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
          const skipped = skipRef.current;
          skipRef.current = false;
          setPhase(payload.to);
          if (payload.to === "break" && payload.artworkId) {
            lastArtworkIdRef.current = payload.artworkId;
            setArtwork(getArtwork(payload.artworkId) ?? getCatalog()[0] ?? null);
          }
          void setWindowMode(windowModeFor(payload.to));
          drivePainter(
            payload.to,
            payload.artworkId,
            painter,
            engine.getConfig().breakMinutes,
            skipped,
          );
        },
      },
      {
        nextArtworkId: () =>
          nextArtwork(lastArtworkIdRef.current)?.id ?? getCatalog()[0].id,
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
    skipRef.current = true;
    engineRef.current?.skip();
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
          />
        ) : null}
        {phase === "breakComplete" && artwork ? (
          <BreakComplete artwork={artwork} onStartNext={handleStart} />
        ) : null}
      </div>
    </main>
  );
}

export default App;
