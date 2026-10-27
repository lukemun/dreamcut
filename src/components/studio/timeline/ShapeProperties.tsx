"use client";

import { useEffect, useState } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { SliderScrubControl } from "./InspectorNumericControls";
import { InspectorVisualChoice } from "./InspectorVisualChoice";
import { InspectorColorControl } from "./InspectorColorControl";
import { Button } from "@/components/ui/button";
import { CameraFollowControl } from "./CameraFollowControl";
import { CAMERA_ZOOM, cameraZoomAt, isCamera } from "@/lib/timeline/camera";
import { DEFAULT_SHAPE_PROPS, DEFAULT_SHAPE_STROKE, SHAPE_KINDS, SHAPE_KIND_LABELS, contourPathD, resolveShapeProps, shapeContours, shapePresetToPath, type ShapeKind } from "@/lib/timeline/shapes";
import { readMediaTransformProps } from "@/lib/timeline/media-transform";
import { DEFAULT_ELEMENT_ANIMATION, resolveAnimationProps } from "@/lib/timeline/animation-presets";
import type { TimelineElement } from "./types";

type Patch = (patch: Record<string, unknown>) => void;

/**
 * One numeric shape setting. Display units convert to and from the stored value. A setting
 * that is keyframed shows its animation instead of a slider; Reset removes the animation and
 * restores the default.
 */
function ShapeNumberRow({ label, field, value, fallback, min, max, step, unit, scale = 1, sliderRange, animated, onCommit, onReset }: {
  label: string; field: string; value: number; fallback: number; min: number; max: number; step: number; unit: string;
  scale?: number; sliderRange?: { min: number; max: number }; animated: boolean; onCommit: (value: number) => void; onReset: () => void;
}) {
  const shown = Number((value * scale).toFixed(4));
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);
  return (
    <InspectorPropertyControl density="compact" label={label} fields={field} keyed={animated} disabled={false} onReset={onReset}>
      {animated ? (
        <span className="text-[length:var(--ui-text-body)] text-[var(--ink-secondary)]">Animated</span>
      ) : (
        <SliderScrubControl density="compact" value={draft} min={min} max={max} step={step} fallback={fallback * scale} label={label.toLowerCase()} unit={unit}
          sliderRange={sliderRange} disabled={false} onChange={setDraft}
          onCommit={(next) => {
            const parsed = Number.parseFloat(next ?? draft);
            if (Number.isFinite(parsed)) onCommit(Math.min(max, Math.max(min, parsed)) / scale);
          }} />
      )}
    </InspectorPropertyControl>
  );
}

/** Each choice shows the shape its own generator draws, so the picker never drifts from the canvas. */
function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  const props = resolveShapeProps({ shape_kind: kind, shape_corner_radius: 0.18, shape_contours: kind === "path" ? GLYPH_PATH : undefined });
  const contours = shapeContours(props, kind === "line" || kind === "arrow" ? 30 : 20, 20);
  return (
    <svg viewBox="-17 -12 34 24" className="mx-auto block h-6 w-9" aria-hidden="true">
      {contours.map((contour, index) => <path key={index} d={contourPathD(contour)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />)}
    </svg>
  );
}

const GLYPH_PATH = [{ closed: true, points: [
  { x: -0.45, y: 0.35, out: [0.05, -0.6] as [number, number] }, { x: 0.05, y: -0.4, in: [-0.3, 0] as [number, number], out: [0.3, 0] as [number, number] },
  { x: 0.45, y: 0.1, in: [0, -0.3] as [number, number] }, { x: 0, y: 0.4 },
] }];

// A camera is not an outline to switch to; it is made as its own clip.
const KIND_OPTIONS = SHAPE_KINDS.filter((kind) => kind !== "camera").map((value) => ({ value, label: SHAPE_KIND_LABELS[value], preview: <ShapeGlyph kind={value} /> }));

