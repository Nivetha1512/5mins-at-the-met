# Bundled Met Open Access paintings

Metadata is sourced from [metmuseum/openaccess](https://github.com/metmuseum/openaccess) (`MetObjects.csv`). Images are downloaded at build time from [The Met Collection API](https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}) — **never at app runtime**.

Only rows with `Is Public Domain = true` and painting classification are included. CC0 companion images are identified on [metmuseum.org](https://www.metmuseum.org/art/collection) by the Creative Commons Zero icon.

`artworks.json` matches `Artwork` in `src/shared/types.ts`. Every entry includes `description` (fun fact / context for BreakComplete).

## Refresh the catalog

1. Ensure Node 18+ (for `fetch`).
2. Run from the repo root:

```bash
# Regenerate artworks.json from openaccess CSV (keeps existing JPGs)
npm run fetch-artworks:catalog

# Re-download images + regenerate catalog (first run downloads ~300 MB CSV)
npm run fetch-artworks
```

The script reads `scripts/curated-artworks.json` (Met object IDs + fun-fact descriptions), looks up titles/artists/credits in `MetObjects.csv`, and writes `public/artworks/artworks.json`.

CSV cache: `data/met-openaccess/MetObjects.csv` (gitignored). Pass `--download-csv` to force a fresh copy from GitHub.

Monet *Water Lilies* at The Met are not Open Access; they are omitted on purpose.
