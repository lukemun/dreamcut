import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { createRenderAssetHasher } from "../local-store/render-assets";
import type { PreparedPreviewInput } from "../timeline/prepared-preview";
import { admitGpuScene, evaluateGpuScene } from "../gpu-preview/scene";

/** Two seconds at 30 fps; the same grid as prepared preview sections. */
const PREVIEW_SECTION_FRAMES = 60;

/**
 * Export chunk reuse. Every export splits into fixed 60-frame chunks. A chunk's picture is
 * fingerprinted by what the GPU renderer evaluates for its frames, the bytes of the files they
 * read, the renderer code and the export settings (size, frame rate, bitrate); its sound by
 * the clips that can sound in it. A re-export with the same settings renders only the chunks
 * whose fingerprint changed and copies the rest. Preview proxies never take part: export always draws full-quality sources,
 * so the preview quality a person edits at cannot make an export reuse lower-quality pixels.
 *
 * Storage: one folder per project (preprocess/export-chunks), holding only the chunks of that
 * project's latest export at each setting; each successful export removes chunks it did not
 * use. A chunk that cannot be fingerprinted (an asset the hasher cannot verify) is always
 * rendered and never cached.
 */
export const EXPORT_CHUNK_FRAMES = PREVIEW_SECTION_FRAMES;
const VERSION = 1;

export type ExportChunk = { range: [number, number]; pictureKey: string | null; audioKey: string | null };
export type ExportPictureSettings = { width: number; height: number; fps: number; bitrate: number; codec: string };

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Renderer code changes invalidate chunks. Source files when present (development), else the package version. */
let codeVersion: string | null = null;
export function exportRendererVersion(): string {
  if (codeVersion) return codeVersion;
  const hash = createHash("sha256");
  const roots = ["src/lib/gpu-preview", "src/lib/frame-runtime", "src/lib/remotion", "src/lib/render", "src/lib/timeline", "src/app/render-frame"].map((root) => path.resolve(root));
  const walk = (entry: string) => {
    let stat: fs.Stats;
    try { stat = fs.statSync(entry); } catch { return; }
    if (stat.isDirectory()) { for (const child of fs.readdirSync(entry).sort()) walk(path.join(entry, child)); return; }
    if (/\.(ts|tsx|glsl|wgsl)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) hash.update(`${entry}\0${stat.size}\0${stat.mtimeMs}\0`);
  };
  roots.forEach(walk);
  try { hash.update(JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).version ?? ""); } catch { /* Packaged builds without package.json keep the source walk. */ }
  return (codeVersion = hash.digest("hex"));
}

const hashers = new Map<string, ReturnType<typeof createRenderAssetHasher>>();
/** Bookkeeping fields that never reach a picture or a sound. */
const volatile = (key: string, value: unknown) => key === "created_at" || key === "updated_at" ? undefined : value;
const SCOPE = "export-chunks";

/**
 * The chunks of [first, last] with their picture and sound fingerprints (null: not reusable).
 * Picture: the GPU renderer's own evaluated scene for every frame of the chunk (each visible
 * layer with its element, resolved geometry, effects and source time) plus the bytes of every
 * file those scenes read. Identical scenes and files draw identical pixels, and an edit
 * elsewhere in the timeline does not touch them. Sound: every clip that can sound within a
 * second of the chunk, plus its files.
 */
export function exportChunks(input: PreparedPreviewInput & { rasterScale?: number }, range: [number, number], origin: string, picture: ExportPictureSettings): ExportChunk[] {
  const version = exportRendererVersion();
  const hasher = hashers.get(version) ?? createRenderAssetHasher(`export-chunks-v${VERSION}:${version}`);
  hashers.set(version, hasher);
  // Absolute file-system paths (provenance receipts, analysis outputs) are never fetched while
  // drawing; they stay in the scene fingerprint as text but are not hashed as render files.
  const local = (value: unknown): unknown => Array.isArray(value) ? value.map(local)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, local(item)]))
    : typeof value === "string" && path.isAbsolute(value) && !value.startsWith("/api/") && !fs.existsSync(path.join(path.resolve("public"), value)) && fs.existsSync(value) ? null
    : value;
  const assets = (value: unknown) => { try { return hasher(local(value), origin); } catch { return null; } };
  const admission = admitGpuScene(input.inputProps.elements, SCOPE, "canvaskit", true);
  const laneOrder = input.inputProps.laneOrderKeys ?? [];
  const audible = input.inputProps.elements.filter((element) => element.type !== "caption_text" && element.type !== "still" && element.type !== "shape");
  const chunks: ExportChunk[] = [];
  for (let first = range[0]; first <= range[1]; first += EXPORT_CHUNK_FRAMES) {
    const last = Math.min(range[1], first + EXPORT_CHUNK_FRAMES - 1);
    let pictureKey: string | null = null;
    if (admission.supported) {
      const scenes: string[] = [];
      for (let frame = first; frame <= last; frame += 1) {
        scenes.push(JSON.stringify(evaluateGpuScene(admission.elements, laneOrder, frame, input.width, input.height, SCOPE, input.fps, true, input.rasterScale ?? 1), volatile));
      }
      const files = assets(scenes.map((scene) => JSON.parse(scene)));
      if (files) pictureKey = digest({ version: VERSION, code: version, picture, range: [first, last], scenes: createHash("sha256").update(scenes.join("\n")).digest("hex"), files });
    }
    const window = [(first - input.fps) / input.fps, (last + 1 + input.fps) / input.fps];
    const sounding = audible.filter((element) => element.timeline_start < window[1]! && element.timeline_start + element.duration > window[0]!)
      .map((element) => JSON.parse(JSON.stringify(element, volatile)));
    const soundFiles = assets(sounding);
    chunks.push({ range: [first, last], pictureKey,
      audioKey: soundFiles ? digest({ version: VERSION, code: version, fps: input.fps, range: [first, last], elements: sounding, files: soundFiles }) : null });
  }
  return chunks;
}

/** Content-checked chunk files: a receipt beside each holds its SHA-256, written last. */
export class ExportChunkStore {
  constructor(readonly directory: string) { fs.mkdirSync(directory, { recursive: true }); }
  file(key: string, extension: string) { return path.join(this.directory, `${key}.${extension}`); }
  valid(file: string): boolean {
    try { return JSON.parse(fs.readFileSync(`${file}.json`, "utf8")).sha256 === createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
    catch { return false; }
  }
  /** Move a finished temporary file into place; a crash between steps leaves no receipt, so no reuse. */
  commit(temporary: string, file: string) {
    const receipt = JSON.stringify({ sha256: createHash("sha256").update(fs.readFileSync(temporary)).digest("hex") });
    fs.renameSync(temporary, file);
    const pending = path.join(this.directory, `.${randomUUID()}.json`);
    fs.writeFileSync(pending, receipt);
    fs.renameSync(pending, `${file}.json`);
  }
  /** After a successful export: keep only what it used. */
  retain(used: ReadonlySet<string>) {
    for (const name of fs.readdirSync(this.directory)) {
      const file = path.join(this.directory, name), base = name.endsWith(".json") ? file.slice(0, -5) : file;
      if (!used.has(base) && !used.has(file)) fs.rmSync(file, { force: true });
    }
  }
}
