import type { CompositionElement } from "@/lib/render/composition-adapters";

export type CutoutReviewMode = "composite" | "base" | "cutout" | "matte";
export const CUTOUT_REVIEW_MODES: readonly CutoutReviewMode[] = ["composite", "base", "cutout", "matte"];

export function isAlphaCutout(element: Pick<CompositionElement, "props">): boolean {
  return element.props?.has_alpha === true;
}

/** Preview-only projection. Review state never persists into timeline JSON or export. */
export function applyCutoutReviewMode(
  elements: CompositionElement[],
  cutoutElementId: string | null,
  mode: CutoutReviewMode,
): CompositionElement[] {
  if (!cutoutElementId || mode === "composite") return elements;
  if (mode === "base") return elements.filter((element) => element.id !== cutoutElementId);

  const cutout = elements.find((element) => element.id === cutoutElementId);
  if (!cutout) return elements;
  return [{
    ...cutout,
    props: {
      ...(cutout.props ?? {}),
      cutout_review_mode: mode,
    },
  }];
}

export function cutoutReviewVideoStyle(element: Pick<CompositionElement, "props">) {
  return element.props?.cutout_review_mode === "matte"
    ? { filter: "brightness(0) invert(1)" }
    : {};
}
