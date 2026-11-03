"use client";
import type { CaptionElementProps } from "@/lib/timeline/captions";
import { DEFAULT_CAPTION_PAGE_LAYOUT } from "@/lib/timeline/caption-page-layout";
import { OptionSelect } from "@/components/ui/select";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { CaptionScaledNumber } from "./CaptionWordStatesControl";

type Patch = Record<string, unknown>;

/** How a caption page sits: its tilt and how many words go on a line (timeline/caption-page-layout.ts). */
export function CaptionPageControl({ props, onPreview, onPatch }: {
  props: CaptionElementProps;
  onPreview: (patch: Patch | null) => void;
  onPatch: (patch: Patch) => void;
}) {
  const number = { onPreview, onPatch };
  return <>
    <InspectorPropertyControl fields="pageTilt" label="Tilt" disabled={false} onReset={() => onPatch({ pageTilt: DEFAULT_CAPTION_PAGE_LAYOUT.pageTilt })}>
      <OptionSelect label="Page tilt" value={props.pageTilt} size="sm"
        options={[{ value: "none", label: "Level" }, { value: "lean", label: "Lean left or right" }, { value: "scatter", label: "Scatter" }]}
        onValueChange={(pageTilt) => onPatch({ pageTilt })} />
    </InspectorPropertyControl>
    {props.pageTilt !== "none"
      ? <CaptionScaledNumber field="pageTiltDeg" label="Tilt angle" value={props.pageTiltDeg} min={0} max={20} step={0.5} unit="°" {...number} />
      : null}
    <CaptionScaledNumber field="wordsPerLine" label="Words per line" value={props.wordsPerLine} min={0} max={12} step={1} unit="" {...number} />
  </>;
}
