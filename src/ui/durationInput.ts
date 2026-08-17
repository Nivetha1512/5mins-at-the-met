/**
 * Pure helpers for the idle MM / SS duration inputs.
 *
 * The inputs keep raw text while the user edits, so every function here has to
 * tolerate empty and partially typed values. Normalizing (clamping and carrying
 * seconds into minutes) happens on blur and on Start, never per keystroke.
 */

/** Shortest phase the UI will accept. */
export const MIN_DURATION_SECONDS = 1;
export const MAX_STUDY_SECONDS = 180 * 60;
export const MAX_BREAK_SECONDS = 60 * 60;

const SECONDS_PER_MINUTE = 60;
const DIGITS_ONLY = /^\d*$/;

/** Raw text of one MM / SS pair. Either half may be empty mid-edit. */
export type DurationText = {
  minutes: string;
  seconds: string;
};

/** Strips anything a numeric field should not hold, so state stays parseable. */
export function sanitizeDigits(raw: string, maxLength = 3): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

export function toDurationText(totalSeconds: number): DurationText {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / SECONDS_PER_MINUTE);
  const seconds = safe % SECONDS_PER_MINUTE;
  return {
    minutes: String(minutes),
    seconds: String(seconds).padStart(2, "0"),
  };
}

/**
 * Total seconds for the typed pair, or `null` when it is not yet a usable
 * duration (all empty, non-numeric, or zero-length).
 */
export function parseDurationText({ minutes, seconds }: DurationText): number | null {
  const m = minutes.trim();
  const s = seconds.trim();
  if (m === "" && s === "") {
    return null;
  }
  if (!DIGITS_ONLY.test(m) || !DIGITS_ONLY.test(s)) {
    return null;
  }
  const total = (m === "" ? 0 : Number(m)) * SECONDS_PER_MINUTE + (s === "" ? 0 : Number(s));
  if (!Number.isFinite(total) || total < MIN_DURATION_SECONDS) {
    return null;
  }
  return total;
}

/**
 * Commit value for a field: the clamped typed duration, or `fallbackSeconds`
 * when the field was left empty or unusable. Never returns NaN.
 */
export function normalizeDuration(
  text: DurationText,
  maxSeconds: number,
  fallbackSeconds: number,
): number {
  const parsed = parseDurationText(text);
  if (parsed !== null) {
    return Math.min(maxSeconds, parsed);
  }
  if (Number.isFinite(fallbackSeconds) && fallbackSeconds >= MIN_DURATION_SECONDS) {
    return Math.min(maxSeconds, Math.round(fallbackSeconds));
  }
  return MIN_DURATION_SECONDS;
}
