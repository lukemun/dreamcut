"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { InspectorEffectNumber } from "./InspectorEffectNumber";
import { InspectorItemHeader, InspectorDisclosure, inspectorQuietButtonClassName } from "./InspectorHierarchy";
import { AnimationPresetPreview } from "./AnimationPresetPreview";
import { InspectorVisualChoice } from "./InspectorVisualChoice";
import { LayerBlendControl } from "./LayerBlendControl";
import { GridMatteControls } from "./GridMatteControls";
import { SubjectWindowControls } from "./SubjectWindowControls";
import { InspectorSection, InspectorSectionFilterContext } from "./InspectorSection";
import { ClipTrimRangeControl } from "./ClipTrimRangeControl";
import { ScrubNumberInput, SliderScrubControl } from "./InspectorNumericControls";
export { ScrubNumberInput } from "./InspectorNumericControls";
import { InspectorPropertyControl, KeyframeToggleButton } from "./InspectorPropertyControl";
import { handwritingPackStatus } from "@/lib/timeline/handwriting-status";
import { ClipEffects } from "./ClipEffects";
import { SubjectGlowControls } from "./SubjectGlowControls";
import { ClipLookControls } from "./ClipLookControls";
import { TransitionEffectControls } from "./TransitionEffectControls";
import { Fragment } from "react";
import { ColorWaveform, type ColorScopeMode } from "./ColorWaveform";
import { ColorGradeAdvancedControls } from "./ColorGradeAdvancedControls";
import { edgeAuraSchema } from "@/lib/timeline/edge-aura";
import { OutlineLayerControls } from "./OutlineLayerControls";
import { ColorSwatchInput } from "./InspectorColorControl";
import { CutoutEffectControls } from "./CutoutEffectControls";
import { fractionToPercent, percentToFraction } from "./inspector-display-values";
import { resolvePaperFill } from "@/lib/timeline/paper-fill";
import { resolveRecolor } from "@/lib/timeline/recolor";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, LockIcon, Maximize2Icon, MinusIcon, PanelRightOpenIcon, PipetteIcon, PlusIcon, RotateCcwIcon, Trash2Icon, UnlockIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, OptionSelect } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { CaptionAudioLinkControl } from "./CaptionAudioLinkControl";
import { resolveEditableSpeechSourceElement } from "./timeline-actions";
import {
  getMaxExtendableTimelineDuration,
  getSourceDurationSeconds,
  supportsPlaybackRate,
} from "@/lib/timeline/media";
import { minTimelineDurationSeconds, quantizeVisualFrameSpan } from "@/lib/timeline/frame-quantization";
import { isAudioElementType, type AnimationPreset } from "@/lib/timeline/animation-presets";
import {
  faderDbToGain,
  gainToFaderDb,
  resultingLufs,
  roleForAudioElement,
  FADER_MIN_DB,
  FADER_MAX_DB,
} from "@/lib/timeline/audio-gain";
import {
  VOICE_ENHANCEMENT_DEFAULT_STRENGTH,
  type AudioEffectAction,
} from "@/lib/timeline/audio-effects";
import {
  VIDEO_STABILIZATION_DEFAULT_STRENGTH,
  type VideoStabilizationAction,
  type VideoStabilizationMode,
} from "@/lib/timeline/video-stabilization";
import { ROLE_LOUDNESS_TARGETS } from "@/lib/qc/standards";
import {
  clearPreviewAudioGain,
  setPreviewAudioGain,
} from "@/lib/remotion/preview-audio-gain-store";
import { elementAutomationValuesAtTime, volumeAutomationPointIndexAtTime, VOLUME_ENVELOPE_FIELD } from "@/lib/timeline/automation-keyframes";
import { countKeyframes, hasKeyframeAtTime, readKeyframeMap, removeKeyframesAtTime, updateKeyframeAtTime, writeKeyframeMap, type KeyframeEase, type KeyframeValue } from "@/lib/timeline/keyframes";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { moveEnvelopePoint, readVolumeEnvelopePoints, writeVolumeEnvelopePatch } from "@/lib/timeline/volume-envelope";
import {
  PLAYBACK_REVERSE_PROP,
  setSpeedAtTime,
  speedAtTimelineTime,
  speedStepDuration,
  SPEED_KEYFRAME_FIELD,
  toggleSpeedStepAtTime,
} from "@/lib/timeline/speed-steps";
import { MEDIA_KEYFRAME_FIELDS, type MediaTransformKeyframeField } from "@/lib/timeline/media-transform";
import type { IdentifiedMediaMotionPreset, MediaMotionPreset } from "@/lib/timeline/motion-presets";
import {
  enableWallSurface,
  resolveSurfacePlaneProps,
  type SurfacePlaneProps,
} from "@/lib/timeline/surface-plane";
import {
  COLOR_GRADE_FIELDS,
  IDENTITY_COLOR_GRADE,
  colorGradeFieldToDisplay,
  type AdvancedColorGradeField,
  type ColorGrade,
  type ColorGradeField,
} from "@/lib/timeline/color-grade";
import {
  CHROMA_KEY_AMOUNT_CONFIG,
  DEFAULT_CHROMA_KEY_COLOR,
  type ChromaKeyAmountField,
  type ChromaKeyField,
} from "@/lib/timeline/chroma-key";
import {
  CHROMA_KEY_REVIEW_MODES,
  CHROMA_KEY_REVIEW_MODE_LABEL,
  type ChromaKeyReviewMode,
} from "@/lib/timeline/chroma-key-review";
import type { CutoutReviewMode } from "@/lib/timeline/cutout-review";
import type { ColorGradeLut } from "@/lib/timeline/cube-lut";

import type { TimelineElement } from "./types";
import { SpeechLinkControl } from "./SpeechLinkControl";
import { SurfaceTrackingControls } from "./SurfaceTrackingControls";
import { SurfaceRegionControls } from "./SurfaceRegionControls";
import { CameraFollowControl } from "./CameraFollowControl";
import { formatTime } from "./adapters";
import { InspectorPanelTabs } from "./InspectorPanelTabs";
import { VisualFramingEditor } from "./VisualFramingEditor";
import { VisualMaskEditor } from "./VisualMaskEditor";
import { maskShapeLabel } from "./mask-handle-geometry";
import { resolveMaskInsetAtTime, type MediaEffectField } from "@/lib/timeline/media-transform";
import { KeyframeValuesPanel } from "./KeyframeInspector";

import { visibleInspectorSections } from "./inspector-sections";
import { MotionGraphicProperties } from "./MotionGraphicProperties";
import { SoundLinkControl } from "./SoundLinkControl";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";



function PaperContourControl({ element, onPatch, onPreview, kind }: {
  element: TimelineElement | null; onPatch: (props: Record<string, unknown>) => void;
  onPreview?: (props: Record<string, unknown> | null) => void; kind?: "aura" | "contour";
}) {
  const ring = edgeAuraSchema.safeParse(element?.props?.edge_aura);
  if (element && ring.success && kind !== "contour") return <div className="grid gap-3" aria-label="Traveling aura">
    {ring.data.keyframes.map((key, index) => <div key={`${element.id}-${index}`} className="grid gap-2 pt-3">
      <InspectorItemHeader title={`Point ${index + 1}`} />
      {([["t", "Time", "s"], ["inner", "Inner band", "%"], ["outer", "Outer band", "%"], ["edge_mix", "Travel", "%"]] as const).map(([field, label, unit]) => {
        const patch = (value: number) => ({ ...ring.data, keyframes: ring.data.keyframes.map((point, i) => i === index ? { ...point, [field]: value / (field === "t" ? 1 : 100) } : point) });
        return <div key={field} className="grid gap-1"><span className="text-xs text-[var(--ink-secondary)]">{label}</span>
          <InspectorEffectNumber label={`Aura point ${index + 1} ${label}`} value={(key[field] ?? 0) * (field === "t" ? 1 : 100)} max={field === "t" ? 600 : 100} step={field === "t" ? .01 : 1} unit={unit}
            onPreview={value => { const draft = value == null ? null : patch(value); onPreview?.(draft && edgeAuraSchema.safeParse(draft).success ? {edge_aura: draft} : null); }}
            onCommit={value => { const draft = patch(value); if (edgeAuraSchema.safeParse(draft).success) onPatch({edge_aura: draft}); }} />
        </div>;
      })}
      <label className="flex items-center justify-between text-xs">Color<ColorSwatchInput ariaLabel={`Aura point ${index + 1} color`} value={key.color} onChange={color => onPatch({ edge_aura: { ...ring.data, keyframes: ring.data.keyframes.map((point, i) => i === index ? { ...point, color } : point) } })} /></label>
    </div>)}
  </div>;
  if (kind === "aura" || element?.props?.contour_model !== "rg-distance-1024-v1") return null;
  return <div role="group" aria-label="Contour growth" className="grid gap-2">
    {([
      ["contour_radius_start", "Starting radius", 900, "px"],
      ["contour_radius_end", "Ending radius", 900, "px"],
      ["contour_duration", "Growth duration", 600, "s"],
    ] as const).map(([field, label, max, unit]) => <div key={`${element.id}-${field}`} className="grid gap-1">
      <span className="text-xs text-[var(--ink-secondary)]">{label}</span>
      <InspectorEffectNumber label={label} value={Number(element.props?.[field] ?? 0)} max={max} unit={unit} step={unit === "s" ? .01 : 1}
        onPreview={value => onPreview?.(value == null ? null : {[field]: value})} onCommit={value => onPatch({[field]: value})} />
    </div>)}
    <label className="flex items-center justify-between text-xs">Paper color<ColorSwatchInput ariaLabel="Contour color" value={String(element.props?.contour_color ?? "#ffffff")} onChange={contour_color => onPatch({ contour_color })} /></label>
  </div>;
}

function RecolorControl({ element, onPatch }: { element: TimelineElement | null; onPatch: (props: Record<string, unknown>) => void }) {
  const saved = resolveRecolor(element?.props);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [element?.id, saved.color, saved.amount, saved.preserveShading]);
  if (!element || !["still", "video_clip"].includes(element.type)) return null;
  const changed = draft.color !== saved.color || draft.amount !== saved.amount || draft.preserveShading !== saved.preserveShading;
  const updateAmount = (value?: string) => {
    if (value == null || !Number.isFinite(Number.parseFloat(value))) return;
    setDraft((current) => ({ ...current, amount: Math.min(100, Math.max(0, Number.parseFloat(value))) / 100 }));
  };
  return <div role="group" aria-label="Recolor" data-recolor-controls className="flex min-w-0 flex-col gap-2 pt-3">
    <span data-effect-control="paper_fill_color" className="text-xs font-semibold text-[var(--ink-muted)]">Recolor</span>
    <div data-effect-control="recolor_color" className="inspector-property-row flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--ink-muted)]">Color</span>
      <div className="flex min-w-0 items-center gap-2">
        <ColorSwatchInput ariaLabel="Recolor color" value={resolvePaperFill(draft.color) ?? "#ffffff"} onChange={(color) => setDraft({ ...draft, color })} className="size-7" />
        <Input aria-label="Recolor hex" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} style={{ width: 100, height: 28, fontSize: 12 }} />
      </div>
    </div>
    <div data-effect-control="recolor_amount" className="inspector-property-row flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--ink-muted)]">Amount</span>
      <div className="flex min-w-0 items-center gap-1.5" style={{ width: "min(100%, 262px)" }}>
        <SliderScrubControl label="Recolor amount" value={String(Math.round(draft.amount * 100))} min={0} max={100} step={1} fallback={0} unit="%" disabled={false} onChange={updateAmount} onCommit={updateAmount} />
      </div>
    </div>
    <label data-effect-control="recolor_preserve_shading" className="flex items-center gap-2 text-xs text-[var(--ink-muted)]"><Checkbox checked={draft.preserveShading} onCheckedChange={(preserveShading) => setDraft({ ...draft, preserveShading })} /> Preserve shading</label>
    <div className="flex flex-wrap items-center gap-1 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs">
      <Button variant="outline" size="sm" disabled={!resolvePaperFill(draft.color) || !changed} onClick={() => onPatch({ recolor_color: resolvePaperFill(draft.color), recolor_amount: draft.amount, recolor_preserve_shading: draft.preserveShading ? 1 : 0 })}>Apply recolor</Button>
      <Button variant="ghost" size="sm" disabled={saved.amount === 0} onClick={() => onPatch({ recolor_amount: 0 })}>Remove</Button>
      <Button variant="ghost" size="sm" disabled={!changed} onClick={() => setDraft(saved)}>Reset draft</Button>
    </div>
  </div>;
}


function InspectorGroupActions({
  label,
  fields,
  keyed,
  disabled,
  onToggle,
  onReset,
  compact = false,
}: {
  label: string;
  fields: string;
  keyed: boolean;
  disabled: boolean;
  onToggle: () => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <div data-inspector-group-actions className={compact ? "flex items-center gap-2" : "flex items-center gap-3 py-1"}>
      <span className="text-[0.78rem] font-semibold text-[var(--ink)]">{compact ? "All" : label}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onReset} className={inspectorQuietButtonClassName}>
          Reset
        </Button>
        <KeyframeToggleButton
          fields={fields}
          label={label}
          keyed={keyed}
          disabled={disabled}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

/* ── Shared input primitives ── */

function parseDbInput(value: string, fallback: number) {
  const next = Number.parseFloat(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(FADER_MIN_DB, Math.min(FADER_MAX_DB, next));
}

function SurfacePlaneNumberControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  compact = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  compact?: boolean;
  onCommit: (value: number) => void;
}) {
  const precision = Math.max(0, `${step}`.split(".")[1]?.length ?? 0);
  const [draft, setDraft] = useState(value.toFixed(precision));

  useEffect(() => setDraft(value.toFixed(precision)), [precision, value]);

  return (
    <InspectorPropertyControl density="compact" label={label} fields={`surface-${label}`} disabled={false} onReset={() => onCommit(label === "Perspective" ? 1200 : 0)}>
      <SliderScrubControl
        density="compact"
        value={draft}
        min={min}
        max={max}
        step={step}
        fallback={value}
        label={label.toLowerCase()}
        unit={unit}
        compact={compact}
        disabled={false}
        onChange={setDraft}
        onCommit={(nextValue) => {
          const parsed = Number.parseFloat(nextValue ?? draft);
          if (Number.isFinite(parsed)) onCommit(parsed);
        }}
      />
    </InspectorPropertyControl>
  );
}

