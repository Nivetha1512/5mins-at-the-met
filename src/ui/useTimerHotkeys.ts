import { useEffect } from "react";

export type TimerHotkeys = {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  /** Esc. Omit to ignore skip. */
  onSkip?: () => void;
  enabled?: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Space toggles pause/resume; Esc skips. Callbacks only — no engine imports.
 */
export function useTimerHotkeys({
  paused,
  onPause,
  onResume,
  onSkip,
  enabled = true,
}: TimerHotkeys): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        if (paused) {
          onResume();
        } else {
          onPause();
        }
        return;
      }
      if ((event.code === "Escape" || event.key === "Escape") && onSkip) {
        event.preventDefault();
        onSkip();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onPause, onResume, onSkip, paused]);
}
