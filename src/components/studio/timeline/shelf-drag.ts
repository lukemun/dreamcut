import type { ElementCreatePayload } from "./asset-shelf-payloads";

/** Panel items carry a ready element payload; the timeline decides only where it lands. */
export const SHELF_ELEMENT_MIME = "application/x-dreamcut-element";

export function setShelfDragPayload(event: React.DragEvent, payload: ElementCreatePayload, label: string) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(SHELF_ELEMENT_MIME, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", label);
}

export function hasShelfDragPayload(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes(SHELF_ELEMENT_MIME);
}

export function readShelfDragPayload(event: React.DragEvent): ElementCreatePayload | null {
  try {
    const parsed = JSON.parse(event.dataTransfer.getData(SHELF_ELEMENT_MIME)) as ElementCreatePayload;
    return parsed && typeof parsed.type === "string" && typeof parsed.lane_key === "string" && Number.isFinite(parsed.duration) ? parsed : null;
  } catch { return null; }
}
