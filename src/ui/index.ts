export { Settings, DEFAULT_TIMER_CONFIG } from "./Settings";
export type { SettingsProps } from "./Settings";

export { StudyChip } from "./StudyChip";
export type { StudyChipProps } from "./StudyChip";

export { BreakComplete } from "./BreakComplete";
export type { BreakCompleteProps } from "./BreakComplete";

export { BackToWork } from "./BackToWork";
export type { BackToWorkProps } from "./BackToWork";

export { BreakTimer } from "./BreakTimer";
export type { BreakTimerProps } from "./BreakTimer";

export { ExitButton } from "./ExitButton";
export type { ExitButtonProps } from "./ExitButton";

export { useTimerHotkeys } from "./useTimerHotkeys";
export type { TimerHotkeys } from "./useTimerHotkeys";

export { UiDemo } from "./UiDemo";
export { formatMs } from "./formatMs";

export {
  MIN_DURATION_SECONDS,
  MAX_STUDY_SECONDS,
  MAX_BREAK_SECONDS,
  normalizeDuration,
  parseDurationText,
  sanitizeDigits,
  toDurationText,
} from "./durationInput";
export type { DurationText } from "./durationInput";
