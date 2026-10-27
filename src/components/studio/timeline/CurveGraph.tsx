"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monotoneSpline, smoothCurve, type CurvePoint } from "@/lib/color/splines";
import { hueRampGradient, SATURATION_RAMP_GRADIENT, TONE_RAMP_GRADIENT } from "@/lib/color/hue-ramp";
import { SliderScrubControl } from "./InspectorNumericControls";

/**
 * A grading curve: drag points, click to add, double-click or Delete to remove, Escape to cancel.
 * Stateless and host-agnostic: Properties and proposal cards pass the value in and receive previews and
 * one commit per gesture. The drawn line is evaluated with the renderer's own spline, so it shows what renders.
 */
export type CurveGraphKind = {
  /** Tone curves start on the diagonal and keep 0 and 1 as end points; other curves start flat. */
  identity: "diagonal" | number;
  periodic?: boolean;
  yRange: readonly [number, number];
  background: "tone" | "hue" | "saturation";
  /** Plain words for an input position and an output value, e.g. "Shadows" / "+12%". */
  describeX: (x: number) => string;
  describeY: (y: number) => string;
  yUnit?: string;
  /** Display ↔ stored conversion for the exact output field. */
  toDisplayY?: (y: number) => number;
  fromDisplayY?: (value: number) => number;
};

export type CurveGraphProps = {
  label: string;
  kind: CurveGraphKind;
  points: readonly CurvePoint[];
  disabled?: boolean;
  size?: "inspector" | "card";
  maxPoints?: number;
  onPreview: (points: CurvePoint[]) => void;
  onCommit: (points: CurvePoint[]) => void;
  onCancel: () => void;
};

const WIDTH = 256;
const STEP = 1 / 256;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The points a first edit starts from: the identity made explicit. */
function seed(kind: CurveGraphKind, points: readonly CurvePoint[]): CurvePoint[] {
  if (points.length) return [...points];
  return kind.identity === "diagonal" ? [[0, 0], [1, 1]] : [];
}

export function evaluateCurve(kind: CurveGraphKind, points: readonly CurvePoint[]) {
  return kind.identity === "diagonal" ? monotoneSpline(points) : smoothCurve(points, kind.identity, kind.periodic);
}

