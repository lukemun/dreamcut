import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { imageCatalogSchema, type ImageCatalogEntry } from "@/lib/image-catalog/schema";
import { personalLibraryFilesRoot, personalLibraryRoot } from "@/lib/local-store/personal-library";

const EXTRACT_VERSION = "pixel-extract-v1";
const DERIVE_VERSION = "layout-derive-v1";
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const ZONE_IDS = ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"] as const;

type SourceEntry = {
  id: string;
  title: string;
  description: string;
  file: string;
  source: ImageCatalogEntry["source"];
};

type Pixel = { r: number; g: number; b: number; luminance: number; saturation: number };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number, places = 4) => Number(value.toFixed(places));
const rgbHex = (r: number, g: number, b: number) => `#${[r, g, b].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

function pixel(r: number, g: number, b: number): Pixel {
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  return { r, g, b, luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, saturation: high === 0 ? 0 : (high - low) / high };
}

function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function deviation(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

function probe(file: string) {
  const parsed = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file], { encoding: "utf8" })) as { streams?: Array<{ width?: number; height?: number }> };
  const width = parsed.streams?.[0]?.width;
  const height = parsed.streams?.[0]?.height;
  if (!width || !height) throw new Error(`Could not read image dimensions: ${file}`);
  return { width, height };
}

function samplePixels(file: string): Pixel[] {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: SAMPLE_WIDTH * SAMPLE_HEIGHT * 3 + 1024 });
  if (raw.length !== SAMPLE_WIDTH * SAMPLE_HEIGHT * 3) throw new Error(`Unexpected decoded pixel count for ${file}`);
  const pixels: Pixel[] = [];
  for (let offset = 0; offset < raw.length; offset += 3) pixels.push(pixel(raw[offset]!, raw[offset + 1]!, raw[offset + 2]!));
  return pixels;
}

function palette(pixels: Pixel[], count = 5): string[] {
  const working = pixels.filter((_, index) => index % 3 === 0);
  const seeds = [
    [...working].sort((a, b) => a.luminance - b.luminance)[0],
    [...working].sort((a, b) => b.luminance - a.luminance)[0],
    [...working].sort((a, b) => b.saturation - a.saturation)[0],
    [...working].sort((a, b) => (b.r - b.b) - (a.r - a.b))[0],
    [...working].sort((a, b) => (b.b - b.r) - (a.b - a.r))[0],
  ].filter((value): value is Pixel => Boolean(value));
  const centers = seeds.slice(0, count).map(({ r, g, b }) => ({ r, g, b }));
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const buckets = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const item of working) {
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const next = (item.r - center.r) ** 2 + (item.g - center.g) ** 2 + (item.b - center.b) ** 2;
        if (next < distance) { distance = next; nearest = index; }
      });
      const bucket = buckets[nearest]!;
      bucket.r += item.r; bucket.g += item.g; bucket.b += item.b; bucket.count += 1;
    }
    buckets.forEach((bucket, index) => {
      if (bucket.count > 0) centers[index] = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count };
    });
  }
  const populations = centers.map((center, index) => ({ center, count: working.filter((item) => {
    const distances = centers.map((candidate) => (item.r - candidate.r) ** 2 + (item.g - candidate.g) ** 2 + (item.b - candidate.b) ** 2);
    return distances.indexOf(Math.min(...distances)) === index;
  }).length }));
  return populations.sort((a, b) => b.count - a.count).map(({ center }) => rgbHex(center.r, center.g, center.b));
}

function analyzeZones(pixels: Pixel[]) {
  return ZONE_IDS.map((id, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x0 = Math.floor(column * SAMPLE_WIDTH / 3);
    const x1 = Math.floor((column + 1) * SAMPLE_WIDTH / 3);
    const y0 = Math.floor(row * SAMPLE_HEIGHT / 3);
    const y1 = Math.floor((row + 1) * SAMPLE_HEIGHT / 3);
    const values: Pixel[] = [];
    let edgeTotal = 0;
    let edgeCount = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const item = pixels[y * SAMPLE_WIDTH + x]!;
      values.push(item);
      if (x + 1 < x1) { edgeTotal += Math.abs(item.luminance - pixels[y * SAMPLE_WIDTH + x + 1]!.luminance); edgeCount += 1; }
      if (y + 1 < y1) { edgeTotal += Math.abs(item.luminance - pixels[(y + 1) * SAMPLE_WIDTH + x]!.luminance); edgeCount += 1; }
    }
    const luminance = mean(values.map((item) => item.luminance));
    const contrast = clamp(deviation(values.map((item) => item.luminance)) * 2.5);
    const edgeDensity = clamp((edgeTotal / Math.max(1, edgeCount)) * 5);
    const saturation = mean(values.map((item) => item.saturation));
    const quietScore = clamp(1 - edgeDensity * 0.7 - contrast * 0.3);
    return {
      id,
      rect: { x: round(column / 3), y: round(row / 3), width: round(1 / 3), height: round(1 / 3) },
      luminance: round(luminance), contrast: round(contrast), edge_density: round(edgeDensity), saturation: round(saturation), low_variation_score: round(quietScore),
    };
  });
}

function visualWeight(pixels: Pixel[]) {
  let total = 0; let weightedX = 0; let weightedY = 0;
  for (let y = 1; y < SAMPLE_HEIGHT - 1; y += 1) for (let x = 1; x < SAMPLE_WIDTH - 1; x += 1) {
    const here = pixels[y * SAMPLE_WIDTH + x]!.luminance;
    const energy = Math.abs(here - pixels[y * SAMPLE_WIDTH + x + 1]!.luminance) + Math.abs(here - pixels[(y + 1) * SAMPLE_WIDTH + x]!.luminance);
    total += energy; weightedX += energy * x / SAMPLE_WIDTH; weightedY += energy * y / SAMPLE_HEIGHT;
  }
  return total === 0 ? { x: 0.5, y: 0.5 } : { x: round(weightedX / total), y: round(weightedY / total) };
}

function analyze(entry: SourceEntry, mediaRoot: string) {
  const file = path.resolve(mediaRoot, entry.file);
  const bytes = fs.readFileSync(file);
  const { width, height } = probe(file);
  const pixels = samplePixels(file);
  const luminance = mean(pixels.map((item) => item.luminance));
  const saturation = mean(pixels.map((item) => item.saturation));
  const contrast = clamp(deviation(pixels.map((item) => item.luminance)) * 2.5);
  const warmth = clamp(mean(pixels.map((item) => (item.r - item.b) / 255)), -1, 1);
  const zones = analyzeZones(pixels);
  const lowVariationRegions = [...zones].sort((a, b) => b.low_variation_score - a.low_variation_score).slice(0, 3).map((zone) => ({
    zone: zone.id,
    rect: zone.rect,
    score: zone.low_variation_score,
    evidence: `Measured low-variation score ${zone.low_variation_score.toFixed(2)} from local edge density ${zone.edge_density.toFixed(2)} and contrast ${zone.contrast.toFixed(2)}.`,
  }));
  const divisor = gcd(width, height);
  return {
    ...entry,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width, height,
    aspect_ratio: `${width / divisor}:${height / divisor}`,
    orientation: width === height ? "square" as const : width > height ? "landscape" as const : "portrait" as const,
    layout: { visual_weight: visualWeight(pixels), zones, low_variation_regions: lowVariationRegions },
    colors: { palette_hex: palette(pixels), average_luminance: round(luminance), contrast: round(contrast), saturation: round(saturation), warmth: round(warmth), tone: luminance < 0.36 ? "dark" as const : luminance > 0.66 ? "light" as const : "mid" as const },
    analysis: { extract_version: EXTRACT_VERSION, derive_version: DERIVE_VERSION, sample_width: SAMPLE_WIDTH, sample_height: SAMPLE_HEIGHT, analyzed_at: new Date().toISOString() },
  };
}

function main() {
  // --personal analyzes the creator's profile library (sources.json + files/) instead of the shared catalog.
  const personal = process.argv.includes("--personal");
  const root = personal ? personalLibraryRoot("images") : path.resolve(process.cwd(), "image-catalog");
  const mediaRoot = personal ? personalLibraryFilesRoot("images") : path.join(root, "images");
  const sourcePath = path.join(root, "sources.json");
  const sources = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as { schema_version: 1; images: SourceEntry[] };
  const selectedId = process.argv.find((argument) => argument.startsWith("--id="))?.slice(5);
  const previousPath = path.join(root, "catalog.json");
  const previousParsed = fs.existsSync(previousPath)
    ? imageCatalogSchema.safeParse(JSON.parse(fs.readFileSync(previousPath, "utf8")))
    : null;
  const previous = previousParsed?.success ? previousParsed.data : { schema_version: 1 as const, images: [] };
  const selected = selectedId ? sources.images.filter((entry) => entry.id === selectedId) : sources.images;
  if (selectedId && selected.length === 0) throw new Error(`Unknown image id: ${selectedId}`);
  const byId = new Map(previous.images.map((entry) => [entry.id, entry]));
  selected.forEach((entry) => byId.set(entry.id, analyze(entry, mediaRoot)));
  const catalog = imageCatalogSchema.parse({ schema_version: 1, images: sources.images.map((entry) => byId.get(entry.id)).filter(Boolean) });
  fs.writeFileSync(previousPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({ catalog: previousPath, analyzed: selected.map((entry) => entry.id), image_count: catalog.images.length }, null, 2));
}

main();
