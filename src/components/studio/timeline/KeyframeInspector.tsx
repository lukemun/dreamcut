"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SliderScrubControl } from "./InspectorNumericControls";
import { collectElementAutomationTimes, elementAutomationValuesAtTime, volumeAutomationPointIndexAtTime, VOLUME_ENVELOPE_FIELD } from "@/lib/timeline/automation-keyframes";
import { readKeyframeMap, type KeyframeEase, type KeyframeValue } from "@/lib/timeline/keyframes";
import { SPEED_KEYFRAME_FIELD } from "@/lib/timeline/speed-steps";
import { readVolumeEnvelopePoints } from "@/lib/timeline/volume-envelope";
import { FADER_MIN_DB, FADER_MAX_DB, gainToFaderDb, faderDbToGain } from "@/lib/timeline/audio-gain";

import { InspectorDisclosure, inspectorQuietButtonClassName } from "./InspectorHierarchy";
import type { TimelineElement } from "./types";

const FIELD_LABELS: Record<string, string> = {
  media_scale: "Scale",
  media_offset_x: "Horizontal position",
  media_offset_y: "Vertical position",
  media_opacity: "Opacity",
  mask_inset: "Mask edges",
  mask_feather: "Mask feather",
  grade_exposure_ev: "Exposure",
  grade_contrast: "Contrast",
  grade_highlights: "Highlights",
  grade_shadows: "Shadows",
  grade_whites: "Whites",
  grade_blacks: "Blacks",

  grade_saturation: "Saturation",
  grade_temperature: "Temperature",
  grade_tint: "Tint",
  grade_hue_degrees: "Hue",
  grade_lift_rgb: "Lift RGB",
  grade_gamma_rgb: "Gamma RGB",
  grade_gain_rgb: "Gain RGB",
  grade_curve_master: "Master curve",
  lut_intensity: "LUT intensity",
  chroma_key_tolerance: "Key tolerance",
  chroma_key_softness: "Key softness",
  chroma_key_spill: "Spill suppression",
  subject_flash: "White flash",
  gradient_map_amount: "Color map",
  gradient_map_contrast: "Color map contrast",
  glitch_amount: "Glitch",
  glitch_shift: "Glitch shift",
  glitch_rgb_split: "Glitch color split",
  glitch_smear: "Glitch smear",
  subject_glow: "Glow strength",
  subject_glow_radius: "Glow radius",
  directional_blur_x: "Horizontal blur",
  directional_blur_y: "Vertical blur",
  playback_rate: "Speed",
  volume_envelope: "Volume",
};

function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

type NumericControl = {
  min: number;
  max: number;
  step: number;
  unit?: string;
  labels?: readonly string[];
  toDisplay?: (value: number) => number;
  fromDisplay?: (value: number) => number;
};

const percentControl = (max = 100): NumericControl => ({
  min: 0,
  max,
  step: 1,
  unit: "%",
  toDisplay: (value) => value * 100,
  fromDisplay: (value) => value / 100,
});