export function ShapeProperties({ element, elements, onPatch }: { element: TimelineElement; elements: readonly TimelineElement[]; onPatch: Patch }) {
  const props = (element.props ?? {}) as Record<string, unknown>;
  const shape = resolveShapeProps(props);
  const transform = readMediaTransformProps(props);
  const keyframes = (props.keyframes ?? {}) as Record<string, unknown[]>;
  const animated = (field: string) => Array.isArray(keyframes[field]) && keyframes[field].length > 0;
  // Reset clears a setting's animation as well as its value, so the slider comes back.
  const reset = (field: string, value: unknown) => {
    const { [field]: _removed, ...rest } = keyframes;
    onPatch({ [field]: value, keyframes: rest });
  };
  const editPoints = () => ({ shape_kind: "path", shape_contours: shapePresetToPath(shape) });
  const animation = resolveAnimationProps(props);
  // The slider covers everyday values; typing reaches the full range.
  const row = (label: string, field: string, value: number, fallback: number, min: number, max: number, step: number, unit: string, scale = 1, sliderRange?: { min: number; max: number }) => (
    <ShapeNumberRow key={field} label={label} field={field} value={value} fallback={fallback} min={min} max={max} step={step} unit={unit} scale={scale} sliderRange={sliderRange}
      animated={animated(field)} onCommit={(next) => onPatch({ [field]: next })} onReset={() => reset(field, fallback)} />
  );
  if (isCamera(element)) return (
    <InspectorSection sectionId="shape-camera" title="Camera">
      {row("Horizontal", "media_offset_x", transform.offsetX, 0, -200, 200, 0.5, "%", 100, { min: -100, max: 100 })}
      {row("Vertical", "media_offset_y", transform.offsetY, 0, -200, 200, 0.5, "%", 100, { min: -100, max: 100 })}
      {row("Zoom", "media_scale", cameraZoomAt(props, 0), 1, CAMERA_ZOOM.min * 100, CAMERA_ZOOM.max * 100, 1, "%", 100, { min: 10, max: 300 })}
      {row("Rotation", "media_rotation", shape.media_rotation, 0, -720, 720, 1, "°", 1, { min: -180, max: 180 })}
    </InspectorSection>
  );
  return (
    <>
      <InspectorSection sectionId="shape" title="Shape">
        <InspectorVisualChoice label="Shape" value={shape.shape_kind} options={KIND_OPTIONS} onChange={(shape_kind) => onPatch(
          // Freeform keeps points already edited; otherwise it starts from the current outline.
          shape_kind === "path" && shape.shape_contours.length === 0 ? editPoints() : { shape_kind })} />
        {shape.shape_kind !== "path" ? (
          <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => onPatch(editPoints())}>Edit points</Button>
        ) : null}
        {row("Width", "shape_width", shape.shape_width, DEFAULT_SHAPE_PROPS.shape_width, 0.5, 400, 0.5, "%", 100, { min: 1, max: 120 })}
        {shape.shape_kind !== "line" ? row("Height", "shape_height", shape.shape_height, DEFAULT_SHAPE_PROPS.shape_height, 0.5, 400, 0.5, "%", 100, { min: 1, max: 120 }) : null}
        {shape.shape_kind === "rect" ? row("Corners", "shape_corner_radius", shape.shape_corner_radius, 0, 0, 50, 1, "%", 100) : null}
        {shape.shape_kind === "polygon" || shape.shape_kind === "star"
          ? row(shape.shape_kind === "star" ? "Points" : "Sides", "shape_sides", shape.shape_sides, DEFAULT_SHAPE_PROPS.shape_sides, 3, 24, 1, "") : null}
        {shape.shape_kind === "star" ? row("Depth", "shape_star_depth", shape.shape_star_depth, DEFAULT_SHAPE_PROPS.shape_star_depth, 5, 95, 1, "%", 100) : null}
        {shape.shape_kind === "arc" ? (
          <>
            {row("Start", "shape_arc_start", shape.shape_arc_start, DEFAULT_SHAPE_PROPS.shape_arc_start, -360, 360, 1, "°")}
            {row("End", "shape_arc_end", shape.shape_arc_end, DEFAULT_SHAPE_PROPS.shape_arc_end, -360, 720, 1, "°")}
          </>
        ) : null}
        {shape.shape_kind === "arrow" ? (
          <>
            {row("Head", "shape_arrow_head", shape.shape_arrow_head, DEFAULT_SHAPE_PROPS.shape_arrow_head, 5, 90, 1, "%", 100)}
            {row("Shaft", "shape_arrow_shaft", shape.shape_arrow_shaft, DEFAULT_SHAPE_PROPS.shape_arrow_shaft, 2, 100, 1, "%", 100)}
          </>
        ) : null}
        <InspectorItemHeader title="Fill" enabled={shape.shape_fill != null}
          onEnabledChange={(on) => onPatch({ shape_fill: on ? DEFAULT_SHAPE_PROPS.shape_fill : null })} />
        {shape.shape_fill != null ? (
          <InspectorColorControl label="Fill colour" value={shape.shape_fill} isCustom={shape.shape_fill !== DEFAULT_SHAPE_PROPS.shape_fill}
            onChange={(shape_fill) => onPatch({ shape_fill })} onReset={() => onPatch({ shape_fill: DEFAULT_SHAPE_PROPS.shape_fill })} />
        ) : null}
        <InspectorItemHeader title="Outline" enabled={shape.shape_stroke != null}
          onEnabledChange={(on) => onPatch({ shape_stroke: on ? DEFAULT_SHAPE_STROKE : null })} />
        {shape.shape_stroke != null ? (
          <>
            <InspectorColorControl label="Outline colour" value={shape.shape_stroke} isCustom={shape.shape_stroke !== DEFAULT_SHAPE_STROKE}
              onChange={(shape_stroke) => onPatch({ shape_stroke })} onReset={() => onPatch({ shape_stroke: DEFAULT_SHAPE_STROKE })} />
            {row("Outline", "shape_stroke_width", shape.shape_stroke_width, DEFAULT_SHAPE_PROPS.shape_stroke_width, 0, 200, 1, "px", 1, { min: 0, max: 40 })}
            {row("Drawn", "shape_draw", shape.shape_draw, 1, 0, 100, 1, "%", 100)}
            {row("Taper", "shape_taper", shape.shape_taper, 0, 0, 100, 1, "%", 100)}
            {row("Wobble", "shape_wobble", shape.shape_wobble, 0, 0, 100, 1, "%", 100)}
            {shape.shape_wobble > 0 ? row("Variation", "shape_seed", shape.shape_seed, 0, 0, 9999, 1, "", 1, { min: 0, max: 99 }) : null}
          </>
        ) : null}
      </InspectorSection>
      <InspectorSection sectionId="shape-placement" title="Placement">
        {row("Horizontal", "media_offset_x", transform.offsetX, 0, -200, 200, 0.5, "%", 100, { min: -100, max: 100 })}
        {row("Vertical", "media_offset_y", transform.offsetY, 0, -200, 200, 0.5, "%", 100, { min: -100, max: 100 })}
        {row("Size", "media_scale", transform.scale, 1, 10, 300, 1, "%", 100)}
        {row("Rotation", "media_rotation", shape.media_rotation, 0, -720, 720, 1, "°", 1, { min: -180, max: 180 })}
        {row("Opacity", "media_opacity", shape.media_opacity, 1, 0, 100, 1, "%", 100)}
      </InspectorSection>
      <InspectorSection sectionId="shape-fades" title="Fades">
        <InspectorItemHeader title="Fade in" enabled={animation.animationIn === "fade"}
          onEnabledChange={(on) => onPatch({ animationIn: on ? "fade" : "none" })} />
        {animation.animationIn === "fade"
          ? row("Fade in", "animationInDuration", animation.animationInDuration, DEFAULT_ELEMENT_ANIMATION.animationInDuration, 0, 2, 0.05, "s") : null}
        <InspectorItemHeader title="Fade out" enabled={animation.animationOut === "fade"}
          onEnabledChange={(on) => onPatch({ animationOut: on ? "fade" : "none" })} />
        {animation.animationOut === "fade"
          ? row("Fade out", "animationOutDuration", animation.animationOutDuration, DEFAULT_ELEMENT_ANIMATION.animationOutDuration, 0, 2, 0.05, "s") : null}
      </InspectorSection>
      <CameraFollowControl element={element} elements={elements} onPatch={onPatch} />
    </>
  );
}
