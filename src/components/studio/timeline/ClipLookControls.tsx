'use client';
import { useEffect, useState } from "react";
import { InspectorEffectNumber } from "./InspectorEffectNumber";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { ProposalColorInput } from "./ProposalAdjustments";
import type { TimelineElement } from "./types";
import { EFFECT_CONTROLS } from "@/lib/timeline/effect-controls";
import { hasKeyframes, hasKeyframeAtTime, removeKeyframes, removeKeyframesAtTime, resolveNumberKeyframe, upsertKeyframe } from "@/lib/timeline/keyframes";

export type LookEffect = "glitch" | "gradient_map";

/** Main rows first; the rest sit under More. Labels are the short creator words. */
const LOOK_ROWS = {
  gradient_map: { main: [
    ["gradient_map_amount", "Mix"],
    ["gradient_map_shadows", "Shadows"],
    ["gradient_map_midtones", "Midtones"],
    ["gradient_map_highlights", "Highlights"],
    ["gradient_map_contrast", "Contrast"],
  ], more: [] },
  glitch: { main: [
    ["glitch_amount", "Amount"],
    ["glitch_block_size", "Block size"],
    ["glitch_shift", "Shift"],
    ["glitch_rgb_split", "Color split"],
    ["glitch_smear", "Smear"],
  ], more: [
    ["glitch_rate", "Speed"],
    ["glitch_seed", "Pattern"],
  ] },
} as const satisfies Record<LookEffect, { main: readonly (readonly [string, string])[]; more: readonly (readonly [string, string])[] }>;

type Control = (typeof EFFECT_CONTROLS)[number];
const control = (field: string) => EFFECT_CONTROLS.find((entry) => entry.prop === field) as Control;

/** Color map and glitch rows, driven by the effect registry's ranges, units and identities. */
export function ClipLookControls({ element, time, effect, onPatch, onPreview }: {
  element: Pick<TimelineElement, "props">;
  time: number;
  effect: LookEffect;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const props = element.props ?? {};
  const [moreOpen, setMoreOpen] = useState(false);
  const row = ([field, label]: readonly [string, string]) => {
    const definition = control(field);
    if (definition.kind === "color") {
      const value = definition.normalize(props[field]);
      return <InspectorPropertyControl key={field} fields={field} label={label} disabled={false}
        onReset={() => onPatch({ [field]: definition.identity })}>
        <LookColor label={label} value={value} onPreview={next => onPreview(next === null ? null : { [field]: next })} onCommit={next => onPatch({ [field]: next })} />
      </InspectorPropertyControl>;
    }
    if (definition.kind !== "number") return null;
    const { scale = 1, offset = 0, step, suffix } = definition.proposal as { scale?: number; offset?: number; step: number; suffix: string };
    const toDisplay = (native: number) => Number((native * scale + offset).toFixed(6));
    const fromDisplay = (display: number) => definition.normalize((display - offset) / scale);
    const fallback = definition.normalize(props[field] ?? definition.identity);
    const value = definition.keyframeable ? resolveNumberKeyframe(props, field, time, fallback, { min: definition.min, max: definition.max }) : fallback;
    const animated = definition.keyframeable && hasKeyframes(props, field);
    const keyed = definition.keyframeable && hasKeyframeAtTime(props, [field], time);
    const write = (native: number) => animated ? { keyframes: upsertKeyframe(props, field, time, native).keyframes } : { [field]: native };
    const toggleTransitionKeyframe = () => {
      if (keyed) { onPatch({ keyframes: removeKeyframesAtTime(props, [field], time).keyframes }); return; }
      const initial = animated ? props : upsertKeyframe(props, field, 0, value);
      onPatch({ keyframes: upsertKeyframe(initial, field, time, value).keyframes });
    };
    return <InspectorPropertyControl key={field} fields={field} label={label} keyed={keyed} disabled={false}
      onToggle={definition.keyframeable ? toggleTransitionKeyframe : undefined}
      onReset={() => onPatch({ [field]: definition.identity, ...(definition.keyframeable ? { keyframes: removeKeyframes(props, [field]).keyframes ?? {} } : {}) })}>
      <InspectorEffectNumber key={`${field}-${time}`} label={label} value={Number((Math.round(toDisplay(value) / step) * step).toFixed(4))}
        min={toDisplay(definition.min)} max={toDisplay(definition.max)} step={step} unit={suffix}
        onPreview={next => onPreview(next === null ? null : write(fromDisplay(next)))}
        onCommit={next => onPatch(write(fromDisplay(next)))} />
    </InspectorPropertyControl>;
  };
  const rows = LOOK_ROWS[effect];
  return <div className="grid gap-2">
    {rows.main.map(row)}
    {rows.more.length ? <InspectorDisclosure title="More" open={moreOpen} onOpenChange={setMoreOpen}>
      <div className="grid gap-2">{rows.more.map(row)}</div>
    </InspectorDisclosure> : null}
  </div>;
}

/** Swatch plus exact hex, the same pair proposal cards use. The picker previews while
 * open and commits once when it closes. */
function LookColor({ label, value, onPreview, onCommit }: { label: string; value: string; onPreview: (value: string | null) => void; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="flex min-w-0 items-center gap-2">
    <input type="color" aria-label={label} value={draft} className="h-8 w-12 shrink-0"
      onChange={event => { setDraft(event.target.value); onPreview(event.target.value); }}
      onBlur={() => { onPreview(null); if (draft !== value) onCommit(draft); }}
      onKeyDown={event => { if (event.key === "Escape") { setDraft(value); onPreview(null); } }} />
    <ProposalColorInput value={value} label={label} onChange={next => { if (next.toLowerCase() !== value) onCommit(next.toLowerCase()); }} />
  </div>;
}
