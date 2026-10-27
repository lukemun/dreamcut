"use client";
import { HANDWRITING_WEIGHT, normalizeHandwritingWeight } from "@/lib/timeline/handwriting-weight";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorEffectNumber } from "./InspectorEffectNumber";

export function HandwritingWeightControl({ value, onPreview, onPatch }: {
  value: unknown;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  return <div>
    <InspectorPropertyControl fields="handwritingWeight" label="Ink weight" disabled={false}
      onReset={() => onPatch({ handwritingWeight: HANDWRITING_WEIGHT.defaultValue })}>
      <InspectorEffectNumber label="Ink weight" value={normalizeHandwritingWeight(value)}
        min={HANDWRITING_WEIGHT.min} max={HANDWRITING_WEIGHT.max} step={HANDWRITING_WEIGHT.step} unit="%"
        onPreview={next => onPreview(next === null ? null : { handwritingWeight: next })}
        onCommit={next => onPatch({ handwritingWeight: next })} />
    </InspectorPropertyControl>
  </div>;
}
