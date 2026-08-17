import { useEffect, useRef, useState } from "react";
import {
  COMPACT_HEIGHT,
  COMPACT_WIDTH,
  IDLE_HEIGHT,
  IDLE_WIDTH,
  isTauri,
  setWindowMode,
  type WindowMode,
} from "./windowBridge";

const MODE_FILL: Record<WindowMode, string> = {
  idle: "#2a2620",
  compact: "#c45c26",
  fullscreen: "#1d4e89",
  dissolve: "#5b2a86",
};

const MODE_LABEL: Record<WindowMode, string> = {
  idle: "idle · settings",
  compact: "compact · study chip",
  fullscreen: "fullscreen · break (clicks on)",
  dissolve: "dissolve · click-through",
};

const MODE_KEYS: WindowMode[] = ["idle", "compact", "fullscreen", "dissolve"];

const DISSOLVE_DEMO_MS = 5_000;

/**
 * Isolated proof for Agent 1. Do not mount from App.tsx.
 * Compact / fullscreen / dissolve swap both the fill color and Tauri chrome.
 * Dissolve auto-returns to compact after 5s because click-through blocks the buttons.
 */
export function WindowModeDemo() {
  const [mode, setMode] = useState<WindowMode>("compact");
  const [tauri, setTauri] = useState(false);
  const [dissolveLeftMs, setDissolveLeftMs] = useState(0);
  const dissolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dissolveTick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTauri(isTauri());
    void setWindowMode("compact");
    return () => clearDissolveTimers();
  }, []);

  function clearDissolveTimers() {
    if (dissolveTimer.current) {
      clearTimeout(dissolveTimer.current);
      dissolveTimer.current = null;
    }
    if (dissolveTick.current) {
      clearInterval(dissolveTick.current);
      dissolveTick.current = null;
    }
    setDissolveLeftMs(0);
  }

  async function choose(next: WindowMode) {
    clearDissolveTimers();
    setMode(next);
    await setWindowMode(next);

    if (next !== "dissolve") {
      return;
    }

    setDissolveLeftMs(DISSOLVE_DEMO_MS);
    dissolveTick.current = setInterval(() => {
      setDissolveLeftMs((left) => Math.max(0, left - 250));
    }, 250);
    dissolveTimer.current = setTimeout(() => {
      clearDissolveTimers();
      setMode("compact");
      void setWindowMode("compact");
    }, DISSOLVE_DEMO_MS);
  }

  return (
    <div
      style={{
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        minHeight:
          mode === "compact" ? COMPACT_HEIGHT : mode === "idle" ? IDLE_HEIGHT : "100vh",
        minWidth:
          mode === "compact" ? COMPACT_WIDTH : mode === "idle" ? IDLE_WIDTH : undefined,
        background: MODE_FILL[mode],
        color: "#f6f1e8",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: mode === "compact" ? 8 : 24,
        userSelect: "none",
        fontFamily: "Inter, Avenir, Helvetica, Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MODE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => void choose(key)}
            style={{
              border: mode === key ? "2px solid #fff" : "1px solid rgba(255,255,255,0.45)",
              background: "rgba(0,0,0,0.28)",
              color: "#fff",
              borderRadius: 6,
              padding: mode === "compact" ? "2px 8px" : "8px 14px",
              fontSize: mode === "compact" ? 11 : 14,
              cursor: "pointer",
            }}
          >
            {key === "idle"
              ? "Idle"
              : key === "compact"
                ? "Compact"
                : key === "fullscreen"
                  ? "Fullscreen"
                  : "Dissolve"}
          </button>
        ))}
      </div>
      <div data-tauri-drag-region={mode === "compact" ? "" : undefined}>
        <p style={{ margin: 0, fontSize: mode === "compact" ? 11 : 22, fontWeight: 600 }}>
          {MODE_LABEL[mode]}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: mode === "compact" ? 10 : 13, opacity: 0.85 }}>
          {tauri ? "Tauri window APIs active" : "Browser only — chrome will not resize"}
          {mode === "dissolve" && dissolveLeftMs > 0
            ? ` · auto compact in ${(dissolveLeftMs / 1000).toFixed(1)}s`
            : null}
        </p>
      </div>
    </div>
  );
}

export default WindowModeDemo;
