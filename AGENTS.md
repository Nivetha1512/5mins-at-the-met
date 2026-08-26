# Agent ownership

macOS overlay pomodoro. Breaks construct a bundled [Met Open Access](https://metmuseum.github.io/) painting; the next study session returns to the compact chip.

App name is historical (`moma-pomodoro`). **Art source is The Met, not MoMA.** Only CC0 Open Access works, bundled locally. No runtime network fetch.

## File ownership

| Path | Owner | Responsibility |
|---|---|---|
| `src/shared/` | Agent 0 | Frozen contract (`types.ts`, `events.ts`). Do not change without orchestrator. |
| `src/app/App.tsx` | Agent 0 only | Composition root. Wire phase changes to window + painter in Wave 2. |
| `src-tauri/` | Agent 1 | Window modes: compact / fullscreen. |
| `src/app/windowBridge.ts` | Agent 1 | Frontend API for window mode. Agent 0 imports it from `App.tsx`. |
| `src/engine/` | Agent 2 | Pomodoro state machine + unit tests. |
| `src/art/` | Agent 3 | Catalog loader, stroke extract, canvas painter. |
| `public/artworks/` | Agent 3 | Bundled images + `artworks.json`. |
| `src/ui/` | Agent 4 | Settings, study chip, break-complete copy. |

## Handoff rules

- **Only Agent 0 edits `src/app/App.tsx`.**
- Public APIs go through `src/shared/`. Specialists must not import each other’s internals.
- Each specialist ships an **isolated demo or unit test** that runs without the rest of the app.
- Images live in `public/artworks/`. **Do not fetch at runtime.**
- Engine callbacks are **`onTick` and `onPhaseChange` only**. The engine must not import window, Tauri, or canvas.

## Art source — The Met Open Access (Agent 3)

Use **The Metropolitan Museum of Art Open Access** program, not MoMA collection dumps.

- Overview: https://metmuseum.github.io/
- Collection API / object pages: `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}`
- Select **paintings** that are **CC0 / Public Domain Open Access** (The Met marks these; confirm Open Access on the object page).
- Download ~8–12 high-resolution stills into `public/artworks/` and write `public/artworks/artworks.json`.
- Prefer well-known, visually rich paintings that read at fullscreen (color, composition). Avoid works with unresolved rights.

Each JSON object **must** match `Artwork` in `src/shared/types.ts`:

- `id`, `title`, `artist`, `year`, `imagePath`, `credit`
- `description` (required): 1–3 sentences of historical context or a fun fact
- `metObjectId` (optional): Met object ID for attribution

**Break-complete UI (Agent 4)** must show **title, artist, year, and description**. Do not omit the fun fact.

Credit line example: `"The Metropolitan Museum of Art, Open Access (CC0)"` plus collection credit from the object page.

## Wave 1 deliverables (isolated)

| Agent | Isolated proof |
|---|---|
| 1 | Colored-rectangle window that can switch compact ↔ fullscreen |
| 2 | `pomodoro.test.ts` covering study → break → breakComplete → studying |
| 3 | Demo page/loop: construct on a bundled Met painting |
| 4 | Settings + StudyChip + BreakComplete (title/artist/year/description) against mock engine types |

## Shared contract (do not drift)

- `PomodoroPhase`: `idle \| studying \| break \| breakComplete`
- `TimerConfig`: `{ studySeconds, breakSeconds }` (whole seconds, so sub-minute phases are representable; legacy persisted `{ studyMinutes, breakMinutes }` is migrated on load)
- `Artwork`: `{ id, title, artist, year, imagePath, credit, description, metObjectId? }`
- `PainterCommand`: `{ type: "construct" \| "clear", artworkId, durationMs }`
- Engine: `onTick`, `onPhaseChange` only

## Cursor Cloud specific instructions

This is a **macOS Tauri overlay app**, but the Cloud VM is **headless Linux**. Develop and test against the **Vite frontend only** — the whole product (engine, canvas painter, artwork catalog, settings, break flow) runs in a plain browser because every native call in `src/app/windowBridge.ts` is guarded by `isTauri()` and no-ops outside Tauri.

- Do **not** run `npm run tauri dev` / `npm run tauri build` here — that path is macOS-oriented (uses `setSimpleFullscreen`, `ActivationPolicy`) and needs a display + webkit. It is not the way to test on this VM.
- Standard commands live in `package.json`: `npm run dev` (Vite on port **1420**, `strictPort` — must be free), `npm test` (Vitest), `npm run build` (`tsc && vite build`). There is **no ESLint**; the "lint" gate is `node ./node_modules/typescript/bin/tsc --noEmit` (per workspace rules, run it plus `npm test` before finishing).
- Artwork images are bundled in `public/artworks/` and served by Vite; there is **no runtime network fetch**. `npm run fetch-artworks*` is maintenance-only.
- To exercise the study → break → break-complete flow quickly, set short **Study/Break** durations in the Settings panel (fields accept whole seconds, e.g. `0:02` / `0:12`); the painting constructs over the break duration.
- Manual GUI testing/screen recording: the VM has an idle screensaver (a rotating white 3D cube on black) that will overwrite recordings during pauses. Disable it for the session with `DISPLAY=:1 xset s off; xset s 0 0` (and/or keep the mouse moving) before recording.
