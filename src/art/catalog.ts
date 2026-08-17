import type { Artwork } from "../shared/types";
import catalogJson from "../../public/artworks/artworks.json";

const catalog: Artwork[] = catalogJson as Artwork[];

export const LAST_ARTWORK_STORAGE_KEY = "moma-pomodoro:last-artwork-id";

/** Bundled Met Open Access catalog. Images are never fetched from the network. */
export function getCatalog(): Artwork[] {
  return catalog;
}

export function getArtwork(id: string): Artwork | undefined {
  return catalog.find((artwork) => artwork.id === id);
}

/**
 * Cycle to the next bundled painting so consecutive breaks differ.
 * Unknown or missing `afterId` starts at the first catalog entry.
 */
export function nextArtwork(afterId?: string): Artwork {
  if (catalog.length === 0) {
    throw new Error("Art catalog is empty");
  }
  if (!afterId) {
    return catalog[0];
  }
  const index = catalog.findIndex((artwork) => artwork.id === afterId);
  const from = index < 0 ? 0 : index;
  return catalog[(from + 1) % catalog.length];
}

/** Pick a random bundled painting, optionally excluding one id (e.g. last session). */
export function randomArtwork(excludeId?: string): Artwork {
  if (catalog.length === 0) {
    throw new Error("Art catalog is empty");
  }
  const pool = excludeId ? catalog.filter((artwork) => artwork.id !== excludeId) : catalog;
  if (pool.length === 0) {
    return catalog[0];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
