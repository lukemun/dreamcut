"use client";

import { useEffect, useRef, useState } from "react";
import { numericWorkingRange } from "@/lib/timeline/numeric-working-range";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { ProposalAdvancedGroup } from "./ProposalAdvancedAdjustments";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { SliderScrubControl } from "./InspectorNumericControls";
import { proposalTunableField, type ProposalControlReference } from "@/lib/agent/proposal-controls";
import { proposalAdjustmentSubject, proposalAdjustmentTiers } from "./proposal-adjustments";
import { proposalMaskWindowRange } from "./proposal-mask-window-range";
import type { ProposalOptionReview, ProposalReviewRow } from "./timeline-client";

type Value = number | string;
type Binding = Pick<ProposalControlReference, "operation_index" | "target" | "field">;
type Item = {row: ProposalReviewRow; change: ProposalReviewRow["changes"][number]};

function peakRampRange(option: ProposalOptionReview, field: string, valueFor: (binding: Binding) => Value | undefined) {
  if (!field.startsWith("playback_ramp_")) return undefined;
  const changes = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes);
  const number = (name: string) => {
    const change = changes.find(item => item.field === name && item.operation_index === 0);
    if (!change) return undefined;
    const value = valueFor({operation_index: change.operation_index, target: "props", field: name}) ?? change.after_value;
    return typeof value === "number" ? value : undefined;
  };
  const profile = changes.find(item => item.field === "playback_ramp_profile" && item.operation_index === 0)?.after_value as {hold_end_source_seconds?: number} | undefined;
  const fast = number("playback_ramp_fast_rate");
  const top = number("playback_ramp_top_rate");
  const start = number("playback_ramp_slow_start_source_seconds");
  const end = number("playback_ramp_slow_end_source_seconds");
  const floor = (value: number) => Math.floor((value + 1e-9) * 100) / 100;
  const ceil = (value: number) => Math.ceil((value - 1e-9) * 100) / 100;
  if (field === "playback_ramp_fast_rate" && top !== undefined) return {min: Math.max(.5, top), max: 4};
  if (field === "playback_ramp_top_rate" && fast !== undefined) return {min: .25, max: Math.min(2, fast)};
  if (field === "playback_ramp_slow_start_source_seconds" && end !== undefined) return {min: .03, max: floor(end - .03)};
  if (field === "playback_ramp_slow_end_source_seconds" && start !== undefined && typeof profile?.hold_end_source_seconds === "number")
    return {min: ceil(start + .03), max: floor(profile.hold_end_source_seconds)};
  return undefined;
}

function peakBarRange(option: ProposalOptionReview, field: string, valueFor: (binding: Binding) => Value | undefined) {
  if (!field.startsWith("playback_ramp_bar_")) return undefined;
  const changes = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes);
  const number = (name: string) => {
    const change = changes.find(item => item.field === name && item.operation_index === 0);
    if (!change) return undefined;
    const value = valueFor({operation_index: 0, target: name === "duration" ? "patch" : "props", field: name}) ?? change.after_value;
    return typeof value === "number" ? value : undefined;
  };
  const close = number("playback_ramp_bar_close_start_seconds");
  const closing = number("playback_ramp_bar_close_duration_seconds");
  const reopen = number("playback_ramp_bar_reopen_start_seconds");
  const reopening = number("playback_ramp_bar_reopen_duration_seconds");
  const duration = number("duration");
  const floor = (value: number) => Math.floor((value + 1e-9) * 100) / 100;
  const ceil = (value: number) => Math.ceil((value - 1e-9) * 100) / 100;
  if (field === "playback_ramp_bar_close_start_seconds" && closing !== undefined && reopen !== undefined) return {min:.03,max:floor(reopen-closing-.03)};
  if (field === "playback_ramp_bar_close_duration_seconds" && close !== undefined && reopen !== undefined) return {min:.03,max:floor(reopen-close-.03)};
  if (field === "playback_ramp_bar_reopen_start_seconds" && close !== undefined && closing !== undefined && reopening !== undefined && duration !== undefined)
    return {min:ceil(close+closing+.03),max:floor(duration-reopening-.03)};
  if (field === "playback_ramp_bar_reopen_duration_seconds" && reopen !== undefined && duration !== undefined) return {min:.03,max:floor(duration-reopen-.03)};
  return undefined;
}

export function ProposalColorInput({value, label, onChange}: {value: string; label: string; onChange: (value: string) => void}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <Input aria-label={`${label} hex`} value={draft} className="h-8 min-w-0 flex-1" onBlur={() => setDraft(value)} onChange={event => {
    const next = event.target.value; setDraft(next);
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
  }} />;
}

