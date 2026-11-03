"use client";
import { useEffect, useRef, useState } from "react";

import { PITCH_SEMITONES_MAX, PITCH_SEMITONES_MIN, readPitchSemitones } from "@/lib/timeline/audio-pitch";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { SliderScrubControl } from "./InspectorNumericControls";

/** Voice pitch for a clip's own sound (timeline/audio-pitch.ts): 0 st is as recorded, negative is deeper. */
export function AudioPitchControl({ props, disabled, onPreview, onPatch }: {
  props: Record<string, unknown> | null | undefined;
  disabled: boolean;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const value = readPitchSemitones(props);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  // An unfinished drag never outlives the control.
  const preview = useRef(onPreview);
  preview.current = onPreview;
  useEffect(() => () => preview.current(null), []);

  const parse = (next: string | undefined) => {
    const parsed = Number.parseFloat(next ?? draft);
    return Number.isFinite(parsed) ? Math.max(PITCH_SEMITONES_MIN, Math.min(PITCH_SEMITONES_MAX, parsed)) : value;
  };

  return (
    <InspectorPropertyControl density="compact" label="Pitch" fields="pitch_semitones" disabled={disabled}
      onReset={() => { onPreview(null); onPatch({ pitch_semitones: 0 }); }}>
      <SliderScrubControl
        density="compact"
        value={draft}
        min={PITCH_SEMITONES_MIN}
        max={PITCH_SEMITONES_MAX}
        step={0.5}
        fallback={0}
        label="pitch"
        unit="st"
        disabled={disabled}
        onChange={(next) => { setDraft(next); onPreview({ pitch_semitones: parse(next) }); }}
        onCommit={(next) => {
          const committed = parse(next);
          onPreview(null);
          if (committed !== value) onPatch({ pitch_semitones: committed });
        }}
        onCancel={() => { setDraft(String(value)); onPreview(null); }}
      />
    </InspectorPropertyControl>
  );
}