const FIELD_CONTROLS: Record<string, NumericControl> = {
  subject_flash: percentControl(),
  gradient_map_amount: percentControl(),
  gradient_map_contrast: { min: 0.25, max: 3, step: 0.05, unit: "×" },
  glitch_amount: percentControl(),
  glitch_shift: percentControl(50),
  glitch_rgb_split: { min: 0, max: 60, step: 1, unit: "px" },
  glitch_smear: percentControl(),
  subject_glow: percentControl(300),
  subject_glow_radius: { min: 0, max: 80, step: 1, unit: "px" },
  directional_blur_x: { min: 0, max: 1080, step: 1, unit: "px" },
  directional_blur_y: { min: 0, max: 1080, step: 1, unit: "px" },
  media_scale: { min: 0.1, max: 3, step: 0.01, unit: "×" },
  media_offset_x: { min: -2, max: 2, step: 0.01 },
  media_offset_y: { min: -2, max: 2, step: 0.01 },
  media_opacity: percentControl(),
  mask_inset: { ...percentControl(95), labels: ["Top", "Right", "Bottom", "Left"] },
  mask_feather: percentControl(50),
  grade_exposure_ev: { min: -3, max: 3, step: 0.01, unit: "EV" },
  grade_highlights: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_shadows: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_whites: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_blacks: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_contrast: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => (value - 1) * 100, fromDisplay: (value) => 1 + value / 100 },
  grade_saturation: { min: -100, max: 100, step: 0.1, unit: "%", toDisplay: (value) => (value - 1) * 100, fromDisplay: (value) => 1 + value / 100 },
  grade_temperature: { min: -100, max: 100, step: 0.1, toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_tint: { min: -100, max: 100, step: 0.1, toDisplay: (value) => value * 100, fromDisplay: (value) => value / 100 },
  grade_hue_degrees: { min: -180, max: 180, step: 0.1, unit: "°" },
  grade_lift_rgb: { min: -0.25, max: 0.25, step: 0.005, labels: ["Red", "Green", "Blue"] },
  grade_gamma_rgb: { min: 0.25, max: 4, step: 0.01, labels: ["Red", "Green", "Blue"] },
  grade_gain_rgb: { min: 0, max: 4, step: 0.01, labels: ["Red", "Green", "Blue"] },
  grade_curve_master: { min: 0, max: 1, step: 0.005, labels: ["Black", "Point 1", "Point 2", "Point 3", "Midpoint", "Point 5", "Point 6", "Point 7", "White"] },
  lut_intensity: percentControl(),
  chroma_key_tolerance: percentControl(),
  chroma_key_softness: percentControl(),
  chroma_key_spill: percentControl(),
  playback_rate: { min: 0.25, max: 4, step: 0.05, unit: "×" },
  volume_envelope: {
    min: FADER_MIN_DB, max: FADER_MAX_DB, step: 0.1, unit: "dB",
    toDisplay: (gain) => gainToFaderDb(gain) ?? FADER_MIN_DB,
    fromDisplay: faderDbToGain,
  },
};

function fallbackControl(value: number): NumericControl {
  const extent = Math.max(1, Math.abs(value) * 2);
  return { min: value < 0 ? -extent : 0, max: extent, step: 0.01 };
}

function formatInput(value: number, step: number) {
  const precision = Math.max(0, `${step}`.split(".")[1]?.length ?? 0);
  return value.toFixed(precision);
}

function ScalarKeyframeControl({
  field,
  label,
  value,
  config,
  onChange,
  onPreview,
}: {
  field: string;
  label: string;
  value: number;
  config: NumericControl;
  onChange: (value: number) => void;
  onPreview?: (value: number | null) => void;
}) {
  const displayValue = config.toDisplay?.(value) ?? value;
  const [draft, setDraft] = useState(() => formatInput(displayValue, config.step));
  useEffect(() => setDraft(formatInput(displayValue, config.step)), [displayValue, config.step]);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => () => previewRef.current?.(null), []);
  const commit = (next: number) => {
    onPreview?.(null);
    if (!Number.isFinite(next)) { setDraft(formatInput(displayValue, config.step)); return; }
    const clamped = Math.min(config.max, Math.max(config.min, next));
    setDraft(formatInput(clamped, config.step));
    const nextValue = config.fromDisplay?.(clamped) ?? clamped;
    if (Math.abs(nextValue - value) < 1e-9) return;
    onChange(nextValue);
  };
  const draftNumber = Number.parseFloat(draft);
  const sliderValue = Number.isFinite(draftNumber) ? Math.min(config.max, Math.max(config.min, draftNumber)) : displayValue;
  return (
    <div data-keyframe-input={field} style={{ display: "grid", gap: 6 }}>
      <SliderScrubControl
        value={draft}
        min={config.min}
        max={config.max}
        step={config.step}
        fallback={displayValue}
        label={label}
        unit={config.unit}
        density="compact"
        largeTarget={field === VOLUME_ENVELOPE_FIELD}
        disabled={false}
        onChange={next => {
          setDraft(next);
          const number = Number.parseFloat(next);
          if (Number.isFinite(number)) {
            const bounded = Math.min(config.max, Math.max(config.min, number));
            onPreview?.(config.fromDisplay?.(bounded) ?? bounded);
          }
        }}
        onCommit={(next) => commit(Number.parseFloat(next ?? draft))}
        onCancel={() => { setDraft(formatInput(displayValue, config.step)); onPreview?.(null); }}
      />
      {field === VOLUME_ENVELOPE_FIELD ? <span style={{ gridColumn: "1 / -1", fontSize: "var(--ui-text-small)", color: "var(--ink-muted)" }}>{sliderValue <= FADER_MIN_DB ? "Muted" : "0 dB = original level"}</span> : null}
    </div>
  );
}

