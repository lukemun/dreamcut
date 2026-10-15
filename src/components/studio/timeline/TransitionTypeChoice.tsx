"use client";
import { InspectorVisualChoice } from "./InspectorVisualChoice";
import { TransitionThumbnail } from "./TransitionThumbnail";
import type { TimelineTransitionType } from "./types";
import { TIMELINE_TRANSITION_TYPES } from "@/lib/timeline/contracts";
const types = TIMELINE_TRANSITION_TYPES;
export function TransitionTypeChoice({value, onChange, disabled = false}: {value?: TimelineTransitionType; onChange: (type: TimelineTransitionType) => void; disabled?: boolean}) {
  return <InspectorVisualChoice centered label="Transition type" value={value ?? ""} disabled={disabled}
    options={types.map(type => ({value: type, label: type === "fade" ? "Crossfade" : type.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()), preview: <TransitionThumbnail type={type} />}))}
    onChange={type => {if (type) onChange(type as TimelineTransitionType);}} />;
}
