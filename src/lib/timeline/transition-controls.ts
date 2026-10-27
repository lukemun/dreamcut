import {currentFrameRate} from './frame-rate-scope';
import { z } from "zod";
import { COMPOSITION_FPS, MIN_TRANSITION_FRAMES } from "./frame-quantization";

/** Boundary-transition parameters own their schema, display and defaults together. */
export const TRANSITION_CONTROLS = [
  { field: "duration_seconds", label: "Blend duration", min: MIN_TRANSITION_FRAMES / COMPOSITION_FPS, max: 2, step: 1 / COMPOSITION_FPS, scale: COMPOSITION_FPS, suffix: "frames", default: .5 },
  { field: "params.whip_blur_strength", label: "Motion blur", min: 0, max: 3, step: .05, suffix: "×", default: 1 },
  { field: "params.whip_zoom_percent", label: "Zoom pulse", min: 0, max: 100, step: 1, suffix: "%", default: 0 },
  { field: "params.smear_zoom_percent", label: "Smear zoom", min: 0, max: 100, step: 1, suffix: "%", default: 35 },
  { field: "params.smear_travel_percent", label: "Smear travel", min: 0, max: 100, step: 1, suffix: "%", default: 12 },
  { field: "params.accent_strength", label: "Strength", min: 0, max: 1, step: .01, scale: 100, suffix: "%", default: 1 },
  { field: "params.accent_hold", label: "Peak hold", min: 0, max: .8, step: .01, scale: 100, suffix: "%", default: 0 },
  { field: "params.page_curl", label: "Page curl", min: 0, max: 2, step: .01, suffix: "×", default: .55 },
  { field: "params.motion_start_progress", label: "Motion delay", min: 0, max: .95, step: .01, suffix: "%", scale: 100, default: 0 },
  { field: "params.audio_fade_start_progress", label: "Audio fade start", min: 0, max: .95, step: .01, suffix: "%", scale: 100, default: 0 },
  { field: "params.audio_fade_duration_seconds", label: "Audio fade duration", min: 1 / 30, max: 2, step: 1 / 30, suffix: "s", default: .5 },
] as const;

export function transitionControl(field: string) {
  return TRANSITION_CONTROLS.find(control => control.field === field);
}

/** Applicability and implicit defaults are shared by review, validation and tuning.
 * Audio fade duration follows the transition clock when it is not authored. */
export function availableTransitionFields(target: Record<string, unknown>) {
  const params = target.params as Record<string, unknown> | undefined;
  return TRANSITION_CONTROLS.filter(control => {
    if (control.field === "params.accent_strength" || control.field === "params.accent_hold") return ["film_burn", "camera_flash", "blackout"].includes(String(target.type));
    if (control.field === "params.page_curl") return target.type === "page_turn";
    if (control.field === "params.whip_zoom_percent") return target.type === "whip" && params?.motion !== "smear";
    if (control.field === "params.whip_blur_strength") return target.type === "whip" || (target.type === "slide" && params?.motion === "smear");
    if (control.field === "params.smear_zoom_percent" || control.field === "params.smear_travel_percent") return ["whip", "slide"].includes(String(target.type)) && params?.motion === "smear";
    return true;
  });
}

export function availableTransitionFieldValue(target: Record<string, unknown> | undefined, field: string): unknown {
  if (!target) return undefined;
  const authored = proposedFieldValue(target, field);
  if (authored !== undefined) return authored;
  const control = availableTransitionFields(target).find(control => control.field === field);
  if (!control) return undefined;
  if (field === "params.audio_fade_duration_seconds") {
    const start = proposedFieldValue(target, "params.audio_fade_start_progress") ?? 0;
    return Math.max(1 / currentFrameRate(), Number(target.duration_seconds) * (1 - Number(start)));
  }
  return control.default;
}

export function transitionNumberSchema(field: string) {
  const control = transitionControl(field);
  if (!control) throw new Error(`Unregistered transition parameter: ${field}`);
  return z.number().finite().min(control.min).max(control.max);
}

/** Read authored values through bounded, registered parameter paths. */
export function proposedFieldValue(target: Record<string, unknown> | undefined, field: string): unknown {
  if (!target) return undefined;
  if (!field.startsWith("params.")) return target[field];
  if (!transitionControl(field)) return undefined;
  const params = target.params;
  return params && typeof params === "object" ? (params as Record<string, unknown>)[field.slice(7)] : undefined;
}

export function setProposedTransitionField(target: Record<string, unknown>, field: string, value: number) {
  transitionNumberSchema(field).parse(value);
  if (availableTransitionFieldValue(target, field) === undefined) throw new Error("Only applicable transition parameters may be tuned");
  if (field.startsWith("params.")) {
    target.params ??= {};
    (target.params as Record<string, unknown>)[field.slice(7)] = value;
  }
  else target[field] = value;
}

export function resolveTransitionNumber(params: Record<string, unknown> | null | undefined, field: string) {
  const control = transitionControl(field);
  if (!control) throw new Error(`Unregistered transition parameter: ${field}`);
  const raw = params?.[field.replace(/^params\./, "")];
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(control.min, Math.min(control.max, raw)) : control.default;
}
