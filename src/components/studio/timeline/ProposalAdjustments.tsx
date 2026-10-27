"use client";

import { useRef, useState } from "react";
import { OptionSelect } from "@/components/ui/select";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { ProposalAdvancedGroup } from "./ProposalAdvancedAdjustments";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorColorField } from "./InspectorColorControl";
import { SliderScrubControl } from "./InspectorNumericControls";
import { PROPOSAL_LIST_CONTROL_FIELDS, proposalTunableField, type ProposalControlReference } from "@/lib/agent/proposal-controls";
import type { AdvancedColorGradeField } from "@/lib/timeline/color-grade";
import { GradeDial, advancedGradeLabel } from "./ColorGradeAdvancedControls";
import { proposalAdjustmentSubject, proposalAdjustmentTiers } from "./proposal-adjustments";
import { proposalDialSlider } from "@/lib/agent/proposal-dial-range";
import type { ProposalOptionReview, ProposalReviewRow } from "./timeline-client";

type Value = number | string | number[];
type Binding = Pick<ProposalControlReference, "operation_index" | "target" | "field">;
type Item = {row: ProposalReviewRow; change: ProposalReviewRow["changes"][number]};

/** Named picture choices a card can tune, in the creator's words. */
const PROPOSAL_CHOICES: Record<string, { value: string; label: string }[]> = {
  media_orientation: [{ value: "original", label: "Original" }, { value: "clockwise", label: "Rotate 90° clockwise" }, { value: "counterclockwise", label: "Rotate 90° counterclockwise" }],
  media_mirror: [{ value: "none", label: "Original" }, { value: "horizontal", label: "Flip horizontally" }],
  subject_window_mode: [{ value: "inside", label: "Inside subject" }, { value: "outside", label: "Outside subject" }],
  media_blend_mode: [{ value: "normal", label: "Normal" }, { value: "difference", label: "Difference" }, { value: "exclusion", label: "Exclusion · softer" }],
  place_side: [{ value: "below", label: "Below" }, { value: "above", label: "Above" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }, { value: "inside", label: "Inside" }],
  place_align: [{ value: "start", label: "Start" }, { value: "center", label: "Centre" }, { value: "end", label: "End" }],
  place_vertical_align: [{ value: "start", label: "Top" }, { value: "center", label: "Middle" }, { value: "end", label: "Bottom" }],
  motion_from_side: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }],
};

function Adjustment({item: {row, change}, option, override, valueFor, onChange}: {
  item: Item; option: ProposalOptionReview; override?: Value; valueFor: (binding: Binding) => Value | undefined;
  onChange: (binding: Binding, value: Value | undefined) => void;
}) {
  const binding = {operation_index: change.operation_index, target: change.target, field: change.field} as Binding;
  const subject = proposalAdjustmentSubject(row, change, option.review_controls, option.adjustment_rows ?? option.rows);
  const base = proposalTunableField(change.target, change.field, change.control_range, change.control_unit, change.control_display);
  const list = PROPOSAL_LIST_CONTROL_FIELDS.includes(change.field);
  const label = change.target === "timing_control" || change.target === "block" ? change.label : list ? advancedGradeLabel(change.field as AdvancedColorGradeField) : base?.label ?? change.label;
  const choices = change.control_choices ?? PROPOSAL_CHOICES[change.field];
  const gesture = useRef<{value: Value | undefined} | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const value = override ?? change.after_value;
  const reset = () => { gesture.current = null; setResetSignal(signal => signal + 1); onChange(binding, undefined); };
  if (typeof value === "number" && base) {
    const {spec, range: sliderRange} = proposalDialSlider(option, change, valueFor)!;
    const display = spec.toDisplay?.(value) ?? value;
    const parse = (raw: string | undefined) => {
      if (raw == null || !raw.trim()) return undefined;
      const number = Number(raw);
      if (!Number.isFinite(number)) return undefined;
      const bounded = Math.max(spec.min, Math.min(spec.max, number));
      return spec.fromDisplay?.(bounded) ?? bounded;
    };
    return <div data-proposal-control={change.field}>
      <InspectorPropertyControl fields={change.field} label={label} density="compact" disabled={override === undefined} onReset={reset}>
        <SliderScrubControl label={`${label} for ${subject}`} value={String(Number(display.toFixed(spec.suffix === "s" ? 2 : stepDecimals(spec.step))))} fallback={display}
          sliderRange={sliderRange} min={spec.min} max={spec.max} step={spec.step} unit={spec.suffix} density="compact" precision={spec.suffix === "s" ? 2 : undefined} disabled={false}
          onChange={raw => {
            const next = parse(raw); if (next === undefined) return;
            gesture.current ??= {value: override}; onChange(binding, next);
          }}
          onCommit={raw => {const next = parse(raw); if (next !== undefined) onChange(binding, next); gesture.current = null;}}
          onCancel={() => {if (gesture.current) {const prior = gesture.current.value; gesture.current = null; onChange(binding, prior);}}}
          resetSignal={resetSignal}
        />
      </InspectorPropertyControl>
    </div>;
  }
  if (Array.isArray(value) && list) {
    return <div data-proposal-control={change.field}>
      <InspectorPropertyControl fields={change.field} label={label} density="group" disabled={override === undefined} onReset={reset}>
        <GradeDial key={resetSignal} field={change.field as AdvancedColorGradeField} value={value} size="card"
          onPreview={next => { gesture.current ??= {value: override}; onChange(binding, next); }}
          onCommit={next => { onChange(binding, next); gesture.current = null; }}
          onCancel={() => { if (gesture.current) { const prior = gesture.current.value; gesture.current = null; onChange(binding, prior); } }} />
      </InspectorPropertyControl>
    </div>;
  }
  if (typeof value !== "string") return null;
  return <div data-proposal-control={change.field}>
    <InspectorPropertyControl fields={change.field} label={label} density="compact" disabled={override === undefined} onReset={reset}>
      {choices ? <OptionSelect label={`${label} for ${subject}`} value={value} options={choices} onValueChange={next => onChange(binding, next)} /> : <InspectorColorField ariaLabel={`${label} for ${subject}`} value={value} onChange={value => onChange(binding, value)} />}
    </InspectorPropertyControl>
  </div>;
}

