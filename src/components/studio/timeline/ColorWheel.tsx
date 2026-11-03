"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { wheelRingGradient } from "@/lib/color/hue-ramp";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { ScrubNumberInput, SliderScrubControl } from "./InspectorNumericControls";

/**
 * A colour wheel for one tonal range: the puck tints, the slider below sets brightness. Value is
 * [red, green, blue, master]. The puck shows the colour part of red/green/blue (their offset from
 * equal); any equal part stays as it is, so a typed value always survives a puck drag exactly.
 * Stateless and host-agnostic, like CurveGraph.
 */
export type WheelValue = readonly [number, number, number, number];

export type ColorWheelProps = {
  label: string;
  value: WheelValue;
  /** Red/green/blue offset the rim reaches (the puck's sensitivity). */
  rgbRange: number;
  /** Bounds for exactly typed red/green/blue values; defaults to the rim range. */
  valueRange?: number;
  masterRange: number;
  disabled?: boolean;
  size?: "inspector" | "card";
  onPreview: (value: WheelValue) => void;
  onCommit: (value: WheelValue) => void;
  onCancel: () => void;
};

// Vectorscope convention: red sits up and to the left, 103° anticlockwise from the right.
export const WHEEL_RED_DEGREES = 103;
const RED = (WHEEL_RED_DEGREES * Math.PI) / 180;
const SQRT3 = Math.sqrt(3);

/** Puck (x right, y up, rim = 1) to a zero-sum red/green/blue offset. */
export function puckToRgb(px: number, py: number, range: number): [number, number, number] {
  // Rotate so the screen direction of red becomes the opponent axis (c1), then expand.
  const angle = Math.atan2(py, px) - RED, radius = Math.hypot(px, py) * 1.5 * range;
  const c1 = radius * Math.cos(angle), c2 = radius * Math.sin(angle);
  return [(2 / 3) * c1, -c1 / 3 + c2 / SQRT3, -c1 / 3 - c2 / SQRT3];
}

export function rgbToPuck(rgb: readonly [number, number, number], range: number): { x: number; y: number; mean: number } {
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const c1 = (2 * rgb[0] - rgb[1] - rgb[2]) / 2, c2 = (SQRT3 / 2) * (rgb[1] - rgb[2]);
  const angle = Math.atan2(c2, c1) + RED, radius = Math.hypot(c1, c2) / (1.5 * range);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), mean };
}

const round = (v: number) => Number(v.toFixed(4));

