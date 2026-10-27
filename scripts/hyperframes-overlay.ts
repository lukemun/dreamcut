import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANIFEST_FILE_NAME,
  applyCanvasSizeToHtml, applyDurationToHtml,
  authoredSegmentDurations,
  canvasSizeForValues,
  compositionCoverage,
  injectRuntimeIntoHtml,
  isWorldLayer,
  manifestSha256,
  parseCompositionManifest,
  rendersOpaque,
  resolveManifestValues,
  singleObjectProblems,
  wholeTemplateGap,
  validateCompositionSources,
  valuesSha256,
  type CompositionManifest,
  type ManifestValues,
} from "@/lib/hyperframes/composition-manifest";
import type { SeparableObject } from "@/lib/hyperframes/composition-objects";
import { canvasTrackOriginForFrame, type SourceCanvasTrack } from "@/lib/timeline/source-projection";
import { LOOKS_FILE, buildLookBundle, lookIdFromValues, usesSharedLooks, writeLookBundle } from "@/lib/hyperframes/look-bundle";
import { pieceLookProblem } from "@/lib/hyperframes/piece-types";
import {
  appendMotionAuditEvent,
  readMotionAudit,
  motionAuditContextFromArgs,
  recordRevisionIfChanged,
} from "@/lib/local-store/motion-audit";

import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { resolveTiming } from "@/lib/hyperframes/composition-timing";
import {
  NO_VALUES_KEY,
  candidateReceiptPath,
  findCandidateRender,
  listCandidateRenders,
  parseCompositionSourceSpec,
  writeCompositionSource,
} from "@/lib/local-store/hyperframes-candidates";
import {
  fingerprintHyperframesSource,
  hyperframesSourceFileHashes,
  readHyperframesTextSources,
  validateHyperframesOverlayReceipt,
  type HyperframesOverlayReceipt,
} from "@/lib/local-store/hyperframes-overlays";
import {
  isSafeHyperframesCompositionId,
  projectDir,
  projectExists,
  projectHyperframesCompositionDir,
  projectHyperframesDir,
  projectHyperframesReceiptPath,
} from "@/lib/local-store/paths";
import { workerCommand } from "@/lib/worker-command";

type Command = "scaffold" | "check" | "preview" | "render" | "prepare" | "density";
type Resolution = "landscape" | "portrait" | "square";

