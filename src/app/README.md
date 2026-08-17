# `src/app/` — Agent 0 (orchestrator)

Composition root. **Only Agent 0 edits `App.tsx`.**

Agent 1 may add `windowBridge.ts` here for Tauri window-mode APIs. Do not import that from engine, art, or UI modules.
