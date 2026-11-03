import type { CompositionElement } from "@/lib/render/composition-adapters";

import { hasChromaKeyData, resetChromaKey } from "./chroma-key";

/**
 * Inspector-only ways to look at a chroma key while tuning it. This mirrors the
 * cutout review modes: a projection applied to the elements handed to the Player,
 * never written to `timeline.json` and never reaching the export.
 */
export type ChromaKeyReviewMode = "composite" | "source" | "key" | "matte";

export const CHROMA_KEY_REVIEW_MODES: readonly ChromaKeyReviewMode[] = [
  "composite",
  "source",
  "key",
  "matte",
];

export const CHROMA_KEY_REVIEW_MODE_LABEL: Record<ChromaKeyReviewMode, string> = {
  composite: "Composite",
  source: "Source (key off)",
  key: "Key only",
  matte: "Alpha matte",
};

export function isChromaKeyed(element: Pick<CompositionElement, "type" | "props">): boolean {
  return element.type === "video_clip" && hasChromaKeyData(element.props);
}

/** Preview-only projection. Review state never persists into timeline JSON or export. */
export function applyChromaKeyReviewMode(
  elements: CompositionElement[],
  keyedElementId: string | null,
  mode: ChromaKeyReviewMode,
): CompositionElement[] {
  if (!keyedElementId || mode === "composite") return elements;

  const keyed = elements.find((element) => element.id === keyedElementId);
  if (!keyed) return elements;

  // Turning the key off in place is what lets the eyedropper see the real backdrop.
  if (mode === "source") {
    return elements.map((element) =>
      element.id === keyedElementId
        ? { ...element, props: resetChromaKey(element.props) }
        : element,
    );
  }

  // "key" and "matte" isolate the clip so nothing underneath disguises a bad edge.
  return [{
    ...keyed,
    props: { ...(keyed.props ?? {}), chroma_key_review_mode: mode },
  }];
}

/**
 * The matte view. `colorKey()` has already written alpha, so flattening every
 * surviving pixel to white over the composition's black background reads as the
 * classic white-is-kept / black-is-removed matte.
 */
export function chromaKeyReviewVideoStyle(element: Pick<CompositionElement, "props">) {
  return element.props?.chroma_key_review_mode === "matte"
    ? { filter: "brightness(0) invert(1)" }
    : {};
}
