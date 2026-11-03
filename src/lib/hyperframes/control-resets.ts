/**
 * When a control changes, the controls that declare `resets_with` it go back to their defaults:
 * switching a graphic's look keeps its words, timing and layout but drops the old look's palette,
 * texture and accent. Shared by the card, the inspector and the render route so all three agree.
 */
export type ResettableControl = { id: string; default: string | number | boolean; resets_with?: string };
export type ControlValues = Record<string, string | number | boolean>;

export function applyControlResets(controls: readonly ResettableControl[], previous: ControlValues, next: ControlValues): ControlValues {
  const changed = new Set(Object.keys(next).filter((id) => previous[id] !== undefined && next[id] !== previous[id]));
  if (!changed.size) return next;
  let out = next;
  for (const control of controls) {
    if (!control.resets_with || !changed.has(control.resets_with) || changed.has(control.id)) continue;
    if (out[control.id] === control.default) continue;
    out = { ...out, [control.id]: control.default };
  }
  return out;
}
