# `src/art/` — catalog + stroke painter

Bundled [Met Open Access](https://metmuseum.github.io/) paintings. Metadata comes from [metmuseum/openaccess](https://github.com/metmuseum/openaccess); images live in `public/artworks/` and are **never** fetched at runtime. Refresh with `npm run fetch-artworks:catalog`.

Famous Monet *Water Lilies* holdings at The Met are **not** Open Access (`isPublicDomain: false`, often Havemeyer / Annenberg). This catalog uses other confirmed CC0 paintings (van Gogh, Vermeer, Bruegel, Sargent, Degas, David, Manet, Rembrandt, Bonheur, Leutze).

## Preview (isolated demo)

`ArtDemo` is exported but **not** mounted in `App.tsx` (Agent 0 owns that file).

Temporarily in `src/main.tsx`:

```tsx
import { ArtDemo } from "./art";
ReactDOM.createRoot(document.getElementById("root")!).render(<ArtDemo />);
```

Or have Agent 0 wire `?demo=art` later. The demo loops **construct (10s)** then **dissolve (30s / `DISSOLVE_MS`)** and cycles to the next painting.

```bash
npm run dev
```

## Catalog

`public/artworks/artworks.json` is an `Artwork[]`. `catalog.ts` imports that bundled JSON (no network).

- `getCatalog()` — all works
- `getArtwork(id)` — one work, or `undefined`
- `nextArtwork(afterId?)` — cycles so consecutive breaks differ

## Painter

```ts
const painter = new ArtPainter(canvas);
await painter.construct(artworkId, durationMs); // progress = elapsed / duration
await painter.dissolve();                       // default DISSOLVE_MS (30s)
painter.clear();
await painter.handleCommand({ type: "construct", artworkId, durationMs });
```

`extractStrokes(imagePath)` turns a bundled image into ordered `{x,y,color,radius}` dabs: large color blocks first, edges/detail last.
