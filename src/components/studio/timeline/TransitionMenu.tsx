"use client";
import { useEffect, useState } from "react";
import { isAccentTransition } from "@/lib/timeline/accent-transitions";
import { transitionControl, resolveTransitionNumber } from "@/lib/timeline/transition-controls";
import { quantizeTransitionDurationSeconds, resolveTransitionDirection } from "@/lib/timeline/transitions";
import { SliderScrubControl } from "./InspectorNumericControls";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorHeading, InspectorItemHeader } from "./InspectorHierarchy";
import { TransitionTypeChoice } from "./TransitionTypeChoice";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TimelineTransition, TimelineTransitionParams } from "./types";

export type TransitionMenuProps = {
  layout?: "horizontal" | "vertical";
  transition: TimelineTransition;
  maxDurationSeconds?: number;
  fromLabel: string;
  toLabel: string;
  previewTransition?: (id: string, params: TimelineTransitionParams | null) => void;
  patchTransition: (transitionId: string, patch: Record<string, unknown>) => void | Promise<unknown>;
  deleteTransition: (transitionId: string) => void | Promise<unknown>;
};

/** One parameter row owns the same draft/cancel/commit/reset behavior for every type. */
function TransitionParameter({transition, field, label, scale = 1, unit, previewTransition, patchTransition}: Pick<TransitionMenuProps, 'transition'|'previewTransition'|'patchTransition'> & {
  field: string; label?: string; scale?: number; unit: string;
}) {
  const control = transitionControl(field)!;
  const key = field.slice(7);
  const saved = transition.type === 'slide' && field === 'params.whip_blur_strength' && transition.params?.whip_blur_strength == null && transition.params?.motion !== 'smear'
    ? 0 : resolveTransitionNumber(transition.params, field);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [saved, transition.id, transition.type]);
  const clear = () => { setDraft(null); previewTransition?.(transition.id, null); };
  const name = label ?? control.label;
  return <div className="grid min-w-0 gap-1">
    <InspectorPropertyControl fields={field} label={name} disabled={false} onReset={() => {
      clear(); const params = {...transition.params}; delete params[key as keyof TimelineTransitionParams];
      void patchTransition(transition.id, {params});
    }}>
      <SliderScrubControl density="compact" label={name} value={draft ?? String(Number((saved * scale).toFixed(2)))}
        min={control.min * scale} max={control.max * scale} step={control.step * scale} fallback={saved * scale} unit={unit} disabled={false}
        onChange={value => {
          setDraft(value); const number = Number.parseFloat(value) / scale;
          if (Number.isFinite(number)) previewTransition?.(transition.id, {...transition.params, [key]: Math.max(control.min, Math.min(control.max, number))});
        }} onCancel={clear} onCommit={value => {
          const number = Number.parseFloat(value ?? draft ?? String(saved * scale)) / scale; clear();
          if (!Number.isFinite(number)) return;
          const bounded = Math.max(control.min, Math.min(control.max, number));
          if (bounded !== saved) void patchTransition(transition.id, {params: {...transition.params, [key]: bounded}});
        }} />
    </InspectorPropertyControl>
  </div>;
}

