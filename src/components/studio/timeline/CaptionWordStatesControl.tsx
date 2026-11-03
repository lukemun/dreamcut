"use client";
import { useState } from "react";
import { OptionSelect } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_CAPTION_PROPS, type CaptionElementProps } from "@/lib/timeline/captions";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorEffectNumber } from "./InspectorEffectNumber";
import { InspectorColorControl } from "./InspectorColorControl";

type Patch = Record<string, unknown>;

/** A caption number shown in display units (scale converts the stored value). */
export function CaptionScaledNumber({ field, label, value, min, max, step, unit, scale = 1, defaults, onPreview, onPatch }: {
  field: keyof CaptionElementProps; label: string; value: number; min: number; max: number; step: number; unit: string; scale?: number;
  /** Reset values when they differ from the caption defaults, e.g. a treatment's preset. */
  defaults?: Partial<Record<keyof CaptionElementProps, unknown>>;
  onPreview: (patch: Patch | null) => void; onPatch: (patch: Patch) => void;
}) {
  return <InspectorPropertyControl fields={field} label={label} disabled={false}
    onReset={() => onPatch({ [field]: defaults && field in defaults ? defaults[field] : DEFAULT_CAPTION_PROPS[field] })}>
    <InspectorEffectNumber label={label} value={Math.round(value * scale * 100) / 100} min={min} max={max} step={step} unit={unit}
      onPreview={next => onPreview(next === null ? null : { [field]: next / scale })}
      onCommit={next => onPatch({ [field]: next / scale })} />
  </InspectorPropertyControl>;
}

/**
 * How each word looks before, while and after it is said (timeline/caption-reading-states.ts).
 * Shown for captions with aligned words, except one word at a time.
 */
export function CaptionWordStatesControl({ props, textColor, onPreview, onPatch }: {
  props: CaptionElementProps;
  /** The colour words are drawn in when no state colour is set. */
  textColor: string;
  onPreview: (patch: Patch | null) => void;
  onPatch: (patch: Patch) => void;
}) {
  const changed = props.upcomingWords !== "shown" || props.speakingWordColor !== null || props.spokenWordColor !== null
    || props.speakingWordScale !== 1 || props.speakingWordLiftEm !== 0 || props.upcomingWordBlurEm > 0 || props.wordStateScope !== "word";
  const [open, setOpen] = useState(changed);
  const number = { onPreview, onPatch };
  return <InspectorDisclosure title="Word states" open={open} onOpenChange={setOpen}>
    <div className="grid min-w-0 gap-2.5">
      <InspectorPropertyControl fields="upcomingWords" label="Upcoming" disabled={false}
        onReset={() => onPatch({ upcomingWords: "shown" })}>
        <OptionSelect label="Upcoming" value={props.upcomingWords} size="sm"
          options={[{ value: "shown", label: "Shown" }, { value: "dimmed", label: "Dimmed" }, { value: "hidden", label: "Hidden" }]}
          onValueChange={(upcomingWords) => onPatch({ upcomingWords })} />
      </InspectorPropertyControl>
      {props.upcomingWords === "dimmed"
        ? <CaptionScaledNumber field="upcomingWordOpacity" label="Dim" value={props.upcomingWordOpacity} min={0} max={100} step={1} unit="%" scale={100} {...number} />
        : null}
      {props.upcomingWords === "hidden" ? null
        : <CaptionScaledNumber field="upcomingWordBlurEm" label="Blur" value={props.upcomingWordBlurEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />}
      <InspectorPropertyControl fields="wordStateScope" label="Changes by" disabled={false}
        onReset={() => onPatch({ wordStateScope: "word" })}>
        <OptionSelect label="Changes by" value={props.wordStateScope} size="sm"
          options={[{ value: "word", label: "Word" }, { value: "line", label: "Line" }]}
          onValueChange={(wordStateScope) => onPatch({ wordStateScope })} />
      </InspectorPropertyControl>
      <InspectorColorControl label="Speaking colour" ariaLabel="Speaking word colour"
        value={props.speakingWordColor ?? textColor} isCustom={props.speakingWordColor !== null}
        onChange={(speakingWordColor) => onPatch({ speakingWordColor })} onReset={() => onPatch({ speakingWordColor: null })} />
      <InspectorColorControl label="Said colour" ariaLabel="Said word colour"
        value={props.spokenWordColor ?? textColor} isCustom={props.spokenWordColor !== null}
        onChange={(spokenWordColor) => onPatch({ spokenWordColor })} onReset={() => onPatch({ spokenWordColor: null })} />
      <CaptionScaledNumber field="speakingWordScale" label="Size" value={props.speakingWordScale} min={100} max={200} step={1} unit="%" scale={100} {...number} />
      <CaptionScaledNumber field="speakingWordLiftEm" label="Lift" value={props.speakingWordLiftEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />
      <CaptionScaledNumber field="speakingWordOvershoot" label="Bounce" value={props.speakingWordOvershoot} min={0} max={100} step={1} unit="%" scale={100} {...number} />
      <CaptionScaledNumber field="wordStateSeconds" label="Change time" value={props.wordStateSeconds} min={0} max={0.6} step={0.01} unit="s" {...number} />
      <InspectorPropertyControl fields="speakingWordHoldsGap" label="Hold in pauses" disabled={false}
        onReset={() => onPatch({ speakingWordHoldsGap: true })}>
        <Checkbox aria-label="Hold in pauses" checked={props.speakingWordHoldsGap}
          onCheckedChange={(checked) => onPatch({ speakingWordHoldsGap: checked === true })} />
      </InspectorPropertyControl>
    </div>
  </InspectorDisclosure>;
}