const RULER_HEIGHT = 16;
const LANE_HEIGHT = 26;
/** A click this close to a keyframe selects it rather than moving the playhead. */
const KEYFRAME_REACH_PX = 10;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];

function rulerTicks(duration: number) {
  if (!(duration > 0)) return [];
  const step = TICK_STEPS.find(candidate => duration / candidate <= 16) ?? 120;
  const majorEvery = step < 1 ? Math.round(1 / step) : 5;
  return Array.from({ length: Math.floor(duration / step + 1e-6) + 1 }, (_, index) => ({ time: index * step, major: index % majorEvery === 0 }));
}

export function KeyframeStrip({
  element,
  selectedTimeSeconds,
  onSelect,
  onRetime,
  addControl,
  children,
  playheadSeconds,
  onSeek,
}: {
  element: TimelineElement;
  selectedTimeSeconds: number | null;
  onSelect: (timeSeconds: number) => void;
  onRetime: (fromTimeSeconds: number, toTimeSeconds: number) => void;
  addControl?: React.ReactNode;
  children?: React.ReactNode;
  playheadSeconds: number;
  onSeek: (timeSeconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), [element.id]);
  useEffect(() => { if (selectedTimeSeconds != null) setOpen(true); }, [selectedTimeSeconds]);
  const [drag, setDrag] = useState<{ from: number; current: number } | null>(null);
  const times = useMemo(() => collectElementAutomationTimes(element), [element]);
  const ticks = useMemo(() => rulerTicks(element.duration), [element.duration]);
  // The player settles on whole frames; while a keyframe is selected the playhead sits on it.
  const playheadAt = selectedTimeSeconds ?? playheadSeconds;
  const playheadFraction = Math.max(0, Math.min(1, playheadAt / (element.duration || 1)));

  useEffect(() => setDrag(null), [element.id]);

  const timeFromPointer = (clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return 0;
    const fraction = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    return Math.min(element.duration, Math.round(fraction * element.duration * 30) / 30);
  };

  return (
    <section data-testid="keyframe-strip" aria-label="Clip keyframes" style={{ padding: open ? "6px 14px 10px" : "4px 14px", background: "var(--chrome-deep)" }}>
      <InspectorDisclosure title="Keyframes" open={open} onOpenChange={(next) => { dragCleanup.current?.(); setDrag(null); setOpen(next); }} actions={<>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous keyframe"
          disabled={!times.some(time => time < playheadSeconds - 0.001)}
          onClick={() => { const time = times.filter(time => time < playheadSeconds - 0.001).at(-1); if (time != null) onSelect(time); }}>‹</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next keyframe"
          disabled={!times.some(time => time > playheadSeconds + 0.001)}
          onClick={() => { const time = times.find(time => time > playheadSeconds + 0.001); if (time != null) onSelect(time); }}>›</Button>
        {addControl}
      </>}>
      <div className="flex justify-between text-[10px] text-[var(--ink-muted)]"><span>0:00</span><span>{element.duration.toFixed(2)}s</span></div>
      <div ref={trackRef} style={{ position: "relative", height: RULER_HEIGHT + LANE_HEIGHT, marginInline: 8 }}>
        <div role="slider" tabIndex={0} aria-label="Clip playhead" aria-valuemin={0} aria-valuemax={element.duration}
          aria-valuenow={Math.max(0, Math.min(element.duration, playheadSeconds))}
          aria-valuetext={`${playheadSeconds.toFixed(2)} seconds`}
          onKeyDown={(event) => {
            const next = event.key === "Home" ? 0 : event.key === "End" ? element.duration
              : event.key === "ArrowLeft" ? playheadSeconds - 1 / 30
                : event.key === "ArrowRight" ? playheadSeconds + 1 / 30 : null;
            if (next == null) return;
            event.preventDefault();
            onSeek(Math.max(0, Math.min(element.duration, next)));
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            onSeek(timeFromPointer(event.clientX));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            if (event.buttons === 0) { event.currentTarget.releasePointerCapture(event.pointerId); return; }
            onSeek(timeFromPointer(event.clientX));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          className="rounded-sm outline-none hover:bg-[var(--chrome-raised)] focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
          style={{ position: "absolute", top: 0, left: -8, right: -8, height: RULER_HEIGHT, cursor: "ew-resize", touchAction: "none" }}>
          {ticks.map(({ time, major }) => <span key={time} aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", left: `calc(8px + (100% - 16px) * ${time / (element.duration || 1)})`, bottom: 0, width: 1, height: major ? 7 : 4, background: "var(--chrome-line-strong)" }} />)}
        </div>
        <div
          data-testid="keyframe-lane"
          onPointerDown={(event) => {
            // Empty lane: pick the nearest keyframe within reach, otherwise move the playhead there.
            if (event.button !== 0) return;
            const bounds = trackRef.current?.getBoundingClientRect();
            if (!bounds || bounds.width <= 0) return;
            const near = times.map(time => ({ time, px: Math.abs(bounds.left + (time / (element.duration || 1)) * bounds.width - event.clientX) }))
              .filter(item => item.px <= KEYFRAME_REACH_PX).sort((a, b) => a.px - b.px)[0];
            event.preventDefault();
            if (near) onSelect(near.time);
            else onSeek(timeFromPointer(event.clientX));
          }}
          style={{ position: "absolute", left: -8, right: -8, top: RULER_HEIGHT, height: LANE_HEIGHT, borderRadius: 4, background: "var(--chrome-panel)", cursor: "pointer", touchAction: "none" }} />
        <div data-testid="keyframe-playhead" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", left: `${playheadFraction * 100}%`, top: 0, bottom: 0, width: 0, zIndex: 3 }}>
          <div style={{ position: "absolute", top: RULER_HEIGHT - 9, left: -6, width: 12, height: 9, background: "var(--chrome-focus-ring)", clipPath: "polygon(0 0, 100% 0, 100% 45%, 50% 100%, 0 45%)" }} />
          <div style={{ position: "absolute", top: RULER_HEIGHT - 1, bottom: 0, left: -1, width: 2, background: "var(--chrome-focus-ring)" }} />
        </div>
        {times.map((time) => {
          const displayTime = drag?.from === time ? drag.current : time;
          const selected = selectedTimeSeconds != null && Math.abs(selectedTimeSeconds - time) < 0.001;
          return (
            <button
              key={time}
              type="button"
              aria-label={`Keyframe at ${time.toFixed(2)} seconds`}
              aria-pressed={selected}
              title={`${time.toFixed(2)}s`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(time);
                  return;
                }
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const next = Math.min(element.duration, Math.max(0, time + (event.key === "ArrowRight" ? 1 : -1) / 30));
                onRetime(time, next);
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.focus();
                dragCleanup.current?.();
                onSelect(time);
                setDrag({ from: time, current: time });
                const onMove = (moveEvent: PointerEvent) => setDrag({ from: time, current: timeFromPointer(moveEvent.clientX) });
                const finish = (upEvent: PointerEvent) => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", finish);
                  window.removeEventListener("pointercancel", cancel);
                  const next = timeFromPointer(upEvent.clientX);
                  setDrag(null);
                  if (Math.abs(upEvent.clientX - event.clientX) > 3 && Math.abs(next - time) > 0.001) onRetime(time, next);
                };
                const cancel = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", finish);
                  window.removeEventListener("pointercancel", cancel);
                  setDrag(null);
                };
                dragCleanup.current = cancel;
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", finish);
                window.addEventListener("pointercancel", cancel);
              }}
              className="group outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-[var(--chrome-focus-ring)]"
              style={{
                position: "absolute",
                left: `${element.duration > 0 ? (displayTime / element.duration) * 100 : 0}%`,
                top: RULER_HEIGHT,
                width: 22,
                height: LANE_HEIGHT,
                padding: 0,
                border: 0,
                background: "transparent",
                transform: "translateX(-50%)",
                cursor: drag?.from === time ? "grabbing" : "pointer",
                zIndex: selected ? 4 : 2,
                touchAction: "none",
                display: "grid",
                placeItems: "center",
              }}
            ><span aria-hidden="true" className={selected ? "" : "group-hover:bg-[var(--ink)]"} style={{ display: "block", width: selected ? 6 : 4, height: selected ? 20 : 16, borderRadius: 3, background: selected ? "var(--chrome-focus-ring)" : "var(--ink-secondary)", boxShadow: "0 0 0 2px var(--chrome-panel)" }} /></button>
          );
        })}
      </div>
      {children}
      </InspectorDisclosure>
    </section>
  );
}

