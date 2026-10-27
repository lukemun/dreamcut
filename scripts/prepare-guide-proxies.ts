/** Prepare small, Git-portable Guide samples without changing project timelines. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { effectCatalogSchema } from "../src/lib/effects/recipes";

const root = process.cwd();
const folder = path.join(root, "public/guide/effects/catalog");
const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const catalog = effectCatalogSchema.parse(JSON.parse(fs.readFileSync("docs/effects/catalog.json", "utf8")));
const samples = catalog.entries.filter(e => e.recipe.status !== "candidate" && !["FX-08", "FX-SCRATCHPAD"].includes(e.catalog_id) && e.recipe.recreation.kind === "video");
// Poster frames are chosen by looking at the proxy: the effect visibly happening, never the first frame.
const posterFrames: Record<string, number> = { "FX-FILM-BURN": 48, "FX-MASK-GLITCH": 55, "FX-CAMERA-FLASH": 58, "FX-BLACKOUT": 57, "FX-WHIP-PAN": 49 };
fs.mkdirSync(folder, { recursive: true });
const entries = samples.map(e => {
  const source = e.recipe.recreation;
  const sourceFile = path.resolve("docs/effects", source.path);
  if (hash(sourceFile) !== source.sha256) throw new Error(`Source hash mismatch: ${e.catalog_id}`);
  const file = `${e.catalog_id.toLowerCase()}-${source.sha256.slice(0, 12)}-640-v1.mp4`;
  const output = path.join(folder, file);
  if (!fs.existsSync(output)) execFileSync("ffmpeg", ["-v", "error", "-i", sourceFile, "-vf", "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2:in_range=tv:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-r", "30", "-c:v", "libx264", "-profile:v", "main", "-crf", "24", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-an", output]);
  const probe = (p: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration,pix_fmt", "-of", "json", p], { encoding: "utf8" })).streams[0];
  const full = probe(sourceFile); const preview = probe(output);
  execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
  if (Math.max(preview.width, preview.height) > 640 || Math.abs(preview.width / preview.height - full.width / full.height) > 2 / Math.min(preview.width, preview.height) || preview.r_frame_rate !== "30/1" || preview.nb_frames !== full.nb_frames || Math.abs(Number(preview.duration) - Number(full.duration)) > 1 / 30) throw new Error(`Invalid proxy: ${e.catalog_id}`);
  const frame = posterFrames[e.catalog_id];
  const posterFile = frame === undefined ? undefined : file.replace(/\.mp4$/, `-poster-f${frame}.jpg`);
  if (posterFile && !fs.existsSync(path.join(folder, posterFile))) execFileSync("ffmpeg", ["-v", "error", "-i", output, "-vf", `select=eq(n\\,${frame})`, "-fps_mode", "passthrough", "-frames:v", "1", "-q:v", "3", path.join(folder, posterFile)]);
  const poster = posterFile ? { file: posterFile, sha256: hash(path.join(folder, posterFile)), frame } : undefined;
  return { catalog_id: e.catalog_id, source_path: `docs/effects/${source.path}`, source_sha256: source.sha256, file, sha256: hash(output), bytes: fs.statSync(output).size, width: preview.width, height: preview.height, fps: 30, frames: Number(preview.nb_frames), duration_seconds: Number(preview.duration), source_time_mapping: "proxy_seconds = sample_seconds", audio: "silent", credit: source.credit, rights: source.rights, ...(poster ? { poster } : {}) };
});
fs.writeFileSync(path.join(folder, "proxies.json"), JSON.stringify({ version: 1, recipe: "H.264 Main / yuv420p / limited Rec.709 / 640px long edge / 30fps / CRF24 / silent / faststart", entries }, null, 2) + "\n");
console.log(`Prepared and decoded ${entries.length} Guide proxies (${entries.reduce((n, e) => n + e.bytes, 0)} bytes).`);