/** Where a colour sits on the wheel, as a unit direction. */
function directionOf(rgb: [number, number, number]) {
  const { x, y } = rgbToPuck(rgb, 1);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
/** Everyday names for the four directions a creator thinks in: warm/cool and green/magenta. */
const DIRECTIONS = [
  { name: "Warm", ...directionOf([1, 0.45, 0]) },
  { name: "Cool", ...directionOf([0, 0.45, 1]) },
  { name: "Green", ...directionOf([0, 1, 0]) },
  { name: "Magenta", ...directionOf([1, 0, 1]) },
] as const;

/** "Neutral", or the nearest named direction and how far toward the rim, e.g. "Warm 40%". */
export function describeWheel(x: number, y: number) {
  const amount = Math.min(1, Math.hypot(x, y));
  if (amount < 0.02) return "Neutral";
  const nearest = DIRECTIONS.reduce((best, d) => (d.x * x + d.y * y > best.x * x + best.y * y ? d : best));
  return `${nearest.name} ${Math.round(amount * 100)}%`;
}

export function ColorWheel({ label, value, rgbRange, valueRange = rgbRange, masterRange, disabled = false, size = "inspector", onPreview, onCommit, onCancel }: ColorWheelProps) {
  const diameter = size === "card" ? 104 : 124;
  // Room around the ring for the direction words.
  // Words sit beside the ring, left and right, so they add width but no height.
  const frameWidth = diameter + 128, frameHeight = diameter + 4;
  const gesture = useRef<{ latest: WheelValue } | null>(null);
  const [showPrecise, setShowPrecise] = useState(false);
  const rgb: [number, number, number] = [value[0], value[1], value[2]];
  const puck = rgbToPuck(rgb, rgbRange);
  const length = Math.hypot(puck.x, puck.y), radius = Math.min(1, length), onRim = length > 1 ? 1 / length : 1;
  const angle = Math.atan2(puck.y, puck.x);

  const fromPointer = (event: PointerEvent<HTMLDivElement>, fine: boolean): WheelValue => {
    const bounds = event.currentTarget.getBoundingClientRect();
    let px = ((event.clientX - bounds.left) / bounds.width) * 2 - 1, py = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    if (fine) { px = puck.x + (px - puck.x) * 0.1; py = puck.y + (py - puck.y) * 0.1; }
    const length = Math.hypot(px, py);
    if (length > 1) { px /= length; py /= length; }
    const shift = puckToRgb(px, py, rgbRange);
    return [round(shift[0] + puck.mean), round(shift[1] + puck.mean), round(shift[2] + puck.mean), value[3]];
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key]!;
      const shift = puckToRgb(puck.x + dx, puck.y + dy, rgbRange);
      onCommit([round(shift[0] + puck.mean), round(shift[1] + puck.mean), round(shift[2] + puck.mean), value[3]]);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      onCommit([value[0], value[1], value[2], round(Math.min(masterRange, Math.max(-masterRange, value[3] + (event.key === "PageUp" ? 1 : -1) * masterRange * 0.02)))]);
    } else if (event.key === "Home") {
      event.preventDefault();
      onCommit([round(puck.mean), round(puck.mean), round(puck.mean), value[3]]);
    }
  };

  const channel = (index: 0 | 1 | 2, name: string) => (
    <label key={name} className="grid min-w-0 gap-1 text-[length:var(--ui-text-caption)] text-[var(--ink-secondary)]">
      {name}
      <ScrubNumberInput ariaLabel={`${label} ${name}`} value={value[index].toFixed(3)} min={-valueRange} max={valueRange} step={0.001} precision={3} width={64} density="compact" disabled={disabled}
        onChange={(next) => { const v = Number.parseFloat(next); if (Number.isFinite(v)) { const out = [...value] as [number, number, number, number]; out[index] = v; onPreview(out); } }}
        onCommit={(next) => { const v = Number.parseFloat(next ?? ""); if (Number.isFinite(v)) { const out = [...value] as [number, number, number, number]; out[index] = v; onCommit(out); } }}
        onCancel={onCancel} />
    </label>
  );
  // Brightness reads as a percentage of its range on every wheel, so the four agree.
  const toPercent = (v: number) => Number(((v / masterRange) * 100).toFixed(1));
  const fromPercent = (v: number) => round((v / 100) * masterRange);
  const description = describeWheel(puck.x, puck.y);

  return (
    <div className="grid w-full min-w-0 justify-items-center gap-2" data-color-wheel={label}>
      <div className="relative max-w-full" style={{ width: frameWidth, height: frameHeight }}>
      {DIRECTIONS.map((direction) => (
        // Each word sits just outside the ring and reads away from it, so neighbours never collide.
        <span key={direction.name} aria-hidden="true" className="absolute whitespace-nowrap text-[length:var(--ui-text-caption)] leading-none text-[var(--ink-secondary)]"
          style={{
            left: frameWidth / 2 + direction.x * (diameter / 2) + (direction.x < 0 ? -8 : 8), top: frameHeight / 2 - direction.y * (diameter / 2),
            transform: `translate(${direction.x < 0 ? "-100%" : "0"}, -50%)`,
          }}>{direction.name}</span>
      ))}
      <div
        role="slider" tabIndex={disabled ? undefined : 0} aria-label={`${label} colour`}
        aria-valuetext={radius < 0.005 ? "Neutral" : `${description}, ${Math.round(((angle * 180) / Math.PI + 360) % 360)}°`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(radius * 100)}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
        style={{ width: diameter, height: diameter, background: wheelRingGradient(90 - WHEEL_RED_DEGREES), touchAction: "none", opacity: disabled ? 0.5 : 1 }}
        onKeyDown={(event) => { if (event.key === "Escape" && gesture.current) { event.preventDefault(); gesture.current = null; onCancel(); } else onKey(event); }}
        onDoubleClick={() => { if (!disabled) onCommit([round(puck.mean), round(puck.mean), round(puck.mean), value[3]]); }}
        onPointerDown={(event) => { if (disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); const next = fromPointer(event, event.shiftKey); gesture.current = { latest: next }; onPreview(next); }}
        onPointerMove={(event) => { if (!gesture.current) return; gesture.current.latest = fromPointer(event, event.shiftKey); onPreview(gesture.current.latest); }}
        onPointerUp={() => { const active = gesture.current; if (!active) return; gesture.current = null; onCommit(active.latest); }}
        onPointerCancel={() => { if (gesture.current) { gesture.current = null; onCancel(); } }}
        onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; onCancel(); } }}
      >
        <div aria-hidden="true" className="absolute rounded-full bg-[var(--chrome-deep)]" style={{ inset: diameter * 0.09, opacity: 0.82 }} />
        <div aria-hidden="true" className="absolute bg-[var(--chrome-line-strong)]" style={{ left: "50%", top: "30%", bottom: "30%", width: 1 }} />
        <div aria-hidden="true" className="absolute bg-[var(--chrome-line-strong)]" style={{ top: "50%", left: "30%", right: "30%", height: 1 }} />
        <div aria-hidden="true" className="absolute rounded-full border-2 border-[var(--ink)] bg-[var(--chrome-raised)]"
          style={{ width: 12, height: 12, left: `calc(${50 + puck.x * onRim * 41}% - 6px)`, top: `calc(${50 - puck.y * onRim * 41}% - 6px)` }} />
      </div>
      </div>
      <div className="w-full min-w-0">
        {/* The readout shares the Exact values line, so the wheel costs one row less. */}
        <InspectorDisclosure title="Exact values" open={showPrecise} onOpenChange={setShowPrecise}
          actions={<span className="text-[length:var(--ui-text-body)] text-[var(--ink)]" data-wheel-description>{description}</span>}>
          <div className="grid min-w-0 grid-cols-3 gap-2">{channel(0, "Red")}{channel(1, "Green")}{channel(2, "Blue")}</div>
        </InspectorDisclosure>
      </div>
      <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <span className="text-[length:var(--ui-text-body)] text-[var(--ink-secondary)]">Brightness</span>
        <SliderScrubControl label={`${label} brightness`} value={String(toPercent(value[3]))} min={-100} max={100} step={0.5} fallback={0} unit="%" disabled={disabled}
          onChange={(next) => { const v = Number.parseFloat(next); if (Number.isFinite(v)) onPreview([value[0], value[1], value[2], fromPercent(v)]); }}
          onCommit={(next) => { const v = Number.parseFloat(next ?? ""); if (Number.isFinite(v)) onCommit([value[0], value[1], value[2], fromPercent(v)]); }}
          onCancel={onCancel} />
      </div>
    </div>
  );
}