function MediaSurfaceControls({
  props,
  compact = false,
  onPatch,
}: {
  props: Record<string, unknown> | null | undefined;
  compact?: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const surface = resolveSurfacePlaneProps(props);
  const patchField = <K extends keyof SurfacePlaneProps>(field: K, value: SurfacePlaneProps[K]) => {
    const propName = {
      perspectivePx: "surfacePerspectivePx",
      depthPx: "surfaceDepthPx",
      rotateXDeg: "surfaceRotateXDeg",
      rotateYDeg: "surfaceRotateYDeg",
      rotateZDeg: "surfaceRotateZDeg",
      skewXDeg: "surfaceSkewXDeg",
      skewYDeg: "surfaceSkewYDeg",
      opacity: "surfaceOpacity",
      blurPx: "surfaceBlurPx",
      blendMode: "surfaceBlendMode",
      mode: "surfaceMode",
    } satisfies Record<keyof SurfacePlaneProps, string>;
    onPatch({ [propName[field]]: value });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "stretch", gap: 8 }}>
        <span style={{ fontSize: "0.875rem", color: "var(--ink-secondary)", fontWeight: 650 }}>3D transform</span>
        <Select
          value={surface.mode}
          onValueChange={(mode) => {
            if (mode === "wall") onPatch(enableWallSurface(props));
            else patchField("mode", "none");
          }}
        >
          <SelectTrigger aria-label="3D transform" className="h-9 w-full min-w-[150px] rounded-md border text-[0.875rem]" style={selectTriggerStyle}>
            <SelectValue>{surface.mode === "wall" ? "On" : "Off"}</SelectValue>
          </SelectTrigger>
          <SelectContent side="top" alignItemWithTrigger={false} className="min-w-[180px] rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1.5 text-[var(--ink)] shadow-xl">
            <SelectItem value="none" style={selectItemStyle} className={selectItemClassName}>Off</SelectItem>
            <SelectItem value="wall" style={selectItemStyle} className={selectItemClassName}>On</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {surface.mode === "wall" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
            <SurfacePlaneNumberControl compact={compact} label="Depth" value={surface.depthPx} min={-400} max={200} step={1} unit="px" onCommit={(value) => patchField("depthPx", value)} />
            <SurfacePlaneNumberControl compact={compact} label="Perspective" value={surface.perspectivePx} min={400} max={3000} step={10} unit="px" onCommit={(value) => patchField("perspectivePx", value)} />
            <SurfacePlaneNumberControl compact={compact} label="Tilt" value={surface.rotateXDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(value) => patchField("rotateXDeg", value)} />
            <SurfacePlaneNumberControl compact={compact} label="Turn" value={surface.rotateYDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(value) => patchField("rotateYDeg", value)} />
            {compact ? <SurfacePlaneNumberControl compact={compact} label="Rotate" value={surface.rotateZDeg} min={-30} max={30} step={0.25} unit="°" onCommit={(value) => patchField("rotateZDeg", value)} /> : null}
            <SurfacePlaneNumberControl compact={compact} label="Horizontal skew" value={surface.skewXDeg} min={-20} max={20} step={0.25} unit="°" onCommit={(value) => patchField("skewXDeg", value)} />
            <SurfacePlaneNumberControl compact={compact} label="Vertical skew" value={surface.skewYDeg} min={-20} max={20} step={0.25} unit="°" onCommit={(value) => patchField("skewYDeg", value)} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── SpeedScrub ── */

function SpeedScrub({
  rate,
  disabled,
  onPreview,
  onCommit,
  onCancelPreview,
  min = 0.25,
  max = 4,
  step = 0.01,
  dragStep = 0.02,
  suffix = "x",
  title = "Drag left or right to adjust speed",
}: {
  rate: number;
  disabled: boolean;
  onPreview?: (rate: number) => void;
  onCommit: (rate: number) => void;
  onCancelPreview?: () => void;
  min?: number;
  max?: number;
  step?: number;
  dragStep?: number;
  suffix?: string;
  title?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const display = preview ?? rate.toFixed(2);
  const displayNumber = Number.parseFloat(display);
  const borderColor = focused
    ? "var(--chrome-focus-ring)"
    : "var(--chrome-line)";

  const clampRate = (value: number) => Math.round(Math.max(min, Math.min(max, value)) * 100) / 100;
  const formatRate = (value: number) => clampRate(value).toFixed(2);
  const nudgeRate = (direction: -1 | 1) => {
    if (disabled) return;
    const next = clampRate((Number.isFinite(displayNumber) ? displayNumber : rate) + direction * step);
    setPreview(null);
    onPreview?.(next);
    onCommit(next);
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div
      ref={rootRef}
      title={`${title}. Click to type.`}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        const startX = event.clientX;
        const startRate = rate;
        let dragging = false;
        const previousUserSelect = document.body.style.userSelect;
        const onMove = (moveEvent: PointerEvent) => {
          const delta = moveEvent.clientX - startX;
          if (!dragging && Math.abs(delta) < 3) return;
          if (!dragging) {
            dragging = true;
            draggingRef.current = true;
            document.body.style.userSelect = "none";
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }
          moveEvent.preventDefault();
          const next = clampRate(startRate + delta * dragStep);
          setPreview(formatRate(next));
          onPreview?.(next);
        };
        const onUp = (upEvent: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          document.body.style.userSelect = previousUserSelect;
          if (!dragging) return;
          const delta = upEvent.clientX - startX;
          const final = clampRate(startRate + delta * dragStep);
          setPreview(null);
          if (final !== rate) onCommit(final);
          else onCancelPreview?.();
          draggingRef.current = false;
        };
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
      }}
      style={{ display: "flex", alignItems: "center", width: 112, border: `1px solid ${borderColor}`, borderRadius: "var(--edge-control-inner)", overflow: "hidden", transition: "border-color 150ms, box-shadow 150ms", height: 44, flexShrink: 0, boxShadow: focused ? "0 0 0 1px var(--chrome-raised)" : "none", cursor: disabled ? "default" : "ew-resize" }}
    >
      <Input
        aria-label="Playback speed numeric value"
        type="number"
        step={String(step)}
        min={String(min)}
        max={String(max)}
        value={display}
        disabled={disabled}
        onChange={(event) => {
          setPreview(event.target.value);
        }}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          if (draggingRef.current) return;
          const parsed = Number.parseFloat(display);
          if (!Number.isFinite(parsed)) {
            setPreview(null);
            onCancelPreview?.();
            return;
          }
          const final = clampRate(parsed);
          setPreview(null);
          if (final !== rate) onCommit(final);
          else onCancelPreview?.();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter") {
            const parsed = Number.parseFloat(display);
            const final = clampRate(Number.isFinite(parsed) ? parsed : rate);
            setPreview(null);
            if (final !== rate) onCommit(final);
            else onCancelPreview?.();
            return;
          }
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
            const next = clampRate((Number.isFinite(displayNumber) ? displayNumber : rate) + direction * step);
            const nextString = formatRate(next);
            setPreview(nextString);
            onPreview?.(next);
        }}
        style={{
          height: 42,
          minWidth: 0,
          flex: 1,
          padding: "0 0.4rem",
          fontSize: "0.9rem",
          fontFamily: "var(--font-mono, monospace)",
          fontWeight: 700,
          background: focused ? "var(--chrome-raised)" : "var(--chrome-deep)",
          color: focused ? "var(--ink)" : "var(--ink-muted)",
          whiteSpace: "nowrap",
          transition: "background 100ms, color 100ms",
          border: "none",
          borderRadius: 0,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
          boxShadow: "none",
          width: "auto",
          paddingRight: 0,
          cursor: disabled ? "default" : "ew-resize",
        }}
      />
      {suffix ? (
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 18,
            fontSize: "0.9rem",
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 700,
            background: focused ? "var(--chrome-raised)" : "var(--chrome-deep)",
            color: focused ? "var(--ink)" : "var(--ink-muted)",
            userSelect: "none",
            whiteSpace: "nowrap",
            transition: "background 100ms, color 100ms",
            paddingTop: 1,
          }}
        >
          {suffix}
        </span>
      ) : null}
      <span
        role="group"
        aria-label="Speed one-step controls"
        style={{ display: "grid", gridTemplateRows: "1fr 1fr", width: 32, height: "100%", flexShrink: 0, borderLeft: "1px solid var(--chrome-line)", background: "var(--chrome-deep)" }}
      >
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Increase speed by ${step}`} title={`Increase speed by ${step}`} disabled={disabled} onPointerDown={(event) => event.stopPropagation()} onClick={() => nudgeRate(1)} className="min-h-0 min-w-0 rounded-none border-0 p-0 text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]" style={{ width: 31, height: 21 }}>
          <PlusIcon aria-hidden="true" style={{ width: 13, height: 13 }} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Decrease speed by ${step}`} title={`Decrease speed by ${step}`} disabled={disabled} onPointerDown={(event) => event.stopPropagation()} onClick={() => nudgeRate(-1)} className="min-h-0 min-w-0 rounded-none border-0 border-t border-[var(--chrome-line)] p-0 text-[var(--ink-secondary)] hover:bg-white/10 hover:text-[var(--ink)]" style={{ width: 31, height: 21 }}>
          <MinusIcon aria-hidden="true" style={{ width: 13, height: 13 }} />
        </Button>
      </span>
    </div>
  );
}

/* ── Element Menu ── */

export type ElementInspectorSubpanel = "audio" | "position" | "motion" | "color" | "mask" | "effects" | "timing" | "keyframe" | "transition";

