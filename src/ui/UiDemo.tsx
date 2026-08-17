import { useCallback, useState } from "react";
import type { Artwork, TimerConfig } from "../shared";
import { BreakComplete } from "./BreakComplete";
import { DEFAULT_TIMER_CONFIG, Settings } from "./Settings";
import { StudyChip } from "./StudyChip";
import { useTimerHotkeys } from "./useTimerHotkeys";
import "./ui.css";

/** Inline mock — not a Met object and not loaded from `public/artworks/`. */
const MOCK_ARTWORK: Artwork = {
  id: "demo-harbor-dusk",
  title: "Harbor at Dusk",
  artist: "Eleanor Voss",
  year: "1902",
  imagePath: "/demo/not-a-met-file.jpg",
  credit: "Demonstration collection (not a Met object)",
  description:
    "Painted from a rented room above the quay, Voss worked only in the twenty minutes after sunset. The violet band along the horizon is lampblack mixed with leftover cobalt, a habit she kept after running out of expensive lake pigments.",
};

/**
 * Isolated visual proof for Agent 4. Do not mount from App.tsx.
 * Space pause/resume; Esc logs a skip in this demo.
 */
export function UiDemo() {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);
  const [remainingMs, setRemainingMs] = useState(25 * 60 * 1000);
  const [paused, setPaused] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const onPause = useCallback(() => setPaused(true), []);
  const onResume = useCallback(() => setPaused(false), []);
  const onSkip = useCallback(() => setSkipped(true), []);

  useTimerHotkeys({ paused, onPause, onResume, onSkip });

  return (
    <div className="ui-demo">
      <div className="ui-demo__row">
        <div className="ui-demo__panel">
          <p className="ui-demo__label">Settings (idle)</p>
          <Settings
            config={config}
            onChange={(next) => {
              setConfig(next);
              setRemainingMs(next.studyMinutes * 60 * 1000);
            }}
            onStart={() => {
              setPaused(false);
              setRemainingMs(config.studyMinutes * 60 * 1000);
            }}
          />
        </div>
        <div className="ui-demo__panel">
          <p className="ui-demo__label">StudyChip (~220×80)</p>
          <StudyChip remainingMs={remainingMs} paused={paused} onPause={onPause} onResume={onResume} />
          {skipped ? <p className="ui-demo__label">Esc skip received</p> : null}
        </div>
      </div>
      <p className="ui-demo__label ui-demo__stage-label">BreakComplete (overlay)</p>
      <div className="ui-demo__stage">
        <BreakComplete artwork={MOCK_ARTWORK} onStartNext={() => setSkipped(false)} />
      </div>
    </div>
  );
}
