#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = process.cwd();
const manifestPath = resolve(repoRoot, process.argv[2] ?? "catalogs/sfx/source-manifests/youtube-sfx-compilations-2026-09-16.json");
const catalogPath = resolve(repoRoot, "catalogs/sfx/catalog.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const managedSourceUrls = new Set(manifest.sources.map((source) => source.url));
const retainedClipKeys = new Set(manifest.sources.flatMap((source) => source.clips.map(([clipId]) => `${source.url}\0${clipId}.wav`)));
catalog.sound_effects = catalog.sound_effects.filter((entry) => entry.category === "collection" || !managedSourceUrls.has(entry.source_url) || retainedClipKeys.has(`${entry.source_url}\0${entry.file.split("/").at(-1)}`));
const entriesBySourceAndFile = new Map(catalog.sound_effects.map((entry) => [`${entry.source_url}\0${entry.file.split("/").at(-1)}`, entry]));
const recutFiles = [];

for (const source of manifest.sources) {
  const masterPath = resolve(dirname(manifestPath), source.master_file);
  for (const [clipId, , startSeconds, endSeconds] of source.clips) {
    if (!(Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds > startSeconds)) {
      throw new Error(`Invalid source window for ${source.id}/${clipId}`);
    }
    const entry = entriesBySourceAndFile.get(`${source.url}\0${clipId}.wav`);
    if (!entry) throw new Error(`Catalog entry missing for ${source.id}/${clipId}`);
    const outputPath = resolve(repoRoot, "catalogs/sfx/audio", entry.file);
    execFileSync("ffmpeg", [
      "-loglevel", "error", "-y", "-i", masterPath,
      "-af", `atrim=start=${startSeconds}:end=${endSeconds},asetpts=PTS-STARTPTS`,
      "-c:a", "pcm_s16le", outputPath,
    ]);
    entry.clearance_note = `User confirmed production use on 2026-09-16. Frame-audited cut from source window ${startSeconds.toFixed(6)}–${endSeconds.toFixed(6)} seconds; see source-manifests/youtube-sfx-compilations-2026-09-16.json.`;
    recutFiles.push({ entry, outputPath });
  }
}

const analysisOutput = execFileSync(resolve(repoRoot, ".venv-music/bin/python"), [
  resolve(repoRoot, "scripts/sfx-analyze.py"),
  ...recutFiles.map(({ outputPath }) => outputPath),
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const analyses = JSON.parse(analysisOutput);

for (const { entry, outputPath } of recutFiles) {
  const result = analyses[outputPath];
  if (!result) throw new Error(`Analysis missing for ${outputPath}`);
  if (result.analysis?.audibility_status !== "audible") {
    throw new Error(`Audibility gate failed for ${entry.title}: ${result.analysis?.audibility_status ?? "unknown"} (${result.analysis?.audible_fraction ?? "?"} active fraction)`);
  }
  Object.assign(entry, result);
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({ manifest: manifestPath, recut: recutFiles.length, catalog: catalogPath }, null, 2));
