import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { imageCatalogFileExists, readImageCatalog, readSharedImageCatalog, resolveImageCatalogFile } from "./image-catalog";
import { musicCatalogFileExists, musicCatalogPreviewDir, readMusicCatalog } from "./music-catalog";
import { resolvePersonalLibraryFile } from "./personal-library";
import { readSfxCatalog, resolveSfxCatalogFile } from "./sfx-catalog";
import { readVisualCatalog, visualCatalogMediaRoot } from "./visual-catalog";
import { searchSfxCatalog } from "@/lib/sfx-catalog/search";

const KEYS = ["DREAMCUT_PROFILE_DIR", "TIMELINE_IMAGE_CATALOG_DIR", "TIMELINE_VISUAL_CATALOG_DIR", "TIMELINE_MUSIC_CATALOG_DIR", "TIMELINE_SFX_CATALOG_DIR"] as const;

function withLibraries(run: (root: string) => void) {
  return () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-library-"));
    const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    process.env.TIMELINE_IMAGE_CATALOG_DIR = path.join(root, "catalogs/images");
    process.env.TIMELINE_VISUAL_CATALOG_DIR = path.join(root, "catalogs/visual");
    process.env.TIMELINE_MUSIC_CATALOG_DIR = path.join(root, "catalogs/music");
    process.env.TIMELINE_SFX_CATALOG_DIR = path.join(root, "catalogs/sfx");
    try { run(root); } finally {
      for (const key of KEYS) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

const zone = (id: string) => ({ id, rect: { x: 0, y: 0, width: 0.3333, height: 0.3333 }, luminance: 0.5, contrast: 0.5, edge_density: 0.5, saturation: 0.5, low_variation_score: 0.5 });
const image = (id: string, file: string) => ({
  id, title: id, description: "A picture.", file, sha256: "a".repeat(64), width: 10, height: 10, aspect_ratio: "1:1", orientation: "square",
  source: { provider: "Test", asset_url: "https://example.com/a", acquisition_url: "https://example.com/a.png", acquisition_notes: "Test fixture.", creator: "Test", license_name: "Test", license_url: "https://example.com/l", source_status: "owned", downloaded_at: "2026-10-12T00:00:00.000Z" },
  layout: { visual_weight: { x: 0.5, y: 0.5 }, zones: ["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"].map(zone), low_variation_regions: [] },
  colors: { palette_hex: ["#000000"], average_luminance: 0.5, contrast: 0.5, saturation: 0.5, warmth: 0, tone: "mid" },
  analysis: { extract_version: "t", derive_version: "t", sample_width: 1, sample_height: 1, analyzed_at: "2026-10-12T00:00:00.000Z" },
});
const sound = (id: string, file: string) => ({
  id, title: `Whoosh ${id}`, category: "whoosh", tags: ["whoosh"], file, source_status: "owned", duration_seconds: 1,
  sample_rate_hz: 48000, channels: 2, source_provider: "Test", source_url: "https://example.com/s", acquired_at: "2026-10-12",
});

test("a fresh checkout without a profile library reads the shared catalogs unchanged", withLibraries((root) => {
  write(path.join(root, "catalogs/images", "catalog.json"), { schema_version: 1, images: [image("stock", "owned/stock.png")] });
  assert.deepEqual(readImageCatalog().images.map((entry) => [entry.id, entry.personal, entry.file]), [["stock", undefined, "owned/stock.png"]]);
  assert.deepEqual(readVisualCatalog().assets, []);
  assert.deepEqual(readMusicCatalog().tracks, []);
}));

test("personal entries merge after shared ones, marked personal and resolved inside the profile library", withLibraries((root) => {
  const profile = path.join(root, "profile");
  write(path.join(root, "catalogs/images", "catalog.json"), { schema_version: 1, images: [image("stock", "owned/stock.png"), image("same", "owned/same.png")] });
  write(path.join(profile, "library", "images", "catalog.json"), { schema_version: 1, images: [image("mine", "owned/mine.png"), image("same", "owned/other.png")] });
  write(path.join(profile, "library", "images", "files", "owned", "mine.png"), "png");
  const merged = readImageCatalog().images;
  assert.deepEqual(merged.map((entry) => [entry.id, entry.personal ?? false, entry.file]), [
    ["stock", false, "owned/stock.png"], ["same", false, "owned/same.png"], ["mine", true, "_personal/owned/mine.png"],
  ]);
  assert.equal(readSharedImageCatalog().images.length, 2);
  assert.equal(resolveImageCatalogFile("_personal/owned/mine.png"), path.join(profile, "library", "images", "files", "owned", "mine.png"));
  assert.equal(imageCatalogFileExists("_personal/owned/mine.png"), true);
  assert.throws(() => resolveImageCatalogFile("_personal/../../../secret.png"), /Invalid personal library file path/);
  assert.throws(() => resolvePersonalLibraryFile("images", "owned/mine.png"), /Not a personal library file/);
  assert.equal(visualCatalogMediaRoot("_personal/owned/x.png"), path.join(profile, "library", "visuals", "files"));
  assert.equal(visualCatalogMediaRoot("owned/x.png"), path.join(root, "catalogs/visual", "media"));
}));

test("personal music versions and sounds use the profile library and are searchable as personal", withLibraries((root) => {
  const profile = path.join(root, "profile");
  write(path.join(profile, "library", "music", "catalog.json"), { schema_version: 1, tracks: [{ id: "theme", title: "Theme", versions: [{ id: "local", label: "Local", file: "owned/theme.mp3", source_status: "owned" }] }] });
  write(path.join(profile, "library", "music", "files", "owned", "theme.mp3"), "mp3");
  const [track] = readMusicCatalog().tracks;
  assert.equal(track?.personal, true);
  assert.equal(track?.versions[0]?.file, "_personal/owned/theme.mp3");
  assert.equal(musicCatalogFileExists("_personal/owned/theme.mp3"), true);
  assert.equal(musicCatalogPreviewDir("_personal/owned/theme.mp3"), path.join(profile, "library", "music", "previews"));

  write(path.join(root, "catalogs/sfx", "catalog.json"), { schema_version: 1, sound_effects: [sound("shared", "owned/shared.wav")] });
  write(path.join(profile, "library", "sfx", "catalog.json"), { schema_version: 1, sound_effects: [sound("mine", "owned/mine.wav"), { ...sound("reel", "owned/reel.wav"), category: "collection" }] });
  const effects = readSfxCatalog().sound_effects;
  assert.deepEqual(effects.map((effect) => effect.id), ["shared", "mine"]);
  assert.equal(resolveSfxCatalogFile("_personal/owned/mine.wav"), path.join(profile, "library", "sfx", "files", "owned", "mine.wav"));
  const hits = searchSfxCatalog(effects, { query: "whoosh" });
  assert.deepEqual(hits.map((hit) => [hit.id, hit.personal ?? false]).sort(), [["mine", true], ["shared", false]]);
  assert.match(hits.find((hit) => hit.id === "mine")!.source_url, /\/api\/sfx-catalog\/media\/_personal\/owned\/mine\.wav$/);
}));

test("an invalid personal catalog names its file", withLibraries((root) => {
  write(path.join(root, "profile", "library", "images", "catalog.json"), { schema_version: 1, images: [{ id: "broken" }] });
  assert.throws(() => readImageCatalog(), /Invalid image catalog at .*library\/images\/catalog\.json/);
}));
