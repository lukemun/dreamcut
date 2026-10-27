import { hasKeyframes, hasKeyframeAtTime, removeKeyframesAtTime, removeKeyframes, resolveNumberKeyframe, upsertKeyframe } from "@/lib/timeline/keyframes";
import { InspectorEffectNumber } from "./InspectorEffectNumber";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { ColorSwatchInput } from "./InspectorColorControl";
import type { TimelineElement } from "./types";
import { cutoutEffectState } from "@/lib/timeline/cutout-effects";
import { Button } from "@/components/ui/button";

export function CutoutEffectControls({ element, time = 0, onPatch, onPreview }: {
  element: Pick<TimelineElement, "props">;
  time?: number;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const props = element.props ?? {};
  const field = "sticker_outline_width";
  const value = resolveNumberKeyframe(props, field, time, Number(props[field] ?? 8));
  const animated = hasKeyframes(props, field);
  const outlinePatch = (next: number) => animated ? {keyframes: upsertKeyframe(props, field, time, next).keyframes} : {[field]:next};
  const keyed = hasKeyframeAtTime(props, [field], time);
  const toggleOutlineKeyframe = () => {
    if (keyed) { onPatch({keyframes:removeKeyframesAtTime(props,[field],time).keyframes}); return; }
    const initial = animated ? props : upsertKeyframe(props,field,0,value);
    onPatch({keyframes:upsertKeyframe(initial,field,time,value).keyframes});
  };
  const state = cutoutEffectState(element.props);
  const reversible = Boolean(element.props?.custom_cutout_receipt);
  const toggle = (field: "background" | "scratchpad") => onPatch({ cutout_effects: {
    schema_version: 1, background: state.background, scratchpad: state.scratchpad, [field]: !state[field],
  } });
  return <div className="grid gap-2" aria-label="Applied effects">
    {(["background", ...(state.hasScratchpad ? ["scratchpad"] : [])] as const).map(field => {
      const key = field as "background" | "scratchpad";
      const label = key === "background" ? "Background removal" : "Scratchpad";
      const paused = key === "scratchpad" && !state.background;
      return <div key={key} className="flex items-center justify-between gap-3">
        <span className="text-sm">{label}</span>
        <Button variant="outline" size="sm" aria-label={`${label}: ${state[key] ? "applied" : "off"}`}
          aria-pressed={state[key]} disabled={!reversible || paused} onClick={() => toggle(key)}>
          {paused ? "Paused" : state[key] ? "Applied · Turn off" : "Off · Apply"}
        </Button>
      </div>;
    })}
    {element.props?.sticker_outline === true && <>
      <InspectorPropertyControl fields="sticker_outline_width" label="Outline width" disabled={false} keyed={keyed} onToggle={toggleOutlineKeyframe} onReset={() => onPatch({sticker_outline_width:0,keyframes:removeKeyframes(props,[field]).keyframes ?? {}})}>
        <InspectorEffectNumber label="Outline width" value={value} min={0} max={32} unit="px" onPreview={value => onPreview(value === null ? null : outlinePatch(value))} onCommit={value => onPatch(outlinePatch(value))}/>
      </InspectorPropertyControl>
      <label className="flex items-center gap-2 text-xs">Outline color <ColorSwatchInput ariaLabel="Outline color" value={String(element.props.sticker_outline_color ?? '#ffffff')} onChange={sticker_outline_color => onPatch({sticker_outline_color})}/></label>
    </>}
    {!reversible || element.props?.compound_clip_id ? <p className="m-0 text-xs text-[var(--ink-muted)]">{!reversible
      ? "No saved original to restore"
      : "Applies to the whole compound clip"}</p> : null}
  </div>;
}
