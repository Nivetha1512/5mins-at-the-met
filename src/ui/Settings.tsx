import { useEffect, useState, type FocusEvent } from "react";
import type { TimerConfig } from "../shared";
import {
  MAX_BREAK_SECONDS,
  MAX_STUDY_SECONDS,
  normalizeDuration,
  parseDurationText,
  sanitizeDigits,
  toDurationText,
  type DurationText,
} from "./durationInput";
import "./ui.css";

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  studySeconds: 25 * 60,
  breakSeconds: 5 * 60,
};

export type SettingsProps = {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
  onStart: () => void;
};

type DurationFieldProps = {
  labelId: string;
  label: string;
  value: DurationText;
  onValueChange: (next: DurationText) => void;
  onCommit: () => void;
};

/**
 * One MM / SS pair. Text is held by the parent so it can stay empty or partially
 * typed; `onCommit` fires when focus leaves the pair entirely, not when moving
 * between the two halves.
 */
function DurationField({ labelId, label, value, onValueChange, onCommit }: DurationFieldProps) {
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    onCommit();
  }

  return (
    <div className="ui-settings__field" role="group" aria-labelledby={labelId}>
      <span className="ui-settings__label" id={labelId}>
        {label}
      </span>
      <div className="ui-settings__duration" onBlur={handleBlur}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label} minutes`}
          value={value.minutes}
          onChange={(event) =>
            onValueChange({ ...value, minutes: sanitizeDigits(event.target.value) })
          }
        />
        <span className="ui-settings__colon" aria-hidden="true">
          :
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={`${label} seconds`}
          value={value.seconds}
          onChange={(event) =>
            onValueChange({ ...value, seconds: sanitizeDigits(event.target.value, 2) })
          }
        />
      </div>
      <span className="ui-settings__unit">min : sec</span>
    </div>
  );
}

export function Settings({ config, onChange, onStart }: SettingsProps) {
  const [study, setStudy] = useState<DurationText>(() => toDurationText(config.studySeconds));
  const [rest, setRest] = useState<DurationText>(() => toDurationText(config.breakSeconds));

  // Re-seed the text only when the committed config moves, so an empty or
  // half-typed field survives re-renders.
  useEffect(() => {
    setStudy(toDurationText(config.studySeconds));
  }, [config.studySeconds]);

  useEffect(() => {
    setRest(toDurationText(config.breakSeconds));
  }, [config.breakSeconds]);

  const canStart = parseDurationText(study) !== null && parseDurationText(rest) !== null;

  function commitStudy(): number {
    const next = normalizeDuration(study, MAX_STUDY_SECONDS, config.studySeconds);
    setStudy(toDurationText(next));
    return next;
  }

  function commitBreak(): number {
    const next = normalizeDuration(rest, MAX_BREAK_SECONDS, config.breakSeconds);
    setRest(toDurationText(next));
    return next;
  }

  function handleStart() {
    const studySeconds = commitStudy();
    const breakSeconds = commitBreak();
    if (studySeconds !== config.studySeconds || breakSeconds !== config.breakSeconds) {
      onChange({ studySeconds, breakSeconds });
    }
    onStart();
  }

  return (
    <section className="ui-settings" aria-label="Session length">
      <div className="ui-settings__fields">
        <DurationField
          labelId="ui-study-label"
          label="Study"
          value={study}
          onValueChange={setStudy}
          onCommit={() => {
            const studySeconds = commitStudy();
            if (studySeconds !== config.studySeconds) {
              onChange({ ...config, studySeconds });
            }
          }}
        />
        <DurationField
          labelId="ui-break-label"
          label="Break"
          value={rest}
          onValueChange={setRest}
          onCommit={() => {
            const breakSeconds = commitBreak();
            if (breakSeconds !== config.breakSeconds) {
              onChange({ ...config, breakSeconds });
            }
          }}
        />
      </div>
      <button type="button" className="ui-btn" onClick={handleStart} disabled={!canStart}>
        Start
      </button>
    </section>
  );
}
