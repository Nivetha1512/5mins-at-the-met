# 5 Minutes at the Met Pomodoro

macOS always-on-top overlay: a compact study timer, then a fullscreen painting constructed over the break. When you start the next session, the painting dissolves for 30 seconds (click-through) and the chip returns.

The app name is historical. **Paintings come from [The Met Open Access](https://metmuseum.github.io/) (CC0), bundled locally** — metadata from [metmuseum/openaccess](https://github.com/metmuseum/openaccess), images downloaded at build time via The Met Collection API. Not from MoMA, and not fetched at runtime.

To refresh the bundled catalog: `npm run fetch-artworks:catalog` (see [public/artworks/README.md](./public/artworks/README.md)).

## Prerequisites

- Node.js 18+
- [Rust](https://www.rust-lang.org/learn/get-started) + Tauri [prerequisites](https://v2.tauri.app/start/prerequisites/) (Xcode CLT on macOS)

Without Rust, `npm run dev` still serves the Vite frontend. `npm run tauri dev` will fail until `rustc` and `cargo` are on `PATH`.

## Run

```bash
npm install
npm run tauri dev
```

Frontend-only (no native window):

```bash
npm run dev
```

## Layout

See [AGENTS.md](./AGENTS.md) for file ownership and the frozen shared contract.
