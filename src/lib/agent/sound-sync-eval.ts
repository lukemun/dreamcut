import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveAudioFile } from "@/lib/agent/visual-activity-tool";
import { writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { projectDir, projectExists, projectTimelinePath } from "@/lib/local-store/paths";
import { createProject } from "@/lib/local-store/store";
import { mixEnvelopes, soundEnvelopeOnTimeline, fileEnvelope, type PlacedSound } from "@/lib/sound-synth/activity-media";
import { alignmentReport, turnResponse, type AlignmentReport } from "@/lib/sound-synth/sound-alignment";

/**
 * sound-sync-v1: does a proposed sound effect follow what is on screen? Three small
 * synthetic fixtures (a drawn sketch, a camera move with one fast section, footage with
 * three motion beats). Each fixture carries its own ground-truth activity, computed here
 * from the fixture definition rather than by visual_activity_prepare, and the scorer
 * compares a proposal's sounds (or audio rendered from it) with that truth.
 * A regression check for the sound-follows-picture routine, not a held-out benchmark.
 * Contract: docs/evals/sound-sync.md.
 */

export const SOUND_SYNC_EVAL_VERSION = "sound-sync-v1";
const RATE = 100;
/** Above this frequency counts as the bright part of a sound (turn scratch). */
const BRIGHT_HZ = 4000;

type Stroke = { start: number; seconds: number; ease: "linear" | "easeInOut" };

export type SoundSyncCase = {
  id: string;
  title: string;
  /** The creator's request, as the model under test receives it. */
  request: string;
  window: { start: number; end: number };
  /** Which visual_activity_prepare curve voices this case. */
  curve: "draw" | "camera" | "frames" | "pen_speed";
  /** sfx_search words for library baselines. */
  library_query: string;
  library_role: "texture" | "movement" | "entrance_accent";
};

const SKETCH_STROKES: Stroke[] = [
  { start: 0.3, seconds: 0.6, ease: "linear" },
  { start: 0.5, seconds: 0.5, ease: "easeInOut" },
  { start: 0.9, seconds: 0.4, ease: "linear" },
  { start: 2.2, seconds: 0.8, ease: "easeInOut" },
  { start: 2.4, seconds: 0.6, ease: "linear" },
  { start: 3.2, seconds: 0.3, ease: "linear" },
];

/**
 * Handwriting: one path shape (a 0.6 x 0.3 box of a 1080-high canvas) traced contour by contour:
 * a zigzag with three sharp corners, a round loop, then two separate strokes (a "t").
 * Drawn with an accelerating start, a pause, and a slowing finish. Polylines only.
 */
const HANDWRITING_CONTOURS: Array<Array<[number, number]>> = [
  [[-0.45, -0.2], [-0.37, 0.3], [-0.29, -0.15], [-0.21, 0.3], [-0.13, -0.2]],
  Array.from({ length: 17 }, (_, index) => {
    const angle = Math.PI / 2 + (index / 16) * 2 * Math.PI;
    return [Number((0.05 + 0.1 * Math.cos(angle)).toFixed(4)), Number((0.05 - 0.25 * Math.sin(angle)).toFixed(4))] as [number, number];
  }),
  [[0.32, -0.35], [0.32, 0.3]],
  [[0.22, -0.1], [0.44, -0.1]],
];
const HANDWRITING_BOX = { width: 0.6, height: 0.3 };
/** shape_draw keyframes (clip-local; the shape starts at 0 on the timeline). */
const HANDWRITING_DRAW = [
  { t: 0.2, v: 0, ease: "easeIn" as const },
  { t: 1.2, v: 0.5, ease: "hold" as const },
  { t: 1.5, v: 0.5, ease: "easeOut" as const },
  { t: 2.6, v: 1 },
];
/** A corner sharper than this is a turn the sound should mark. */
const SHARP_TURN_DEGREES = 60;

/** Camera: a slow drift, one fast push between 1.4 and 1.8 s, then a slow settle (linear segments). */
const CAMERA_OFFSET_X = [{ t: 0, v: 0 }, { t: 1.4, v: 0.05 }, { t: 1.8, v: 0.55 }, { t: 3.6, v: 0.6 }];
const CAMERA_SCALE = [{ t: 0, v: 1 }, { t: 3.6, v: 1.15 }];

/** Footage: a square on a dark, noisy background moves in three beats (source clock). */
const FOOTAGE_SECONDS = 4.5;
const FOOTAGE_START = 0.5;
const SQUARE_PATH = [
  { t: 0, x: 40, y: 100 },
  { t: 0.6, x: 40, y: 100 },
  { t: 0.9, x: 240, y: 100 },
  { t: 1.8, x: 240, y: 100 },
  { t: 2.0, x: 240, y: 400 },
  { t: 3.0, x: 240, y: 400 },
  { t: 3.4, x: 60, y: 400 },
  { t: 4.5, x: 60, y: 400 },
];

export const SOUND_SYNC_CASES: SoundSyncCase[] = [
  {
    id: "handwriting",
    title: "Pencil on handwriting: strokes, speed and sharp turns",
    request: "Add a handwriting pencil sound that matches the strokes: faster when the pen speeds up, a different scratch where it turns, quiet when it lifts.",
    window: { start: 0, end: 3 },
    curve: "pen_speed",
    library_query: "pencil scribble writing",
    library_role: "texture",
  },
  {
    id: "drawn-sketch",
    title: "Pencil sound on a self-drawing sketch",
    request: "Add a pencil sound while the sketch draws itself.",
    window: { start: 0, end: 4 },
    curve: "draw",
    library_query: "pencil scribble writing",
    library_role: "texture",
  },
  {
    id: "camera-fast-section",
    title: "Air on a camera move with one fast push",
    request: "Give the camera move some air, with a whoosh on the fast push.",
    window: { start: 0, end: 4 },
    curve: "camera",
    library_query: "whoosh",
    library_role: "movement",
  },
  {
    id: "footage-motion-beats",
    title: "Sound on the moves in a footage clip",
    request: "Add sound effects to the moves in this clip.",
    window: { start: FOOTAGE_START, end: FOOTAGE_START + FOOTAGE_SECONDS },
    curve: "frames",
    library_query: "whoosh swish",
    library_role: "movement",
  },
];

export function soundSyncCase(id: string) {
  const found = SOUND_SYNC_CASES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown case ${id}; cases: ${SOUND_SYNC_CASES.map((candidate) => candidate.id).join(", ")}`);
  return found;
}

// ── Ground truth, from the fixture definitions ─────────────────────────────

function easeSlope(progress: number, ease: Stroke["ease"]) {
  if (ease === "linear") return 1;
  return progress < 0.5 ? 4 * progress : 4 * (1 - progress);
}

function handwritingProgress(time: number) {
  const points = HANDWRITING_DRAW;
  if (time <= points[0]!.t) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (time > right.t) continue;
    const p = (time - left.t) / (right.t - left.t);
    const eased = left.ease === "hold" ? 0 : left.ease === "easeIn" ? p * p : left.ease === "easeOut" ? 1 - (1 - p) * (1 - p) : p;
    return left.v + (right.v - left.v) * eased;
  }
  return 1;
}

/** Pixel polylines (1080-high canvas) with each contour's length and its sharp corners' arc positions. */
function handwritingGeometry() {
  const scaleX = HANDWRITING_BOX.width * 1080;
  const scaleY = HANDWRITING_BOX.height * 1080;
  let offset = 0;
  const corners: number[] = [];
  for (const contour of HANDWRITING_CONTOURS) {
    const points = contour.map(([x, y]) => [x * scaleX, y * scaleY] as const);
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      const segment = Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]);
      if (index < points.length - 1) {
        const a = Math.atan2(points[index]![1] - points[index - 1]![1], points[index]![0] - points[index - 1]![0]);
        const b = Math.atan2(points[index + 1]![1] - points[index]![1], points[index + 1]![0] - points[index]![0]);
        let turn = Math.abs(b - a);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if ((turn * 180) / Math.PI > SHARP_TURN_DEGREES) corners.push(offset + length + segment);
      }
      length += segment;
    }
    offset += length;
  }
  return { perimeter: offset, corners };
}

/** Timeline seconds where the pen passes each sharp corner of the handwriting. */
export function handwritingTurnTimes() {
  const { perimeter, corners } = handwritingGeometry();
  return corners.map((at) => {
    let low = HANDWRITING_DRAW[0]!.t;
    let high = HANDWRITING_DRAW.at(-1)!.t;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (handwritingProgress(middle) * perimeter < at) low = middle;
      else high = middle;
    }
    return Number(((low + high) / 2).toFixed(3));
  });
}

function piecewiseSpeed(points: Array<{ t: number; v: number }>, time: number) {
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (time >= left.t && time < right.t) return (right.v - left.v) / (right.t - left.t);
  }
  return 0;
}

/** Truth activity (arbitrary units) on RATE bins across the case window. */
export function truthCurve(testCase: SoundSyncCase): Float64Array {
  const n = Math.round((testCase.window.end - testCase.window.start) * RATE);
  const out = new Float64Array(n);
  for (let index = 0; index < n; index += 1) {
    const time = testCase.window.start + (index + 0.5) / RATE;
    if (testCase.id === "handwriting") {
      const { perimeter } = handwritingGeometry();
      const step = 1 / RATE;
      out[index] = (perimeter * (handwritingProgress(time + step / 2) - handwritingProgress(time - step / 2))) / step;
    } else if (testCase.id === "drawn-sketch") {
      for (const stroke of SKETCH_STROKES) {
        const progress = (time - stroke.start) / stroke.seconds;
        if (progress >= 0 && progress < 1) out[index] += easeSlope(progress, stroke.ease) / stroke.seconds;
      }
    } else if (testCase.id === "camera-fast-section") {
      out[index] = Math.abs(piecewiseSpeed(CAMERA_OFFSET_X, time)) / 0.6 + Math.abs(piecewiseSpeed(CAMERA_SCALE, time)) / 0.15;
    } else {
      const local = time - FOOTAGE_START;
      const dx = piecewiseSpeed(SQUARE_PATH.map(({ t, x }) => ({ t, v: x })), local);
      const dy = piecewiseSpeed(SQUARE_PATH.map(({ t, y }) => ({ t, v: y })), local);
      out[index] = Math.hypot(dx, dy);
    }
  }
  return out;
}

// ── Fixture projects ────────────────────────────────────────────────────────

function element(projectId: string, fields: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), project_id: projectId, source_url: null, beat_id: null, voice_clip_id: null, character_id: null,
    trim_start: 0, trim_end: 0, volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: now, updated_at: now, ...fields,
  };
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
}

function piecewiseExpr(points: Array<{ t: number; v: number }>) {
  // Nested if() over linear segments, on ffmpeg's t (seconds).
  let expr = String(points.at(-1)!.v);
  for (let index = points.length - 1; index >= 1; index -= 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    const slope = (right.v - left.v) / (right.t - left.t);
    expr = `if(lt(t\\,${right.t})\\,${left.v}+${slope.toFixed(6)}*(t-${left.t})\\,${expr})`;
  }
  return expr;
}

/**
 * Create a disposable fixture project. Refuses an existing project. Writes only that
 * project's folder (timeline, metadata, generated media); never touches another project.
 */
export function setupSoundSyncFixture(caseId: string, projectId: string) {
  const testCase = soundSyncCase(caseId);
  if (projectExists(projectId)) throw new Error(`Project ${projectId} already exists; pass a fresh id`);
  createProject(projectId, "reels", `Sound sync eval: ${testCase.title}`, { outputAspectRatio: "9:16", frameRate: 30 });
  const dir = projectDir(projectId);
  const sources = path.join(dir, "media", "sources");
  fs.mkdirSync(sources, { recursive: true });
  const elements: Array<Record<string, unknown>> = [];
  const mediaUrl = (file: string) => `/api/projects/${projectId}/media/sources/${file}`;

  if (testCase.id === "handwriting") {
    ffmpeg(["-f", "lavfi", "-i", "color=c=0xf4efe6:s=1080x1920", "-frames:v", "1", path.join(sources, "paper.png")]);
    elements.push(element(projectId, { type: "still", source_url: mediaUrl("paper.png"), timeline_start: 0, duration: 3, lane_key: "visual_0", lane_index: 0, props: { title: "Paper", has_alpha: false } }));
    elements.push(element(projectId, {
      type: "shape", timeline_start: 0, duration: 3, lane_key: "visual_1", lane_index: 1,
      props: {
        title: "Handwriting", shape_kind: "path", shape_width: HANDWRITING_BOX.width, shape_height: HANDWRITING_BOX.height, shape_fill: null,
        shape_stroke: "#1c1b19", shape_stroke_width: 2, shape_taper: 0.3, shape_wobble: 0.1, shape_seed: 3,
        shape_contours: HANDWRITING_CONTOURS.map((points) => ({ closed: false, points: points.map(([x, y]) => ({ x, y })) })),
        keyframes: { shape_draw: HANDWRITING_DRAW.map(({ t, v, ease }) => ({ t, v, ...(ease ? { ease } : {}) })) },
      },
    }));
  } else if (testCase.id === "drawn-sketch") {
    ffmpeg(["-f", "lavfi", "-i", "color=c=0xf4efe6:s=1080x1920", "-frames:v", "1", path.join(sources, "paper.png")]);
    elements.push(element(projectId, { type: "still", source_url: mediaUrl("paper.png"), timeline_start: 0, duration: 4, lane_key: "visual_0", lane_index: 0, props: { title: "Paper", has_alpha: false } }));
    SKETCH_STROKES.forEach((stroke, index) => {
      const x = -0.6 + index * 0.24;
      elements.push(element(projectId, {
        type: "shape", timeline_start: stroke.start, duration: 4 - stroke.start, lane_key: `visual_${index + 1}`, lane_index: index + 1,
        props: {
          title: `Stroke ${index + 1}`, shape_kind: "path", shape_width: 0.2, shape_height: 0.3, shape_fill: null, shape_stroke: "#1c1b19", shape_stroke_width: 1.4,
          media_offset_x: x, media_offset_y: index % 2 ? 0.2 : -0.2,
          shape_contours: [{ closed: false, points: [{ x: -0.08, y: -0.12 }, { x: 0.06, y: 0.02 }, { x: -0.04, y: 0.12 }] }],
          keyframes: { shape_draw: [{ t: 0, v: 0, ...(stroke.ease === "linear" ? {} : { ease: stroke.ease }) }, { t: stroke.seconds, v: 1 }] },
        },
      }));
    });
  } else if (testCase.id === "camera-fast-section") {
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=1080x1920", "-frames:v", "1", path.join(sources, "grid.png")]);
    const camera = element(projectId, {
      type: "shape", timeline_start: 0, duration: 4, lane_key: "visual_1", lane_index: 1,
      props: { title: "Camera", shape_kind: "camera", shape_width: 1, shape_height: 1, keyframes: { media_offset_x: CAMERA_OFFSET_X, media_scale: CAMERA_SCALE } },
    });
    elements.push(element(projectId, { type: "still", source_url: mediaUrl("grid.png"), timeline_start: 0, duration: 4, lane_key: "visual_0", lane_index: 0, props: { title: "Grid", has_alpha: false, camera_id: camera.id } }));
    elements.push(camera);
  } else {
    const xs = piecewiseExpr(SQUARE_PATH.map(({ t, x }) => ({ t, v: x })));
    const ys = piecewiseExpr(SQUARE_PATH.map(({ t, y }) => ({ t, v: y })));
    // overlay evaluates x/y every frame (drawbox would evaluate them once).
    ffmpeg([
      "-f", "lavfi", "-i", `color=c=0x202020:s=360x640:r=30:d=${FOOTAGE_SECONDS}`,
      "-f", "lavfi", "-i", `color=c=white:s=60x60:r=30:d=${FOOTAGE_SECONDS}`,
      "-filter_complex", `[0:v][1:v]overlay=x='${xs}':y='${ys}':eval=frame,noise=alls=6:allf=t,format=yuv420p`,
      "-c:v", "libx264", "-g", "15", "-t", String(FOOTAGE_SECONDS), path.join(sources, "motion-beats.mp4"),
    ]);
    elements.push(element(projectId, {
      type: "video_clip", source_url: mediaUrl("motion-beats.mp4"), timeline_start: FOOTAGE_START, duration: FOOTAGE_SECONDS, lane_key: "visual_0", lane_index: 0,
      props: { title: "Motion beats", source_duration_seconds: FOOTAGE_SECONDS, has_alpha: false },
    }));
  }
  writeJsonFileAtomic(projectTimelinePath(projectId), { schema_version: 1, elements, transitions: [] });
  return { project_id: projectId, case_id: testCase.id, window: testCase.window, request: testCase.request, elements: elements.length };
}

// ── Scoring ─────────────────────────────────────────────────────────────────

type ProposalLike = { options?: Array<{ id?: string; recommended?: boolean; operations?: Array<Record<string, unknown>> }>; operations?: Array<Record<string, unknown>>; proposal?: ProposalLike };

/** create_audio operations of the recommended (or named) option of a proposal, record or bare operation list. */
export function proposalSounds(input: ProposalLike, optionId?: string) {
  const proposal = input.proposal ?? input;
  const operations = proposal.operations ?? (() => {
    const options = proposal.options ?? [];
    const option = optionId ? options.find((candidate) => candidate.id === optionId) : options.find((candidate) => candidate.recommended) ?? options[0];
    return option?.operations ?? [];
  })();
  return operations.flatMap((operation) => {
    const create = operation.create_audio as Record<string, unknown> | undefined;
    return create && typeof create.source_url === "string" ? [create] : [];
  });
}

export type SoundSyncScore = {
  suite: string;
  case_id: string;
  sound_count: number;
  correlation: number;
  median_onset_ms: number | null;
  uncaused_fraction: number;
  /** Handwriting only: how much the sound changes at sharp turns (median ratio, needs >= 1.25). */
  turn_response: number | null;
  pass: boolean;
  failures: string[];
  report: AlignmentReport;
  turns?: ReturnType<typeof turnResponse>;
};

function scoreEnvelope(testCase: SoundSyncCase, envelope: Float64Array, soundCount: number, bright?: Float64Array): SoundSyncScore {
  const report = alignmentReport(truthCurve(testCase), envelope, RATE, testCase.window.start);
  const failures = [...report.failures];
  if (soundCount === 0) failures.unshift("the proposal has no sound");
  const turns = testCase.id === "handwriting" && bright
    ? turnResponse(handwritingTurnTimes().map((time) => time - testCase.window.start), envelope, bright, RATE, testCase.window.start)
    : undefined;
  if (turns && !turns.pass) failures.push(`the sound barely changes at the sharp turns (median ${turns.median_response ?? 0}x, needs 1.25x brighter or louder)`);
  return {
    suite: SOUND_SYNC_EVAL_VERSION,
    case_id: testCase.id,
    sound_count: soundCount,
    correlation: report.correlation,
    median_onset_ms: report.onsets.median_abs_offset_ms,
    uncaused_fraction: report.uncaused_energy_fraction,
    turn_response: turns?.median_response ?? null,
    pass: failures.length === 0,
    failures,
    report,
    ...(turns ? { turns } : {}),
  };
}

/**
 * Score a proposal against the case truth. With `renderedAudio` (audio of the proposal's
 * sounds rendered from the window start), that file is measured; otherwise the proposal's
 * create_audio sources are decoded and mixed as placed.
 */
export async function gradeSoundSync(caseId: string, input: { projectId: string; proposal: ProposalLike; optionId?: string; renderedAudio?: string }) {
  const testCase = soundSyncCase(caseId);
  const sounds = proposalSounds(input.proposal, input.optionId);
  const n = Math.round((testCase.window.end - testCase.window.start) * RATE);
  const needsBright = testCase.id === "handwriting";
  if (input.renderedAudio) {
    const bright = needsBright ? await fileEnvelope(input.renderedAudio, RATE, n, 0, { highpassHz: BRIGHT_HZ }) : undefined;
    return scoreEnvelope(testCase, await fileEnvelope(input.renderedAudio, RATE, n), sounds.length || 1, bright);
  }
  const placed: PlacedSound[] = sounds.map((sound) => {
    const sourceStart = typeof sound.source_start_seconds === "number" ? sound.source_start_seconds : 0;
    return {
      label: String(sound.title ?? sound.source_url),
      file: resolveAudioFile(input.projectId, sound.source_url as string),
      timeline_start: typeof sound.timeline_start === "number" ? sound.timeline_start : testCase.window.start,
      source_start: sourceStart,
      source_end: typeof sound.source_end_seconds === "number" ? sound.source_end_seconds : sourceStart + 30,
      volume: typeof sound.volume === "number" ? sound.volume : 1,
      playback_rate: typeof sound.playback_rate === "number" ? sound.playback_rate : 1,
    };
  });
  const envelopes = await Promise.all(placed.map((sound) => soundEnvelopeOnTimeline(sound, testCase.window.start, RATE, n)));
  const bright = needsBright
    ? mixEnvelopes(await Promise.all(placed.map((sound) => soundEnvelopeOnTimeline(sound, testCase.window.start, RATE, n, { highpassHz: BRIGHT_HZ }))), n)
    : undefined;
  return scoreEnvelope(testCase, mixEnvelopes(envelopes, n), placed.length, bright);
}

export function soundSyncPacket(caseId: string, projectId: string) {
  const testCase = soundSyncCase(caseId);
  return {
    suite: SOUND_SYNC_EVAL_VERSION,
    case_id: testCase.id,
    project_id: projectId,
    request: testCase.request,
    setup: `pnpm eval:sound-sync setup ${testCase.id} ${projectId}`,
    grade: `pnpm eval:sound-sync grade ${testCase.id} ${projectId} <proposal_id | proposal.json> [rendered.wav]`,
    scoring: "Handwriting adds: the sound must change at sharp turns (1.25x brighter or louder within 30 ms of each turn than the stroke around it, median). All cases: envelope-to-activity correlation (>= 0.6), median onset error (<= 40 ms, a missed onset counts 250 ms) and share of sound energy with no visual cause (<= 15%), against truth computed from the fixture definition.",
  };
}
