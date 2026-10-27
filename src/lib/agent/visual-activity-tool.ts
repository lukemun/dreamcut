import fs from "node:fs";
import path from "node:path";

import { toolError } from "@/lib/agent/tool-error";
import { resolveLocalMediaSource } from "@/lib/local-store/audio-effects";
import { projectHyperframesCompositionDir } from "@/lib/local-store/paths";
import { readProposal } from "@/lib/local-store/proposals";
import { resolveSfxCatalogFile } from "@/lib/local-store/sfx-catalog";
import { activeElements, readTimeline } from "@/lib/local-store/store";
import { measureFrameMotion, mixEnvelopes, runCompositionActivity, soundEnvelopeOnTimeline, type PlacedSound } from "@/lib/sound-synth/activity-media";
import { alignmentReport, turnResponse } from "@/lib/sound-synth/sound-alignment";
import {
  binCount,
  combineCurves,
  compositionIdOf,
  cutActivity,
  elementTitle,
  isVisualElement,
  keyframeActivity,
  normalize,
  overlapsWindow,
  penActivity,
  presetActivity,
  resampleOnto,
  smooth,
  sourceTimeAt,
  summarizeCurve,
  synthEmbed,
  topPeaks,
  type ActivityCurve,
  type ActivityElement,
  type ActivityWindow,
  type CurveKind,
} from "@/lib/sound-synth/visual-activity";

const MAX_WINDOW_SECONDS = 60;
/** Above this frequency counts as the bright part of a sound (a pen's scratch on turns). */
const BRIGHT_HZ = 4000;

function invalid(message: string): never {
  throw toolError("INVALID_ARGUMENTS", message, { action: "fix_arguments", reason: message });
}

type CompositionActivityInput = { element_id: string; activity_js: string; scripts?: string[] };
type SoundInput = { source_url: string; timeline_start: number; source_start_seconds?: number; source_end_seconds?: number; volume?: number; playback_rate?: number; title?: string };

function parseNumber(value: unknown, name: string, min = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) invalid(`${name} must be a number of seconds ≥ ${min}`);
  return value;
}

export function resolveAudioFile(projectId: string, sourceUrl: string): string {
  const local = resolveLocalMediaSource(projectId, sourceUrl, { allowReferencedProject: true });
  if (local) return local.absolutePath;
  const catalog = /^\/api\/sfx-catalog\/media\/(.+)$/.exec(sourceUrl);
  if (catalog) {
    const file = resolveSfxCatalogFile(catalog[1]!.split("/").map(decodeURIComponent).join("/"));
    if (fs.existsSync(file)) return file;
  }
  invalid(`Cannot read the sound at ${sourceUrl}; use a project media URL or a sound-effect Library source_url`);
}

function curveFor(curves: Map<string, ActivityCurve>, name: string, kind: CurveKind, n: number) {
  let curve = curves.get(name);
  if (!curve) {
    curve = { name, kind, values: new Float64Array(n), element_ids: [] };
    curves.set(name, curve);
  }
  return curve;
}

function add(curve: ActivityCurve, values: ArrayLike<number>, elementId: string) {
  for (let index = 0; index < curve.values.length; index += 1) curve.values[index] += values[index] ?? 0;
  if (!curve.element_ids.includes(elementId)) curve.element_ids.push(elementId);
}

/**
 * Visual activity curves for a timeline window and, optionally, how well given sounds
 * follow them. Read-only: never edits the timeline or writes project files.
 */