export type ElementMenuProps = {
  /** "horizontal" (default) renders as a single toolbar row; "vertical" stacks sections for side panels. */
  layout?: "horizontal" | "vertical";
  showAdvancedInspector?: boolean;
  showKeyframes?: boolean;
  showInspectorTabs?: boolean;
  transitionContent?: ReactNode;
  beatControls?: ReactNode;
  captionGeneration?: ReactNode;
  inspectorSubpanel?: ElementInspectorSubpanel;
  onInspectorSubpanelChange?: (subpanel: ElementInspectorSubpanel) => void;
  selectedKeyframeTimeSeconds?: number | null;
  keyframeElement?: TimelineElement | null;
  onChangeSelectedKeyframeValue?: (field: string, value: KeyframeValue) => void;
  onChangeSelectedKeyframeEase?: (field: string, ease: KeyframeEase) => void;
  onDeleteSelectedKeyframeField?: (field: string) => void;
  onDeleteSelectedKeyframe?: () => void;
  selectedElement: TimelineElement | null;
  timelineElements: TimelineElement[];
  onSelectElement?: (elementId: string) => void;
  outlineButtonClassName: string;
  editVolume: number;
  setEditVolume: (value: number) => void;
  editTrimStart: string;
  setEditTrimStart: (value: string) => void;
  editTrimEnd: string;
  setEditTrimEnd: (value: string) => void;
  editFadeIn: string;
  setEditFadeIn: (value: string) => void;
  editFadeOut: string;
  setEditFadeOut: (value: string) => void;
  editAnimationIn: AnimationPreset;
  setEditAnimationIn: (value: AnimationPreset) => void;
  editAnimationOut: AnimationPreset;
  setEditAnimationOut: (value: AnimationPreset) => void;
  editAnimInDuration: string;
  setEditAnimInDuration: (value: string) => void;
  editAnimOutDuration: string;
  setEditAnimOutDuration: (value: string) => void;
  commitAnimInDuration: (nextValue?: string) => void;
  commitAnimOutDuration: (nextValue?: string) => void;
  availableAnimationPresets: readonly AnimationPreset[];
  previewSelectedEffectProps: (patch: Record<string, unknown> | null) => void;
  patchSelectedElementProps: (patch: Record<string, unknown>) => void;
  editMediaScale: string;
  setEditMediaScale: (value: string) => void;
  editMediaOffsetX: string;
  setEditMediaOffsetX: (value: string) => void;
  editMediaOffsetY: string;
  setEditMediaOffsetY: (value: string) => void;
  previewVisualTransform: (overrides?: { scale?: string; offsetX?: string; offsetY?: string }) => void;
  clearVisualTransformPreview: () => void;
  showPositionGrid?: boolean;
  onTogglePositionGrid?: () => void;
  commitVisualTransform: (field: "scale" | "offsetX" | "offsetY", nextValue?: string) => void;
  commitVisualTransformValues: (values: { scale: string; offsetX: string; offsetY: string }) => void | Promise<unknown>;
  resetVisualTransform: () => void;
  motionPreset: IdentifiedMediaMotionPreset;
  applyMotionPreset: (preset: MediaMotionPreset) => void;
  compositionDimensions: { width: number; height: number };
  selectedLocalPlayheadSec: number;
  editMaskTop: string;
  setEditMaskTop: (value: string) => void;
  editMaskRight: string;
  setEditMaskRight: (value: string) => void;
  editMaskBottom: string;
  setEditMaskBottom: (value: string) => void;
  editMaskLeft: string;
  setEditMaskLeft: (value: string) => void;
  previewMaskInset: (overrides?: Partial<Record<"top" | "right" | "bottom" | "left", string>>, rotation?: number) => void;
  commitMaskInset: (field: "top" | "right" | "bottom" | "left", nextValue?: string) => void;
  editMediaOpacity: string;
  setEditMediaOpacity: (value: string) => void;
  editMaskFeather: string;
  setEditMaskFeather: (value: string) => void;
  editMaskCornerRadius: string;
  setEditMaskCornerRadius: (value: string) => void;
  editMirrorCenter: string;
  setEditMirrorCenter: (value: string) => void;
  editMirrorHeight: string;
  setEditMirrorHeight: (value: string) => void;
  previewMediaEffect: (field: MediaEffectField, nextValue?: string) => void;
  commitMediaEffect: (field: MediaEffectField, nextValue?: string) => void;
  editColorGrade: Record<ColorGradeField, string>;
  setEditColorGrade: (field: ColorGradeField, value: string) => void;
  previewColorGrade: (field: ColorGradeField, nextValue?: string) => void;
  commitColorGrade: (field: ColorGradeField, nextValue?: string) => void;
  resetColorGradeControls: () => void;
  toggleColorGradeKeyframeAtPlayhead: (field: ColorGradeField) => void;
  colorGradeKeyedAtPlayhead: Record<ColorGradeField, boolean>;
  clearColorGradeKeyframes: () => void;
  /** Waits for a clip click on the timeline; the selected clips get proposal cards taking its look. */
  startLookPick: (mode: "match" | "same") => void;
  lookPickMode: "match" | "same" | null;
  editChromaKeyColor: string;
  editChromaKeyTolerance: string;
  editChromaKeySoftness: string;
  editChromaKeySpill: string;
  setEditChromaKey: (field: ChromaKeyAmountField, value: string) => void;
  previewChromaKey: (field: ChromaKeyField, nextValue?: string) => void;
  commitChromaKey: (field: ChromaKeyField, nextValue?: string) => void;
  resetChromaKeyControls: () => void;
  toggleChromaKeyKeyframeAtPlayhead: (field: ChromaKeyAmountField) => void;
  chromaKeyKeyedAtPlayhead: Record<ChromaKeyAmountField, boolean>;
  advancedColorGrade: ColorGrade;
  previewAdvancedColorGrade: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  commitAdvancedColorGrade: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  toggleAdvancedColorGradeKeyframeAtPlayhead: (field: AdvancedColorGradeField) => void;
  advancedColorGradeKeyedAtPlayhead: Record<AdvancedColorGradeField, boolean>;
  colorGradeLut: ColorGradeLut | null;
  applyColorGradeLut: (asset: { assetId: string; sourceUrl: string } | null) => void;
  previewColorGradeLutIntensity: (intensity: number) => void;
  commitColorGradeLutIntensity: (intensity: number) => void;
  toggleColorGradeLutKeyframeAtPlayhead: () => void;
  lutIntensityKeyedAtPlayhead: boolean;
  cutoutReviewMode: CutoutReviewMode;
  chromaKeyReviewMode: ChromaKeyReviewMode;
  setChromaKeyReviewMode: (mode: ChromaKeyReviewMode) => void;
  setCutoutReviewMode: (mode: CutoutReviewMode) => void;
  previewMirrorBand: (field: "center" | "height", nextValue?: string) => void;
  commitMirrorBand: (field: "center" | "height", nextValue?: string) => void;
  resetMediaEffects: () => void;
  resetMaskInset: () => void;
  addTransformKeyframeAtPlayhead: () => void;
  toggleTransformKeyframeAtPlayhead: (field: MediaTransformKeyframeField) => void;
  addMaskKeyframeAtPlayhead: () => void;
  addOpacityKeyframeAtPlayhead: () => void;
  transformKeyedAtPlayhead: boolean;
  transformFieldKeyedAtPlayhead: Record<MediaTransformKeyframeField, boolean>;
  maskKeyedAtPlayhead: boolean;
  opacityKeyedAtPlayhead: boolean;
  clearVisualKeyframes: () => void;
  editStart: string;
  setEditStart: (value: string) => void;
  commitStart: () => void;
  editDuration: string;
  setEditDuration: (value: string) => void;
  previewDuration?: (nextValue: string) => void;
  commitDuration: (nextValue?: string) => void;
  commitVolume: (pct: number) => void;
  toggleVolumeKeyframeAtPlayhead: () => void;
  volumeKeyedAtPlayhead: boolean;
  commitTrimStart: (nextValue?: string) => void;
  commitTrimEnd: (nextValue?: string) => void;
  commitFadeIn: (nextValue?: string) => void;
  commitFadeOut: (nextValue?: string) => void;
  previewPlaybackRate?: (elementId: string, nextPlaybackRate: number) => void;
  clearPlaybackRatePreview?: () => void;
  updatePlaybackRate: (elementId: string, nextPlaybackRate: number) => { duration: number } | null;
  patchElement: (elementId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
  resetElement: (elementId: string) => void | Promise<unknown>;
  normalizeElementLoudness: (elementId: string) => void | Promise<unknown>;
  applyAudioEffect: (
    elementId: string,
    action: AudioEffectAction,
    options?: { strength?: number },
  ) => void | Promise<unknown>;
  applyVideoStabilization: (
    elementId: string,
    action: VideoStabilizationAction,
    options?: { mode?: VideoStabilizationMode; strength?: number },
  ) => void | Promise<unknown>;
  deleteElement: (elementId: string) => void | Promise<unknown>;
  hasTransitionIn: boolean;
  hasTransitionOut: boolean;
};

const selectTriggerStyle = { background: "var(--chrome-raised)", borderColor: "var(--chrome-line-strong)", color: "var(--ink)", paddingInline: 12 } as const;
const selectItemClassName = "cursor-pointer rounded text-left text-[0.92rem] text-[var(--ink)]";
const selectItemStyle = { paddingLeft: 16, paddingRight: 36, paddingTop: 10, paddingBottom: 10 } as const;

function MotionPresetControl({
  value,
  onValueChange,
  disabled,
  compact = false,
}: {
  value: IdentifiedMediaMotionPreset;
  onValueChange: (preset: MediaMotionPreset) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const presets: Array<{ value: MediaMotionPreset; label: string; glyph: string; description: string }> = [
    { value: "none", label: "Still", glyph: "•", description: "Keep the clip in place" },
    { value: "float", label: "Float", glyph: "↕", description: "Drift gently" },
    { value: "bounce", label: "Bounce", glyph: "⌁", description: "Travel back and forth" },
    { value: "orbit", label: "Orbit", glyph: "○", description: "Circle the current position" },
    { value: "spiral", label: "Spiral", glyph: "◎", description: "Three turns into the center, shrinking along the path" },
  ];
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[0.78rem] font-semibold text-[var(--ink-secondary)]">Move during the clip</span>
      <div role="radiogroup" aria-label="Motion preset" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: compact ? 4 : 6 }}>
        {presets.map((preset) => {
          const selected = value === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${preset.label}: ${preset.description}`}
              disabled={disabled}
              title={`${preset.label} — ${preset.description}`}
              onClick={() => onValueChange(preset.value)}
              style={{
                minHeight: compact ? 32 : 54,
                display: "flex",
                flexDirection: compact ? "row" : "column",
                alignItems: "center",
                justifyContent: "center",
                gap: compact ? 4 : 2,
                padding: compact ? "0 5px" : "6px 4px",
                border: `1px solid ${selected ? "var(--chrome-focus-ring)" : "var(--chrome-line)"}`,
                borderRadius: "var(--edge-control-inner)",
                background: selected ? "var(--chrome-raised)" : "var(--chrome-deep)",
                color: "var(--ink)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: compact ? "0.9rem" : "1.05rem", lineHeight: 1, color: selected ? "var(--chrome-focus-ring)" : "var(--ink-secondary)", fontWeight: 800 }}>{preset.glyph}</span>
              <span style={{ fontSize: compact ? "0.72rem" : "0.78rem", fontWeight: 700, lineHeight: 1.1 }}>{preset.label}</span>
            </button>
          );
        })}
      </div>
      {value === "custom" ? <p className="m-0 text-[0.75rem] text-[var(--ink-secondary)]">Custom keyframes</p> : null}
    </div>
  );
}

function AnimationEffectSelector({
  value,
  presets,
  disabled,
  side,
  onValueChange,
}: {
  value: AnimationPreset;
  presets: readonly AnimationPreset[];
  disabled: boolean;
  side: "start" | "end";
  onValueChange: (value: AnimationPreset) => void;
}) {
  const label = side === "start" ? "Effect at the start of the clip" : "Effect at the end of the clip";
  const presetLabel = (preset: AnimationPreset) => preset === "none" ? "None" : preset.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-[0.8rem] font-semibold text-[var(--ink-secondary)]">Preset</span>
      <InspectorVisualChoice initialLimit={6} label={label} value={value} disabled={disabled} onChange={onValueChange}
        options={presets.map(preset => ({value: preset, label: presetLabel(preset), preview: <AnimationPresetPreview preset={preset} side={side} />}))} />
    </div>
  );
}

type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

function screenEyeDropper(): EyeDropperCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null;
}

const HEX_COLOR_INPUT = /^#[0-9a-fA-F]{6}$/;

/**
 * Sampling the real backdrop beats typing a nominal green, so the eyedropper is
 * the primary action. The browser colour input is deliberately avoided: the
 * design system calls for shared primitives over raw browser form controls.
 */
function ChromaKeyColorControl({
  value,
  disabled,
  onCommit,
  onPickStart,
  onPickEnd,
}: {
  value: string;
  disabled: boolean;
  onCommit: (color: string) => void;
  onPickStart: () => void;
  onPickEnd: () => void;
}) {
  const active = value.length > 0;
  const [draft, setDraft] = useState(value);
  const eyeDropper = screenEyeDropper();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const pickFromScreen = useCallback(async () => {
    if (!eyeDropper) return;
    onPickStart();
    try {
      const result = await new eyeDropper().open();
      if (result?.sRGBHex) onCommit(result.sRGBHex);
    } catch {
      // The picker throws on Escape; treating cancel as "no change" is correct.
    } finally {
      onPickEnd();
    }
  }, [eyeDropper, onCommit, onPickEnd, onPickStart]);

  if (!active) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {eyeDropper ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={pickFromScreen}
            className={inspectorQuietButtonClassName}
            style={{ minHeight: 36, paddingInline: 12 }}
          >
            <PipetteIcon aria-hidden="true" />
            Pick colour from preview
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onCommit(DEFAULT_CHROMA_KEY_COLOR)}
          className={inspectorQuietButtonClassName}
          style={{ minHeight: 36, paddingInline: 12 }}
        >
          {eyeDropper ? "Start from green" : "Key out a colour"}
        </Button>
      </div>
    );
  }

  const commitDraft = (next: string) => {
    const trimmed = next.trim();
    if (HEX_COLOR_INPUT.test(trimmed)) onCommit(trimmed.toLowerCase());
    else setDraft(value);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={eyeDropper ? "Pick key colour from the preview" : "Key colour"}
        title={eyeDropper ? "Pick the key colour from anywhere on screen" : undefined}
        disabled={disabled || !eyeDropper}
        onClick={pickFromScreen}
        style={{ borderColor: "var(--chrome-line)", borderRadius: "var(--edge-control-inner)", background: "transparent" }}
      >
        <span
          aria-hidden="true"
          style={{ width: 18, height: 18, borderRadius: 3, background: value, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)" }}
        />
      </Button>
      <Input
        aria-label="Key colour hex"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitDraft((event.target as HTMLInputElement).value);
          if (event.key === "Escape") setDraft(value);
        }}
        className="h-9 w-[7.5rem] rounded-md text-[0.875rem] font-semibold"
        style={{ borderColor: "var(--chrome-line)", background: "var(--chrome-panel)", color: "var(--ink)" }}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => onCommit("")}
        className={inspectorQuietButtonClassName}
        style={{ minHeight: 32, paddingInline: 10, marginLeft: "auto" }}
      >
        Remove key
      </Button>
    </div>
  );
}

function ChromaKeyReviewControl({
  value,
  onValueChange,
  disabled,
}: {
  value: ChromaKeyReviewMode;
  onValueChange: (mode: ChromaKeyReviewMode) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, color: "var(--ink-secondary, var(--ink-muted))", fontWeight: 500 }}>Review view · preview only</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Select value={value} onValueChange={(next) => next && onValueChange(next as ChromaKeyReviewMode)}>
          <SelectTrigger aria-label="Chroma key review view" disabled={disabled} className="h-9 min-w-[150px] flex-1 rounded-md border text-[0.875rem] font-semibold" style={selectTriggerStyle}>
            <SelectValue>{CHROMA_KEY_REVIEW_MODE_LABEL[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" className="min-w-[190px] rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-panel)] p-1.5 text-[var(--ink)] shadow-xl">
            {CHROMA_KEY_REVIEW_MODES.map((mode) => (
              <SelectItem key={mode} value={mode} className={selectItemClassName} style={selectItemStyle}>
                {CHROMA_KEY_REVIEW_MODE_LABEL[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}


function ColorGradeControls({
  editColorGrade,
  setEditColorGrade,
  previewColorGrade,
  commitColorGrade,
  toggleColorGradeKeyframeAtPlayhead,
  colorGradeKeyedAtPlayhead,
  disabled,
  compact = false,
  scopeMode,
}: Pick<ElementMenuProps,
  | "editColorGrade"
  | "setEditColorGrade"
  | "previewColorGrade"
  | "commitColorGrade"
  | "toggleColorGradeKeyframeAtPlayhead"
  | "colorGradeKeyedAtPlayhead"
> & { disabled: boolean; compact?: boolean; scopeMode?: ColorScopeMode | null }) {
  const control = (field: ColorGradeField, min: number, max: number, step: number, unit: string) => (
    <SliderScrubControl value={editColorGrade[field]} min={min} max={max} step={step}
      fallback={0} label={field.replaceAll("grade_", "").replaceAll("_", " ")} unit={unit} disabled={disabled}
      onChange={value => { setEditColorGrade(field, value); previewColorGrade(field, value); }}
      onCommit={value => commitColorGrade(field, value)} />
  );

  return (
    <div className="grid gap-3">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: compact ? 10 : 8 }}>
      {([
        ["grade_exposure_ev", "Exposure", -3, 3, 0.01, "EV"],
        ["grade_contrast", "Contrast", -100, 100, 0.1, "%"],
        ["grade_contrast_pivot", "Pivot", 20, 80, 0.1, "%"],
        ["grade_highlights", "Highlights", -100, 100, 0.1, "%"],
        ["grade_shadows", "Shadows", -100, 100, 0.1, "%"],
        ["grade_whites", "Whites", -100, 100, 0.1, "%"],
        ["grade_blacks", "Blacks", -100, 100, 0.1, "%"],

        ["grade_saturation", "Saturation", -100, 100, 0.1, "%"],
        ["grade_temperature", "Temperature", -100, 100, 0.1, ""],
        ["grade_tint", "Tint", -100, 100, 0.1, ""],
        ["grade_hue_degrees", "Hue", -180, 180, 0.1, "°"],
      ] as const).map(([field, label, min, max, step, unit]) => (
        <div key={field} className="grid gap-2">
        {field === "grade_exposure_ev" || field === "grade_saturation" ? <InspectorItemHeader title={field === "grade_exposure_ev" ? "Tone" : "Color balance"} /> : null}
        <InspectorPropertyControl
          label={label}
          fields={field}
          keyed={colorGradeKeyedAtPlayhead[field]}
          disabled={disabled}
          onToggle={() => toggleColorGradeKeyframeAtPlayhead(field)}
          onReset={() => commitColorGrade(field, String(Number(colorGradeFieldToDisplay(field, IDENTITY_COLOR_GRADE).toFixed(1))))}
        >
          {control(field, min, max, step, unit)}
        </InspectorPropertyControl>
        </div>
      ))}
      </div>
    </div>
  );
}

type LutAsset = { asset_id: string; title: string; size: number; source_url: string };

function ColorGradeLutControls({
  projectId,
  lut,
  disabled,
  apply,
  previewIntensity,
  commitIntensity,
  toggleKeyframe,
  keyed,
}: {
  projectId: string;
  lut: ColorGradeLut | null;
  disabled: boolean;
  apply: (asset: { assetId: string; sourceUrl: string } | null) => void;
  previewIntensity: (intensity: number) => void;
  commitIntensity: (intensity: number) => void;
  toggleKeyframe: () => void;
  keyed: boolean;
}) {
  const [assets, setAssets] = useState<LutAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const lutFileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/color-luts`);
    const body = await response.json() as { assets?: LutAsset[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Failed to load LUTs.");
    setAssets(body.assets ?? []);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load LUTs."));
  }, [refresh]);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/color-luts`, { method: "POST", body: form });
      const body = await response.json() as { asset?: LutAsset; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error ?? "LUT upload failed.");
      await refresh();
      apply({ assetId: body.asset.asset_id, sourceUrl: body.asset.source_url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "LUT upload failed.");
    } finally {
      setBusy(false);
    }
  }, [apply, refresh, projectId]);

  return (
    <div className="grid gap-3" data-effect-control="lut_intensity">
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-[var(--ink)]" htmlFor="color-lut-upload">Look file</label>
        <Select
          value={lut?.assetId ?? "none"}
          onValueChange={(value) => {
            if (value === "none") apply(null);
            else {
              const asset = assets.find((candidate) => candidate.asset_id === value);
              if (asset) apply({ assetId: asset.asset_id, sourceUrl: asset.source_url });
            }
          }}
        >
          <SelectTrigger aria-label="Look file" disabled={disabled || busy} className="w-full border-[var(--edge-outline)] bg-[var(--chrome-raised)] text-[var(--ink)]">
            <SelectValue placeholder="None">
              {lut ? assets.find((asset) => asset.asset_id === lut.assetId)?.title ?? "Selected look" : "None"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="editor-chrome">
            <SelectGroup>
              <SelectItem value="none">None</SelectItem>
              {assets.map((asset) => <SelectItem key={asset.asset_id} value={asset.asset_id}>{asset.title} · {asset.size}³</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <input ref={lutFileInput} id="color-lut-upload" aria-label="Load a .cube look file" type="file" accept=".cube,text/plain" hidden disabled={disabled || busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
        <Button type="button" variant="outline" size="sm" className="w-fit" disabled={disabled || busy} onClick={() => lutFileInput.current?.click()}>
          {busy ? "Loading…" : "Load look file (.cube)…"}
        </Button>
      </div>
      {lut ? (
        <InspectorPropertyControl
          label="Look strength"
          fields="lut_intensity"
          keyed={keyed}
          disabled={disabled}
          onToggle={toggleKeyframe}
          onReset={() => commitIntensity(1)}
        >
          <div className="grid grid-cols-[minmax(6rem,1fr)_5.5rem_2rem] items-center gap-2">
            <Slider value={lut.intensity * 100} min={0} max={100} step={1} disabled={disabled} label="Look strength" onValueChange={(next) => previewIntensity(next / 100)} onValueCommit={(next) => commitIntensity(next / 100)} />
            <ScrubNumberInput ariaLabel="Look strength numeric value" value={String(Math.round(lut.intensity * 100))} min={0} max={100} step={1} width={112} disabled={disabled} onChange={(next) => { const parsed = Number.parseFloat(next); if (Number.isFinite(parsed)) previewIntensity(parsed / 100); }} onCommit={(next) => { const parsed = Number.parseFloat(next ?? ""); if (Number.isFinite(parsed)) commitIntensity(parsed / 100); }} />
            <span className="text-sm text-[var(--ink-secondary)]">%</span>
          </div>
        </InspectorPropertyControl>
      ) : null}
      {error ? <p role="alert" className="rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-deep)] p-3 text-sm leading-6 text-[var(--ink)]">{error}</p> : null}
    </div>
  );
}

export function ElementMenu({
  layout = "horizontal",
  showAdvancedInspector = true,
  showKeyframes = true,
  showInspectorTabs = true,
  transitionContent,
  beatControls,
  captionGeneration,
  inspectorSubpanel,
  onInspectorSubpanelChange,
  selectedKeyframeTimeSeconds = null,
  keyframeElement,
  onChangeSelectedKeyframeValue,
  onChangeSelectedKeyframeEase,
  onDeleteSelectedKeyframeField,
  onDeleteSelectedKeyframe,
  selectedElement,
  timelineElements,
  onSelectElement,
  outlineButtonClassName,
  editVolume,
  editTrimStart,
  setEditTrimStart,
  editTrimEnd,
  setEditTrimEnd,
  editFadeIn,
  setEditFadeIn,
  editFadeOut,
  setEditFadeOut,
  editAnimationIn,
  setEditAnimationIn,
  editAnimationOut,
  setEditAnimationOut,
  editAnimInDuration,
  setEditAnimInDuration,
  editAnimOutDuration,
  setEditAnimOutDuration,
  commitAnimInDuration,
  commitAnimOutDuration,
  availableAnimationPresets,
  previewSelectedEffectProps,
  patchSelectedElementProps,
  editMediaScale,
  setEditMediaScale,
  editMediaOffsetX,
  setEditMediaOffsetX,
  editMediaOffsetY,
  setEditMediaOffsetY,
  previewVisualTransform,
  clearVisualTransformPreview,
  showPositionGrid = false,
  onTogglePositionGrid,
  commitVisualTransform,
  commitVisualTransformValues,
  resetVisualTransform,
  motionPreset,
  applyMotionPreset,
  compositionDimensions,
  selectedLocalPlayheadSec,
  editMaskTop,
  setEditMaskTop,
  editMaskRight,
  setEditMaskRight,
  editMaskBottom,
  setEditMaskBottom,
  editMaskLeft,
  setEditMaskLeft,
  previewMaskInset,
  commitMaskInset,
  editMediaOpacity,
  setEditMediaOpacity,
  editMaskFeather,
  setEditMaskFeather,
  editMaskCornerRadius,
  setEditMaskCornerRadius,
  editMirrorCenter,
  setEditMirrorCenter,
  editMirrorHeight,
  setEditMirrorHeight,
  previewMediaEffect,
  commitMediaEffect,
  editColorGrade,
  setEditColorGrade,
  previewColorGrade,
  commitColorGrade,
  resetColorGradeControls,
  toggleColorGradeKeyframeAtPlayhead,
  colorGradeKeyedAtPlayhead,
  clearColorGradeKeyframes,
  startLookPick,
  lookPickMode,
  editChromaKeyColor,
  editChromaKeyTolerance,
  editChromaKeySoftness,
  editChromaKeySpill,
  setEditChromaKey,
  previewChromaKey,
  commitChromaKey,
  resetChromaKeyControls,
  toggleChromaKeyKeyframeAtPlayhead,
  chromaKeyKeyedAtPlayhead,
  advancedColorGrade,
  previewAdvancedColorGrade,
  commitAdvancedColorGrade,
  toggleAdvancedColorGradeKeyframeAtPlayhead,
  advancedColorGradeKeyedAtPlayhead,
  colorGradeLut,
  applyColorGradeLut,
  previewColorGradeLutIntensity,
  commitColorGradeLutIntensity,
  toggleColorGradeLutKeyframeAtPlayhead,
  lutIntensityKeyedAtPlayhead,
  cutoutReviewMode,
  chromaKeyReviewMode,
  setChromaKeyReviewMode,
  setCutoutReviewMode,
  previewMirrorBand,
  commitMirrorBand,
  resetMediaEffects,
  resetMaskInset,
  addTransformKeyframeAtPlayhead,
  toggleTransformKeyframeAtPlayhead,
  addMaskKeyframeAtPlayhead,
  addOpacityKeyframeAtPlayhead,
  transformKeyedAtPlayhead,
  transformFieldKeyedAtPlayhead,
  maskKeyedAtPlayhead,
  opacityKeyedAtPlayhead,
  clearVisualKeyframes,
  editStart,
  setEditStart,
  commitStart,
  editDuration,
  setEditDuration,
  previewDuration,
  commitDuration,
  commitVolume,
  toggleVolumeKeyframeAtPlayhead,
  volumeKeyedAtPlayhead,
  commitTrimStart,
  commitTrimEnd,
  commitFadeIn,
  commitFadeOut,
  previewPlaybackRate,
  clearPlaybackRatePreview,
  updatePlaybackRate,
  patchElement,
  resetElement,
  normalizeElementLoudness,
  applyAudioEffect,
  applyVideoStabilization,
  deleteElement,
  hasTransitionIn,
  hasTransitionOut,
}: ElementMenuProps) {
  const elementType = selectedElement?.type ?? "";
  const hasLinkedSpeechVisual = Boolean(selectedElement && timelineElements.some((candidate) => {
    if (candidate.id === selectedElement.id || candidate.type !== "video_clip" || candidate.removed_at != null) return false;
    const binding = candidate.props?.speech_sync_binding;
    return candidate.voice_clip_id === selectedElement.id
      || (binding && typeof binding === "object" && !Array.isArray(binding)
        && (binding as Record<string, unknown>).source_element_id === selectedElement.id);
  }));
  const isReversed = selectedElement?.props?.[PLAYBACK_REVERSE_PROP] === true;
  // Reverse plays the used source window backward at one constant speed.
  const supportsReverse = selectedElement?.type === "video_clip"
    && getSourceDurationSeconds(selectedElement) != null
    && !selectedElement.props?.speech_sync_binding
    && !selectedElement.position_locked;
  const supportsSpeedSteps = selectedElement?.type === "video_clip"
    && getSourceDurationSeconds(selectedElement) != null
    && !hasLinkedSpeechVisual
    && !isReversed;
  const hasSpeedSteps = Boolean(selectedElement
    && (readKeyframeMap(selectedElement.props)[SPEED_KEYFRAME_FIELD]?.length ?? 0) > 0);
  const speedKeyedAtPlayhead = Boolean(selectedElement
    && hasKeyframeAtTime(selectedElement.props, [SPEED_KEYFRAME_FIELD], selectedLocalPlayheadSec));
  const displayedPlaybackRate = selectedElement && supportsSpeedSteps
    ? speedAtTimelineTime(selectedElement, selectedLocalPlayheadSec)
    : selectedElement?.playback_rate ?? 1;
  const commitPlaybackRateAtPlayhead = (next: number) => {
    if (!selectedElement) return;
    if (supportsSpeedSteps && hasSpeedSteps) {
      const result = setSpeedAtTime(selectedElement, selectedLocalPlayheadSec, next);
      const duration = quantizeVisualFrameSpan(selectedElement.timeline_start, result.duration).duration;
      void patchElement(selectedElement.id, {
        playback_rate: result.playbackRate,
        props: result.props,
        duration,
      });
      setEditDuration(duration.toFixed(2));
      return;
    }
    const result = updatePlaybackRate(selectedElement.id, next);
    if (result) setEditDuration(result.duration.toFixed(2));
  };
  const setPlaybackDirection = (reverse: boolean) => {
    if (!selectedElement || !supportsReverse || reverse === isReversed) return;
    let props: Record<string, unknown> = { ...(selectedElement.props ?? {}) };
    if (reverse) props[PLAYBACK_REVERSE_PROP] = true; else delete props[PLAYBACK_REVERSE_PROP];
    // Speed steps do not apply to a reversed clip; choosing Reverse removes them in the same undoable edit.
    if (reverse && hasSpeedSteps) {
      const map = readKeyframeMap(props);
      delete map[SPEED_KEYFRAME_FIELD];
      props = writeKeyframeMap(props, map);
      const duration = quantizeVisualFrameSpan(selectedElement.timeline_start, speedStepDuration({ ...selectedElement, props })).duration;
      void patchElement(selectedElement.id, { props, duration });
      setEditDuration(duration.toFixed(2));
      return;
    }
    void patchElement(selectedElement.id, { props });
  };
  const toggleSpeedKeyframeAtPlayhead = () => {
    if (!selectedElement || !supportsSpeedSteps) return;
    const result = toggleSpeedStepAtTime(selectedElement, selectedLocalPlayheadSec);
    const duration = quantizeVisualFrameSpan(selectedElement.timeline_start, result.duration).duration;
    void patchElement(selectedElement.id, { props: result.props, duration });
    setEditDuration(duration.toFixed(2));
  };
  const isAudio = isAudioElementType(elementType);
  const volumeRole = selectedElement ? roleForAudioElement(selectedElement) : null;
  const volumeLabel = "Volume";
  const supportsAudioEffects = Boolean(
    selectedElement?.source_url
    && (isAudio || elementType === "video_clip"),
  );
  const voiceEnhancement = selectedElement?.props?.voice_enhancement;
  const voiceEnhancementReceipt = voiceEnhancement && typeof voiceEnhancement === "object"
    ? voiceEnhancement as Record<string, unknown>
    : null;
  const voiceEnhancementApplied = voiceEnhancementReceipt != null;
  const voiceEnhancementEnabled = voiceEnhancementReceipt?.enabled !== false;
  const storedVoiceEnhancementStrength =
    typeof voiceEnhancementReceipt?.strength_percent === "number"
      ? voiceEnhancementReceipt.strength_percent
      : VOICE_ENHANCEMENT_DEFAULT_STRENGTH;
  const noiseReductionApplied = typeof selectedElement?.props?.audio_cleanup_original_source_url === "string";
  const loudnessNormalizationApplied = typeof selectedElement?.props?.loudness_normalization_original_source_url === "string";
  const audioTreatmentApplied =
    voiceEnhancementApplied || noiseReductionApplied || loudnessNormalizationApplied;
  const detachedAudioId = typeof selectedElement?.props?.detached_audio_element_id === "string"
    ? selectedElement.props.detached_audio_element_id
    : null;
  const detachedFromVideoId = typeof selectedElement?.props?.detached_from_video_element_id === "string"
    ? selectedElement.props.detached_from_video_element_id
    : null;
  const [audioEffectBusy, setAudioEffectBusy] = useState<AudioEffectAction | null>(null);
  const [voiceEnhancementStrength, setVoiceEnhancementStrength] = useState(
    storedVoiceEnhancementStrength,
  );
  const stabilization = selectedElement?.props?.video_stabilization;
  const stabilizationReceipt = stabilization && typeof stabilization === "object"
    ? stabilization as Record<string, unknown>
    : null;
  const stabilizationApplied = stabilizationReceipt != null;
  const stabilizationEnabled = stabilizationReceipt?.enabled !== false;
  const storedStabilizationMode = stabilizationReceipt?.mode === "lock_camera"
    ? "lock_camera"
    : "smooth_motion";
  const storedStabilizationStrength =
    typeof stabilizationReceipt?.strength_percent === "number"
      ? stabilizationReceipt.strength_percent
      : VIDEO_STABILIZATION_DEFAULT_STRENGTH;
  const [stabilizationMode, setStabilizationMode] = useState<VideoStabilizationMode>(
    storedStabilizationMode,
  );
  const [stabilizationStrength, setStabilizationStrength] = useState(
    storedStabilizationStrength,
  );
  const [stabilizationBusy, setStabilizationBusy] = useState<VideoStabilizationAction | null>(null);
  useEffect(() => {
    setVoiceEnhancementStrength(storedVoiceEnhancementStrength);
  }, [selectedElement?.id, storedVoiceEnhancementStrength]);
  useEffect(() => {
    setStabilizationMode(storedStabilizationMode);
    setStabilizationStrength(storedStabilizationStrength);
  }, [selectedElement?.id, storedStabilizationMode, storedStabilizationStrength]);

  // dB fader: 0 dB = unity (the clip exactly as recorded), mute at the floor, + boosts.
  // Nothing is auto-leveled on drop — what the fader shows is exactly the stored gain.
  // `editVolume` stays raw gain % internally; we translate to/from dB only at this display
  // boundary so the pending-commit reconciliation and envelope path are untouched. The role
  // reference (source_lufs → target) drives ONLY the deliberate Normalize action and the
  // informational LUFS readout, never the fader's zero.
  const volumeSourceLufs = typeof selectedElement?.props?.source_lufs === "number"
    ? (selectedElement.props.source_lufs as number)
    : null;
  const volumeTargetLufs = volumeRole ? ROLE_LOUDNESS_TARGETS[volumeRole] : null;
  const volumeGain = editVolume / 100;
  const volumeDisplayDb = gainToFaderDb(volumeGain); // number | null (null = muted)
  const volumeIsMuted = volumeDisplayDb == null;
  const volumeIsBoosted = volumeDisplayDb != null && volumeDisplayDb > 0;
  const volumeResultLufs = resultingLufs(volumeSourceLufs, volumeGain);
  const previousAudibleVolume = useRef(new Map<string, number>());
  const toggleVolumeMute = () => {
    if (!selectedElement) return;
    if (volumeIsMuted) {
      commitVolume(previousAudibleVolume.current.get(selectedElement.id) ?? 100);
    } else {
      previousAudibleVolume.current.set(selectedElement.id, editVolume);
      commitVolume(0);
    }
  };
  const volumeMuteButton = <Button
    type="button"
    variant="ghost"
    size="xs"
    className={inspectorQuietButtonClassName}
    aria-label={volumeIsMuted ? "Unmute clip audio" : "Mute clip audio"}
    aria-pressed={volumeIsMuted}
    disabled={!selectedElement || elementType === "caption_text" || elementType === "still"}
    onClick={toggleVolumeMute}
  >{volumeIsMuted ? "Unmute" : "Mute"}</Button>;
  // Keep high-frequency fader movement out of TimelineStep state. The control
  // owns its live readout, while the preview store rerenders only the selected
  // audio track. Commit still persists once on release.
  const setVolumeFromDb = (db: number) => {
    if (!selectedElement) return;
    setPreviewAudioGain(selectedElement.id, faderDbToGain(db));
  };
  const commitVolumeFromDb = (db: number) => commitVolume(faderDbToGain(db) * 100);
  // Normalize measures the source loudness (server-side) and re-levels the clip to its role
  // reference — the deliberate, only path that changes gain by loudness; nothing auto-levels.
  const normalizeVolume = () => { if (selectedElement) void normalizeElementLoudness(selectedElement.id); };
  const runAudioEffect = async (
    action: AudioEffectAction,
    options?: { strength?: number },
  ) => {
    if (!selectedElement || audioEffectBusy) return;
    setAudioEffectBusy(action);
    try {
      await applyAudioEffect(selectedElement.id, action, options);
    } finally {
      setAudioEffectBusy(null);
    }
  };
  const isCaption = elementType === "caption_text";
  const isStill = elementType === "still";
  const isVisualAsset = elementType === "still" || elementType === "video_clip";
  const isAlphaCutout = selectedElement?.props?.has_alpha === true;
  // A model-authored motion graphic: its declared controls lead the Animation tab.
  const isMotionGraphic = selectedElement?.type === "video_clip" && motionSubjectFromSourceUrl(selectedElement.source_url ?? "")?.kind === "composition";
  const showAnimPresets = !isAudio && availableAnimationPresets.length > 0;
  const disableMediaControls = !selectedElement || isCaption || isStill;
  const disableFadeIn = disableMediaControls || hasTransitionIn;
  const disableFadeOut = disableMediaControls || hasTransitionOut;
  const disableAnimIn = !selectedElement || hasTransitionIn;
  const disableAnimOut = !selectedElement || hasTransitionOut;
  const sourceDurationSeconds = selectedElement ? getSourceDurationSeconds(selectedElement) : null;
  const maxExtendableDurationSeconds = selectedElement && sourceDurationSeconds != null
    ? getMaxExtendableTimelineDuration(selectedElement)
    : null;
  const durationInputMax = maxExtendableDurationSeconds != null
    ? Math.max(minTimelineDurationSeconds(), maxExtendableDurationSeconds)
    : 999;
  const selectedPlaybackRate = Math.max(0.001, selectedElement?.playback_rate ?? 1);
  const selectedTrimStart = selectedElement?.trim_start ?? 0;
  const selectedTrimEnd = selectedElement?.trim_end ?? 0;
  const trimStartInputMax = sourceDurationSeconds != null
    ? Math.max(0, sourceDurationSeconds - selectedTrimEnd - minTimelineDurationSeconds() * selectedPlaybackRate)
    : 999;
  const trimEndInputMax = sourceDurationSeconds != null
    ? Math.max(0, sourceDurationSeconds - selectedTrimStart - minTimelineDurationSeconds() * selectedPlaybackRate)
    : 999;
  const durationIsMax = selectedElement != null && maxExtendableDurationSeconds != null
    ? Math.abs(selectedElement.duration - maxExtendableDurationSeconds) <= 0.005
    : false;
  const editableSpeechSource = resolveEditableSpeechSourceElement(selectedElement, timelineElements);
  const availableTailSeconds = selectedElement != null && maxExtendableDurationSeconds != null
    ? Math.max(0, maxExtendableDurationSeconds - selectedElement.duration)
    : null;
  const availableHeadSeconds = selectedElement?.type === "video_clip"
    && selectedElement.props?.speech_sync_binding != null
    ? Math.max(0, selectedElement.trim_start / selectedPlaybackRate)
    : null;
  const useMaxDuration = () => {
    if (maxExtendableDurationSeconds == null || maxExtendableDurationSeconds <= 0) return;
    const next = maxExtendableDurationSeconds.toFixed(3);
    setEditDuration(next);
    previewDuration?.(next);
    commitDuration(next);
  };
  // Offered only while the clip can actually grow toward its source's end.
  const canExtendToSourceEnd = !durationIsMax && availableTailSeconds != null && availableTailSeconds > 0.005;
  const sourceLengthLabel = sourceDurationSeconds != null ? formatTime(sourceDurationSeconds, 2) : null;
  const maxDurationLabel = maxExtendableDurationSeconds != null ? formatTime(maxExtendableDurationSeconds, 2) : null;
  const [animCollapsed, setAnimCollapsed] = useState(false);
  const [animSide, setAnimSide] = useState<"in" | "out">("in");
  const [localVerticalSubpanel, setLocalVerticalSubpanel] = useState<ElementInspectorSubpanel>("position");
  const verticalSubpanel = inspectorSubpanel ?? localVerticalSubpanel;
  const setVerticalSubpanel = onInspectorSubpanelChange ?? setLocalVerticalSubpanel;
  const [maskMode, setMaskMode] = useState<"edges" | "mirror">("edges");
  const [rectangleEdgesOpen, setRectangleEdgesOpen] = useState(false);
  const [clipSettingsOpen, setClipSettingsOpen] = useState(false);
  const [colorScopeMode, setColorScopeMode] = useState<ColorScopeMode | null>("brightness");
  /** The review view to return to once the eyedropper releases the Source view. */
  const chromaPickRestoreRef = useRef<ChromaKeyReviewMode>("composite");
  const [visualFramingOpen, setVisualFramingOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const expandedWidthRef = useRef<number | null>(null);
  const visualKeyframeCount = selectedElement
    ? countKeyframes(selectedElement.props, MEDIA_KEYFRAME_FIELDS)
    : 0;
  const hasVisualKeyframes = visualKeyframeCount > 0;
  const hasCropKeyframes = selectedElement
    ? countKeyframes(selectedElement.props, ["mask_inset", "mask_feather", "mask_corner_radius"]) > 0
    : false;
  const hasColorGradeKeyframes = selectedElement
    ? countKeyframes(selectedElement.props, COLOR_GRADE_FIELDS) > 0
    : false;

  useEffect(() => {
    setVisualFramingOpen(Boolean(selectedElement && isVisualAsset && !isAlphaCutout));
  }, [isAlphaCutout, isVisualAsset, selectedElement?.id]);

  useEffect(() => {
    if (cutoutReviewMode === "composite") return;
    setCutoutReviewMode("composite");
  }, [cutoutReviewMode, setCutoutReviewMode]);

  // After expand/collapse, measure and potentially re-collapse
  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    if (!animCollapsed) {
      // We're expanded — record the content width so we know the threshold to re-expand
      expandedWidthRef.current = node.scrollWidth;
      // If it overflows, snap back to collapsed before paint
      if (node.scrollWidth > node.clientWidth + 1) {
        requestAnimationFrame(() => setAnimCollapsed(true));
      }
    }
  }, [animCollapsed]);

  useEffect(() => {
    const node = menuRef.current;
    if (!node) return;
    const check = () => {
      if (node.scrollWidth > node.clientWidth + 1) {
        // Overflows — collapse
        setAnimCollapsed(true);
      } else if (expandedWidthRef.current != null) {
        // Collapsed and have room — expand if the container can fit the expanded width
        if (node.clientWidth >= expandedWidthRef.current) {
          setAnimCollapsed(false);
        }
      }
    };
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isVertical = layout === "vertical";
  const voiceInputMetrics = voiceEnhancementReceipt?.input
    && typeof voiceEnhancementReceipt.input === "object"
    ? voiceEnhancementReceipt.input as Record<string, unknown>
    : null;
  const voiceOutputMetrics = voiceEnhancementReceipt?.output
    && typeof voiceEnhancementReceipt.output === "object"
    ? voiceEnhancementReceipt.output as Record<string, unknown>
    : null;
  const voiceNoiseReductionDb =
    typeof voiceInputMetrics?.noise_rms_dbfs === "number"
    && typeof voiceOutputMetrics?.noise_rms_dbfs === "number"
      ? Number(
          (voiceInputMetrics.noise_rms_dbfs - voiceOutputMetrics.noise_rms_dbfs).toFixed(1),
        )
      : null;
  const audioEffectsControls = supportsAudioEffects ? (
    <div className="grid min-w-0 gap-3">
      {volumeRole === "narrator" ? (
        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <strong className="text-sm text-[var(--ink)]">Enhance voice</strong>
            <strong className="shrink-0 font-mono text-sm text-[var(--ink)]">
              {voiceEnhancementStrength}%
            </strong>
          </div>
          <Slider
            value={voiceEnhancementStrength}
            min={0}
            max={100}
            step={5}
            disabled={audioEffectBusy != null}
            label="Voice enhancement strength"
            onValueChange={setVoiceEnhancementStrength}
            onValueCommit={setVoiceEnhancementStrength}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="default"
              disabled={audioEffectBusy != null}
              onClick={() => void runAudioEffect(
                "enhance_voice",
                { strength: voiceEnhancementStrength },
              )}
            >
              {audioEffectBusy === "enhance_voice"
                ? "Enhancing voice…"
                : voiceEnhancementApplied
                  ? "Apply strength"
                  : "Enhance voice"}
            </Button>
            {voiceEnhancementApplied ? (
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={audioEffectBusy != null}
                onClick={() => void runAudioEffect("toggle_voice_enhancement")}
              >
                {audioEffectBusy === "toggle_voice_enhancement"
                  ? "Switching…"
                  : voiceEnhancementEnabled
                    ? "Use original"
                    : "Use enhanced"}
              </Button>
            ) : null}
            {audioTreatmentApplied ? (
              <Button
                type="button"
                variant="ghost"
                size="default"
                disabled={audioEffectBusy != null}
                onClick={() => void runAudioEffect("restore_original")}
              >
                {audioEffectBusy === "restore_original" ? "Restoring…" : "Remove treatment"}
              </Button>
            ) : null}
          </div>
          {voiceEnhancementApplied ? (
            <span className="text-sm font-semibold text-[var(--ink-secondary)]">
              {voiceEnhancementEnabled ? "Enhanced selected" : "Original selected"}
              {voiceNoiseReductionDb != null
                ? voiceEnhancementEnabled
                  ? ` · background ${voiceNoiseReductionDb} dB lower`
                  : ` · enhanced version is ${voiceNoiseReductionDb} dB lower`
                : ""}
              {typeof voiceOutputMetrics?.integrated_lufs === "number"
                ? ` · ${voiceOutputMetrics.integrated_lufs} LUFS`
                : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={elementType === "music" ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2"}>
        {volumeRole ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={audioEffectBusy != null || voiceEnhancementApplied}
            onClick={normalizeVolume}
            className={elementType === "music" ? "h-8 min-w-0 px-2 text-xs" : undefined}
            title={voiceEnhancementApplied ? "Remove the current treatment first" : undefined}
          >
            {elementType === "music" ? "Match loudness" : "Match target loudness"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="default"
          disabled={audioEffectBusy != null || audioTreatmentApplied}
          onClick={() => void runAudioEffect("reduce_background_noise")}
          className={elementType === "music" ? "h-8 min-w-0 px-2 text-xs" : undefined}
          title={audioTreatmentApplied ? "Remove the current treatment first" : undefined}
        >
          {audioEffectBusy === "reduce_background_noise"
            ? "Reducing noise…"
            : elementType === "music" ? "Reduce noise" : "Reduce background noise"}
        </Button>
        {elementType === "video_clip" || detachedFromVideoId ? (
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={audioEffectBusy != null}
            onClick={() => void runAudioEffect(
              detachedAudioId || detachedFromVideoId ? "reattach_audio" : "detach_audio",
            )}
          >
            {audioEffectBusy === "detach_audio"
              ? "Detaching…"
              : audioEffectBusy === "reattach_audio"
                ? "Reattaching…"
                : detachedAudioId
                  ? "Reattach audio"
                  : detachedFromVideoId
                    ? "Reattach to video"
                    : "Detach audio"}
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  const musicToolsControls = elementType === "music" && (audioEffectsControls || beatControls) ? (
    <div className="grid min-w-0 gap-3" aria-label="Music tools">
      {audioEffectsControls}
      {beatControls}
    </div>
  ) : null;

  const runVideoStabilization = async (
    action: VideoStabilizationAction,
    options?: { mode?: VideoStabilizationMode; strength?: number },
  ) => {
    if (!selectedElement || stabilizationBusy) return;
    setStabilizationBusy(action);
    try {
      await applyVideoStabilization(selectedElement.id, action, options);
    } finally {
      setStabilizationBusy(null);
    }
  };
  const stabilizationControls = elementType === "video_clip" ? (
    <div className="grid min-w-0 gap-3" data-stabilization-controls="">
      <div className="grid min-w-0 gap-2">
        <span className="text-sm font-bold text-[var(--ink)]">Camera behavior</span>
        <Select
          value={stabilizationMode}
          disabled={stabilizationBusy != null}
          onValueChange={(value) => {
            if (value === "smooth_motion" || value === "lock_camera") {
              setStabilizationMode(value);
            }
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-md border text-sm" style={selectTriggerStyle}>
            <SelectValue>{stabilizationMode === "lock_camera" ? "Lock camera" : "Smooth camera movement"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem className={selectItemClassName} style={selectItemStyle} value="smooth_motion">
                Smooth motion
              </SelectItem>
              <SelectItem className={selectItemClassName} style={selectItemStyle} value="lock_camera">
                Lock camera
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[var(--ink)]">Strength</span>
          <strong className="font-mono text-sm text-[var(--ink)]">{stabilizationStrength}%</strong>
        </div>
        <Slider
          value={stabilizationStrength}
          min={0}
          max={100}
          step={5}
          disabled={stabilizationBusy != null}
          label="Video stabilization strength"
          onValueChange={setStabilizationStrength}
          onValueCommit={setStabilizationStrength}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="default"
          disabled={stabilizationBusy != null}
          onClick={() => void runVideoStabilization("apply", {
            mode: stabilizationMode,
            strength: stabilizationStrength,
          })}
        >
          {stabilizationBusy === "apply"
            ? "Stabilizing…"
            : stabilizationApplied
              ? "Apply settings"
              : "Stabilize video"}
        </Button>
        {stabilizationApplied ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={stabilizationBusy != null}
              onClick={() => void runVideoStabilization("toggle_comparison")}
            >
              {stabilizationBusy === "toggle_comparison"
                ? "Switching…"
                : stabilizationEnabled
                  ? "View original"
                  : "Use stabilized"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={stabilizationBusy != null}
              onClick={() => void runVideoStabilization("remove")}
            >
              {stabilizationBusy === "remove" ? "Removing…" : "Remove"}
            </Button>
          </>
        ) : null}
      </div>
      {stabilizationApplied ? (
        <span className="text-sm font-semibold text-[var(--ink-secondary)]">
          {stabilizationEnabled ? "Stabilized version selected" : "Original version selected"}
        </span>
      ) : null}
    </div>
  ) : null;

  const columnHeaderStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 4,
  };

  const columnStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    flexShrink: 0,
    padding: isVertical ? "8px 0" : "8px 0",
    ...(isVertical ? { width: "100%" } : {}),
  };

  const dividerStyle: React.CSSProperties = isVertical
    ? {
        height: 1,
        width: "100%",
        background: "var(--panel-group-divider, var(--chrome-line))",
        flexShrink: 0,
      }
    : {
        width: 1,
        alignSelf: "stretch",
        background: "var(--panel-group-divider, var(--chrome-line))",
        flexShrink: 0,
      };

  if (selectedElement?.props?.outline_parent_id) {
    return <OutlineLayerControls element={selectedElement} onPatch={patchSelectedElementProps} />;
  }

  /* ── Vertical inspector layout (landscape side panel) ────────────────── */

  if (isVertical) {
    const fieldLabelStyle: React.CSSProperties = {
      flex: "0 0 96px",
      fontSize: "var(--ui-text-body)",
      fontWeight: 500,
      color: "var(--ink)",
    };
    // Labels share one column with InspectorPropertyControl's compact rows; controls start beside them and fill the
    // rest. When the panel is too narrow the control wraps below its label instead of overflowing (no sideways scroll).
    const fieldStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 6, minWidth: 0, minHeight: 36 };
    const fieldGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 };
    const controlRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "112px 38px", alignItems: "center", justifyContent: "start", columnGap: 8 };
    const unitStyle: React.CSSProperties = { width: 38, fontSize: "var(--ui-text-small)", color: "var(--ink-secondary, var(--ink-muted))", textAlign: "left" };
    const isIn = animSide === "in";
    const hasSourceTiming = !isCaption && !isStill;
    const verticalSubpanels = [
      { id: "position" as const, label: "Layout", description: "Size, position, and crop", disabled: !(showAdvancedInspector && isVisualAsset) },
      { id: "color" as const, label: "Color", description: "Tone and color correction", disabled: !(showAdvancedInspector && isVisualAsset) },
      { id: "mask" as const, label: "Mask", description: "Shape masks and background removal", disabled: !(showAdvancedInspector && isVisualAsset) },
      { id: "effects" as const, label: "Effects", description: "Basic operators and applied effect controls", disabled: !(showAdvancedInspector && isVisualAsset) },
      { id: "motion" as const, label: "Animation", description: "Entrance, exit, and reveal", disabled: !isVisualAsset },
      { id: "audio" as const, label: "Audio", description: "Volume, fades, and sound treatment", disabled: disableMediaControls || (selectedElement?.props?.runtime_source_has_audio === false && !selectedElement?.props?.speech_sync_binding) },
      { id: "timing" as const, label: "Timing", description: "Start, duration, source trims, and speed", disabled: false },
    ].filter((panel) => !("disabled" in panel && panel.disabled));
    const defaultVerticalSubpanel: ElementInspectorSubpanel = isMotionGraphic ? "motion" : showAdvancedInspector && isVisualAsset
      ? "position"
      : disableMediaControls || selectedElement?.props?.runtime_source_has_audio === false
        ? "timing"
        : "audio";
    const activeVerticalSubpanel = verticalSubpanel === "transition" && transitionContent ? "motion" : isCaption
      || verticalSubpanels.some((panel) => panel.id === verticalSubpanel && !panel.disabled)
      ? verticalSubpanel
      : defaultVerticalSubpanel;
    const visibleVerticalSections = visibleInspectorSections(activeVerticalSubpanel, {
      visual: isVisualAsset, caption: isCaption, alpha: isAlphaCutout,
      rhythm: Boolean(beatControls), musicTools: Boolean(musicToolsControls), composition: isMotionGraphic,
    });

    return (
      <div ref={menuRef} style={{
        background: "var(--chrome-panel)",
        width: "100%",
        boxSizing: "border-box",
        flexShrink: 0,
        minWidth: 0,
        overflowX: "hidden",
        overflowY: "auto",
        opacity: selectedElement ? 1 : 0.35,
        pointerEvents: selectedElement ? "auto" : "none",
        transition: "opacity 150ms ease",
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}>
        {showInspectorTabs && verticalSubpanels.length > 1 ? (
          <InspectorPanelTabs
            ariaLabel="Media inspector panels"
            tabs={verticalSubpanels}
            value={activeVerticalSubpanel}
            onValueChange={setVerticalSubpanel}
            sticky
          />
        ) : null}
        <InspectorSectionFilterContext.Provider value={visibleVerticalSections}>
        <InspectorSection sectionId="timing" title="Timing">
          <CaptionAudioLinkControl element={selectedElement} onPatch={patchSelectedElementProps} />
          <div style={fieldGridStyle}>
            <SpeechLinkControl element={selectedElement} elements={timelineElements} onPatch={patchElement} />
            <SoundLinkControl element={selectedElement} elements={timelineElements} onPatch={patchElement} />
            {isAlphaCutout
            && editableSpeechSource
            && availableTailSeconds != null
            && availableTailSeconds <= 0.05 ? (
              <div className="grid gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <strong>Cutout picture ends here</strong>
                {onSelectElement ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => onSelectElement(editableSpeechSource.id)}
                  >
                    Open speech source
                  </Button>
                ) : null}
              </div>
            ) : null}
            {/* Where the clip sits on the timeline, then which part of its source it plays and how fast. Stills and
                captions have no source to choose from, so they keep the two placement rows without group names. */}
            {hasSourceTiming ? <InspectorItemHeader title="Placement" /> : null}
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>Start</span>
              <span style={controlRowStyle}>
                <ScrubNumberInput
                  ariaLabel="Timeline start numeric value"
                  value={editStart}
                  min={0}
                  max={86_400}
                  step={1 / 30}
                  precision={3}
                  disabled={!selectedElement || selectedElement.position_locked}
                  onChange={setEditStart}
                  onCommit={commitStart}
                />
                <span style={unitStyle}>s</span>
              </span>
            </div>
            <div style={fieldStyle}>
              <span style={fieldLabelStyle}>Duration</span>
              <span style={controlRowStyle}>
                <ScrubNumberInput ariaLabel="Duration numeric value" value={editDuration} min={minTimelineDurationSeconds()} max={durationInputMax} step={0.01} disabled={!selectedElement} onChange={(v) => { setEditDuration(v); previewDuration?.(v); }} onCommit={commitDuration} />
                <span style={unitStyle}>s</span>
              </span>
            </div>
            {hasSourceTiming ? <>
              <div style={{ marginTop: 12 }}>
                <InspectorItemHeader title="Source" actions={canExtendToSourceEnd ? (
                  <Button type="button" variant="ghost" size="sm" aria-label="Extend to source end" onClick={useMaxDuration} className={`whitespace-nowrap ${inspectorQuietButtonClassName}`}>
                    <Maximize2Icon data-icon="inline-start" aria-hidden="true" /> Extend to end
                  </Button>
                ) : null} />
              </div>
              {sourceDurationSeconds != null ? (
                <ClipTrimRangeControl sourceSeconds={sourceDurationSeconds} trimStart={editTrimStart} trimEnd={editTrimEnd}
                  trimStartMax={trimStartInputMax} trimEndMax={trimEndInputMax} minUsedSeconds={minTimelineDurationSeconds() * selectedPlaybackRate}
                  disabled={disableMediaControls} onTrimStartChange={setEditTrimStart} onTrimEndChange={setEditTrimEnd}
                  onTrimStartCommit={commitTrimStart} onTrimEndCommit={commitTrimEnd} />
              ) : <>
              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>Remove from start</span>
                <span style={controlRowStyle}>
                  <ScrubNumberInput ariaLabel="Trim start numeric value" value={editTrimStart} min={0} max={trimStartInputMax} step={0.01} disabled={disableMediaControls} onChange={setEditTrimStart} onCommit={commitTrimStart} />
                  <span style={unitStyle}>s</span>
                </span>
              </div>
              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>Remove from end</span>
                <span style={controlRowStyle}>
                  <ScrubNumberInput ariaLabel="Trim end numeric value" value={editTrimEnd} min={0} max={trimEndInputMax} step={0.01} placeholder="-" disabled={disableMediaControls} onChange={setEditTrimEnd} onCommit={commitTrimEnd} />
                  <span style={unitStyle}>s</span>
                </span>
              </div>
              </>}
              <div style={fieldStyle}>
                <span style={fieldLabelStyle}>Speed</span>
                <span style={{ ...controlRowStyle, gridTemplateColumns: "112px 18px 36px" }}>
                  <SpeedScrub suffix="" rate={displayedPlaybackRate} disabled={!selectedElement || !supportsPlaybackRate(selectedElement?.type ?? "")} onPreview={(next) => { if (!selectedElement || hasSpeedSteps) return; previewPlaybackRate?.(selectedElement.id, next); }} onCommit={commitPlaybackRateAtPlayhead} onCancelPreview={clearPlaybackRatePreview} />
                  <span style={unitStyle}>×</span>
                  <KeyframeToggleButton fields={SPEED_KEYFRAME_FIELD} label="speed" keyed={speedKeyedAtPlayhead} disabled={!supportsSpeedSteps} onToggle={toggleSpeedKeyframeAtPlayhead} />
                </span>
              </div>
              {selectedElement?.type === "video_clip" ? (
                <div style={fieldStyle}>
                  <span style={fieldLabelStyle}>Direction</span>
                  <SegmentedControl fill role="group" aria-label="Playback direction">
                    {([[false, "Forward"], [true, "Reverse"]] as const).map(([reverse, label]) => (
                      <button key={label} type="button" aria-pressed={isReversed === reverse} disabled={!supportsReverse}
                        onClick={() => setPlaybackDirection(reverse)}>{label}</button>
                    ))}
                  </SegmentedControl>
                </div>
              ) : null}
            </> : null}
          </div>
        </InspectorSection>
        <InspectorSection sectionId="audio" title="Audio">
          <div style={fieldGridStyle}>
            <div style={{ ...fieldStyle, display: "grid", gap: 6, gridTemplateColumns: "88px minmax(0, 1fr)" }}>
              <span style={{ ...fieldLabelStyle, alignSelf: "start", paddingTop: 14 }}>{volumeLabel}</span>
              <div className="grid gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <SliderScrubControl
                    value={volumeDisplayDb == null ? String(FADER_MIN_DB) : String(volumeDisplayDb)}
                    min={FADER_MIN_DB}
                    max={FADER_MAX_DB}
                    step={0.1}
                    fallback={0}
                    label="volume"
                    unit="dB"
                    disabled={disableMediaControls}
                    onChange={(value) => setVolumeFromDb(parseDbInput(value, volumeDisplayDb ?? FADER_MIN_DB))}
                    onCommit={(value) => commitVolumeFromDb(parseDbInput(value ?? String(volumeDisplayDb ?? FADER_MIN_DB), volumeDisplayDb ?? FADER_MIN_DB))}
                    onCancel={() => {
                      if (selectedElement) clearPreviewAudioGain(selectedElement.id);
                    }}
                  />
                  {showKeyframes ? <KeyframeToggleButton
                    fields="volume_envelope"
                    label={volumeLabel}
                    keyed={volumeKeyedAtPlayhead}
                    disabled={disableMediaControls}
                    onToggle={toggleVolumeKeyframeAtPlayhead}
                  /> : null}
                </div>
                <div className="flex items-center gap-2">
                  {volumeMuteButton}
                  {volumeResultLufs != null ? (
                    <span title="Resulting integrated loudness" className="text-[0.72rem] font-semibold tabular-nums text-[var(--ink-muted)]">→ {volumeResultLufs} LUFS{volumeTargetLufs != null ? ` · ref ${volumeTargetLufs}` : ""}</span>
                  ) : volumeIsBoosted ? (
                    <span className="rounded bg-[var(--chrome-raised)] px-2 py-0.5 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[var(--ink)]">Boost</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </InspectorSection>

        {musicToolsControls ? (
          <InspectorSection sectionId="music-tools" title="Music tools">
            {musicToolsControls}
          </InspectorSection>
        ) : audioEffectsControls ? (
          <InspectorSection sectionId="audio-effects"
            title="Audio effects"
            defaultOpen={false}
          >
            {audioEffectsControls}
          </InspectorSection>
        ) : null}

        {activeVerticalSubpanel === "motion" && transitionContent ? (
          <div aria-label="Transition at next join">
            {transitionContent}
          </div>
        ) : null}
        {isMotionGraphic && selectedElement ? (
          <MotionGraphicProperties element={selectedElement} patchElement={patchElement} />
        ) : null}
        <InspectorSection sectionId="animation" title={showAnimPresets ? "Animation" : "Fades"}>
          {selectedElement?.type === "caption_text" && typeof selectedElement.props?.letter_fall_start_seconds === "number" ? (
            <div style={fieldGridStyle}>
              <div style={fieldStyle}><span style={fieldLabelStyle}>Direction</span>
                <OptionSelect label="Letter fall direction" value={String(selectedElement.props?.letter_fall_order??"outside_in")}
                  onValueChange={next=>patchSelectedElementProps({letter_fall_order:next})}
                  options={[{value:"outside_in",label:"Both ends inward"},{value:"left_to_right",label:"Left to right"},{value:"right_to_left",label:"Right to left"}]} />
              </div>
              {([
                ["letter_fall_start_seconds", "Release at", 0, selectedElement.duration, .01],
                ["letter_fall_seconds", "Letter fall time", .2, 2, .01],
                ["letter_fall_stagger_seconds", "Letter stagger", 0, .15, .005],
              ] as const).map(([field, label, min, max, step]) => (
                <div key={field} style={fieldStyle}>
                  <span style={fieldLabelStyle}>{label}</span>
                  <SliderScrubControl value={String(selectedElement.props?.[field] ?? 0)} min={min} max={max} step={step}
                    fallback={field === "letter_fall_seconds" ? .45 : .04} label={label} unit="s" disabled={false}
                    onChange={() => {}}
                    onCommit={value => { if (value !== undefined) patchSelectedElementProps({[field]: Number(value)}); }} />
                </div>
              ))}
            </div>
          ) : null}
          {showAnimPresets ? (
            <>
              {([true, false] as const).map(isIn => <div key={isIn ? 'entrance' : 'exit'} className="grid gap-3">
                <InspectorItemHeader title={isIn ? "Entrance" : "Exit"} />
              {selectedElement?.type === "caption_text" && (isIn ? editAnimationIn : editAnimationOut) === "handwriting" ? (
                <p className="text-xs text-[var(--ink-muted)]" data-handwriting-status>
                  {handwritingPackStatus(String(selectedElement.props?.fontPreset ?? "display_serif"), String(selectedElement.props?.text ?? ""), selectedElement.props?.handwritingRevealMode === "saved_strokes" ? "saved_strokes" : "line_mask").label}
                </p>
              ) : null}
              {selectedElement?.type === "caption_text" && handwritingPackStatus(String(selectedElement.props?.fontPreset ?? ""), "").kind !== "fallback" && (isIn ? editAnimationIn : editAnimationOut) === "handwriting" ? (
                <InspectorPropertyControl label="Reveal" fields="handwritingRevealMode" disabled={false} onReset={() => patchSelectedElementProps({ handwritingRevealMode: "line_mask" })}>
                  <OptionSelect label="Handwriting reveal" value={String(selectedElement.props?.handwritingRevealMode ?? "line_mask")} onValueChange={(next) => patchSelectedElementProps({ handwritingRevealMode: next })}
                    options={[{ value: "saved_strokes", label: "Previous saved reveal" }, { value: "line_mask", label: "Turning line mask" }]} />
                </InspectorPropertyControl>
              ) : null}
              <div style={fieldGridStyle}>
                <AnimationEffectSelector
                  value={isIn ? editAnimationIn : editAnimationOut}
                  presets={availableAnimationPresets}
                  disabled={isIn ? disableAnimIn : disableAnimOut}
                  side={isIn ? "start" : "end"}
                  onValueChange={(value) => {
                    if (isIn) { setEditAnimationIn(value); patchSelectedElementProps({ animationIn: value }); }
                    else { setEditAnimationOut(value); patchSelectedElementProps({ animationOut: value }); }
                  }}
                />
                {(isIn ? editAnimationIn : editAnimationOut) !== "none" ? (
                <div style={fieldStyle}>
                  <span style={fieldLabelStyle}>{(isIn ? editAnimationIn : editAnimationOut) === "handwriting" ? (isIn ? "Drawing time" : "Erasing time") : "Duration"}</span>
                  <SliderScrubControl
                    value={isIn ? editAnimInDuration : editAnimOutDuration}
                    min={0}
                    max={(isIn ? editAnimationIn : editAnimationOut) === "handwriting" ? Math.min(60, Math.max(2, selectedElement?.duration ?? 2)) : 2}
                    step={0.01}
                    fallback={0.25}
                    label={(isIn ? editAnimationIn : editAnimationOut) === "handwriting" ? (isIn ? "Drawing time" : "Erasing time") : `${isIn ? "entrance" : "exit"} animation duration`}
                    unit="s"
                    disabled={isIn ? disableAnimIn : disableAnimOut}
                    onChange={isIn ? setEditAnimInDuration : setEditAnimOutDuration}
                    onCommit={isIn ? commitAnimInDuration : commitAnimOutDuration}
                  />
                </div>
                ) : null}
              </div>
              </div>)}
            </>
          ) : (
            <div style={fieldGridStyle}>
              <div style={fieldStyle}><span style={fieldLabelStyle}>Fade in</span><span style={controlRowStyle}><ScrubNumberInput ariaLabel="Fade in numeric value" value={editFadeIn} min={0} max={999} step={0.01} disabled={disableFadeIn} onChange={setEditFadeIn} onCommit={commitFadeIn} /><span style={unitStyle}>s</span></span></div>
              <div style={fieldStyle}><span style={fieldLabelStyle}>Fade out</span><span style={controlRowStyle}><ScrubNumberInput ariaLabel="Fade out numeric value" value={editFadeOut} min={0} max={999} step={0.01} disabled={disableFadeOut} onChange={setEditFadeOut} onCommit={commitFadeOut} /><span style={unitStyle}>s</span></span></div>
            </div>
          )}
        </InspectorSection>

        {stabilizationControls ? (
          <InspectorSection sectionId="stabilization"
            title="Stabilization"
            disclosure
            defaultOpen={false}
          >
            {stabilizationControls}
          </InspectorSection>
        ) : null}



        {(isVisualAsset || isCaption) && selectedElement ? (
          <CameraFollowControl element={selectedElement} elements={timelineElements} onPatch={patchSelectedElementProps} />
        ) : null}
        {isVisualAsset && (
          <>
          <InspectorSection sectionId="placement" title="Position & size" headerAction={<Button variant="ghost" size="sm" aria-pressed={showPositionGrid} onClick={onTogglePositionGrid} className={inspectorQuietButtonClassName}>Preview grid</Button>}>
            <div style={fieldGridStyle}>
              <InspectorGroupActions
                label="Frame position"
                fields="media_scale,media_offset_x,media_offset_y"
                keyed={transformKeyedAtPlayhead}
                disabled={!selectedElement}
                onToggle={addTransformKeyframeAtPlayhead}
                onReset={() => {
                  clearVisualTransformPreview();
                  resetVisualTransform();
                }}
              />
              <InspectorPropertyControl density="compact" label="Size" fields="media_scale" keyed={transformFieldKeyedAtPlayhead.media_scale} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_scale")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("scale", "1"); }}>
                <SliderScrubControl density="compact" value={String(fractionToPercent(Number(editMediaScale)))} min={10} max={300} step={1} fallback={100} label="size" unit="%" disabled={!selectedElement} onChange={(v) => { const value = String(percentToFraction(Number(v))); setEditMediaScale(value); previewVisualTransform({ scale: value }); }} onCommit={(v) => commitVisualTransform("scale", v == null ? undefined : String(percentToFraction(Number(v))))} onCancel={clearVisualTransformPreview} />
              </InspectorPropertyControl>
              <InspectorPropertyControl density="compact" label="Horizontal" fields="media_offset_x" keyed={transformFieldKeyedAtPlayhead.media_offset_x} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_offset_x")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("offsetX", "0"); }}>
                  <SliderScrubControl density="compact" value={String(Number(editMediaOffsetX) * 50)} min={-100} max={100} step={0.5} unit="%" fallback={0} label="horizontal" compact disabled={!selectedElement} onChange={(display) => { const value = String(Number(display) / 50); setEditMediaOffsetX(value); previewVisualTransform({ offsetX: value }); }} onCommit={(value) => commitVisualTransform("offsetX", value == null ? undefined : String(Number(value) / 50))} onCancel={clearVisualTransformPreview} />
              </InspectorPropertyControl>
              <InspectorPropertyControl density="compact" label="Vertical" fields="media_offset_y" keyed={transformFieldKeyedAtPlayhead.media_offset_y} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_offset_y")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("offsetY", "0"); }}>
                  <SliderScrubControl density="compact" value={String(Number(editMediaOffsetY) * 50)} min={-100} max={100} step={0.5} unit="%" fallback={0} label="vertical" compact disabled={!selectedElement} onChange={(display) => { const value = String(Number(display) / 50); setEditMediaOffsetY(value); previewVisualTransform({ offsetY: value }); }} onCommit={(value) => commitVisualTransform("offsetY", value == null ? undefined : String(Number(value) / 50))} onCancel={clearVisualTransformPreview} />
              </InspectorPropertyControl>
              <InspectorPropertyControl density="compact" label="Rotate" fields="media_orientation" disabled={!selectedElement} onReset={() => patchSelectedElementProps({ media_orientation: "original" })}>
                <InspectorVisualChoice inline label="Rotate picture" value={String(selectedElement?.props?.media_orientation ?? "original")} onChange={media_orientation => patchSelectedElementProps({media_orientation})}
                  options={([{value:"original",label:"None",angle:0},{value:"clockwise",label:"Right",angle:90},{value:"counterclockwise",label:"Left",angle:-90}]).map(item => ({...item,preview:<span className="inline-block text-[13px] font-bold leading-none" style={{transform:`rotate(${item.angle}deg)`}}>R</span>}))} />
              </InspectorPropertyControl>
              <InspectorPropertyControl density="compact" label="Flip" fields="media_mirror" disabled={!selectedElement} onReset={() => patchSelectedElementProps({media_mirror:"none"})}>
                <InspectorVisualChoice inline label="Flip horizontally" value={String(selectedElement?.props?.media_mirror ?? "none")} onChange={media_mirror => patchSelectedElementProps({media_mirror})}
                  options={[{value:"none",label:"None"},{value:"horizontal",label:"Mirrored"}].map(item => ({...item,preview:<span className="inline-block text-[13px] font-bold leading-none" style={{transform:item.value === "horizontal" ? "scaleX(-1)" : undefined}}>R</span>}))} />
              </InspectorPropertyControl>
              <InspectorPropertyControl density="compact" label="Opacity" fields="media_opacity" keyed={opacityKeyedAtPlayhead} disabled={!selectedElement} onToggle={addOpacityKeyframeAtPlayhead} onReset={() => commitMediaEffect("opacity", "100")}>
                <SliderScrubControl density="compact" value={editMediaOpacity} min={0} max={100} step={1} fallback={100} label="opacity" unit="%" disabled={!selectedElement} onChange={(v) => { setEditMediaOpacity(v); previewMediaEffect("opacity", v); }} onCommit={(v) => commitMediaEffect("opacity", v)} />
              </InspectorPropertyControl>
              {selectedElement ? <LayerBlendControl value={String(selectedElement.props?.media_blend_mode ?? "normal")} onChange={media_blend_mode => patchSelectedElementProps({ media_blend_mode })} /> : null}
              {selectedElement ? <SurfacePlaneNumberControl label="Rotation" value={resolveSurfacePlaneProps(selectedElement.props).mode === "wall" ? resolveSurfacePlaneProps(selectedElement.props).rotateZDeg : 0} min={-30} max={30} step={0.25} unit="°" onCommit={(surfaceRotateZDeg) => patchSelectedElementProps({
                ...(resolveSurfacePlaneProps(selectedElement.props).mode === "none" ? {
                  surfaceMode: "wall", surfaceDepthPx: 0, surfaceRotateXDeg: 0, surfaceRotateYDeg: 0,
                  surfaceSkewXDeg: 0, surfaceSkewYDeg: 0, surfaceOpacity: 1, surfaceBlurPx: 0, surfaceBlendMode: "normal",
                } : {}),
                surfaceRotateZDeg,
              })} /> : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedElement || !hasVisualKeyframes}
                onClick={() => {
                  clearVisualTransformPreview();
                  clearVisualKeyframes();
                }}
                className={inspectorQuietButtonClassName}
                style={{ minHeight: 36, paddingInline: 12 }}
              >
                Clear all keyframes
              </Button>
            </div>
          </InspectorSection>

          {!isAlphaCutout && selectedElement ? (
            <InspectorSection sectionId="crop"
              title="Reframe visually"
              disclosure
              defaultOpen={false}
            >
              <VisualFramingEditor
                element={selectedElement}
                composition={compositionDimensions}
                localPlayheadSeconds={selectedLocalPlayheadSec}
                editMediaScale={editMediaScale}
                editMediaOffsetX={editMediaOffsetX}
                editMediaOffsetY={editMediaOffsetY}
                setEditMediaScale={setEditMediaScale}
                setEditMediaOffsetX={setEditMediaOffsetX}
                setEditMediaOffsetY={setEditMediaOffsetY}
                previewVisualTransform={previewVisualTransform}
                clearVisualTransformPreview={clearVisualTransformPreview}
                commitVisualTransformValues={commitVisualTransformValues}
                resetVisualTransform={resetVisualTransform}
              />
            </InspectorSection>
          ) : null}

          {selectedElement && (selectedElement.type === "video_clip" || selectedElement.type === "still") ? (
            <InspectorSection sectionId="surface" title="On a screen" disclosure defaultOpen={Boolean(selectedElement.props?.surface_track)}>
              <SurfaceTrackingControls key={selectedElement.id} title="Attach to a screen in a video" element={selectedElement} elements={timelineElements} onPatch={patchSelectedElementProps} />
              {selectedElement.props?.surface_track ? <SurfaceRegionControls value={selectedElement.props?.surface_region} onPatch={patchSelectedElementProps} /> : null}
            </InspectorSection>
          ) : null}

          {!isAlphaCutout && selectedElement ? (
            <InspectorSection sectionId="perspective"
              title={resolveSurfacePlaneProps(selectedElement.props).mode === "wall" ? "Advanced geometry · Active" : "Advanced geometry"}
              disclosure
              defaultOpen={false}
            >
              <MediaSurfaceControls
                props={selectedElement.props}
                onPatch={patchSelectedElementProps}
              />
            </InspectorSection>
          ) : null}

          <InspectorSection sectionId="effects" title="Effects">
            {selectedElement ? <ClipEffects key={selectedElement.id} appliedTreatments={[
              ...(edgeAuraSchema.safeParse(selectedElement.props?.edge_aura).success ? [{id: "aura", label: "Traveling aura", controls: <PaperContourControl kind="aura" element={selectedElement} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} />}] : []),
              ...(selectedElement.props?.contour_model === "rg-distance-1024-v1" ? [{id: "contour", label: "Contour growth", controls: <PaperContourControl kind="contour" element={selectedElement} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} />}] : []),
            ]} gridControls={<GridMatteControls props={selectedElement.props ?? {}} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} />} windowControls={<SubjectWindowControls props={selectedElement.props ?? {}} elements={timelineElements} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} />} props={selectedElement.props ?? {}} alpha={isAlphaCutout} onPatch={patchSelectedElementProps} lookControls={selectedElement.type === "video_clip" || selectedElement.type === "still" ? effect => <ClipLookControls effect={effect} onPreview={previewSelectedEffectProps} element={selectedElement} time={selectedLocalPlayheadSec} onPatch={patchSelectedElementProps} /> : undefined}>{effect => <SubjectGlowControls effect={effect} onPreview={previewSelectedEffectProps} element={selectedElement} time={selectedLocalPlayheadSec} onPatch={patchSelectedElementProps} />}</ClipEffects> : null}
          </InspectorSection>

          <InspectorSection sectionId="color"
            title="Color"
          >
            {/* Whole-grade actions lead the tab so they are found without scrolling past every control. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "inline-flex", gap: 4 }}>
                <Button variant="ghost" size="sm" disabled={!selectedElement} aria-pressed={lookPickMode === "match"} onClick={() => startLookPick("match")} className={inspectorQuietButtonClassName} style={{ minHeight: 36, paddingInline: 12 }}>Match a clip</Button>
                <Button variant="ghost" size="sm" disabled={!selectedElement} aria-pressed={lookPickMode === "same"} onClick={() => startLookPick("same")} className={inspectorQuietButtonClassName} style={{ minHeight: 36, paddingInline: 12 }}>Copy a clip&apos;s look</Button>
              </span>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {hasColorGradeKeyframes ? <Button variant="ghost" size="sm" onClick={clearColorGradeKeyframes} className={inspectorQuietButtonClassName} style={{ minHeight: 36 }}>Clear color animation</Button> : null}
                <Button variant="ghost" size="sm" disabled={!selectedElement} onClick={resetColorGradeControls} className={inspectorQuietButtonClassName} style={{ minHeight: 36, paddingInline: 12 }}>Reset color</Button>
              </span>
            </div>
            {selectedElement ? <ColorWaveform element={selectedElement} scopeMode={colorScopeMode} onScopeChange={setColorScopeMode} /> : null}
            <ColorGradeAdvancedControls basic={<>
              <ColorGradeControls
                scopeMode={colorScopeMode}
                editColorGrade={editColorGrade}
                setEditColorGrade={setEditColorGrade}
                previewColorGrade={previewColorGrade}
                commitColorGrade={commitColorGrade}
                toggleColorGradeKeyframeAtPlayhead={toggleColorGradeKeyframeAtPlayhead}
                colorGradeKeyedAtPlayhead={colorGradeKeyedAtPlayhead}
                disabled={!selectedElement}
              />
              {selectedElement ? <ColorGradeLutControls projectId={selectedElement.project_id} lut={colorGradeLut} disabled={!selectedElement} apply={applyColorGradeLut} previewIntensity={previewColorGradeLutIntensity} commitIntensity={commitColorGradeLutIntensity} toggleKeyframe={toggleColorGradeLutKeyframeAtPlayhead} keyed={lutIntensityKeyedAtPlayhead} /> : null}
            </>} grade={advancedColorGrade} disabled={!selectedElement} preview={previewAdvancedColorGrade} commit={commitAdvancedColorGrade} toggleKeyframe={toggleAdvancedColorGradeKeyframeAtPlayhead} keyed={advancedColorGradeKeyedAtPlayhead} />
            <RecolorControl element={selectedElement} onPatch={patchSelectedElementProps} />
          </InspectorSection>

          <InspectorSection sectionId="shape-mask" title="Shape mask">
            <p className="m-0 text-xs text-[var(--ink-secondary)]">Masking: {String(selectedElement?.props?.title ?? selectedElement?.source_url?.split("/").at(-1) ?? "Selected layer")}</p>
            {selectedElement && activeVerticalSubpanel === "mask" ? <VisualMaskEditor
              key={`visual-mask-${selectedElement.id}`}
              element={selectedElement}
              time={selectedLocalPlayheadSec}
              preview={previewMaskInset}
              clear={clearVisualTransformPreview}
              commit={patchSelectedElementProps}
            /> : null}
            <div style={{ ...fieldStyle, display: "grid", gap: 6, gridTemplateColumns: "minmax(64px, 96px) minmax(0, 1fr)" }}>
              <span style={fieldLabelStyle}>Feather</span>
              <SliderScrubControl value={editMaskFeather} min={0} max={50} step={1} fallback={0} label="mask softness" unit="%" disabled={!selectedElement} onChange={(next) => { setEditMaskFeather(next); previewMediaEffect("maskFeather", next); }} onCommit={(next) => commitMediaEffect("maskFeather", next)} />
            </div>
            <div data-effect-control="mask_corner_radius" style={{ ...fieldStyle, display: "grid", gap: 6, gridTemplateColumns: "minmax(64px, 96px) minmax(0, 1fr)" }}>
              <span style={fieldLabelStyle}>Roundness</span>
              <SliderScrubControl value={editMaskCornerRadius} min={0} max={100} step={1} fallback={0} label="crop roundness" unit="%" disabled={!selectedElement} onChange={(next) => { setEditMaskCornerRadius(next); previewMediaEffect("maskCornerRadius", next); }} onCommit={(next) => commitMediaEffect("maskCornerRadius", next)} />
            </div>
            <InspectorGroupActions label="Mask shape" fields="mask_inset" keyed={maskKeyedAtPlayhead} disabled={!selectedElement} onToggle={addMaskKeyframeAtPlayhead} onReset={resetMaskInset} />
            {selectedElement && maskShapeLabel(resolveMaskInsetAtTime(selectedElement.props, selectedLocalPlayheadSec)) === "Rectangle" ? <InspectorDisclosure key={selectedElement.id} title="Rectangle edges" open={rectangleEdgesOpen} onOpenChange={setRectangleEdgesOpen}>
              <div className="grid gap-3 pt-2">
            <InspectorVisualChoice label="Rectangle adjustment" value={maskMode} onChange={setMaskMode} options={[
              {value:"edges",label:"Independent edges",preview:<svg viewBox="0 0 60 32" className="h-8 w-full"><rect x="10" y="4" width="40" height="24" fill="none" stroke="currentColor"/><path d="M5 16H15 M45 16H55 M30 0V8 M30 24V32" stroke="currentColor" strokeWidth="2"/></svg>},
              {value:"mirror",label:"Horizontal band",preview:<svg viewBox="0 0 60 32" className="h-8 w-full"><rect x="10" y="10" width="40" height="12" fill="currentColor" opacity=".5"/><path d="M10 8H50 M10 24H50" stroke="currentColor"/></svg>},
            ]} />
            <div data-effect-control="mask_inset" style={fieldGridStyle}>
              {maskMode === "edges" ? ([
                ["Top", "top", editMaskTop, setEditMaskTop],
                ["Right", "right", editMaskRight, setEditMaskRight],
                ["Bottom", "bottom", editMaskBottom, setEditMaskBottom],
                ["Left", "left", editMaskLeft, setEditMaskLeft],
              ] as const).map(([label, field, value, setter]) => (
                <div key={field} style={{ ...fieldStyle, display: "grid", gap: 6, gridTemplateColumns: "minmax(64px, 96px) minmax(0, 1fr)" }}>
                  <span style={fieldLabelStyle}>{label}</span>
                  <SliderScrubControl value={value} min={0} max={95} step={1} fallback={0} label={`crop ${field}`} unit="%" disabled={!selectedElement} onChange={(next) => { setter(next); previewMaskInset({ [field]: next }); }} onCommit={(next) => commitMaskInset(field, next)} />
                </div>
              )) : ([
                ["Center", "center", editMirrorCenter, setEditMirrorCenter, 50],
                ["Height", "height", editMirrorHeight, setEditMirrorHeight, 100],
              ] as const).map(([label, field, value, setter, fallback]) => (
                <div key={field} style={{ ...fieldStyle, display: "grid", gap: 6, gridTemplateColumns: "minmax(64px, 96px) minmax(0, 1fr)" }}>
                  <span style={fieldLabelStyle}>{label}</span>
                  <SliderScrubControl value={value} min={0} max={100} step={1} fallback={fallback} label={`horizontal band ${field}`} unit="%" disabled={!selectedElement} onChange={(next) => { setter(next); previewMirrorBand(field, next); }} onCommit={(next) => commitMirrorBand(field, next)} />
                </div>
              ))}
            </div>
              </div>
            </InspectorDisclosure> : null}
          </InspectorSection>
          {isAlphaCutout && selectedElement ? <InspectorSection sectionId="background-removal" title="Background removal" defaultOpen>
            <CutoutEffectControls time={selectedLocalPlayheadSec} element={selectedElement} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} />
          </InspectorSection> : null}
          {selectedElement?.type === "video_clip" ? (
            <InspectorSection sectionId="chroma-key"
              title="Chroma key"
              defaultOpen={editChromaKeyColor.length > 0}
            >
              <div data-effect-control="chroma_key_color" className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13px] font-medium text-[var(--ink)]">Key colour</span>
                <ChromaKeyColorControl
                  value={editChromaKeyColor}
                  disabled={!selectedElement}
                  onCommit={(color) => commitChromaKey("chroma_key_color", color)}
                  // Sampling has to see the un-keyed plate, so the picker borrows the
                  // Source view for its duration and restores whatever was selected.
                  onPickStart={() => {
                    chromaPickRestoreRef.current = chromaKeyReviewMode;
                    setChromaKeyReviewMode("source");
                  }}
                  onPickEnd={() => setChromaKeyReviewMode(chromaPickRestoreRef.current)}
                />
              </div>
              {editChromaKeyColor.length > 0 ? (
                <ChromaKeyReviewControl
                  value={chromaKeyReviewMode}
                  onValueChange={setChromaKeyReviewMode}
                  disabled={!selectedElement}
                />
              ) : null}
              {editChromaKeyColor.length > 0 ? (
                <>
                  {([
                    ["chroma_key_tolerance", "Tolerance", editChromaKeyTolerance, "tolerance"],
                    ["chroma_key_softness", "Softness", editChromaKeySoftness, "softness"],
                    ["chroma_key_spill", "Spill suppression", editChromaKeySpill, "spill suppression"],
                  ] as const).map(([field, label, value, sliderLabel]) => (
                    <InspectorPropertyControl
                      key={field}
                      label={label}
                      fields={field}
                      keyed={chromaKeyKeyedAtPlayhead[field]}
                      disabled={!selectedElement}
                      onToggle={() => toggleChromaKeyKeyframeAtPlayhead(field)}
                      onReset={() => commitChromaKey(field, String(Math.round(CHROMA_KEY_AMOUNT_CONFIG[field].identity * 100)))}
                    >
                      <SliderScrubControl
                        value={value}
                        min={0}
                        max={100}
                        step={1}
                        fallback={Math.round(CHROMA_KEY_AMOUNT_CONFIG[field].identity * 100)}
                        label={sliderLabel}
                        unit="%"
                        disabled={!selectedElement}
                        onChange={(next) => { setEditChromaKey(field, next); previewChromaKey(field, next); }}
                        onCommit={(next) => commitChromaKey(field, next)}
                      />
                    </InspectorPropertyControl>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Button variant="ghost" size="sm" disabled={!selectedElement} onClick={resetChromaKeyControls} className={inspectorQuietButtonClassName} style={{ minHeight: 36, paddingInline: 12 }}>Reset key</Button>
                  </div>
                </>
              ) : null}
            </InspectorSection>
          ) : null}


          <InspectorSection sectionId="blur-reveal" title="Reveal & blur" disclosure defaultOpen={false}>
            {selectedElement ? <TransitionEffectControls onPreview={previewSelectedEffectProps} element={selectedElement} time={selectedLocalPlayheadSec} onPatch={patchSelectedElementProps} /> : null}
          </InspectorSection>

          </>
        )}



        {!musicToolsControls && beatControls ? (
          <InspectorSection sectionId="rhythm" title="Rhythm">
            {beatControls}
          </InspectorSection>
        ) : null}

        {activeVerticalSubpanel !== "keyframe" && activeVerticalSubpanel !== "transition" && !isCaption ? <div style={{ order: 100, padding: 14 }}><InspectorDisclosure title="Clip settings" open={clipSettingsOpen} onOpenChange={setClipSettingsOpen}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={!selectedElement} onClick={() => selectedElement && patchElement(selectedElement.id, { position_locked: !selectedElement.position_locked })} className={inspectorQuietButtonClassName} aria-pressed={!!selectedElement?.position_locked} title={selectedElement?.position_locked ? "Unlock position" : "Lock position"} style={{ minHeight: 40 }}>
            {selectedElement?.position_locked ? <LockIcon data-icon="inline-start" /> : <UnlockIcon data-icon="inline-start" />}
            {selectedElement?.position_locked ? "Unlock position" : "Lock position"}
          </Button>
          <Button variant="ghost" size="sm" disabled={!selectedElement} onClick={() => { if (!selectedElement) return; void resetElement(selectedElement.id); }} className={inspectorQuietButtonClassName} style={{ minHeight: 40 }}>
            <RotateCcwIcon data-icon="inline-start" /> Reset clip
          </Button>
        </div></InspectorDisclosure></div> : null}
        </InspectorSectionFilterContext.Provider>
      </div>
    );
  }

  /* ── Horizontal toolbar layout (portrait / bottom panel) ───────────── */

  return (
    <div ref={menuRef} style={{
      borderTop: "1px solid var(--chrome-line)",
      background: "var(--chrome-panel)",
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      flexShrink: 0,
      minWidth: 0,
      overflowX: isVertical ? "hidden" : "auto",
      overflowY: isVertical ? "auto" : "hidden",
      opacity: selectedElement ? 1 : 0.35,
      pointerEvents: selectedElement ? "auto" : "none",
      transition: "opacity 150ms ease",
    }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: isVertical ? 0 : "max-content" }}>
        <div style={{ display: "flex", flexDirection: isVertical ? "column" : "row", alignItems: isVertical ? "stretch" : "stretch", gap: 0, padding: isVertical ? "0 0.75rem" : "0 1rem", boxSizing: "border-box", minWidth: isVertical ? 0 : "max-content" }}>
          {/* Timing column */}
          <div style={{ ...columnStyle, paddingRight: 12 }}>
            <span style={columnHeaderStyle}>Timing</span>
            <CaptionAudioLinkControl element={selectedElement} onPatch={patchSelectedElementProps} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ScrubNumberInput
                ariaLabel="Duration numeric value"
                value={editDuration}
                min={minTimelineDurationSeconds()}
                max={durationInputMax}
                step={0.01}
                disabled={!selectedElement}
                onChange={(value) => {
                  setEditDuration(value);
                  previewDuration?.(value);
                }}
                onCommit={(value) => {
                  commitDuration(value);
                }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--ink-muted)" }}>s</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--ink-muted)" }}>@</span>
              <SpeedScrub
                rate={displayedPlaybackRate}
                disabled={!selectedElement || !supportsPlaybackRate(selectedElement?.type ?? "")}
                onPreview={(next) => {
                  if (!selectedElement || hasSpeedSteps) return;
                  previewPlaybackRate?.(selectedElement.id, next);
                }}
                onCommit={commitPlaybackRateAtPlayhead}
                onCancelPreview={clearPlaybackRatePreview}
              />
              <KeyframeToggleButton fields={SPEED_KEYFRAME_FIELD} label="speed" keyed={speedKeyedAtPlayhead} disabled={!supportsSpeedSteps} onToggle={toggleSpeedKeyframeAtPlayhead} />
            </div>
            {sourceLengthLabel && maxDurationLabel ? (
              <div data-source-duration className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[0.875rem] text-[var(--ink-secondary)]">
                <span className="flex flex-wrap items-center gap-2">
                <span>Source <strong className="font-mono text-[var(--ink)]">{sourceLengthLabel}</strong></span>
                <span>· Can extend to <strong className="font-mono text-[var(--ink)]">{maxDurationLabel}</strong></span>
                {availableTailSeconds != null && availableTailSeconds > 0.005 ? (
                  <span>· <strong className="font-mono text-[var(--ink)]">{formatTime(availableTailSeconds, 2)}</strong> remaining</span>
                ) : null}
                </span>
                <Button type="button" variant="ghost" size="xs" aria-label="Extend to source end" disabled={durationIsMax} onClick={useMaxDuration} className={`whitespace-nowrap ${inspectorQuietButtonClassName}`}>
                  <Maximize2Icon data-icon="inline-start" aria-hidden="true" /> Extend to end
                </Button>
              </div>
            ) : null}
          </div>

          <div style={dividerStyle} />

          {/* Volume column */}
          <div style={{ ...columnStyle, paddingInline: 12 }}>
            <span style={columnHeaderStyle}>{volumeLabel}</span>
            <div className="flex min-w-[320px] items-center gap-2">
              <SliderScrubControl
                value={volumeDisplayDb == null ? String(FADER_MIN_DB) : String(volumeDisplayDb)}
                min={FADER_MIN_DB}
                max={FADER_MAX_DB}
                step={0.1}
                fallback={0}
                label="volume"
                unit="dB"
                compact
                disabled={disableMediaControls}
                onChange={(value) => setVolumeFromDb(parseDbInput(value, volumeDisplayDb ?? FADER_MIN_DB))}
                onCommit={(value) => commitVolumeFromDb(parseDbInput(value ?? String(volumeDisplayDb ?? FADER_MIN_DB), volumeDisplayDb ?? FADER_MIN_DB))}
                onCancel={() => {
                  if (selectedElement) clearPreviewAudioGain(selectedElement.id);
                }}
              />
              <KeyframeToggleButton
                fields="volume_envelope"
                label={volumeLabel}
                keyed={volumeKeyedAtPlayhead}
                disabled={disableMediaControls}
                onToggle={toggleVolumeKeyframeAtPlayhead}
              />
              {volumeMuteButton}
              {volumeResultLufs != null ? (
                <span title="Resulting integrated loudness" className="whitespace-nowrap text-[0.72rem] font-semibold tabular-nums text-[var(--ink-muted)]">
                  {volumeResultLufs} LUFS{volumeTargetLufs != null ? ` · ref ${volumeTargetLufs}` : ""}
                </span>
              ) : volumeIsBoosted ? (
                <span className="rounded bg-[var(--chrome-raised)] px-1.5 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]">
                  Boost
                </span>
              ) : null}
            </div>
          </div>

          <div style={dividerStyle} />

          {musicToolsControls ? (
            <>
              <div style={{ ...columnStyle, minWidth: 250, paddingInline: 12 }}>
                <span style={columnHeaderStyle} >Music tools</span>
                {musicToolsControls}
              </div>
              <div style={dividerStyle} />
            </>
          ) : audioEffectsControls ? (
            <>
              <div style={{ ...columnStyle, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Audio effects</span>
                {audioEffectsControls}
              </div>
              <div style={dividerStyle} />
            </>
          ) : null}

          {selectedElement?.type === "video_clip" && captionGeneration ? (
            <>
              <div style={{ ...columnStyle, minWidth: 220, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Captions</span>
                {captionGeneration}
              </div>
              <div style={dividerStyle} />
            </>
          ) : null}

          {stabilizationControls ? (
            <>
              <div style={{ ...columnStyle, minWidth: 280, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Stabilization</span>
                {stabilizationControls}
              </div>
              <div style={dividerStyle} />
            </>
          ) : null}

          {/* Trim column */}
          <div style={{ ...columnStyle, paddingInline: 12 }}>
            <span style={columnHeaderStyle}>Trim</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <ScrubNumberInput ariaLabel="Trim start numeric value" value={editTrimStart} min={0} max={trimStartInputMax} step={0.01} disabled={disableMediaControls} onChange={setEditTrimStart} onCommit={commitTrimStart} />
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>-</span>
            <ScrubNumberInput ariaLabel="Trim end numeric value" value={editTrimEnd} min={0} max={trimEndInputMax} step={0.01} placeholder="-" disabled={disableMediaControls} onChange={setEditTrimEnd} onCommit={commitTrimEnd} />
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Animation / Fade columns */}
          <PaperContourControl element={selectedElement} onPatch={patchSelectedElementProps} />
          {showAnimPresets ? (() => {
          const renderAnimSide = (side: "in" | "out") => {
            const preset = side === "in" ? editAnimationIn : editAnimationOut;
            const dur = side === "in" ? editAnimInDuration : editAnimOutDuration;
            const disabled = side === "in" ? disableAnimIn : disableAnimOut;
            const onPreset = (value: AnimationPreset | null) => {
              if (!value) return;
              if (side === "in") {
                setEditAnimationIn(value);
                patchSelectedElementProps({ animationIn: value });
              } else {
                setEditAnimationOut(value);
                patchSelectedElementProps({ animationOut: value });
              }
            };
            const onDurChange = side === "in" ? setEditAnimInDuration : setEditAnimOutDuration;
            const onDurCommit = side === "in" ? commitAnimInDuration : commitAnimOutDuration;

            return (
              <div style={{ ...columnStyle, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Anim {side === "in" ? "In" : "Out"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Select
                    value={preset}
                    disabled={disabled}
                    onValueChange={onPreset}
                  >
                    <SelectTrigger className="h-8 w-[110px] rounded-md border text-[0.82rem]" style={{ ...selectTriggerStyle, opacity: disabled ? 0.5 : 1 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top" alignItemWithTrigger={false} className="min-w-[160px] rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1.5 text-[var(--ink)] shadow-xl">
                      {availableAnimationPresets.map((value) => (
                        <SelectItem key={value} value={value} style={selectItemStyle} className={selectItemClassName}>
                          {value.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <SliderScrubControl value={dur} min={0} max={2} step={0.01} fallback={0.25} label={`${side} animation duration`} unit="s" compact disabled={disabled} onChange={onDurChange} onCommit={onDurCommit} />
                </div>
              </div>
            );
          };

          if (animCollapsed) {
            const isIn = animSide === "in";
            return (
              <div style={{ ...columnStyle, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Animation</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <div style={{ display: "flex", overflow: "hidden", borderRadius: "var(--edge-control-inner)", border: "1px solid var(--chrome-line)" }}>
                    <button
                      type="button"
                      onClick={() => setAnimSide("in")}
                      style={{
                        padding: "0 8px",
                        height: 30,
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        background: isIn ? "var(--chrome-raised)" : "var(--chrome-deep)",
                        color: isIn ? "var(--ink)" : "var(--ink-muted)",
                        opacity: disableAnimIn ? 0.4 : 1,
                        transition: "background 100ms, color 100ms",
                      }}
                    >
                      In
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnimSide("out")}
                      style={{
                        padding: "0 8px",
                        height: 30,
                        border: "none",
                        borderLeft: "1px solid var(--chrome-raised)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        background: !isIn ? "var(--chrome-raised)" : "var(--chrome-deep)",
                        color: !isIn ? "var(--ink)" : "var(--ink-muted)",
                        opacity: disableAnimOut ? 0.4 : 1,
                        transition: "background 100ms, color 100ms",
                      }}
                    >
                      Out
                    </button>
                  </div>
                  <Select
                    value={isIn ? editAnimationIn : editAnimationOut}
                    disabled={isIn ? disableAnimIn : disableAnimOut}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (isIn) { setEditAnimationIn(v as AnimationPreset); patchSelectedElementProps({ animationIn: v }); }
                      else { setEditAnimationOut(v as AnimationPreset); patchSelectedElementProps({ animationOut: v }); }
                    }}
                  >
                    <SelectTrigger className="h-8 w-[110px] rounded-md border text-[0.82rem]" style={{ ...selectTriggerStyle, opacity: (isIn ? disableAnimIn : disableAnimOut) ? 0.5 : 1 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top" alignItemWithTrigger={false} className="min-w-[160px] rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-1.5 text-[var(--ink)] shadow-xl">
                      {availableAnimationPresets.map((value) => (
                        <SelectItem key={value} value={value} style={selectItemStyle} className={selectItemClassName}>
                          {value.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <SliderScrubControl
                    value={isIn ? editAnimInDuration : editAnimOutDuration}
                    min={0}
                    max={2}
                    step={0.01}
                    fallback={0.25}
                    label={`${isIn ? "entrance" : "exit"} animation duration`}
                    unit="s"
                    compact
                    disabled={isIn ? disableAnimIn : disableAnimOut}
                    onChange={isIn ? setEditAnimInDuration : setEditAnimOutDuration}
                    onCommit={isIn ? commitAnimInDuration : commitAnimOutDuration}
                  />
                </div>
              </div>
            );
          }

          return (
            <>
              {renderAnimSide("in")}
              <div style={dividerStyle} />
              {renderAnimSide("out")}
            </>
          );
          })() : (
            <div style={{ ...columnStyle, paddingInline: 12 }}>
              <span style={columnHeaderStyle}>Fade</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <ScrubNumberInput ariaLabel="Fade in numeric value" value={editFadeIn} min={0} max={999} step={0.01} disabled={disableFadeIn} onChange={setEditFadeIn} onCommit={commitFadeIn} />
                <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>-</span>
                <ScrubNumberInput ariaLabel="Fade out numeric value" value={editFadeOut} min={0} max={999} step={0.01} disabled={disableFadeOut} onChange={setEditFadeOut} onCommit={commitFadeOut} />
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {!musicToolsControls && beatControls ? (
            <>
              <div style={{ ...columnStyle, paddingInline: 12 }}>
                <span style={columnHeaderStyle}>Rhythm</span>
                {beatControls}
              </div>
              <div style={dividerStyle} />
            </>
          ) : null}

          {/* Actions column */}
          <div style={{ ...columnStyle, paddingLeft: 12 }}>
            <span style={columnHeaderStyle}>Clip settings</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={!selectedElement}
                title={selectedElement?.position_locked ? "Unlock position" : "Lock position"}
                aria-pressed={!!selectedElement?.position_locked}
                className="hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]"
                onClick={() => selectedElement && patchElement(selectedElement.id, { position_locked: !selectedElement.position_locked })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  border: "1px solid transparent",
                  borderRadius: "var(--edge-control-inner)",
                  background: selectedElement?.position_locked ? "var(--chrome-raised)" : undefined,
                  color: selectedElement?.position_locked ? "var(--ink)" : "var(--ink-muted)",
                  cursor: selectedElement ? "pointer" : "default",
                  transition: "background 100ms, color 100ms, border-color 100ms",
                  borderColor: selectedElement?.position_locked ? "var(--chrome-selected-ring)" : "transparent",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {selectedElement?.position_locked ? (
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
                    <rect x="1.5" y="7" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M4 7V4.5a3 3 0 0 1 6 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <circle cx="7" cy="11" r="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
                    <rect x="1.5" y="7" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M4 7V4.5a3 3 0 0 1 6 0V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedElement}
                onClick={() => {
                  if (!selectedElement) return;
                  void resetElement(selectedElement.id);
                }}
                className={inspectorQuietButtonClassName}
                style={{ height: 32, width: 32, paddingInline: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                title="Reset clip"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedElement}
                onClick={() => selectedElement && deleteElement(selectedElement.id)}
                className={inspectorQuietButtonClassName}
                title="Remove element"
                style={{ height: 32, width: 32, paddingInline: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: selectedElement ? "var(--ink)" : undefined }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </Button>
            </div>
          </div>
        </div>

        {isVisualAsset ? (
          <div style={{ display: "flex", flexDirection: isVertical ? "column" : "row", alignItems: isVertical ? "stretch" : "stretch", gap: 0, padding: isVertical ? "0 0.75rem 0.65rem" : "0 1rem 0.65rem", boxSizing: "border-box", minWidth: isVertical ? 0 : "max-content" }}>
            {isAlphaCutout && selectedElement ? <CutoutEffectControls time={selectedLocalPlayheadSec} element={selectedElement} onPreview={previewSelectedEffectProps} onPatch={patchSelectedElementProps} /> : null}
            <div style={{ ...columnStyle, paddingRight: 12 }}>
              <span style={{ ...columnHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                {isAlphaCutout ? "Placement" : "Framing"}
                <Button variant="ghost" size="sm" aria-pressed={showPositionGrid} onClick={onTogglePositionGrid} className={inspectorQuietButtonClassName}>Preview grid</Button>
                <InspectorGroupActions
                  compact
                  label="Frame position"
                  fields="media_scale,media_offset_x,media_offset_y"
                  keyed={transformKeyedAtPlayhead}
                  disabled={!selectedElement}
                  onToggle={addTransformKeyframeAtPlayhead}
                  onReset={() => {
                    clearVisualTransformPreview();
                    resetVisualTransform();
                  }}
                />
              </span>
              <MotionPresetControl value={motionPreset} onValueChange={applyMotionPreset} disabled={!selectedElement} compact />
              {!isAlphaCutout && selectedElement ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisualFramingOpen(true)}
                  className={inspectorQuietButtonClassName}
                  style={{ height: 32, marginBottom: 8, paddingInline: 10 }}
                >
                  <PanelRightOpenIcon data-icon="inline-start" /> Adjust in frame
                </Button>
              ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <InspectorPropertyControl label="Scale" fields="media_scale" keyed={transformFieldKeyedAtPlayhead.media_scale} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_scale")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("scale", "1"); }}>
                  <SliderScrubControl value={editMediaScale} min={0.1} max={3} step={0.01} fallback={1} label="scale" unit="x" compact disabled={!selectedElement} onChange={(value) => { setEditMediaScale(value); previewVisualTransform({ scale: value }); }} onCommit={(value) => commitVisualTransform("scale", value)} onCancel={clearVisualTransformPreview} />
                </InspectorPropertyControl>
                <InspectorPropertyControl label="X · Left / Right" fields="media_offset_x" keyed={transformFieldKeyedAtPlayhead.media_offset_x} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_offset_x")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("offsetX", "0"); }}>
                  <SliderScrubControl value={editMediaOffsetX} min={-2} max={2} step={0.01} fallback={0} label="horizontal" compact disabled={!selectedElement} onChange={(value) => { setEditMediaOffsetX(value); previewVisualTransform({ offsetX: value }); }} onCommit={(value) => commitVisualTransform("offsetX", value)} onCancel={clearVisualTransformPreview} />
                </InspectorPropertyControl>
                <InspectorPropertyControl label="Y · Up / Down" fields="media_offset_y" keyed={transformFieldKeyedAtPlayhead.media_offset_y} disabled={!selectedElement} onToggle={() => toggleTransformKeyframeAtPlayhead("media_offset_y")} onReset={() => { clearVisualTransformPreview(); commitVisualTransform("offsetY", "0"); }}>
                  <SliderScrubControl value={editMediaOffsetY} min={-2} max={2} step={0.01} fallback={0} label="vertical" compact disabled={!selectedElement} onChange={(value) => { setEditMediaOffsetY(value); previewVisualTransform({ offsetY: value }); }} onCommit={(value) => commitVisualTransform("offsetY", value)} onCancel={clearVisualTransformPreview} />
                </InspectorPropertyControl>
                <InspectorPropertyControl label="Blend" fields="media_blend_mode" disabled={!selectedElement} onReset={() => patchSelectedElementProps({ media_blend_mode: "normal" })}>
                <OptionSelect label="Layer blend" value={String(selectedElement?.props?.media_blend_mode ?? "normal")} onValueChange={(next) => patchSelectedElementProps({ media_blend_mode: next })}
                  options={[{ value: "normal", label: "Normal" }, { value: "difference", label: "Difference · invert" }, { value: "exclusion", label: "Exclusion · soft invert" }]} />
              </InspectorPropertyControl>
              <InspectorPropertyControl label="Opacity" fields="media_opacity" keyed={opacityKeyedAtPlayhead} disabled={!selectedElement} onToggle={addOpacityKeyframeAtPlayhead} onReset={() => commitMediaEffect("opacity", "100")}>
                  <SliderScrubControl value={editMediaOpacity} min={0} max={100} step={1} fallback={100} label="opacity" unit="%" compact disabled={!selectedElement} onChange={(value) => { setEditMediaOpacity(value); previewMediaEffect("opacity", value); }} onCommit={(value) => commitMediaEffect("opacity", value)} />
                </InspectorPropertyControl>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "0.68rem", color: "transparent", userSelect: "none" }}>Keyframes</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!selectedElement || !hasVisualKeyframes}
                    onClick={() => {
                      clearVisualTransformPreview();
                      clearVisualKeyframes();
                    }}
                    className={inspectorQuietButtonClassName}
                    style={{ fontSize: "0.82rem", height: 32, paddingInline: "0.65rem" }}
                  >
                    Clear all keyframes
                  </Button>
                </div>
              </div>
            </div>
            {!isAlphaCutout && selectedElement ? (
              <>
                <div style={dividerStyle} />
                <div style={{ ...columnStyle, width: resolveSurfacePlaneProps(selectedElement.props).mode === "wall" ? 804 : 260, paddingInline: 12 }}>
                  <span style={columnHeaderStyle}>Attach to wall</span>
                  <MediaSurfaceControls
                    compact
                    props={selectedElement.props}
                    onPatch={patchSelectedElementProps}
                  />
                </div>
              </>
            ) : null}
            <div style={dividerStyle} />
            <div style={{ ...columnStyle, paddingInline: 12 }}>
              <span style={columnHeaderStyle}>Color</span>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <Button variant="ghost" size="sm" disabled={!selectedElement} aria-pressed={lookPickMode === "match"} onClick={() => startLookPick("match")} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9 }}>Match a clip</Button>
                <Button variant="ghost" size="sm" disabled={!selectedElement} aria-pressed={lookPickMode === "same"} onClick={() => startLookPick("same")} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9 }}>Copy a clip&apos;s look</Button>
                <Button variant="ghost" size="sm" disabled={!selectedElement} onClick={resetColorGradeControls} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9 }}>Reset color</Button>
                {hasColorGradeKeyframes ? <Button variant="ghost" size="sm" onClick={clearColorGradeKeyframes} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9 }}>Clear color animation</Button> : null}
              </div>
              {selectedElement ? <div style={{ width: 320, maxWidth: "100%" }}><ColorWaveform element={selectedElement} scopeMode={colorScopeMode} onScopeChange={setColorScopeMode} /></div> : null}
              <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
                <div style={{ width: 680, maxWidth: "100%" }}>
                <ColorGradeAdvancedControls basic={<>
                  <ColorGradeControls
                    scopeMode={colorScopeMode}
                    editColorGrade={editColorGrade}
                    setEditColorGrade={setEditColorGrade}
                    previewColorGrade={previewColorGrade}
                    commitColorGrade={commitColorGrade}
                    toggleColorGradeKeyframeAtPlayhead={toggleColorGradeKeyframeAtPlayhead}
                    colorGradeKeyedAtPlayhead={colorGradeKeyedAtPlayhead}
                    disabled={!selectedElement}
                    compact
                  />
                  {selectedElement ? <ColorGradeLutControls projectId={selectedElement.project_id} lut={colorGradeLut} disabled={!selectedElement} apply={applyColorGradeLut} previewIntensity={previewColorGradeLutIntensity} commitIntensity={commitColorGradeLutIntensity} toggleKeyframe={toggleColorGradeLutKeyframeAtPlayhead} keyed={lutIntensityKeyedAtPlayhead} /> : null}
                </>} grade={advancedColorGrade} disabled={!selectedElement} preview={previewAdvancedColorGrade} commit={commitAdvancedColorGrade} toggleKeyframe={toggleAdvancedColorGradeKeyframeAtPlayhead} keyed={advancedColorGradeKeyedAtPlayhead} />
                </div>
              </div>
              <RecolorControl element={selectedElement} onPatch={patchSelectedElementProps} />
            </div>
            <div style={dividerStyle} />
            <div style={{ ...columnStyle, paddingInline: 12 }}>
              <span style={columnHeaderStyle}>Blur & reveal</span>
              {selectedElement ? <TransitionEffectControls onPreview={previewSelectedEffectProps} element={selectedElement} time={selectedLocalPlayheadSec} onPatch={patchSelectedElementProps} /> : null}
            </div>
            <div data-effect-control="mask_inset" style={{ ...columnStyle, paddingInline: 12 }}>
              <span style={{ ...columnHeaderStyle, display: "flex", alignItems: "center", gap: 8 }}>
                {isAlphaCutout ? "Occlusion" : "Edge crop"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 3 }}>
                  <Button variant="ghost" size="sm" onClick={() => setMaskMode("edges")} aria-pressed={maskMode === "edges"} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9, background: maskMode === "edges" ? "var(--chrome-raised)" : undefined }}>Independent edges</Button>
                  <Button variant="ghost" size="sm" onClick={() => setMaskMode("mirror")} aria-pressed={maskMode === "mirror"} className={inspectorQuietButtonClassName} style={{ height: 32, paddingInline: 9, background: maskMode === "mirror" ? "var(--chrome-raised)" : undefined }}>Horizontal band</Button>
                </div>
                <InspectorGroupActions
                  compact
                  label={isAlphaCutout ? "Occlusion edges" : "Crop edges"}
                  fields="mask_inset"
                  keyed={maskKeyedAtPlayhead}
                  disabled={!selectedElement}
                  onToggle={addMaskKeyframeAtPlayhead}
                  onReset={resetMaskInset}
                />
                {maskMode === "edges" ? ([
                  ["Top", "top", editMaskTop, setEditMaskTop],
                  ["Right", "right", editMaskRight, setEditMaskRight],
                  ["Bottom", "bottom", editMaskBottom, setEditMaskBottom],
                  ["Left", "left", editMaskLeft, setEditMaskLeft],
                ] as const).map(([label, field, value, setter]) => (
                  <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="text-xs font-bold text-[color:var(--ink-secondary,var(--ink-muted))]">{label}</span>
                    <SliderScrubControl value={value} min={0} max={95} step={1} fallback={0} label={`crop ${field}`} unit="%" compact disabled={!selectedElement} onChange={(next) => { setter(next); previewMaskInset({ [field]: next }); }} onCommit={(next) => commitMaskInset(field, next)} />
                  </div>
                )) : ([
                  ["Center", "center", editMirrorCenter, setEditMirrorCenter, 50],
                  ["Height", "height", editMirrorHeight, setEditMirrorHeight, 100],
                ] as const).map(([label, field, value, setter, fallback]) => (
                  <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="text-xs font-bold text-[color:var(--ink-secondary,var(--ink-muted))]">{label}</span>
                    <SliderScrubControl value={value} min={0} max={100} step={1} fallback={fallback} label={`horizontal band ${field}`} unit="%" compact disabled={!selectedElement} onChange={(next) => { setter(next); previewMirrorBand(field, next); }} onCommit={(next) => commitMirrorBand(field, next)} />
                  </div>
                ))}
                <div data-effect-control="mask_feather" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="text-xs font-bold text-[color:var(--ink-secondary,var(--ink-muted))]">Feather</span>
                  <SliderScrubControl value={editMaskFeather} min={0} max={50} step={1} fallback={0} label="edge feather" unit="%" compact disabled={!selectedElement} onChange={(next) => { setEditMaskFeather(next); previewMediaEffect("maskFeather", next); }} onCommit={(next) => commitMediaEffect("maskFeather", next)} />
                </div>
                <div data-effect-control="mask_corner_radius" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="text-xs font-bold text-[color:var(--ink-secondary,var(--ink-muted))]">Crop roundness</span>
                  <SliderScrubControl value={editMaskCornerRadius} min={0} max={100} step={1} fallback={0} label="crop roundness" unit="%" compact disabled={!selectedElement} onChange={(next) => { setEditMaskCornerRadius(next); previewMediaEffect("maskCornerRadius", next); }} onCommit={(next) => commitMediaEffect("maskCornerRadius", next)} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {!isVertical && visualFramingOpen && isVisualAsset && !isAlphaCutout && selectedElement ? (
        <aside
          aria-label="Visual framing workspace"
          className="fixed bottom-4 right-4 top-[4.5rem] z-(--layer-panel) w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[var(--edge-outline)] bg-[var(--chrome-panel)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex justify-end">
            <Button variant="ghost" size="icon-sm" aria-label="Close visual crop workspace" title="Close visual crop workspace" onClick={() => setVisualFramingOpen(false)}>
              <XIcon />
            </Button>
          </div>
          <VisualFramingEditor
            element={selectedElement}
            composition={compositionDimensions}
            localPlayheadSeconds={selectedLocalPlayheadSec}
            editMediaScale={editMediaScale}
            editMediaOffsetX={editMediaOffsetX}
            editMediaOffsetY={editMediaOffsetY}
            setEditMediaScale={setEditMediaScale}
            setEditMediaOffsetX={setEditMediaOffsetX}
            setEditMediaOffsetY={setEditMediaOffsetY}
            previewVisualTransform={previewVisualTransform}
            clearVisualTransformPreview={clearVisualTransformPreview}
            commitVisualTransformValues={commitVisualTransformValues}
            resetVisualTransform={resetVisualTransform}
          />
        </aside>
      ) : null}
    </div>
  );
}
