import { InspectorEffectNumber } from "./InspectorEffectNumber";
import type { SubjectEffect } from "@/lib/timeline/clip-effects";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import type { TimelineElement } from "./types";
import { hasKeyframes, hasKeyframeAtTime, removeKeyframesAtTime, removeKeyframes, resolveNumberKeyframe, upsertKeyframe } from "@/lib/timeline/keyframes";

export function SubjectGlowControls({ element, time, onPatch, onPreview, effect }: {
  element: Pick<TimelineElement, "props">;
  time: number;
  effect: SubjectEffect;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const props = element.props ?? {};
  return <div className="grid gap-2">
    {([
      ["subject_flash", "White flash", 1, 0, 100, "%"],
      ["subject_glow", "Glow strength", 3, 0, 100, "%"],
      ["subject_glow_radius", "Glow radius", 80, 10, 1, "px"],
    ] as const).filter(([field]) => effect === 'flash' ? field === 'subject_flash' : field !== 'subject_flash').map(([field, label, max, identity, factor, unit]) => {
      const value = resolveNumberKeyframe(props, field, time, Number(props[field] ?? identity));
      const animated = hasKeyframes(props, field);
      const commit = (next: number) => {
        const bounded = Math.min(max, Math.max(0, next));
        onPatch(animated ? { keyframes: upsertKeyframe(props, field, time, bounded).keyframes } : { [field]: bounded });
      };
      const keyed = hasKeyframeAtTime(props, [field], time);
      const toggleTransitionKeyframe = () => {
        if (keyed) { onPatch({ keyframes: removeKeyframesAtTime(props, [field], time).keyframes }); return; }
        const initial = animated ? props : upsertKeyframe(props, field, 0, value);
        onPatch({ keyframes: upsertKeyframe(initial, field, time, value).keyframes });
      };
      return <InspectorPropertyControl key={field} fields={field} label={label} keyed={keyed} disabled={false}
        onToggle={toggleTransitionKeyframe}
        onReset={() => onPatch({ [field]: identity, keyframes: removeKeyframes(props, [field]).keyframes ?? {} })}>
        <InspectorEffectNumber key={`${field}-${time}`} label={label} value={Math.round(value * factor)} max={max * factor} unit={unit}
          onPreview={next => onPreview(next === null ? null : animated
            ? { keyframes: upsertKeyframe(props, field, time, next / factor).keyframes }
            : { [field]: next / factor })}
          onCommit={next => commit(next / factor)} />
      </InspectorPropertyControl>;
    })}
  </div>;
}
