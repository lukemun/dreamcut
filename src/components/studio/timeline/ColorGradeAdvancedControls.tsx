"use client";

import { useState, type ReactNode } from "react";
import {
  COLOR_GRADE_CURVE_FIELDS,
  COLOR_GRADE_SLICE_FIELDS,
  COLOR_GRADE_WHEEL_FIELDS,
  SLICE_BOUNDS,
  SLICE_IDENTITY,
  advancedColorGradeValue,
  type AdvancedColorGradeField,
  type ColorGrade,
  type ColorGradeCurveField,
  type ColorGradeWheelField,
} from "@/lib/timeline/color-grade";
import type { CurvePoint } from "@/lib/color/splines";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ColorWheel, type WheelValue } from "./ColorWheel";
import { CurveGraph } from "./CurveGraph";
import { SliderScrubControl } from "./InspectorNumericControls";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { CURVE_SPECS, SLICE_SPECS, WHEEL_SPECS, wheelRanges } from "./color-grade-control-specs";

type View = "basic" | "wheels" | "curves" | "slice";

const toFlat = (points: readonly CurvePoint[]) => points.flatMap(([x, y]) => [x, y]);
const toPoints = (flat: readonly number[]): CurvePoint[] => Array.from({ length: Math.floor(flat.length / 2) }, (_, i) => [flat[i * 2]!, flat[i * 2 + 1]!]);
const isWheel = (field: AdvancedColorGradeField): field is ColorGradeWheelField => (COLOR_GRADE_WHEEL_FIELDS as readonly string[]).includes(field);
const isCurve = (field: AdvancedColorGradeField): field is ColorGradeCurveField => (COLOR_GRADE_CURVE_FIELDS as readonly string[]).includes(field);

/** What a grade field resets to. */
export function advancedGradeIdentity(field: AdvancedColorGradeField): number[] {
  return isWheel(field) ? [0, 0, 0, 0] : isCurve(field) ? [] : [...SLICE_IDENTITY];
}

/** Display label for a wheel, curve or slice field. */
export function advancedGradeLabel(field: AdvancedColorGradeField): string {
  return isWheel(field) ? WHEEL_SPECS[field].label : isCurve(field) ? CURVE_SPECS[field].label : SLICE_SPECS[field];
}

/**
 * One wheel, curve or colour slice, value in and value out. Properties and proposal cards both
 * render this, so a creator tunes the same control before and after approval.
 */
export function GradeDial({ field, value, disabled = false, size = "inspector", onPreview, onCommit, onCancel }: {
  field: AdvancedColorGradeField;
  value: readonly number[];
  disabled?: boolean;
  size?: "inspector" | "card";
  onPreview: (value: number[]) => void;
  onCommit: (value: number[]) => void;
  onCancel: () => void;
}) {
  if (isWheel(field)) {
    return <ColorWheel label={WHEEL_SPECS[field].label} value={value as unknown as WheelValue} {...wheelRanges(field)}
      disabled={disabled} size={size} onPreview={(next) => onPreview([...next])} onCommit={(next) => onCommit([...next])} onCancel={onCancel} />;
  }
  if (isCurve(field)) {
    return <CurveGraph key={field} label={`${CURVE_SPECS[field].label} curve`} kind={CURVE_SPECS[field].kind} points={toPoints(value)} disabled={disabled} size={size}
      onPreview={(points) => onPreview(toFlat(points))} onCommit={(points) => onCommit(toFlat(points))} onCancel={onCancel} />;
  }
  const [hue, saturation, density] = (value.length === 3 ? value : SLICE_IDENTITY) as [number, number, number];
  const set = (index: 0 | 1 | 2, next: number) => { const out: number[] = [hue, saturation, density]; out[index] = next; return out; };
  const row = (index: 0 | 1 | 2, label: string, display: number, min: number, max: number, unit: string, toStored: (v: number) => number) => (
    <div key={label} className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-[length:var(--ui-text-body)] text-[var(--ink-secondary)]">{label}</span>
      <SliderScrubControl label={`${SLICE_SPECS[field]} ${label.toLowerCase()}`} value={String(Number(display.toFixed(1)))} min={min} max={max} step={0.5} fallback={display} unit={unit} disabled={disabled}
        density={size === "card" ? "compact" : undefined}
        onChange={(next) => { const v = Number.parseFloat(next); if (Number.isFinite(v)) onPreview(set(index, toStored(v))); }}
        onCommit={(next) => { const v = Number.parseFloat(next ?? ""); if (Number.isFinite(v)) onCommit(set(index, toStored(v))); }}
        onCancel={onCancel} />
    </div>
  );
  return (
    <div className="grid w-full min-w-0 gap-2">
      {row(0, "Hue", hue, SLICE_BOUNDS.hue[0], SLICE_BOUNDS.hue[1], "°", (v) => v)}
      {row(1, "Saturation", (saturation - 1) * 100, -100, 100, "%", (v) => 1 + v / 100)}
      {row(2, "Depth", density * 100, -100, 100, "%", (v) => v / 100)}
    </div>
  );
}

