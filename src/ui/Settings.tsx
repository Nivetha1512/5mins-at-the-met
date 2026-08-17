import type { TimerConfig } from "../shared";
import "./ui.css";

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  studyMinutes: 25,
  breakMinutes: 5,
};

export type SettingsProps = {
  config: TimerConfig;
  onChange: (config: TimerConfig) => void;
  onStart: () => void;
};

const MIN_MINUTES = 1;
const MAX_STUDY_MINUTES = 180;
const MAX_BREAK_MINUTES = 60;

function clampMinutes(value: number, max: number): number {
  return Math.min(max, Math.max(MIN_MINUTES, Math.round(value)));
}

export function Settings({ config, onChange, onStart }: SettingsProps) {
  const canStart = config.studyMinutes >= MIN_MINUTES && config.breakMinutes >= MIN_MINUTES;

  function setStudyMinutes(raw: number) {
    if (Number.isNaN(raw)) {
      return;
    }
    onChange({ ...config, studyMinutes: clampMinutes(raw, MAX_STUDY_MINUTES) });
  }

  function setBreakMinutes(raw: number) {
    if (Number.isNaN(raw)) {
      return;
    }
    onChange({ ...config, breakMinutes: clampMinutes(raw, MAX_BREAK_MINUTES) });
  }

  return (
    <section className="ui-settings" aria-label="Session length">
      <div className="ui-settings__fields">
        <div className="ui-settings__field">
          <label htmlFor="ui-study-minutes">Study</label>
          <input
            id="ui-study-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_STUDY_MINUTES}
            value={config.studyMinutes}
            onChange={(event) => setStudyMinutes(event.target.valueAsNumber)}
          />
          <span className="ui-settings__unit">minutes</span>
        </div>
        <div className="ui-settings__field">
          <label htmlFor="ui-break-minutes">Break</label>
          <input
            id="ui-break-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_BREAK_MINUTES}
            value={config.breakMinutes}
            onChange={(event) => setBreakMinutes(event.target.valueAsNumber)}
          />
          <span className="ui-settings__unit">minutes</span>
        </div>
      </div>
      <button type="button" className="ui-btn" onClick={onStart} disabled={!canStart}>
        Start
      </button>
    </section>
  );
}