/** Decimals a dial's step shows, so converted values like 1.15 → 15% never read 14.9999. */
function stepDecimals(step: number): number {
  return Math.min(4, (String(step).split(".")[1] ?? "").length);
}

export function ProposalAdjustments({option, valueFor, onChange}: {
  option: ProposalOptionReview; valueFor: (binding: Binding) => Value | undefined;
  onChange: (binding: Binding, value: Value | undefined) => void;
}) {
  const tiers = proposalAdjustmentTiers(option);
  // One clip, named on the option row above, needs no header over its dials.
  const allItems = [...tiers.main, ...tiers.advanced];
  const oneClip = allItems.every((item) => item.change.target !== "timing_control" && item.row.element_id === allItems[0]?.row.element_id)
    && new Set(allItems.map((item) => proposalAdjustmentSubject(item.row, item.change, option.review_controls, option.adjustment_rows ?? option.rows))).size === 1;
  const render = (items: Item[]) => <div className="grid min-w-0 gap-1.5">
    {items.map((item, index) => {
      const subject = proposalAdjustmentSubject(item.row, item.change, option.review_controls, option.adjustment_rows ?? option.rows);
      const previous = index > 0 ? proposalAdjustmentSubject(items[index - 1].row, items[index - 1].change, option.review_controls, option.adjustment_rows ?? option.rows) : null;
      const binding = {operation_index: item.change.operation_index, target: item.change.target, field: item.change.field} as Binding;
      const group = item.change.control_group;
      const groupValue = group && valueFor({...binding, operation_index: group.operation_index});
      const inherited = typeof groupValue === "number" ? groupValue + group!.offset_seconds : undefined;
      return <div key={`${binding.operation_index}:${binding.target}:${binding.field}`} className="grid min-w-0 gap-1">
        {!oneClip && (subject !== previous || item.change.target !== "timing_control" && item.row.element_id !== items[index - 1]?.row.element_id) && <><InspectorItemHeader title={subject} /></>}
        <Adjustment item={inherited === undefined ? item : {...item, change: {...item.change, after_value: inherited}}} option={option} override={valueFor(binding)} valueFor={valueFor} onChange={onChange} />
      </div>;
    })}
  </div>;
  if (!tiers.main.length && !tiers.advanced.length) return null;
  const lastAdvanced = tiers.advanced.at(-1);
  return <section aria-label="Adjustments" className="mt-3 grid min-w-0 gap-3">
    {render(tiers.main)}
    <ProposalAdvancedGroup id="timing" order={0} count={tiers.advanced.length} endsWith={lastAdvanced && proposalAdjustmentSubject(lastAdvanced.row, lastAdvanced.change, option.review_controls, option.adjustment_rows ?? option.rows)}>{render(tiers.advanced)}</ProposalAdvancedGroup>
  </section>;
}