/**
 * Properties → Color: one row of tabs, Basics (the host's sliders and look file) · Wheels · Curves · One color,
 * so every grading tool is one click away rather than behind a collapsed section.
 */
export function ColorGradeAdvancedControls({ basic, grade, disabled, preview, commit, toggleKeyframe, keyed }: {
  basic: ReactNode;
  grade: ColorGrade;
  disabled: boolean;
  preview: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  commit: (field: AdvancedColorGradeField, value: readonly number[]) => void;
  toggleKeyframe: (field: AdvancedColorGradeField) => void;
  keyed: Record<AdvancedColorGradeField, boolean>;
}) {
  const [view, setView] = useState<View>("basic");
  const [curve, setCurve] = useState<ColorGradeCurveField>("grade_curve_y");
  const value = (field: AdvancedColorGradeField) => advancedColorGradeValue(grade, field);
  // Cancelling a gesture shows the committed value again; nothing is written.
  const cancelField = (field: AdvancedColorGradeField) => () => preview(field, value(field));
  const property = (field: AdvancedColorGradeField) => (
    <InspectorPropertyControl key={field} label={advancedGradeLabel(field)} fields={field} keyed={keyed[field]} disabled={disabled} density="group"
      onToggle={() => toggleKeyframe(field)} onReset={() => commit(field, advancedGradeIdentity(field))}>
      <GradeDial field={field} value={value(field)} disabled={disabled}
        onPreview={(next) => preview(field, next)} onCommit={(next) => commit(field, next)} onCancel={cancelField(field)} />
    </InspectorPropertyControl>
  );

  return (
    <div className="grid min-w-0 gap-4">
      <SegmentedControl size="sm" fill role="group" aria-label="Color tools" className="[&>button]:!whitespace-nowrap [&>button]:!px-1.5">
        {([["basic", "Basics"], ["wheels", "Wheels"], ["curves", "Curves"], ["slice", "One color"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} disabled={disabled} onClick={() => setView(id)}>{label}</button>
        ))}
      </SegmentedControl>

      {view === "basic" ? <div className="grid min-w-0 gap-4">{basic}</div> : null}

      {view === "wheels" ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-3">
          {COLOR_GRADE_WHEEL_FIELDS.map(property)}
        </div>
      ) : null}

      {view === "curves" ? (
        <div className="grid min-w-0 gap-3">
          <Select value={curve} disabled={disabled} onValueChange={(next) => { if (next) setCurve(next as ColorGradeCurveField); }}>
            <SelectTrigger className="w-full" aria-label="Curve"><SelectValue>{CURVE_SPECS[curve].label}</SelectValue></SelectTrigger>
            <SelectContent>
              {(["Tone", "Color"] as const).map((group) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {COLOR_GRADE_CURVE_FIELDS.filter((field) => CURVE_SPECS[field].group === group).map((field) => <SelectItem key={field} value={field}>{CURVE_SPECS[field].label}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {property(curve)}
        </div>
      ) : null}

      {view === "slice" ? (
        <div className="grid min-w-0 gap-4">
          {COLOR_GRADE_SLICE_FIELDS.map(property)}
        </div>
      ) : null}
    </div>
  );
}
