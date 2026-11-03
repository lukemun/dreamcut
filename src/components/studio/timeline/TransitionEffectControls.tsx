import { InspectorEffectNumber } from "./InspectorEffectNumber";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import type { TimelineElement } from "./types";
import { hasKeyframes, hasKeyframeAtTime, removeKeyframesAtTime, removeKeyframes, resolveNumberKeyframe, upsertKeyframe } from "@/lib/timeline/keyframes";

export function TransitionEffectControls({ element, time, onPatch, onPreview }: {
  element: Pick<TimelineElement, "props">;
  time: number;
  onPreview: (patch: Record<string, unknown> | null) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const props = element.props ?? {};
  return <div className="grid gap-2">
    {([
      ["iris_radius", "Oval reveal", 2, 2, 100, "%"],
      ["iris_feather", "Oval feather", .8, .08, 100, "%"],
      ["zoom_blur", "Edge blur", 40, 0, 1, "px"],
      ["transition_blur", "Blur", 40, 0, 1, "px"],
      ["directional_blur_x", "Horizontal blur", 1080, 0, 1, "px"],
      ["directional_blur_y", "Vertical blur", 1080, 0, 1, "px"],
    ] as const).map(([field, label, max, identity, factor, unit]) => {
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
    {([ ["window_open_duration", "Window opening", 10, .1, "s"], ["window_corner_radius", "Window roundness", 200, 1, "px"], ["window_side_margin_percent", "Window side margins", 45, 1, "%"], ["window_vertical_margin_percent", "Window top / bottom space", 45, 1, "%"], ["window_center_y_percent", "Window vertical center", 100, .1, "%"] ] as const).map(([field,label,max,step,unit]) =>
      <InspectorPropertyControl key={field} fields={field} label={label} disabled={false} onReset={() => onPatch({[field]:field === "window_center_y_percent" ? 50 : 0})}>
        <InspectorEffectNumber key={`${field}-${time}`} label={label} value={Number(props[field] ?? (field === "window_center_y_percent" ? 50 : 0))} max={max} step={step} unit={unit}
          onPreview={value => onPreview(value === null ? null : {[field]:value})} onCommit={value => onPatch({[field]:value})} />
      </InspectorPropertyControl>)}
  </div>;
}