function usage(): never {
  throw new Error([
    "Usage:",
    "  pnpm hyperframes-overlay scaffold <project-id> <composition-id> [--resolution portrait|landscape|square]",
    "  pnpm hyperframes-overlay check <project-id> <composition-id>",
    "  pnpm hyperframes-overlay preview <project-id> <composition-id>",
    "  pnpm hyperframes-overlay render <project-id> <composition-id> --approved [--values '<json>'] [--rating 1-5]",
    "  pnpm hyperframes-overlay prepare <project-id> <composition-id> [--spec @spec.json] [--values '<json>'] [--json]",
    "    Writes agent source files (optional), checks, and renders a candidate for a proposal to review.",
    "  pnpm hyperframes-overlay density <project-id> <composition-id> --render <media path> [--json]",
    "    Renders that exact render again at 2x pixel density for a 2K/4K export (cached beside it).",
    "",
    "Audit options (all commands): --agent <name> --model <id> --effort <level>",
    "  --feedback-ids <id,id> --proposal-id <id> --request <text> --approved-by editor|chat",
    "Without --agent, the action is recorded as a person in the editor.",
  ].join("\n"));
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function parseArgs(argv: string[]) {
  const command = argv[0] as Command | undefined;
  const projectId = argv[1];
  const compositionId = argv[2];
  if (!command || !["scaffold", "check", "preview", "render", "prepare", "density"].includes(command)
    || !projectId || !compositionId || !isSafeHyperframesCompositionId(compositionId)) {
    usage();
  }
  if (!projectExists(projectId)) throw new Error(`Timeline project does not exist: ${projectId}`);
  const requestedResolution = optionValue(argv, "--resolution") ?? "portrait";
  if (!["landscape", "portrait", "square"].includes(requestedResolution)) {
    throw new Error(`Unsupported resolution: ${requestedResolution}`);
  }
  const ratingText = optionValue(argv, "--rating");
  const rating = ratingText == null ? null : Number(ratingText);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("--rating must be a whole number from 1 to 5");
  }
  const valuesText = optionValue(argv, "--values");
  let values: unknown;
  if (valuesText != null) {
    try {
      values = JSON.parse(valuesText.startsWith("@") ? fs.readFileSync(valuesText.slice(1), "utf8") : valuesText);
    } catch (error) {
      throw new Error(`--values must be JSON or @file.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const approvedBy = optionValue(argv, "--approved-by") ?? "editor";
  if (approvedBy !== "editor" && approvedBy !== "chat") throw new Error("--approved-by must be editor or chat");
  return {
    command,
    projectId,
    compositionId,
    resolution: requestedResolution as Resolution,
    approved: argv.includes("--approved"),
    json: argv.includes("--json"),
    specPath: optionValue(argv, "--spec"),
    renderPath: optionValue(argv, "--render"),
    expectFingerprint: optionValue(argv, "--expect-fingerprint"),
    approvedBy: approvedBy as "editor" | "chat",
    rating,
    values,
    ...motionAuditContextFromArgs(argv),
  };
}

type Args = ReturnType<typeof parseArgs>;

type LoadedManifest = { manifest: CompositionManifest; sha256: string } | null;

function loadManifest(source: string): LoadedManifest {
  const manifestPath = path.join(source, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) return null;
  const text = fs.readFileSync(manifestPath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Animation controls file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { manifest: parseCompositionManifest(raw), sha256: manifestSha256(text) };
}

function runHyperframes(cwd: string, args: string[], capture = false): string {
  const cli = createRequire(import.meta.url).resolve("hyperframes/bin/hyperframes.mjs");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_TELEMETRY: "1" },
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw new Error(`Animation runtime could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `\n${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}` : "";
    throw new Error(`HyperFrames command failed: ${args.join(" ")}${detail}`);
  }
  return capture ? result.stdout.trim() : "";
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type FfprobeJson = {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    pix_fmt?: string;
    tags?: { alpha_mode?: string; ALPHA_MODE?: string };
  }>;
  format?: { duration?: string };
};

function parseFrameRate(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split("/").map(Number);
  const numerator = parts[0] ?? 0;
  const denominator = parts[1] ?? 1;
  return numerator !== 0 && denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Crop a transparent render to a window that follows its drawing: as large as the largest area any
 * one frame draws in, moved frame by frame along a path of a few straight segments
 * (SourceCanvasTrack). Worth it when the window keeps at most CROP_KEEPS_AT_MOST of the frame.
 * Rewrites the file in place; returns the track, or null when the render was left whole.
 */
const CROP_KEEPS_AT_MOST = 0.8;
const CROP_MARGIN_PX = 2;
/** How far the simplified path may stray from each frame's own window; the window is this much larger. */
const CROP_PATH_TOLERANCE_PX = 12;
function cropToContent(filePath: string, probe: { width: number; height: number; codec: string; fps: number }): SourceCanvasTrack | null {
  const decoder = probe.codec === "vp9" ? ["-c:v", "libvpx-vp9"] : [];
  // reset=1: each frame reports its own drawn area.
  const detect = spawnSync("ffmpeg", ["-hide_banner", ...decoder, "-i", filePath,
    "-vf", "alphaextract,cropdetect=limit=0:round=2:reset=1:skip=0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (detect.status !== 0) return null;
  const boxes: Array<{ t: number; x0: number; y0: number; x1: number; y1: number } | null> = [];
  for (const line of (detect.stderr ?? "").split("\n")) {
    const m = /x1:(-?\d+) x2:(-?\d+) y1:(-?\d+) y2:(-?\d+) .*?pts:(-?\d+) t:([\d.]+)/.exec(line);
    if (!m) continue;
    const [x1, x2, y1, y2] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
    // Frame times come from the frame number: the millisecond timestamps can sit just before a frame.
    const t = boxes.length / probe.fps;
    boxes.push(x2 >= x1 && y2 >= y1 ? { t, x0: x1, y0: y1, x1: x2 + 1, y1: y2 + 1 } : null);
  }
  const drawn = boxes.filter((box): box is NonNullable<typeof box> => box != null);
  if (drawn.length === 0) return null;
  const evenUp = (value: number, limit: number) => Math.min(limit - (limit % 2), value + (value % 2));
  const pad = (CROP_MARGIN_PX + CROP_PATH_TOLERANCE_PX) * 2;
  const width = evenUp(Math.max(...drawn.map((box) => box.x1 - box.x0)) + pad, probe.width);
  const height = evenUp(Math.max(...drawn.map((box) => box.y1 - box.y0)) + pad, probe.height);
  if (width * height > probe.width * probe.height * CROP_KEEPS_AT_MOST) return null;
  // Each frame's ideal window is centred on its drawing; empty frames hold the nearest one.
  const ideal = drawn.map((box) => ({ t: box.t,
    x: Math.min(probe.width - width, Math.max(0, (box.x0 + box.x1 - width) / 2)),
    y: Math.min(probe.height - height, Math.max(0, (box.y0 + box.y1 - height) / 2)) }));
  let keys = simplifyPath(ideal, CROP_PATH_TOLERANCE_PX);
  const trackOf = (points: typeof keys): SourceCanvasTrack => ({ canvas: { width: probe.width, height: probe.height }, size: { width, height }, fps: probe.fps,
    keys: points.map((key) => ({ t: Math.round(key.t * 1e6) / 1e6, x: Math.round(key.x), y: Math.round(key.y) })) });
  // Every frame's drawing must sit inside the window the track puts there. A frame that strays (its
  // drawing pressed against the canvas edge leaves the window no slack) becomes a point of the path.
  let track = trackOf(keys);
  for (let pass = 0; pass <= drawn.length; pass++) {
    const stray = drawn.findIndex((box) => {
      const o = canvasTrackOriginForFrame(track, Math.round(box.t * probe.fps));
      return box.x0 < o.x || box.y0 < o.y || box.x1 > o.x + width || box.y1 > o.y + height;
    });
    if (stray < 0) break;
    if (pass === drawn.length) return null;
    keys = [...keys.filter((key) => key.t !== ideal[stray]!.t), ideal[stray]!].sort((p, q) => p.t - q.t);
    track = trackOf(keys);
  }
  // Move the crop to each frame's window: one command per frame, at that frame's time.
  const frameTimes = boxes.map((_, index) => index / probe.fps);
  // Each command is timed half a frame early: frame timestamps are rounded to milliseconds, so a
  // command at the exact frame time can land just after its frame.
  const commands = frameTimes.map((t, frame) => { const o = canvasTrackOriginForFrame(track, frame); return `${Math.max(0, t - 0.5 / probe.fps).toFixed(6)} crop x ${o.x}, crop y ${o.y};`; }).join("\n");
  const commandFile = `${filePath}.crop.cmd`, cropped = `${filePath}.crop.webm`;
  fs.writeFileSync(commandFile, commands + "\n");
  const first = canvasTrackOriginForFrame(track, 0);
  const encode = spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...decoder, "-i", filePath,
    "-vf", `sendcmd=f=${commandFile},crop=${width}:${height}:${first.x}:${first.y}:exact=1`,
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "18", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
    "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1", "-an", cropped], { encoding: "utf8" });
  fs.rmSync(commandFile, { force: true });
  if (encode.status !== 0) { fs.rmSync(cropped, { force: true }); throw new Error(`Cropping the render failed: ${encode.stderr}`); }
  fs.renameSync(cropped, filePath);
  return track;
}

/** Fewest points whose straight segments stay within `tolerance` pixels of every point (Ramer-Douglas-Peucker). */
function simplifyPath(points: Array<{ t: number; x: number; y: number }>, tolerance: number): Array<{ t: number; x: number; y: number }> {
  if (points.length <= 2) return points;
  const a = points[0]!, b = points.at(-1)!;
  let worst = -1, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!, f = (p.t - a.t) / Math.max(1e-9, b.t - a.t);
    const off = Math.max(Math.abs(p.x - (a.x + (b.x - a.x) * f)), Math.abs(p.y - (a.y + (b.y - a.y) * f)));
    if (off > worst) { worst = off; index = i; }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplifyPath(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyPath(points.slice(index), tolerance)];
}

function probeOutput(filePath: string, expectOpaque = false) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt:stream_tags=alpha_mode",
    "-of", "json",
    filePath,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout) as FfprobeJson;
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(parsed.format?.duration);
  const alphaMode = video?.tags?.alpha_mode ?? video?.tags?.ALPHA_MODE;
  if (!video || !Number.isFinite(duration) || duration <= 0 || !video.width || !video.height) {
    throw new Error("Rendered HyperFrames overlay is missing valid video metadata");
  }
  if (alphaMode !== "1" && !/^(?:yuva|gbrap|rgba|argb|bgra|abgr|ya)/i.test(video.pix_fmt ?? "")) {
    throw new Error("Rendered WebM has no alpha channel; make the HyperFrames composition background transparent");
  }
  const alphaProbe = spawnSync("ffmpeg", [
    "-v", "error",
    ...(video.codec_name === "vp9" ? ["-c:v", "libvpx-vp9"] : []),
    "-ss", String(Math.min(duration / 2, Math.max(0, duration - 0.01))),
    "-i", filePath,
    "-frames:v", "1",
    "-vf", "alphaextract,signalstats,metadata=print:file=-",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const minimumAlpha = Number(alphaProbe.stdout.match(/lavfi\.signalstats\.YMIN=(\d+)/)?.[1]);
  // A full-screen graphic (its controls file's opaque switch is on) legitimately has no transparent pixel.
  if (alphaProbe.status !== 0 || !Number.isFinite(minimumAlpha) || (minimumAlpha >= 255 && !expectOpaque)) {
    throw new Error("Rendered WebM declares alpha but decoded pixels are fully opaque; make the HyperFrames composition background transparent");
  }
  return {
    duration,
    width: video.width,
    height: video.height,
    fps: parseFrameRate(video.r_frame_rate),
    codec: video.codec_name ?? "unknown",
    pixelFormat: video.pix_fmt ?? null,
  };
}

function scaffold(projectId: string, compositionId: string, resolution: Resolution) {
  const parent = projectHyperframesDir(projectId);
  const destination = projectHyperframesCompositionDir(projectId, compositionId);
  if (fs.existsSync(destination)) throw new Error(`HyperFrames composition already exists: ${destination}`);
  fs.mkdirSync(parent, { recursive: true });
  runHyperframes(process.cwd(), [
    "init", destination,
    "--non-interactive",
    "--example", "blank",
    "--resolution", resolution,
  ]);
  console.log(`HyperFrames source: ${destination}`);
  console.log(`Next: pnpm hyperframes-overlay check ${projectId} ${compositionId}`);
}

/**
 * Validate the composition and append revision, coverage and validation audit events.
 * Coverage is recorded, never enforced; only broken controls files or runtime checks fail.
 */
function check(args: Args): { source: string; fingerprint: string; loaded: LoadedManifest } {
  const { projectId, compositionId } = args;
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source)) throw new Error(`HyperFrames composition does not exist: ${source}`);
  const subject = { kind: "composition" as const, id: compositionId };
  const fingerprint = fingerprintHyperframesSource(source);
  const sources = readHyperframesTextSources(source);

  let loaded: LoadedManifest = null;
  let manifestError: string | null = null;
  try {
    loaded = loadManifest(source);
  } catch (error) {
    manifestError = error instanceof Error ? error.message : String(error);
  }
  // The checks see the values that will render (the defaults, with any values given), not the
  // fallbacks written into index.html. A template that works with looks gets DreamCut's look
  // bundle (runtime, kit and one look), never a looks.js of its own.
  let checkValues: ManifestValues | null = null;
  if (loaded) {
    try { checkValues = resolveManifestValues(loaded.manifest, args.values); } catch (error) { manifestError ??= error instanceof Error ? error.message : String(error); }
  }
  const sharedLooks = usesSharedLooks(loaded?.manifest);
  const checkLook = sharedLooks && checkValues ? lookIdFromValues(checkValues) : null;
  const checkedSources = checkLook
    ? [...sources.filter((file) => file.path !== LOOKS_FILE), { path: LOOKS_FILE, text: buildLookBundle(checkLook) }]
    : sources;
  const manifestPath = path.join(source, MANIFEST_FILE_NAME);
  const revision = recordRevisionIfChanged(projectId, subject, args.actor, {
    type: "revision",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? (fs.existsSync(manifestPath) ? manifestSha256(fs.readFileSync(manifestPath, "utf8")) : null),
    files: hyperframesSourceFileHashes(source),
    feedback_ids: args.feedbackIds,
    proposal_id: args.proposalId,
    request: args.request,
  });
  if (revision) {
    appendMotionAuditEvent(projectId, subject, args.actor, {
      type: "coverage",
      source_fingerprint_sha256: fingerprint,
      coverage: compositionCoverage(loaded?.manifest ?? null, checkedSources),
    });
  }

  // The runtime check launches a browser (about 6 s). A value change re-renders unchanged code,
  // so code that already passed keeps its result; the audit already records that validation.
  // A looks template is re-checked every time: its look code is supplied by DreamCut and is not
  // part of the source fingerprint, so an earlier pass may have seen different look code.
  const passedBefore = !sharedLooks && readMotionAudit(projectId, "composition", compositionId).events
    .some((event) => event.type === "validation" && event.ok && event.source_fingerprint_sha256 === fingerprint);
  const validation = manifestError
    ? { errors: [manifestError], warnings: [] as string[] }
    : validateCompositionSources(loaded?.manifest ?? null, checkedSources);
  // One separable object per composition applies to new or changed code; graphics that already
  // passed keep re-rendering when a person changes their values.
  if (!manifestError && !passedBefore) validation.errors.push(...singleObjectProblems(loaded?.manifest ?? null, checkValues));
  // A split piece is drawn only in a look that draws that piece type (looks/pieces.json).
  const pieceProblem = manifestError ? null : pieceLookProblem(loaded?.manifest ?? null, checkValues);
  if (pieceProblem) validation.errors.push(pieceProblem);
  if (validation.errors.length === 0 && passedBefore) {
    for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
    return { source, fingerprint, loaded };
  }
  let runtimeError: string | null = null;
  if (validation.errors.length === 0) {
    // The runtime check and the object probe run on a copy carrying the values and look bundle.
    const checkDir = loaded && checkValues ? renderCopy(source, loaded, checkValues) : source;
    try {
      const output = runHyperframes(checkDir, ["check"], true);
      if (output) console.log(output);
      // Every composition is probed. A packaged template drawn whole, or a canvas painted edge to
      // edge, is recorded as a split gap rather than passing silently; an ordinary composition,
      // or one layer of a split template, that shows several objects is refused. A split
      // template's world layers (its backdrop and atmosphere) are not objects.
      const probe = probeObjects(checkDir);
      const manifest = loaded?.manifest ?? null;
      const gap = wholeTemplateGap(manifest, checkValues);
      const labels = (probe.most?.objects ?? []).map((object) => object.label);
      if (isWorldLayer(manifest, checkValues)) {
        // One backdrop and its atmosphere, drawn edge to edge by the packaged template.
      } else if (gap) {
        appendMotionAuditEvent(projectId, subject, args.actor, { type: "split_gap", source_fingerprint_sha256: fingerprint, reason: "exempt_template", detail: gap, objects: labels });
      } else if (probe.frame) {
        runtimeError = `At ${probe.frame.at_seconds}s this composition shows ${probe.frame.objects.length} separable objects (${probe.frame.objects.map((object) => object.label).join(", ")}). `
          + "A composition draws one object: put each logo, title, word block or picture on its own timeline element, native where possible. "
          + "One drawing passes while it draws on in pieces only if those pieces later join into one shape; start its strokes touching otherwise.";
      } else if (probe.opaque_canvas) {
        appendMotionAuditEvent(projectId, subject, args.actor, { type: "split_gap", source_fingerprint_sha256: fingerprint, reason: "opaque_canvas", detail: "draws on a canvas painted edge to edge, so the check cannot tell its drawings apart", objects: [] });
      }
    } catch (error) {
      runtimeError = error instanceof Error ? error.message : String(error);
    } finally {
      if (checkDir !== source) fs.rmSync(path.dirname(checkDir), { recursive: true, force: true });
    }
  }
  const errors = runtimeError ? [...validation.errors, runtimeError] : validation.errors;
  appendMotionAuditEvent(projectId, subject, args.actor, {
    type: "validation",
    source_fingerprint_sha256: fingerprint,
    ok: errors.length === 0,
    errors,
    warnings: validation.warnings,
  });
  for (const warning of validation.warnings) console.warn(`Warning: ${warning}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { source, fingerprint, loaded };
}

/**
 * Render the composition's default frames and count the separable objects in each
 * (scripts/composition-object-probe.ts): the first frame showing more than one, the frame
 * showing the most, and whether a canvas is painted edge to edge.
 */
type ObjectProbe = {
  frame: { at_seconds: number; objects: SeparableObject[] } | null;
  most: { at_seconds: number; objects: SeparableObject[] } | null;
  opaque_canvas: boolean;
};
function probeObjects(source: string): ObjectProbe {
  // The app root: this file sits in scripts/ as source and in workers/ when compiled.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const probe = workerCommand("scripts/composition-object-probe.ts", [source], root);
  const result = spawnSync(probe.command, probe.args, { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error(`Object check could not run: ${(result.stderr || result.stdout || String(result.error ?? "")).trim()}`);
  const parsed = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as Partial<ObjectProbe>;
  return { frame: parsed.frame ?? null, most: parsed.most ?? null, opaque_canvas: Boolean(parsed.opaque_canvas) };
}

/** Copy the source for a parameterized render so injected values never touch the original. */
function prepareParameterizedSource(source: string, injectHtml: (html: string) => string): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-hf-render-"));
  const copy = path.join(scratch, "source");
  fs.cpSync(source, copy, {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return name !== "renders" && name !== ".git" && name !== "node_modules";
    },
  });
  const nodeModules = path.join(source, "node_modules");
  if (fs.existsSync(nodeModules)) fs.symlinkSync(nodeModules, path.join(copy, "node_modules"), "dir");
  const indexPath = path.join(copy, "index.html");
  if (!fs.existsSync(indexPath)) throw new Error("Animation with controls needs an index.html to receive values");
  fs.writeFileSync(indexPath, injectHtml(fs.readFileSync(indexPath, "utf8")));
  return copy;
}

/** A disposable copy of the source with the look bundle for one look written into it. */
function withLookBundle(source: string, lookId: string): string {
  const copy = prepareParameterizedSource(source, (html) => html);
  writeLookBundle(copy, lookId);
  return copy;
}

/**
 * A disposable copy that renders as these values do: the canvas size and length they choose, the
 * values injected for the composition to read, and the look bundle when its template uses looks.
 */
function renderCopy(source: string, loaded: NonNullable<LoadedManifest>, values: ManifestValues): string {
  const segmentDurations = authoredSegmentDurations(loaded.manifest);
  const copy = prepareParameterizedSource(source, (html) => {
    // A canvas control picks the render size; the renderer reads it from the root before scripts run.
    const size = canvasSizeForValues(loaded.manifest, values);
    const sized = size ? applyCanvasSizeToHtml(html, size) : html;
    // A declared length follows its timing controls; the renderer reads it before scripts run too.
    const length = loaded.manifest.timing ? resolveTiming(loaded.manifest.timing, values).duration : null;
    const timed = length ? applyDurationToHtml(sized, length) : sized;
    return injectRuntimeIntoHtml(timed, { controls: values, segment_durations: segmentDurations });
  });
  if (usesSharedLooks(loaded.manifest)) writeLookBundle(copy, lookIdFromValues(values));
  return copy;
}

function preview(projectId: string, compositionId: string) {
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source)) throw new Error(`HyperFrames composition does not exist: ${source}`);
  const loaded = loadManifest(source);
  // A looks template previews from a copy carrying the bundle for its default look.
  const look = loaded && usesSharedLooks(loaded.manifest) ? lookIdFromValues(resolveManifestValues(loaded.manifest, {})) : null;
  runHyperframes(look ? withLookBundle(source, look) : source, ["preview"]);
}

type RenderMode = "approved" | "candidate";

/** The render cache key: the values, plus the look code DreamCut supplies for a looks template. */
function renderCacheKeys(loaded: LoadedManifest, values: ManifestValues | null) {
  // A looks template's render also depends on the look code DreamCut supplies, so a look edit
  // never reuses a render made with the old code.
  const lookKey = loaded && values && usesSharedLooks(loaded.manifest) ? sha256Text(buildLookBundle(lookIdFromValues(values))) : null;
  const valuesKey = values ? (lookKey ? sha256Text(`${valuesSha256(values)}:${lookKey}`) : valuesSha256(values)) : NO_VALUES_KEY;
  return { lookKey, valuesKey };
}

function cachedCandidate(projectId: string, compositionId: string, fingerprint: string, loaded: LoadedManifest, values: ManifestValues | null) {
  const cached = findCandidateRender(projectId, compositionId, fingerprint, renderCacheKeys(loaded, values).valuesKey, values ? valuesSha256(values) : NO_VALUES_KEY);
  // A transparent render made before cropping existed is rendered again so it is cropped too.
  return cached && (cached.output.canvas_track || cached.output.crop_checked || rendersOpaque(loaded?.manifest ?? null, values)) ? cached : null;
}

/** An existing render of exactly this source and these values, found without running the check. */
function reusableCandidate(args: Args) {
  const { projectId, compositionId } = args;
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source)) return null;
  const fingerprint = fingerprintHyperframesSource(source);
  if (args.expectFingerprint && args.expectFingerprint !== fingerprint) return null;
  let loaded: LoadedManifest = null, values: ManifestValues | null = null;
  try {
    loaded = loadManifest(source);
    values = loaded ? resolveManifestValues(loaded.manifest, args.values) : null;
  } catch {
    return null;
  }
  if (!loaded && args.values !== undefined) return null;
  const cached = cachedCandidate(projectId, compositionId, fingerprint, loaded, values);
  return cached ? { receipt: cached, reused: true, manifest: loaded?.manifest ?? null, values } : null;
}

function render(args: Args, mode: RenderMode = "approved") {
  const { projectId, compositionId, approved } = args;
  if (mode === "approved" && !approved) {
    throw new Error("Render requires --approved after the final HyperFrames Studio preview is approved");
  }
  const startedAt = Date.now();
  const projectRoot = projectDir(projectId);
  // A value change or replay of an already-rendered graphic reuses that render without the check
  // (which launches a browser twice): the same source and values already passed when it rendered.
  if (mode === "candidate") {
    const reused = reusableCandidate(args);
    if (reused) return reused;
  }
  const { source, fingerprint, loaded } = check(args);
  if (args.expectFingerprint && args.expectFingerprint !== fingerprint) {
    throw new Error("This motion graphic's code changed after it was proposed; ask for a revised proposal");
  }
  const values = loaded ? resolveManifestValues(loaded.manifest, args.values) : null;
  if (!loaded && args.values !== undefined) throw new Error("This animation has no controls file, so --values cannot apply");
  const segmentDurations = loaded ? authoredSegmentDurations(loaded.manifest) : null;
  // A looks template's render also depends on the look code DreamCut supplies, so a look edit
  // never reuses a render made with the old code.
  const { valuesKey } = renderCacheKeys(loaded, values);
  const subject = { kind: "composition" as const, id: compositionId };

  if (mode === "candidate") {
    const cached = cachedCandidate(projectId, compositionId, fingerprint, loaded, values);
    if (cached) return { receipt: cached, reused: true, manifest: loaded?.manifest ?? null, values };
  }
  // A looks template always renders from a copy carrying the bundle for its current look.
  const finalSource = loaded && values ? renderCopy(source, loaded, values) : source;

  const outputDirectory = path.join(projectRoot, "media", "hyperframes", compositionId);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pendingOutputPath = path.join(
    outputDirectory,
    `.${compositionId}.${process.pid}.${Date.now()}.pending.webm`,
  );
  try {
    runHyperframes(finalSource, ["render", "--format", "webm", "--quality", "high", "--output", pendingOutputPath]);
  } finally {
    if (finalSource !== source) fs.rmSync(path.dirname(finalSource), { recursive: true, force: true });
  }

  let probe: ReturnType<typeof probeOutput>;
  let crop: ReturnType<typeof cropToContent> = null;
  try {
    const opaque = rendersOpaque(loaded?.manifest ?? null, values);
    probe = probeOutput(pendingOutputPath, opaque);
    // A transparent graphic is kept only as large as the area any of its frames uses, so a piece
    // that fills a corner decodes a corner, not a full frame. The editor draws it back in place.
    if (!opaque) {
      crop = cropToContent(pendingOutputPath, probe);
      if (crop) probe = probeOutput(pendingOutputPath, false);
    }
  } catch (error) {
    // A rejected render is not kept; only checked outputs stay in project media.
    fs.rmSync(pendingOutputPath, { force: true });
    throw error;
  }
  const outputSha256 = sha256(pendingOutputPath);
  const outputPath = path.join(outputDirectory, `${compositionId}.${outputSha256.slice(0, 16)}.webm`);
  if (fs.existsSync(outputPath)) fs.unlinkSync(pendingOutputPath);
  else fs.renameSync(pendingOutputPath, outputPath);
  const version = runHyperframes(process.cwd(), ["--version"], true).match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
  const receipt: HyperframesOverlayReceipt = {
    schema_version: 1,
    composition_id: compositionId,
    source: {
      project_relative_directory: path.relative(projectRoot, source).replaceAll(path.sep, "/"),
      fingerprint_sha256: fingerprint,
    },
    output: {
      project_relative_path: path.relative(projectRoot, outputPath).replaceAll(path.sep, "/"),
      sha256: outputSha256,
      duration_seconds: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      codec: probe.codec,
      pixel_format: probe.pixelFormat,
      alpha_mode: "1",
      ...(crop ? { canvas_track: crop } : {}),
      ...(!rendersOpaque(loaded?.manifest ?? null, values) ? { crop_checked: true as const } : {}),
    },
    render: {
      hyperframes_version: version,
      rendered_at: new Date().toISOString(),
      quality: "high",
      format: "webm",
      approved: mode === "approved",
    },
    ...(loaded && values && segmentDurations ? {
      parameters: {
        manifest_sha256: loaded.sha256,
        values_sha256: valuesSha256(values),
        values,
        segment_durations: segmentDurations,
        // Where this render's named moments fall and how long it runs, so linked sounds and the clip can follow.
        ...(loaded.manifest.timing ? { timing: resolveTiming(loaded.manifest.timing, values) } : {}),
      },
    } : {}),
  };
  writeJsonFileAtomic(projectHyperframesReceiptPath(projectId, compositionId), receipt, validateHyperframesOverlayReceipt);
  const candidatePath = candidateReceiptPath(projectId, compositionId, fingerprint, valuesKey);
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  writeJsonFileAtomic(candidatePath, receipt, validateHyperframesOverlayReceipt);
  appendMotionAuditEvent(projectId, subject, args.actor, {
    type: "render",
    source_fingerprint_sha256: fingerprint,
    manifest_sha256: loaded?.sha256 ?? null,
    values_sha256: values ? valuesSha256(values) : null,
    values,
    output_path: receipt.output.project_relative_path,
    output_sha256: outputSha256,
    duration_seconds: probe.duration,
    renderer: `hyperframes@${version}`,
    elapsed_ms: Date.now() - startedAt,
    approval_required: mode === "approved",
    approved: mode === "approved",
  });
  if (mode === "candidate") return { receipt, reused: false, manifest: loaded?.manifest ?? null, values };
  appendMotionAuditEvent(projectId, subject, { type: "person", via: args.approvedBy }, {
    type: "review",
    source_fingerprint_sha256: fingerprint,
    decision: "approved",
    rating: args.rating,
    proposal_id: args.proposalId,
  });
  console.log(`Linked overlay: ${outputPath}`);
  console.log(`Receipt: ${projectHyperframesReceiptPath(projectId, compositionId)}`);
  console.log("Reload the editor Library; the overlay appears as a Cutout asset.");
  return { receipt, reused: false, manifest: loaded?.manifest ?? null, values };
}

/**
 * Agent path: optionally write source files from a spec, then check and render a
 * candidate. No human approval is recorded here; the proposal is the approval point.
 */
function prepare(args: Args) {
  if (args.specPath) {
    const specText = fs.readFileSync(args.specPath.startsWith("@") ? args.specPath.slice(1) : args.specPath, "utf8");
    writeCompositionSource(args.projectId, args.compositionId, parseCompositionSourceSpec(JSON.parse(specText)));
  }
  const result = render(args, "candidate");
  const output = {
    composition_id: args.compositionId,
    reused: result.reused,
    media_path: result.receipt.output.project_relative_path.replace(/^media\//, ""),
    source_url: `/api/projects/${args.projectId}/media/${result.receipt.output.project_relative_path.replace(/^media\//, "").split("/").map(encodeURIComponent).join("/")}`,
    duration_seconds: result.receipt.output.duration_seconds,
    width: result.receipt.output.width,
    height: result.receipt.output.height,
    fps: result.receipt.output.fps,
    has_alpha: true,
    source_fingerprint_sha256: result.receipt.source.fingerprint_sha256,
    values: result.values,
    controls: result.manifest?.controls ?? [],
    actors: result.manifest?.actors ?? [],
    markers: result.manifest?.markers ?? [],
  };
  if (args.json) console.log(`DREAMCUT_RESULT ${JSON.stringify(output)}`);
  else console.log(`Candidate: ${output.media_path}${result.reused ? " (reused)" : ""}`);
}

/** HyperFrames renders at 2x device pixels through its 4K presets; the composition itself is unchanged. */
const DENSITY_SCALE = 2;

/**
 * The same render at twice the pixel density, for a 2K or 4K export: the receipt's exact values, the
 * composition's unchanged source, the 4K preset for its shape, and the same crop to its drawn area.
 * Cached beside the render as `<name>@2x.webm` with a `.json` record of its crop track.
 */
function density(args: Args) {
  const { projectId, compositionId, renderPath } = args;
  if (!renderPath) usage();
  const projectRoot = projectDir(projectId);
  const receipt = listCandidateRenders(projectId, compositionId).find((entry) => entry.output.project_relative_path === renderPath);
  if (!receipt) throw new Error(`No render record for ${renderPath}`);
  const original = path.join(projectRoot, receipt.output.project_relative_path);
  const target = original.replace(/\.webm$/, `@${DENSITY_SCALE}x.webm`);
  const record = target.replace(/\.webm$/, ".json");
  const emit = (value: unknown) => args.json ? console.log(`DREAMCUT_RESULT ${JSON.stringify(value)}`) : console.log(`Density render: ${path.relative(projectRoot, target)}`);
  if (fs.existsSync(target) && fs.existsSync(record)) return emit(JSON.parse(fs.readFileSync(record, "utf8")));
  const source = projectHyperframesCompositionDir(projectId, compositionId);
  if (!fs.existsSync(source) || fingerprintHyperframesSource(source) !== receipt.source.fingerprint_sha256) {
    throw new Error("This motion graphic's code changed after this render, so it cannot be rendered again at a higher resolution");
  }
  const loaded = loadManifest(source);
  const values = loaded ? (receipt.parameters?.values ?? resolveManifestValues(loaded.manifest, undefined)) : null;
  const canvas = receipt.output.canvas_track?.canvas ?? { width: receipt.output.width, height: receipt.output.height };
  const preset = canvas.width > canvas.height ? "landscape-4k" : canvas.width < canvas.height ? "portrait-4k" : "square-4k";
  const finalSource = loaded && values ? renderCopy(source, loaded, values) : source;
  const pending = path.join(path.dirname(original), `.${compositionId}.${process.pid}.${Date.now()}.density.pending.webm`);
  try {
    // Parallel capture holds every frame on disk first (4 bytes a pixel); streaming needs no room but runs one
    // capture worker, many times slower. Stream only when the scratch volume cannot hold the frames with room to spare.
    const frameBytes = canvas.width * DENSITY_SCALE * canvas.height * DENSITY_SCALE * 4 * Math.ceil(receipt.output.duration_seconds * receipt.output.fps);
    const scratch = fs.statfsSync(os.tmpdir()), free = scratch.bavail * scratch.bsize;
    const stream = free < frameBytes * 1.25 + 4 * 1024 ** 3;
    if (stream) console.log(`Warning: streaming the ${preset} render (${Math.round(frameBytes / 1024 ** 3)} GB of frames, ${Math.round(free / 1024 ** 3)} GB free); this is slower`);
    runHyperframes(finalSource, ["render", "--format", "webm", "--quality", "high", "--resolution", preset, ...(stream ? ["--low-memory-mode"] : []), "--output", pending]);
  } finally {
    if (finalSource !== source) fs.rmSync(path.dirname(finalSource), { recursive: true, force: true });
  }
  try {
    const opaque = rendersOpaque(loaded?.manifest ?? null, values);
    let probe = probeOutput(pending, opaque);
    if (probe.width < canvas.width * DENSITY_SCALE && !receipt.output.canvas_track) throw new Error(`The ${preset} render came out ${probe.width} × ${probe.height}`);
    // Cropped like the original, so the export places it exactly where the original sits.
    const track = receipt.output.canvas_track ? cropToContent(pending, probe) : null;
    if (track) probe = probeOutput(pending, false);
    fs.renameSync(pending, target);
    const result = { media_path: path.relative(projectRoot, target).replaceAll(path.sep, "/"), width: probe.width, height: probe.height, canvas_track: track };
    writeJsonFileAtomic(record, result);
    emit(result);
  } catch (error) {
    fs.rmSync(pending, { force: true });
    throw error;
  }
}

const args = parseArgs(process.argv.slice(2));
switch (args.command) {
  case "scaffold": scaffold(args.projectId, args.compositionId, args.resolution); break;
  case "check": check(args); console.log("Animation check passed."); break;
  case "preview": preview(args.projectId, args.compositionId); break;
  case "render": render(args); break;
  case "prepare": prepare(args); break;
  case "density": density(args); break;
}
