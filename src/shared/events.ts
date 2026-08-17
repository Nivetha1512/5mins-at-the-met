import type { PomodoroPhase } from "./types";

/**
 * Engine callback contract.
 *
 * The pomodoro engine must emit only these two callbacks. It must not import
 * window APIs, Tauri, canvas, or UI modules.
 */

export type TickPayload = {
  phase: PomodoroPhase;
  remainingMs: number;
  elapsedMs: number;
  totalMs: number;
};

export type PhaseChangePayload = {
  from: PomodoroPhase;
  to: PomodoroPhase;
  artworkId?: string;
};

export type OnTick = (payload: TickPayload) => void;

export type OnPhaseChange = (payload: PhaseChangePayload) => void;

export type EngineCallbacks = {
  onTick: OnTick;
  onPhaseChange: OnPhaseChange;
};
