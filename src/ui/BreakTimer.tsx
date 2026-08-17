import type { TickPayload } from "../shared";
import { formatMs } from "./formatMs";
import "./ui.css";

export type BreakTimerProps = Pick<TickPayload, "remainingMs">;

/** Compact break countdown pinned to the top-right during painting. */
export function BreakTimer({ remainingMs }: BreakTimerProps) {
  return (
    <div className="ui-break-timer" role="timer" aria-label="Break remaining">
      <span className="ui-break-timer__label">Break</span>
      <span className="ui-break-timer__time" aria-live="polite">
        {formatMs(remainingMs)}
      </span>
    </div>
  );
}