export async function visualActivityPrepare(projectId: string, body: Record<string, unknown>) {
  const start = parseNumber(body.start_seconds, "start_seconds");
  const end = parseNumber(body.end_seconds, "end_seconds");
  if (end <= start) invalid("end_seconds must be after start_seconds");
  if (end - start > MAX_WINDOW_SECONDS) invalid(`The window can be at most ${MAX_WINDOW_SECONDS} s; prepare one beat or scene at a time`);
  const rate = body.rate === undefined ? 100 : body.rate;
  if (!Number.isInteger(rate) || (rate as number) < 20 || (rate as number) > 200) invalid("rate must be a whole number of values per second, 20–200");
  const window: ActivityWindow = { start, end, rate: rate as number };
  const n = binCount(window);

  const timeline = readTimeline(projectId);
  const all = activeElements(timeline) as unknown as ActivityElement[];
  const byId = new Map(all.map((element) => [element.id, element]));
  let elements = all.filter((element) => isVisualElement(element) && overlapsWindow(element, window));
  if (body.element_ids !== undefined) {
    if (!Array.isArray(body.element_ids) || !body.element_ids.every((id) => typeof id === "string")) invalid("element_ids must list timeline element ids");
    const missing = (body.element_ids as string[]).filter((id) => !byId.has(id));
    if (missing.length) invalid(`Unknown element ids: ${missing.join(", ")}`);
    const wanted = new Set(body.element_ids as string[]);
    elements = elements.filter((element) => wanted.has(element.id));
  }
  const compositionInputs = new Map<string, CompositionActivityInput>();
  if (body.composition_activity !== undefined) {
    if (!Array.isArray(body.composition_activity) || body.composition_activity.length > 6) invalid("composition_activity must list up to 6 { element_id, activity_js }");
    for (const entry of body.composition_activity as CompositionActivityInput[]) {
      if (!entry || typeof entry.element_id !== "string" || typeof entry.activity_js !== "string") invalid("Each composition_activity entry needs element_id and activity_js");
      const element = byId.get(entry.element_id);
      if (!element || !compositionIdOf(element)) invalid(`${entry.element_id} is not a HyperFrames composition clip`);
      if (entry.scripts !== undefined && (!Array.isArray(entry.scripts) || !entry.scripts.every((script) => typeof script === "string"))) invalid("scripts must list .js files in the composition folder");
      compositionInputs.set(entry.element_id, entry);
      if (!elements.some((candidate) => candidate.id === element.id)) elements.push(element);
    }
  }
  const measureFrames = body.measure_frames === undefined ? "auto" : body.measure_frames;
  if (measureFrames !== "auto" && measureFrames !== "never") invalid("measure_frames must be auto or never");

  const curves = new Map<string, ActivityCurve>();
  const sources: Array<{ element_id: string; title: string; read_from: string[]; note?: string }> = [];
  const compositionOnsets: number[] = [];
  const penDowns: number[] = [];

  for (const element of elements) {
    const readFrom: string[] = [];
    let note: string | undefined;
    const props = element.props ?? {};
    const isCamera = element.type === "shape" && props.shape_kind === "camera";
    const keyframed = keyframeActivity(element, window);
    if (keyframed) {
      if (keyframed.draw.some((value) => value > 0)) add(curveFor(curves, "draw", "draw", n), keyframed.draw, element.id);
      if (keyframed.motion.some((value) => value > 0)) add(curveFor(curves, isCamera ? "camera" : "motion", isCamera ? "camera" : "motion", n), keyframed.motion, element.id);
      readFrom.push(`keyframes (${keyframed.fields.join(", ")})`);
    }
    const pen = penActivity(element, window);
    if (pen) {
      add(curveFor(curves, "pen_speed", "pen", n), pen.speed, element.id);
      add(curveFor(curves, "pen_turn", "pen", n), pen.turn, element.id);
      penDowns.push(...pen.pen_down);
      readFrom.push("pen tip along its contours");
    }
    if (isCamera) {
      if (readFrom.length) sources.push({ element_id: element.id, title: elementTitle(element), read_from: readFrom });
      continue;
    }
    const preset = presetActivity(element, window);
    if (preset) {
      add(curveFor(curves, "entrances", "entrances", n), preset, element.id);
      readFrom.push("entrance/exit animation");
    }
    const cut = cutActivity(element, window);
    if (cut) {
      add(curveFor(curves, "cuts", "cuts", n), cut, element.id);
      readFrom.push("hard cut in/out");
    }
    const composition = compositionIdOf(element);
    const input = compositionInputs.get(element.id);
    if (composition && input) {
      const dir = projectHyperframesCompositionDir(projectId, composition);
      if (!fs.existsSync(dir)) {
        throw toolError("COMPOSITION_SOURCE_MISSING", `The composition ${composition} has no source folder in this project, so its scene data cannot be read.`, { action: "fix_arguments", reason: "Omit composition_activity for this clip to measure its rendered frames instead." }, 404);
      }
      const scripts = input.scripts ?? (fs.existsSync(path.join(dir, "scene.js")) ? ["scene.js"] : fs.readdirSync(dir).filter((file) => file.endsWith(".js")).sort());
      const clamp = (time: number) => Math.min(element.timeline_start + element.duration, Math.max(element.timeline_start, time));
      const sourceEnd = Math.max(sourceTimeAt(element, clamp(start)), sourceTimeAt(element, clamp(end)));
      let result;
      try {
        result = runCompositionActivity(dir, scripts, input.activity_js, sourceEnd + 0.5, window.rate);
      } catch (error) {
        throw toolError("ACTIVITY_SCRIPT_FAILED", error instanceof Error ? error.message : String(error), { action: "fix_arguments", reason: "Fix activity_js (or the scripts list) and call again; or omit composition_activity to measure the rendered frames." });
      }
      const mapTime = (time: number) => (time >= element.timeline_start && time <= element.timeline_start + element.duration ? sourceTimeAt(element, time) : null);
      for (const [name, values] of Object.entries(result.curves)) {
        add(curveFor(curves, `composition_${name}`, "composition", n), resampleOnto(values, 0, result.rate, window, mapTime), element.id);
      }
      for (const times of Object.values(result.onsets)) {
        for (const time of times) {
          // Composition clock to timeline clock (constant speed assumed for named onsets).
          const timelineTime = element.timeline_start + (time - (element.trim_start ?? 0)) / (element.playback_rate || 1);
          if (timelineTime >= start && timelineTime <= end) compositionOnsets.push(timelineTime);
        }
      }
      readFrom.push(`composition scene data (${scripts.join(", ")})`);
    } else if (element.type === "video_clip" && measureFrames === "auto") {
      const url = element.source_url ?? "";
      const local = url ? resolveLocalMediaSource(projectId, url, { allowReferencedProject: true }) : null;
      if (!local) {
        note = "Its media file is missing, so its motion was not measured.";
      } else {
        const from = Math.max(start, element.timeline_start);
        const to = Math.min(end, element.timeline_start + element.duration);
        const a = sourceTimeAt(element, from);
        const b = sourceTimeAt(element, to);
        const measured = await measureFrameMotion(local.absolutePath, Math.min(a, b), Math.max(a, b), { alpha: props.has_alpha === true });
        const mapTime = (time: number) => (time >= from && time <= to ? sourceTimeAt(element, time) : null);
        add(curveFor(curves, "frames", "frames", n), resampleOnto(measured.values, measured.start, measured.fps, window, mapTime), element.id);
        readFrom.push(composition ? "rendered frames (no activity_js given)" : "frame motion");
        if (composition) note = "Measured from the render; pass composition_activity with activity_js to read exact timing from the scene data.";
      }
    }
    if (readFrom.length || note) sources.push({ element_id: element.id, title: elementTitle(element), read_from: readFrom, ...(note ? { note } : {}) });
  }

  const smoothed = new Map<string, Float64Array>();
  for (const curve of curves.values()) {
    // Cuts stay sharp; everything else gets 20 ms smoothing.
    smoothed.set(curve.name, normalize(curve.kind === "cuts" ? curve.values : smooth(curve.values, Math.round(0.02 * window.rate))));
  }
  // Pen curves restate the draw curve in more detail, so they stay out of the total.
  const total = combineCurves([...curves.values()].filter((curve) => curve.kind !== "pen").map((curve) => smoothed.get(curve.name)!), n);
  const named: Record<string, Float64Array> = { total, ...Object.fromEntries(smoothed) };

  const response: Record<string, unknown> = {
    window: { start_seconds: start, end_seconds: end, rate: window.rate, values: n },
    total: summarizeCurve(total, window),
    curves: [...curves.values()].map((curve) => ({
      name: curve.name,
      kind: curve.kind,
      element_ids: curve.element_ids,
      ...summarizeCurve(smoothed.get(curve.name)!, window),
    })),
    ...(penDowns.length ? { pen_down_seconds: penDowns.sort((left, right) => left - right).map((time) => Number(time.toFixed(3))) } : {}),
    ...(compositionOnsets.length ? { composition_onsets_seconds: compositionOnsets.sort((left, right) => left - right).map((time) => Number(time.toFixed(3))) } : {}),
    sources,
    synth_embed: synthEmbed(window, named),
  };
  if (body.include_values === true) {
    response.values = Object.fromEntries(Object.entries(named).map(([name, values]) => [name, Array.from(values, (value) => Number(value.toFixed(3)))]));
  }

  const check = await checkSounds(projectId, body, window, named, byId);
  if (check) response.check = check;
  response.next = check
    ? "Report each sound's correlation, median onset offset and uncaused share on the card (assumptions or option summary). If a check failed, fix the timing or the synth curve and check again before proposing."
    : "Make the sound follow the curve: paste synth_embed into sound_synth_prepare's synth_js and drive loudness from activityAt(name, t), or place and trim library sounds on the onsets and peaks. Then call again with check.sounds (or check.proposal_id) and put the numbers on the card.";
  response.limits = "Keyframes, presets, pen curves and composition scene data are exact; frame motion is measured (share of changed pixels per frame at 30 fps, 160 px wide), counts every change (a camera move swamps a small drawing) and cannot tell a subject's motion from a camera shake or lighting change. Nobody has listened yet.";
  return response;
}

