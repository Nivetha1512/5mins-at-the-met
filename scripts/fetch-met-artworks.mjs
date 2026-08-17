#!/usr/bin/env node
/**
 * Build-time script: curate bundled paintings from metmuseum/openaccess metadata
 * and download CC0 images via The Met Collection API (never at app runtime).
 *
 * Usage:
 *   node scripts/fetch-met-artworks.mjs [--skip-images] [--download-csv] [--csv <path>]
 *
 * Default CSV path: data/met-openaccess/MetObjects.csv
 * Curated list: scripts/curated-artworks.json (metObjectId + description fun facts)
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { streamCsv } from "./lib/csv-stream.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_CSV = join(ROOT, "data/met-openaccess/MetObjects.csv");
const CSV_URL =
  "https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv";
const CURATED_PATH = join(__dirname, "curated-artworks.json");
const ARTWORKS_DIR = join(ROOT, "public/artworks");
const CATALOG_PATH = join(ARTWORKS_DIR, "artworks.json");
const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1/objects";
const CC0_SUFFIX = "The Metropolitan Museum of Art, Open Access (CC0)";

const args = process.argv.slice(2);
const skipImages = args.includes("--skip-images");
const downloadCsv = args.includes("--download-csv");
const csvFlagIndex = args.indexOf("--csv");
const csvPath = csvFlagIndex >= 0 ? resolve(args[csvFlagIndex + 1]) : DEFAULT_CSV;

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatCredit(creditLine) {
  const trimmed = creditLine.trim();
  if (!trimmed) {
    return CC0_SUFFIX;
  }
  if (trimmed.includes(CC0_SUFFIX)) {
    return trimmed;
  }
  return `${trimmed}. ${CC0_SUFFIX}`;
}

function parsePublicDomain(value) {
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isPainting(row) {
  const classification = String(row.Classification ?? "").toLowerCase();
  const objectName = String(row["Object Name"] ?? "").toLowerCase();
  return classification.includes("painting") || objectName === "painting";
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadCsvFile(destPath) {
  console.log(`Downloading MetObjects.csv from metmuseum/openaccess (~300 MB)...`);
  await mkdir(dirname(destPath), { recursive: true });
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`CSV download failed: ${response.status} ${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(destPath));
  console.log(`Saved ${destPath}`);
}

async function loadRowsForIds(csvFile, wantedIds) {
  const remaining = new Set(wantedIds);
  const found = new Map();

  await streamCsv(csvFile, (row) => {
    const objectId = Number(row["Object ID"]);
    if (!remaining.has(objectId)) {
      return;
    }
    found.set(objectId, row);
    remaining.delete(objectId);
  });

  return { found, missing: [...remaining] };
}

async function fetchMetObject(objectId) {
  const response = await fetch(`${MET_API}/${objectId}`);
  if (!response.ok) {
    throw new Error(`Met API ${objectId}: ${response.status}`);
  }
  const data = await response.json();
  if (!data.isPublicDomain) {
    throw new Error(`Met API ${objectId}: not public domain`);
  }
  const imageUrl = data.primaryImageSmall || data.primaryImage;
  if (!imageUrl) {
    throw new Error(`Met API ${objectId}: no primary image`);
  }
  return { imageUrl, api: data };
}

async function downloadImage(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}): ${url}`);
  }
  await pipeline(response.body, createWriteStream(destPath));
}

function rowToArtwork(curated, row, apiObject) {
  const metObjectId = Number(row["Object ID"]);
  const title = String(row.Title ?? "").trim();
  const artist = String(row["Artist Display Name"] ?? "Unknown artist").trim();
  const year = String(row["Object Date"] ?? "").trim() || "Unknown date";
  const creditLine = String(row["Credit Line"] ?? "").trim();
  const id = curated.id ?? slugify(title || `met-${metObjectId}`);

  const csvPublicDomain = parsePublicDomain(row["Is Public Domain"]);
  if (!csvPublicDomain) {
    console.warn(
      `Note: ${metObjectId} (${title}) has Is Public Domain=false in openaccess CSV; Met API confirms CC0.`,
    );
  }
  if (!apiObject.isPublicDomain) {
    throw new Error(`${metObjectId} (${title}): not public domain per Met Collection API`);
  }
  if (!isPainting(row)) {
    throw new Error(`${metObjectId} (${title}): not classified as a painting in openaccess CSV`);
  }

  return {
    id,
    title: title || apiObject.title || `Met object ${metObjectId}`,
    artist,
    year,
    imagePath: `/artworks/${id}.jpg`,
    credit: formatCredit(creditLine),
    description: curated.description,
    metObjectId,
  };
}

async function main() {
  const curated = JSON.parse(await readFile(CURATED_PATH, "utf8"));
  const wantedIds = curated.map((entry) => entry.metObjectId);

  if (downloadCsv || !(await fileExists(csvPath))) {
    if (!(await fileExists(csvPath))) {
      console.log(`CSV not found at ${csvPath}`);
    }
    await downloadCsvFile(csvPath);
  }

  console.log(`Reading openaccess metadata from ${csvPath}`);
  const { found, missing } = await loadRowsForIds(csvPath, wantedIds);
  if (missing.length > 0) {
    throw new Error(`Object IDs not found in MetObjects.csv: ${missing.join(", ")}`);
  }

  await mkdir(ARTWORKS_DIR, { recursive: true });

  const artworks = [];
  for (const entry of curated) {
    const row = found.get(entry.metObjectId);
    const { imageUrl, api } = await fetchMetObject(entry.metObjectId);
    const artwork = rowToArtwork(entry, row, api);
    artworks.push(artwork);

    const imagePath = join(ARTWORKS_DIR, `${artwork.id}.jpg`);
    if (skipImages && (await fileExists(imagePath))) {
      console.log(`Skipping image (exists): ${artwork.id}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }

    if (skipImages) {
      console.warn(`Warning: ${artwork.id}.jpg missing; run without --skip-images to download`);
      continue;
    }

    console.log(`Downloading image for ${artwork.title} (${entry.metObjectId})...`);
    await downloadImage(imageUrl, imagePath);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await writeFile(CATALOG_PATH, `${JSON.stringify(artworks, null, 2)}\n`, "utf8");

  console.log(`Wrote ${artworks.length} entries to ${CATALOG_PATH}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
