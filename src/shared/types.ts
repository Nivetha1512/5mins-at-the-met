/** Frozen shared contract. Wave 1 agents import from `src/shared` only. */

export type PomodoroPhase =
  | "idle"
  | "studying"
  | "break"
  | "breakComplete"
  | "dissolving";

/** Phase lengths in whole seconds so sub-minute durations are representable. */
export type TimerConfig = {
  studySeconds: number;
  breakSeconds: number;
};

/** Fixed dissolve duration while the next study session begins (click-through). */
export const DISSOLVE_MS = 30_000;

/**
 * A bundled Met Open Access (CC0) painting.
 * `description` is required: 1–3 sentences with a personal-history fun fact for BreakComplete.
 * Images live under `public/artworks/` and are never fetched at runtime.
 */
export type Artwork = {
  id: string;
  title: string;
  artist: string;
  /** Display date from The Met (e.g. "1888" or "ca. 1874"). */
  year: string;
  /** Path relative to `public/`, e.g. `/artworks/starry-night-over-the-rhone.jpg`. */
  imagePath: string;
  credit: string;
  /** Short fun fact about the artist’s personal history, shown on break-complete. */
  description: string;
  /** The Met collection object ID, when known. */
  metObjectId?: number;
};

export type PainterCommand = {
  type: "construct" | "dissolve" | "clear";
  artworkId: string;
  durationMs: number;
};