async function checkSounds(projectId: string, body: Record<string, unknown>, window: ActivityWindow, curves: Record<string, Float64Array>, byId: Map<string, ActivityElement>) {
  const check = body.check;
  if (check === undefined) return null;
  if (!check || typeof check !== "object") invalid("check must be an object");
  const spec = check as { curve?: unknown; sound_element_ids?: unknown; proposal_id?: unknown; option_id?: unknown; sounds?: unknown };
  const curveName = spec.curve === undefined ? "total" : spec.curve;
  if (typeof curveName !== "string" || !curves[curveName]) invalid(`check.curve must be one of: ${Object.keys(curves).join(", ")}`);
  const placed: PlacedSound[] = [];
  const fromElement = (element: ActivityElement, label?: string): PlacedSound => {
    const props = element.props ?? {};
    const sourceStart = Number(props.source_start_seconds ?? element.trim_start ?? 0);
    const playback = element.playback_rate || 1;
    return {
      label: label ?? elementTitle(element),
      file: resolveAudioFile(projectId, element.source_url ?? ""),
      timeline_start: element.timeline_start,
      source_start: sourceStart,
      source_end: sourceStart + element.duration * playback,
      volume: typeof (element as { volume?: unknown }).volume === "number" ? (element as unknown as { volume: number }).volume : 1,
      playback_rate: playback,
      ...(Array.isArray(props.volume_envelope) ? { volume_envelope: props.volume_envelope as PlacedSound["volume_envelope"] } : {}),
    };
  };
  if (spec.sound_element_ids !== undefined) {
    if (!Array.isArray(spec.sound_element_ids) || spec.sound_element_ids.length > 12) invalid("check.sound_element_ids must list up to 12 timeline sound ids");
    for (const id of spec.sound_element_ids as string[]) {
      const element = byId.get(id);
      if (!element || isVisualElement(element)) invalid(`${id} is not a sound on the timeline`);
      placed.push(fromElement(element));
    }
  }
  if (spec.proposal_id !== undefined) {
    if (typeof spec.proposal_id !== "string") invalid("check.proposal_id must be a proposal id");
    const record = readProposal(projectId, spec.proposal_id);
    const options = (record.proposal as { options?: Array<{ id?: string; recommended?: boolean; operations?: Array<Record<string, unknown>> }> }).options ?? [];
    const option = spec.option_id !== undefined
      ? options.find((candidate) => candidate.id === spec.option_id)
      : options.find((candidate) => candidate.recommended) ?? options[0];
    if (!option) invalid("That proposal has no such option");
    for (const operation of option.operations ?? []) {
      const create = operation.create_audio as Record<string, unknown> | undefined;
      if (!create || typeof create.source_url !== "string") continue;
      const follows = create.follows_visual as { element_id?: string; offset_seconds?: number } | undefined;
      const anchor = follows?.element_id ? byId.get(follows.element_id) : undefined;
      const timelineStart = typeof create.timeline_start === "number" ? create.timeline_start : (anchor?.timeline_start ?? 0) + (follows?.offset_seconds ?? 0);
      const sourceStart = typeof create.source_start_seconds === "number" ? create.source_start_seconds : 0;
      placed.push({
        label: typeof create.title === "string" ? create.title : create.source_url,
        file: resolveAudioFile(projectId, create.source_url),
        timeline_start: timelineStart,
        source_start: sourceStart,
        source_end: typeof create.source_end_seconds === "number" ? create.source_end_seconds : sourceStart + Number(create.source_duration_seconds ?? 30),
        volume: typeof create.volume === "number" ? create.volume : 1,
        playback_rate: typeof create.playback_rate === "number" ? create.playback_rate : 1,
      });
    }
  }
  if (spec.sounds !== undefined) {
    if (!Array.isArray(spec.sounds) || spec.sounds.length > 12) invalid("check.sounds must list up to 12 sounds");
    for (const sound of spec.sounds as SoundInput[]) {
      if (!sound || typeof sound.source_url !== "string" || typeof sound.timeline_start !== "number") invalid("Each check.sounds entry needs source_url and timeline_start");
      const sourceStart = sound.source_start_seconds ?? 0;
      placed.push({
        label: sound.title ?? sound.source_url,
        file: resolveAudioFile(projectId, sound.source_url),
        timeline_start: sound.timeline_start,
        source_start: sourceStart,
        source_end: sound.source_end_seconds ?? sourceStart + 30,
        volume: sound.volume ?? 1,
        playback_rate: sound.playback_rate ?? 1,
      });
    }
  }
  if (!placed.length) invalid("check needs sound_element_ids, proposal_id or sounds");
  const n = binCount(window);
  const envelopes = await Promise.all(placed.map((sound) => soundEnvelopeOnTimeline(sound, window.start, window.rate, n)));
  const curve = curves[curveName]!;
  const mix = mixEnvelopes(envelopes, n);
  // Drawn strokes: does the sound change where the pen turns sharply?
  const turnCurve = curves.pen_turn;
  const turnTimes = turnCurve ? topPeaks(turnCurve, window.rate, 50, 0.08).filter((peak) => peak.value >= 0.5).map((peak) => peak.time) : [];
  const turns = turnTimes.length
    ? turnResponse(turnTimes, mix, mixEnvelopes(await Promise.all(placed.map((sound) => soundEnvelopeOnTimeline(sound, window.start, window.rate, n, { highpassHz: BRIGHT_HZ }))), n), window.rate, window.start)
    : undefined;
  return {
    curve: curveName,
    mix: alignmentReport(curve, mix, window.rate, window.start),
    ...(turns ? { turns } : {}),
    sounds: placed.map((sound, index) => ({ title: sound.label, timeline_start: sound.timeline_start, ...alignmentReport(curve, envelopes[index]!, window.rate, window.start) })),
    ...(turns ? { turns_note: "turns: for each sharp pen turn, how much brighter (energy above 4 kHz) or louder the mix is within 30 ms than the stroke around it; median_response >= 1.25 passes." } : {}),
    note: "Each sound is compared with the chosen curve on its own and the mix of all of them likewise. A sound that follows only part of the picture (one curve) scores better against that curve: pass check.curve.",
  };
}