export function TransitionMenu({layout = "horizontal", transition, maxDurationSeconds = 2, fromLabel, toLabel, previewTransition, patchTransition, deleteTransition}: TransitionMenuProps) {
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  useEffect(() => setDurationDraft(null), [transition.id, transition.duration_seconds]);
  useEffect(() => () => previewTransition?.(transition.id, null), [transition.id, transition.type, previewTransition]);
  const commitDuration = (value?: string) => {
    const raw = Number.parseFloat(value ?? durationDraft ?? String(transition.duration_seconds));
    setDurationDraft(null);
    const next = quantizeTransitionDurationSeconds(Number.isFinite(raw) ? raw : transition.duration_seconds, {maxSeconds: maxDurationSeconds});
    if (next !== transition.duration_seconds) void patchTransition(transition.id, {duration_seconds: next});
  };
  const accent = isAccentTransition(transition.type);
  const pageTurn = transition.type === 'page_turn';
  const motion = transition.type === 'whip' || transition.type === 'slide';
  const smear = transition.params?.motion === 'smear';
  const origin = transition.params?.page_turn_origin === 'bottom-right' ? 'bottom-right' : 'right-edge';
  const direction = resolveTransitionDirection(transition.params);
  const directions = {'from-left':'From left','from-right':'From right','from-top':'From top','from-bottom':'From bottom'};
  const rowProps = {transition, previewTransition, patchTransition};
  return <div className="grid min-w-0 w-full gap-3 overflow-x-hidden overflow-y-auto bg-[var(--chrome-panel)] p-3" style={{maxHeight: layout === 'horizontal' ? 'min(50vh, 420px)' : undefined}}>
    <div className="grid min-w-0 gap-1">
      <InspectorHeading>Transition</InspectorHeading>
      <p className="m-0 break-words text-xs text-[var(--ink-secondary)]">{fromLabel} → {toLabel}</p>
    </div>
    <div className="grid w-full min-w-0 max-w-xl gap-4 border-t border-[var(--chrome-line)] pt-3">
      <div className="grid min-w-0 gap-1">
        <InspectorPropertyControl fields="duration_seconds" label="Duration" disabled={false} onReset={() => commitDuration(String(Math.min(.5, maxDurationSeconds)))}>
          <SliderScrubControl density="compact" label="Transition duration" value={durationDraft ?? transition.duration_seconds.toFixed(2)}
            min={transitionControl('duration_seconds')!.min} max={maxDurationSeconds} step={1 / 30} precision={2} fallback={transition.duration_seconds} unit="s" disabled={false}
            onChange={setDurationDraft} onCommit={commitDuration} onCancel={() => setDurationDraft(null)} />
        </InspectorPropertyControl>
        <p className="m-0 text-xs text-[var(--ink-muted)]">Max {maxDurationSeconds.toFixed(2)} s</p>
      </div>
      {!accent && transition.type !== 'fade' && (!pageTurn || origin === 'right-edge') && <div className="grid min-w-0 gap-2">
        <InspectorItemHeader title="Direction" />
        <Select value={direction} onValueChange={value => {
          if (value && value in directions) void patchTransition(transition.id, {params: {...transition.params, direction: value}});
        }}><SelectTrigger className="w-full"><SelectValue>{directions[direction]}</SelectValue></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{Object.entries(directions).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </div>}
    <TransitionTypeChoice value={transition.type} onChange={type => void patchTransition(transition.id, {type})} />
      {accent && <>
        <TransitionParameter {...rowProps} field="params.accent_strength" scale={100} unit="%" />
        <TransitionParameter {...rowProps} field="params.accent_hold" scale={100} unit="%" />
      </>}
      {pageTurn && <>
        <TransitionParameter {...rowProps} field="params.page_curl" scale={100} unit="%" />
        <div className="grid min-w-0 gap-2"><InspectorItemHeader title="Turn origin" />
          <Select value={origin} onValueChange={value => {if (value === 'right-edge' || value === 'bottom-right') void patchTransition(transition.id, {params: {...transition.params, page_turn_origin: value}});}}>
            <SelectTrigger className="w-full"><SelectValue>{origin === 'right-edge' ? 'Right edge' : 'Bottom right → top left'}</SelectValue></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="right-edge">Right edge</SelectItem><SelectItem value="bottom-right">Bottom right → top left</SelectItem></SelectGroup></SelectContent>
          </Select>
        </div>
      </>}
      {motion && <>
        <InspectorItemHeader title="Blend into motion smear" enabled={smear} onEnabledChange={enabled => void patchTransition(transition.id, {params: {...transition.params, motion: enabled ? 'smear' : 'travel'}})} />
        <TransitionParameter {...rowProps} field="params.whip_blur_strength" unit="×" />
        {transition.type === "whip" && !smear && <TransitionParameter {...rowProps} field="params.whip_zoom_percent" unit="%" />}
        {smear && <>
          <TransitionParameter {...rowProps} field="params.smear_zoom_percent" unit="%" />
          <TransitionParameter {...rowProps} field="params.smear_travel_percent" unit="%" />
        </>}
      </>}
      <Button type="button" variant="destructive" className="justify-self-start" onClick={() => void deleteTransition(transition.id)}>Remove transition</Button>
    </div>
  </div>;
}