export function KeyframeValuesPanel({
  element,
  timeSeconds,
  onChangeValue,
  onPreviewValue,
  onChangeEase,
  onDeleteField,
  onDeleteMoment,
  onAddField,
}: {
  element: TimelineElement;
  timeSeconds: number;
  /** Key a property that is animated elsewhere on the clip at this moment, at its current value. */
  onAddField?: (field: string) => void;
  onChangeValue?: (field: string, value: KeyframeValue) => void;
  onPreviewValue?: (field: string, value: KeyframeValue | null) => void;
  onChangeEase?: (field: string, ease: KeyframeEase) => void;
  onDeleteField?: (field: string) => void;
  onDeleteMoment?: () => void;
}) {
  const values = elementAutomationValuesAtTime(element, timeSeconds);
  const volumePointIndex = volumeAutomationPointIndexAtTime(element, timeSeconds);
  const volumePointCount = readVolumeEnvelopePoints(element, element.duration).length;
  const volumePointCanDelete = volumePointIndex > 0 && volumePointIndex < volumePointCount - 1;
  const keyedHere = new Set(values.map(({ field }) => field));
  const missingFields = Object.keys(readKeyframeMap(element.props)).filter(field => field !== SPEED_KEYFRAME_FIELD && !keyedHere.has(field));
  const momentCanDelete = values.some(({ field }) => field !== VOLUME_ENVELOPE_FIELD) || volumePointCanDelete;
  const easeOptions: { value: KeyframeEase; label: string; title: string }[] = [
    { value: "hold", label: "Hold", title: "Hold until the next keyframe" },
    { value: "linear", label: "Linear", title: "Move at a constant rate" },
    { value: "easeIn", label: "In", title: "Ease in" },
    { value: "easeOut", label: "Out", title: "Ease out" },
    { value: "easeInOut", label: "In + out", title: "Ease in and out" },
  ];
  return (
    <section aria-label="Selected keyframe values" style={{ display: "grid", gap: 8, padding: "10px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: "block", color: "var(--ink)", fontSize: "var(--ui-text-small)" }}>At {timeSeconds.toFixed(2)}s</strong>

        </span>
        <Button type="button" variant="ghost" size="sm" disabled={!onDeleteMoment || !momentCanDelete} onClick={onDeleteMoment} className={`h-8 px-2.5 text-xs ${inspectorQuietButtonClassName}`}>
          <Trash2Icon aria-hidden="true" className="size-3.5" /> Delete keyframe
        </Button>
      </div>
      <div style={{ minWidth: 0 }}>
        {values.map(({ field, value, ease, interpolationLocked }) => {
          const firstValue = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value);
          const config = FIELD_CONTROLS[field] ?? fallbackControl(firstValue);
          const entryIndexes = Array.isArray(value)
            ? field === "grade_curve_master"
              ? value.map((_, index) => index).slice(1, -1)
              : value.map((_, index) => index)
            : [0];
          return (
          <div key={field} data-keyframe-value={field} style={{ display: "grid", gap: 7, padding: "8px 9px", background: "transparent" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ color: "var(--ink)", fontSize: "var(--ui-text-small)" }}>{fieldLabel(field)}</strong>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span role="radiogroup" aria-label={`${fieldLabel(field)} interpolation`} style={{ display: "flex", overflow: "hidden", border: "1px solid var(--chrome-line-strong)", borderRadius: 4 }}>
                  {easeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={ease === option.value}
                      title={option.title}
                      disabled={!onChangeEase || field === "playback_rate" || interpolationLocked}
                      onClick={() => onChangeEase?.(field, option.value)}
                      style={{ height: 26, paddingInline: 7, border: 0, background: ease === option.value ? "var(--chrome-selected-bg)" : "var(--chrome-deep)", boxShadow: ease === option.value ? "inset 0 0 0 1px var(--chrome-selected-ring)" : undefined, color: ease === option.value ? "var(--ink)" : "var(--ink-secondary)", fontSize: "0.66rem", fontWeight: 650, cursor: !onChangeEase || field === "playback_rate" || interpolationLocked ? "default" : "pointer" }}
                    >
                      {option.label}
                    </button>
                  ))}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${fieldLabel(field)} keyframe`} title={`Delete ${fieldLabel(field)} keyframe`} disabled={!onDeleteField || (field === VOLUME_ENVELOPE_FIELD && !volumePointCanDelete)} onClick={() => onDeleteField?.(field)} className="size-7 text-[var(--ink-muted)]">
                  <Trash2Icon aria-hidden="true" className="size-3.5" />
                </Button>
              </span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {entryIndexes.map((valueIndex) => {
                const entry = Array.isArray(value) ? value[valueIndex]! : value;
                const entryConfig = field === "grade_curve_master" && Array.isArray(value)
                  ? { ...config, min: Number(value[valueIndex - 1] ?? 0), max: Number(value[valueIndex + 1] ?? 1) }
                  : config;
                return (
                <div key={valueIndex} style={{ display: "grid", gridTemplateColumns: config.labels ? "64px minmax(0, 1fr)" : "minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
                  {config.labels ? <span style={{ color: "var(--ink-secondary)", fontSize: "var(--ui-text-small)" }}>{config.labels[valueIndex] ?? `Value ${valueIndex + 1}`}</span> : null}
                  <ScalarKeyframeControl
                    field={field}
                    label={config.labels?.[valueIndex] ? `${fieldLabel(field)} ${config.labels[valueIndex]}` : fieldLabel(field)}
                    value={Number(entry)}
                    config={entryConfig}
                    onPreview={next => onPreviewValue?.(field, next == null ? null : Array.isArray(value)
                      ? value.map((item, index) => index === valueIndex ? next : item) : next)}
                    onChange={(next) => {
                      if (!onChangeValue) return;
                      if (!Array.isArray(value)) onChangeValue(field, next);
                      else onChangeValue(field, value.map((item, itemIndex) => itemIndex === valueIndex ? next : item));
                    }}
                  />
                </div>
                );
              })}
            </div>
          </div>
          );
        })}
        {onAddField ? missingFields.map(field => (
          <div key={field} data-keyframe-missing={field} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 9px" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: "var(--ui-text-small)" }}>{fieldLabel(field)}</span>
            <Button type="button" variant="ghost" size="sm" aria-label={`Add ${fieldLabel(field)} at this keyframe`} onClick={() => onAddField(field)} className={`h-7 px-2 text-xs ${inspectorQuietButtonClassName}`}>
              <PlusIcon aria-hidden="true" className="size-3.5" /> Add
            </Button>
          </div>
        )) : null}
      </div>
    </section>
  );
}
