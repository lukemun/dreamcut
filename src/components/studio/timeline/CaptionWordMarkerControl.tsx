"use client";
import { useState } from "react";
import { OptionSelect } from "@/components/ui/select";
import type { CaptionElementProps } from "@/lib/timeline/captions";
import { DEFAULT_CAPTION_WORD_MARKER } from "@/lib/timeline/caption-word-marker";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorColorControl } from "./InspectorColorControl";
import { CaptionScaledNumber } from "./CaptionWordStatesControl";

type Patch = Record<string, unknown>;

/**
 * A box, underline or growing bar behind the word being said (timeline/caption-word-marker.ts).
 * Shown for captions with aligned words.
 */
export function CaptionWordMarkerControl({ props, onPreview, onPatch }: {
  props: CaptionElementProps;
  onPreview: (patch: Patch | null) => void;
  onPatch: (patch: Patch) => void;
}) {
  const [open, setOpen] = useState(props.wordMarker !== "none");
  const number = { onPreview, onPatch };
  const marker = props.wordMarker;
  return <InspectorDisclosure title="Word marker" open={open} onOpenChange={setOpen}>
    <div className="grid min-w-0 gap-2.5">
      <InspectorPropertyControl fields="wordMarker" label="Marker" disabled={false}
        onReset={() => onPatch({ wordMarker: "none" })}>
        <OptionSelect label="Marker" value={marker} size="sm"
          options={[{ value: "none", label: "None" }, { value: "box", label: "Box" }, { value: "underline", label: "Underline" }, { value: "bar", label: "Growing bar" }]}
          onValueChange={(wordMarker) => onPatch({ wordMarker })} />
      </InspectorPropertyControl>
      {marker === "none" ? null : <>
        <InspectorColorControl label="Colour" ariaLabel="Word marker colour"
          value={props.wordMarkerColor} isCustom={props.wordMarkerColor !== DEFAULT_CAPTION_WORD_MARKER.wordMarkerColor}
          onChange={(wordMarkerColor) => onPatch({ wordMarkerColor })}
          onReset={() => onPatch({ wordMarkerColor: DEFAULT_CAPTION_WORD_MARKER.wordMarkerColor })} />
        <CaptionScaledNumber field="wordMarkerOpacity" label="Opacity" value={props.wordMarkerOpacity} min={0} max={100} step={1} unit="%" scale={100} {...number} />
        {marker === "box" ? null
          : <CaptionScaledNumber field="wordMarkerThicknessEm" label="Thickness" value={props.wordMarkerThicknessEm} min={2} max={120} step={1} unit="%" scale={100} {...number} />}
        <CaptionScaledNumber field="wordMarkerRadiusEm" label="Corners" value={props.wordMarkerRadiusEm} min={0} max={60} step={1} unit="%" scale={100} {...number} />
        {marker === "bar" ? null : <>
          <CaptionScaledNumber field="wordMarkerPadEm" label="Padding" value={props.wordMarkerPadEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />
          <InspectorPropertyControl fields="wordMarkerMotion" label="Move" disabled={false}
            onReset={() => onPatch({ wordMarkerMotion: "snap" })}>
            <OptionSelect label="Move" value={props.wordMarkerMotion} size="sm"
              options={[{ value: "snap", label: "Cut" }, { value: "pop", label: "Pop" }, { value: "slide", label: "Slide" }]}
              onValueChange={(wordMarkerMotion) => onPatch({ wordMarkerMotion })} />
          </InspectorPropertyControl>
          {props.wordMarkerMotion === "snap" ? null
            : <CaptionScaledNumber field="wordMarkerSeconds" label="Move time" value={props.wordMarkerSeconds} min={0} max={0.6} step={0.01} unit="s" {...number} />}
        </>}
      </>}
    </div>
  </InspectorDisclosure>;
}