function Adjustment({item: {row, change}, option, override, valueFor, onChange}: {
  item: Item; option: ProposalOptionReview; override?: Value; valueFor: (binding: Binding) => Value | undefined;
  onChange: (binding: Binding, value: Value | undefined) => void;
}) {
  const binding = {operation_index: change.operation_index, target: change.target, field: change.field} as Binding;
  const subject = proposalAdjustmentSubject(row, change, option.review_controls);
  const base = proposalTunableField(change.target, change.field, change.control_range, change.control_unit);
  const label = change.target === "timing_control" ? change.label : base?.label ?? change.label;
  const gesture = useRef<{value: Value | undefined} | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const value = override ?? change.after_value;
  const reset = () => { gesture.current = null; setResetSignal(signal => signal + 1); onChange(binding, undefined); };
  if (typeof value === "number" && base) {
    const spec = {...base};
    const windowRange = proposalMaskWindowRange(option, change.field, (operation_index, field) => {
      const current = valueFor({operation_index, target: "props", field});
      return typeof current === "number" ? current : undefined;
    });
    if (windowRange && windowRange.max >= windowRange.min) {
      spec.min = windowRange.min;
      spec.max = windowRange.max;
    }
    const rampRange = peakRampRange(option, change.field, valueFor);
    if (rampRange && rampRange.max >= rampRange.min) {
      spec.min = rampRange.min;
      spec.max = rampRange.max;
    }
    const barRange = peakBarRange(option, change.field, valueFor);
    if (barRange && barRange.max >= barRange.min) {
      spec.min = barRange.min;
      spec.max = barRange.max;
    }
    const sourceDuration = option.rows.flatMap(row => row.changes).find(item => item.operation_index === change.operation_index && item.field === "source_duration_seconds")?.after_value;
    if (["source_start_seconds", "source_end_seconds"].includes(change.field) && typeof sourceDuration === "number") spec.max = sourceDuration;
    const display = spec.toDisplay?.(value) ?? value;
    const authored = typeof change.after_value === "number" ? (spec.toDisplay?.(change.after_value) ?? change.after_value) : display;
    const sliderRange = change.target === "timing_control"
      ? {min: spec.min, max: spec.max}
      : numericWorkingRange(authored, spec.min, spec.max, spec.step,
        // Size and position get room to reach any placement; timing keeps a fine window.
        spec.suffix === "s" || spec.suffix === "frames" ? {} : {floorFraction: 0.25});
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
  if (typeof value !== "string") return null;
  return <div data-proposal-control={change.field}>
    <InspectorPropertyControl fields={change.field} label={label} density="compact" disabled={override === undefined} onReset={reset}>
      {change.field === "media_orientation" ? <NativeSelect aria-label={`${label} for ${subject}`} value={value} onChange={event => onChange(binding, event.target.value)}><option value="original">Original</option><option value="clockwise">Rotate 90° clockwise</option><option value="counterclockwise">Rotate 90° counterclockwise</option></NativeSelect> : change.field === "media_mirror" ? <NativeSelect aria-label={`${label} for ${subject}`} value={value} onChange={event => onChange(binding, event.target.value)}><option value="none">Original</option><option value="horizontal">Flip horizontally</option></NativeSelect> : change.field === "subject_window_mode" ? <NativeSelect aria-label={`${label} for ${subject}`} value={value} onChange={event => onChange(binding, event.target.value)}><option value="inside">Inside subject</option><option value="outside">Outside subject</option></NativeSelect> : change.field === "media_blend_mode" ? <NativeSelect aria-label={`${label} for ${subject}`} value={value} onChange={event => onChange(binding, event.target.value)}>
        <option value="normal">Normal</option><option value="difference">Difference</option><option value="exclusion">Exclusion · softer</option>
      </NativeSelect> : <><input type="color" aria-label={`${label} for ${subject}`} value={value} onChange={event => onChange(binding, event.target.value)} className="h-8 w-12" /><ProposalColorInput value={value} label={`${label} for ${subject}`} onChange={value => onChange(binding, value)} /></>}
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
  const render = (items: Item[]) => <div className="grid min-w-0 gap-1.5">
    {items.map((item, index) => {
      const subject = proposalAdjustmentSubject(item.row, item.change, option.review_controls);
      const previous = index > 0 ? proposalAdjustmentSubject(items[index - 1].row, items[index - 1].change, option.review_controls) : null;
      const binding = {operation_index: item.change.operation_index, target: item.change.target, field: item.change.field} as Binding;
      const group = item.change.control_group;
      const groupValue = group && valueFor({...binding, operation_index: group.operation_index});
      const inherited = typeof groupValue === "number" ? groupValue + group!.offset_seconds : undefined;
      return <div key={`${binding.operation_index}:${binding.target}:${binding.field}`} className="grid min-w-0 gap-1">
        {(subject !== previous || item.change.target !== "timing_control" && item.row.element_id !== items[index - 1]?.row.element_id) && <><InspectorItemHeader title={subject} /></>}
        <Adjustment item={inherited === undefined ? item : {...item, change: {...item.change, after_value: inherited}}} option={option} override={valueFor(binding)} valueFor={valueFor} onChange={onChange} />
      </div>;
    })}
  </div>;
  if (!tiers.main.length && !tiers.advanced.length) return null;
  const lastAdvanced = tiers.advanced.at(-1);
  return <section aria-label="Adjustments" className="mt-3 grid min-w-0 gap-3">
    {render(tiers.main)}
    <ProposalAdvancedGroup id="timing" order={0} count={tiers.advanced.length} endsWith={lastAdvanced && proposalAdjustmentSubject(lastAdvanced.row, lastAdvanced.change, option.review_controls)}>{render(tiers.advanced)}</ProposalAdvancedGroup>
  </section>;
}
