import type { TickPayload } from "../shared";
import { formatMs } from "./formatMs";
import "./ui.css";

export type StudyChipProps = Pick<TickPayload, "remainingMs"> & {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onClose: () => void;
};

export function StudyChip({
  remainingMs,
  paused,
  onPause,
  onResume,
  onEnd,
  onClose,
}: StudyChipProps) {
  const time = formatMs(remainingMs);

  return (
    <div className={paused ? "ui-chip ui-chip--paused" : "ui-chip"} role="timer" aria-label="Study remaining">
      <p className="ui-chip__time" aria-live="polite">
        {time}
      </p>
      <div className="ui-chip__actions">
        <button
          type="button"
          className="ui-chip__toggle"
          onClick={paused ? onResume : onPause}
          aria-pressed={paused}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="ui-chip__toggle" onClick={onEnd}>
          End
        </button>
        <button type="button" className="ui-chip__toggle" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
