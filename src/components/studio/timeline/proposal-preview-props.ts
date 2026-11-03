/** Picture dials the player can show at once, before the server's full preview arrives. */
const INSTANT_PREVIEW_FIELDS = new Set(["media_scale", "media_offset_x", "media_offset_y", "media_opacity", "absX", "absY", "fontSizePx"]);

type ReviewChange = { field: string; target: string; operation_index: number };
type ReviewRow = { element_id: string; changes: ReviewChange[] };
type Override = { operation_index: number; target: string; field: string; value: number | string | number[] };

export type InstantPreviewProp = { elementId: string; field: string; value: number };

/** The tuned values that only restyle one existing draft element, keyed to that element. */
export function instantPreviewProps(rows: readonly ReviewRow[], overrides: readonly Override[]): InstantPreviewProp[] {
  return overrides.flatMap((override) => {
    if (typeof override.value !== "number" || !INSTANT_PREVIEW_FIELDS.has(override.field)) return [];
    if (!["props", "create_visual", "create_text", "create_shape"].includes(override.target)) return [];
    const row = rows.find((candidate) => candidate.changes.some((change) => change.operation_index === override.operation_index
      && change.target === override.target && change.field === override.field));
    return row ? [{ elementId: row.element_id, field: override.field, value: override.value }] : [];
  });
}

/** Draft elements with those values applied; untouched elements keep their identity. */
export function applyInstantPreviewProps<T extends { id: string; props?: Record<string, unknown> | null }>(elements: readonly T[], props: readonly InstantPreviewProp[]): T[] {
  if (props.length === 0) return [...elements];
  return elements.map((element) => {
    const own = props.filter((prop) => prop.elementId === element.id);
    return own.length ? { ...element, props: { ...(element.props ?? {}), ...Object.fromEntries(own.map((prop) => [prop.field, prop.value])) } } : element;
  });
}
