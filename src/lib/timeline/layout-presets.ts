/**
 * Screen layouts: named arrangements of slots that clips fill (split screens, grids, picture in picture).
 * A layout is not its own timeline element. Applying it writes each clip's ordinary placement props
 * (mask_inset crop, media_scale, media_offset_x/y), so the result stays tunable, undoable and renders
 * like any other placed clip on both renderers.
 *
 * Slot rectangles are canvas fractions, front-most first: in picture in picture the small inset is
 * slot 0, so the clip on the top lane takes it.
 */
export type LayoutSlot = { x: number; y: number; w: number; h: number };
export type LayoutPreset = { id: string; label: string; slots: LayoutSlot[] };

const PIP = 0.3;
const MARGIN = 0.04;
const full: LayoutSlot = { x: 0, y: 0, w: 1, h: 1 };
const rows = (count: number): LayoutSlot[] => Array.from({ length: count }, (_, i) => ({ x: 0, y: i / count, w: 1, h: 1 / count }));
const columns = (count: number): LayoutSlot[] => Array.from({ length: count }, (_, i) => ({ x: i / count, y: 0, w: 1 / count, h: 1 }));
const pip = (right: boolean, bottom: boolean): LayoutSlot[] => [
  { x: right ? 1 - MARGIN - PIP : MARGIN, y: bottom ? 1 - MARGIN - PIP : MARGIN, w: PIP, h: PIP },
  full,
];

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  { id: "top-bottom", label: "Top & Bottom", slots: rows(2) },
  { id: "side-by-side", label: "Side by Side", slots: columns(2) },
  { id: "hero-top", label: "Hero on Top", slots: [{ x: 0, y: 0, w: 1, h: .5 }, { x: 0, y: .5, w: .5, h: .5 }, { x: .5, y: .5, w: .5, h: .5 }] },
  { id: "hero-bottom", label: "Hero on Bottom", slots: [{ x: 0, y: .5, w: 1, h: .5 }, { x: 0, y: 0, w: .5, h: .5 }, { x: .5, y: 0, w: .5, h: .5 }] },
  { id: "hero-left", label: "Hero on Left", slots: [{ x: 0, y: 0, w: .5, h: 1 }, { x: .5, y: 0, w: .5, h: .5 }, { x: .5, y: .5, w: .5, h: .5 }] },
  { id: "hero-right", label: "Hero on Right", slots: [{ x: .5, y: 0, w: .5, h: 1 }, { x: 0, y: 0, w: .5, h: .5 }, { x: 0, y: .5, w: .5, h: .5 }] },
  { id: "grid-2x2", label: "2×2 Grid", slots: [{ x: 0, y: 0, w: .5, h: .5 }, { x: .5, y: 0, w: .5, h: .5 }, { x: 0, y: .5, w: .5, h: .5 }, { x: .5, y: .5, w: .5, h: .5 }] },
  { id: "rows-3", label: "3 Rows", slots: rows(3) },
  { id: "rows-4", label: "4 Rows", slots: rows(4) },
  { id: "columns-3", label: "3 Columns", slots: columns(3) },
  { id: "columns-4", label: "4 Columns", slots: columns(4) },
  { id: "pip-bottom-right", label: "PIP · Bottom Right", slots: pip(true, true) },
  { id: "pip-top-right", label: "PIP · Top Right", slots: pip(true, false) },
  { id: "pip-bottom-left", label: "PIP · Bottom Left", slots: pip(false, true) },
  { id: "pip-top-left", label: "PIP · Top Left", slots: pip(false, false) },
];

export function layoutPreset(id: string) {
  return LAYOUT_PRESETS.find(preset => preset.id === id) ?? null;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Placement props that fill `slot` with a clip, cropped to the slot and scaled to cover it.
 * Media is contain-fitted to the canvas; the crop (mask_inset) is measured on the canvas, outside the
 * clip's own move and scale (resolved-media-scene order: mask, translate, scale).
 */
export function layoutSlotProps(slot: LayoutSlot, clipAspect: number, canvasAspect: number) {
  const fittedWidth = Math.min(1, clipAspect / canvasAspect);
  const fittedHeight = Math.min(1, canvasAspect / clipAspect);
  const scale = Math.min(3, Math.max(slot.w / fittedWidth, slot.h / fittedHeight));
  return {
    media_scale: round(scale),
    media_offset_x: round((slot.x + slot.w / 2 - .5) * 2),
    media_offset_y: round((slot.y + slot.h / 2 - .5) * 2),
    mask_inset: [round(slot.y), round(1 - slot.x - slot.w), round(1 - slot.y - slot.h), round(slot.x)] as [number, number, number, number],
  };
}

/** Pixel aspect of a placed clip from its prepared preview, or null when unknown. */
export function clipAspect(props: Record<string, unknown> | null | undefined): number | null {
  for (const key of ["preview_proxy_validation", "runtime_still_preview"]) {
    const box = props?.[key] as { width?: unknown; height?: unknown } | undefined;
    if (typeof box?.width === "number" && typeof box?.height === "number" && box.width > 0 && box.height > 0) return box.width / box.height;
  }
  return null;
}

/** What an agent reads when the creator selects a layout. */
export function layoutAgentText(preset: LayoutPreset) {
  const slots = preset.slots.map((slot, i) => `${i + 1}: x ${round(slot.x)}, y ${round(slot.y)}, w ${round(slot.w)}, h ${round(slot.h)}`).join("; ");
  return `Screen layout "${preset.label}" (${preset.slots.length} slots, canvas fractions, front-most first: ${slots}). `
    + "To use it, fill each slot with one overlapping visual clip by setting that clip's mask_inset to the slot "
    + "([top, right, bottom, left]) and its media_scale and media_offset_x/y so the picture covers the slot; "
    + "the editor's Layouts Add does this for selected clips.";
}