export function CurveGraph({ label, kind, points, disabled = false, size = "inspector", maxPoints = 16, onPreview, onCommit, onCancel }: CurveGraphProps) {
  const height = size === "card" ? 150 : 200;
  // Close to square, as a curve reads best; a wide panel centres it instead of stretching it.
  const maxWidth = Math.round(height * 1.4);
  const [selected, setSelected] = useState<number | null>(null);
  const gesture = useRef<{ original: CurvePoint[]; latest: CurvePoint[]; index: number } | null>(null);
  // The graph takes keyboard focus whenever a point is picked, so Delete/Backspace remove it
  // whether it was clicked, dragged, just added or reached with Tab.
  const frame = useRef<HTMLDivElement>(null);
  const [yMin, yMax] = kind.yRange;
  const toY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;
  const fromY = (py: number) => yMin + (1 - py / height) * (yMax - yMin);
  const isTone = kind.identity === "diagonal";

  const path = useMemo(() => {
    const curve = evaluateCurve(kind, points);
    return Array.from({ length: 65 }, (_, i) => {
      const x = i / 64, y = clamp(curve(x), yMin, yMax);
      return `${i === 0 ? "M" : "L"}${(x * WIDTH).toFixed(1)} ${toY(y).toFixed(1)}`;
    }).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, points, height]);
  const identityPath = isTone ? `M0 ${toY(0)} L${WIDTH} ${toY(1)}` : `M0 ${toY(kind.identity as number)} H${WIDTH}`;

  /** Keep x between neighbours (tone curve ends stay at 0 and 1) and y within range. */
  const place = (list: CurvePoint[], index: number, x: number, y: number): CurvePoint[] => {
    const next = [...list];
    const lockedEnd = isTone && (index === 0 || index === list.length - 1);
    const lo = kind.periodic ? 0 : (list[index - 1]?.[0] ?? 0) + STEP;
    const hi = kind.periodic ? 1 - STEP : (list[index + 1]?.[0] ?? 1) - STEP;
    const nx = lockedEnd ? list[index]![0] : clamp(x, Math.min(lo, hi), Math.max(lo, hi));
    next[index] = [Number(nx.toFixed(4)), Number(clamp(y, yMin, yMax).toFixed(4))];
    return next;
  };

  const pointerPosition = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    return { x, y: fromY(((event.clientY - bounds.top) / bounds.height) * height) };
  };

  const begin = (event: PointerEvent<SVGSVGElement>, index: number, list: CurvePoint[]) => {
    event.preventDefault();
    frame.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { original: seed(kind, points), latest: list, index };
    setSelected(index);
    onPreview(list);
  };

  const onBackgroundDown = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled || (event.target as Element).getAttribute("data-curve-point") != null) return;
    const base = seed(kind, points);
    if (base.length >= maxPoints) return;
    const { x } = pointerPosition(event);
    const y = evaluateCurve(kind, base)(x);
    let list = [...base, [x, y] as CurvePoint].sort((a, b) => a[0] - b[0]);
    // A first point on a flat curve gets neighbours at rest, so it bends one part of the range, not all of it.
    if (!isTone && base.length === 0) {
      const rest = kind.identity as number;
      list = [[x - 0.12, rest], [x, rest], [x + 0.12, rest]].map(([px, py]) => [kind.periodic ? ((px! % 1) + 1) % 1 : clamp(px!, 0, 1), py!] as CurvePoint).sort((a, b) => a[0] - b[0]);
    }
    const index = list.findIndex((p) => p[0] === x || Math.abs(p[0] - x) < 1e-9);
    begin(event, index, list);
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    const { x, y } = pointerPosition(event);
    active.latest = place(active.latest, active.index, x, y);
    onPreview(active.latest);
  };

  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    move(event);
    gesture.current = null;
    onCommit(active.latest);
  };

  const cancel = () => {
    if (!gesture.current) return;
    gesture.current = null;
    onCancel();
  };

  const remove = (index: number) => {
    const list = seed(kind, points);
    if (isTone && (index === 0 || index === list.length - 1)) return;
    const next = list.filter((_, i) => i !== index);
    setSelected(null);
    onCommit(isTone && next.length === 2 && next[0]![1] === 0 && next[1]![1] === 1 ? [] : next);
  };

  const onPointKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (disabled) return;
    const list = seed(kind, points);
    const point = list[index];
    if (!point) return;
    const step = (event.shiftKey ? 10 : 1) * STEP;
    const yStep = step * (yMax - yMin);
    const moves: Record<string, [number, number]> = { ArrowUp: [0, yStep], ArrowDown: [0, -yStep], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key]!;
      onCommit(place(list, index, point[0] + dx, point[1] + dy));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(index);
    }
  };

  const display = seed(kind, points);
  const active = selected != null && display[selected] ? selected : null;
  const removable = active != null && !(isTone && (active === 0 || active === display.length - 1));
  const onFrameKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) return;
    if ((event.key === "Delete" || event.key === "Backspace") && removable) { event.preventDefault(); remove(active!); }
  };
  const toDisplayY = kind.toDisplayY ?? ((y: number) => y);
  const fromDisplayY = kind.fromDisplayY ?? ((v: number) => v);
  const displayRange = [toDisplayY(yMin), toDisplayY(yMax)].sort((a, b) => a - b) as [number, number];

  return (
    <div className="mx-auto grid w-full min-w-0 gap-2" style={{ maxWidth }} data-curve-graph={label}>
      <div ref={frame} tabIndex={-1} onKeyDown={onFrameKey}
        className="relative rounded-[var(--edge-control-inner)] border border-[var(--edge-outline)] bg-[var(--chrome-raised)] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]">
        <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height, touchAction: "none" }}
          role="group" aria-label={label}
          onPointerDown={onBackgroundDown} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
          onKeyDown={(event) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
          {[0.25, 0.5, 0.75].map((f) => <path key={`h${f}`} d={`M0 ${f * height} H${WIDTH}`} stroke="var(--chrome-line)" />)}
          {[0.25, 0.5, 0.75].map((f) => <path key={`v${f}`} d={`M${f * WIDTH} 0 V${height}`} stroke="var(--chrome-line)" />)}
          <path d={identityPath} stroke="var(--chrome-line-strong)" strokeDasharray="4 4" fill="none" />
          <path d={path} stroke="var(--ink)" strokeWidth={2.5} fill="none" vectorEffect="non-scaling-stroke" />
          {display.map(([x, y], index) => (
            <circle key={index} data-curve-point={index} cx={x * WIDTH} cy={toY(y)} r={index === active ? 6 : 4.5}
              fill={index === active ? "var(--chrome-focus-ring)" : "var(--ink)"} stroke="var(--chrome-deep)" strokeWidth={1.5}
              role="slider" tabIndex={disabled ? undefined : 0} aria-orientation="vertical"
              aria-label={`${label} point at ${kind.describeX(x)}`} aria-valuemin={yMin} aria-valuemax={yMax} aria-valuenow={y} aria-valuetext={kind.describeY(y)}
              onFocus={() => setSelected(index)}
              onDoubleClick={() => remove(index)}
              onKeyDown={(event) => onPointKey(event, index)}
              onPointerDown={(event) => {
                if (disabled) return;
                const svg = event.currentTarget.ownerSVGElement;
                if (!svg) return;
                event.stopPropagation();
                event.preventDefault();
                svg.setPointerCapture(event.pointerId);
                frame.current?.focus({ preventScroll: true });
                gesture.current = { original: seed(kind, points), latest: display, index };
                setSelected(index);
              }} />
          ))}
        </svg>
        <div aria-hidden="true" className="mt-2 rounded-full" style={{ height: 6, background: kind.background === "hue" ? hueRampGradient() : kind.background === "saturation" ? SATURATION_RAMP_GRADIENT : TONE_RAMP_GRADIENT }} />
      </div>
      {active != null ? (
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 text-[length:var(--ui-text-body)] text-[var(--ink-secondary)]">
          <span>In</span>
          {/* In and Out share one row anatomy (slider, number, unit), so their parts line up. */}
          <SliderScrubControl label={`${label} point position`} value={(display[active]![0] * 100).toFixed(1)} min={0} max={100} step={0.1}
            fallback={display[active]![0] * 100} unit="%" disabled={disabled || (isTone && (active === 0 || active === display.length - 1))}
            onChange={(next) => { const v = Number.parseFloat(next); if (Number.isFinite(v)) onPreview(place(display, active, v / 100, display[active]![1])); }}
            onCommit={(next) => { const v = Number.parseFloat(next ?? ""); if (Number.isFinite(v)) onCommit(place(display, active, v / 100, display[active]![1])); }}
            onCancel={onCancel} />
          <span>Out</span>
          <SliderScrubControl label={kind.describeX(display[active]![0])} value={String(Number(toDisplayY(display[active]![1]).toFixed(2)))}
            min={displayRange[0]} max={displayRange[1]} step={0.1} fallback={toDisplayY(display[active]![1])} unit={kind.yUnit ?? ""} disabled={disabled}
            onChange={(next) => { const v = Number.parseFloat(next); if (Number.isFinite(v)) onPreview(place(display, active, display[active]![0], fromDisplayY(v))); }}
            onCommit={(next) => { const v = Number.parseFloat(next ?? ""); if (Number.isFinite(v)) onCommit(place(display, active, display[active]![0], fromDisplayY(v))); }}
            onCancel={onCancel} />
          {removable ? (
            <Button type="button" variant="ghost" size="sm" className="col-span-2 w-fit justify-self-start px-0" disabled={disabled} onClick={() => remove(active!)}>
              <Trash2Icon aria-hidden="true" />Remove point
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
