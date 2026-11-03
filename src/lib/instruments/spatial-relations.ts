import type { Canvas, Rect } from "@/lib/instruments/frame-state";
import { resolveMaskInsetAtTime } from "@/lib/timeline/media-transform";

type ElementLike = {
  id: string;
  type: string;
  timeline_start: number;
  props?: Record<string, unknown> | null;
};

export type GapExpectation = {
  captionId: string;
  visualId: string;
  minPx: number;
  maxPx: number;
};

export type SpatialRelationState = {
  subject: { id: string; kind: "caption_ink"; edge: "bottom"; bounds: Rect };
  target: { id: string; kind: "visual_mask"; edge: "top"; bounds: Rect };
  /** Positive is clear space, zero is touching, negative is overlap. */
  signedGapPx: number;
  signedGapPctOfFrameHeight: number;
  relation: "above_with_clearance" | "touching" | "overlapping";
  statement: string;
  expectation: { minPx: number; maxPx: number; status: "pass" | "fail" } | null;
};

export function visualMaskRectAt(element: ElementLike, atSeconds: number, canvas: Canvas): Rect {
  const localSeconds = Math.max(0, atSeconds - element.timeline_start);
  const mask = resolveMaskInsetAtTime(element.props, localSeconds);
  return {
    left: mask.left * canvas.width,
    top: mask.top * canvas.height,
    right: (1 - mask.right) * canvas.width,
    bottom: (1 - mask.bottom) * canvas.height,
  };
}

export function captionBottomToMaskTopRelation(args: {
  captionId: string;
  captionText: string;
  inkBounds: Rect;
  visual: ElementLike;
  atSeconds: number;
  canvas: Canvas;
  expectation?: GapExpectation | null;
}): SpatialRelationState {
  const targetBounds = visualMaskRectAt(args.visual, args.atSeconds, args.canvas);
  const signedGapPx = Number((targetBounds.top - args.inkBounds.bottom).toFixed(2));
  const relation = Math.abs(signedGapPx) < 0.5
    ? "touching"
    : signedGapPx > 0
      ? "above_with_clearance"
      : "overlapping";
  const distance = Math.abs(signedGapPx);
  const phrase = relation === "touching"
    ? "touches"
    : relation === "above_with_clearance"
      ? `is ${distance}px above`
      : `overlaps by ${distance}px past`;
  const expectation = args.expectation
    ? {
        minPx: args.expectation.minPx,
        maxPx: args.expectation.maxPx,
        status: signedGapPx >= args.expectation.minPx && signedGapPx <= args.expectation.maxPx
          ? "pass" as const
          : "fail" as const,
      }
    : null;

  return {
    subject: { id: args.captionId, kind: "caption_ink", edge: "bottom", bounds: args.inkBounds },
    target: { id: args.visual.id, kind: "visual_mask", edge: "top", bounds: targetBounds },
    signedGapPx,
    signedGapPctOfFrameHeight: Number(((signedGapPx / args.canvas.height) * 100).toFixed(3)),
    relation,
    statement: `“${args.captionText}” visible ink ${phrase} visual ${args.visual.id}'s mask top.`,
    expectation,
  };
}

export function parseGapExpectation(value: string | undefined): GapExpectation | null {
  if (!value) return null;
  const [captionId, visualId, minRaw, maxRaw, ...extra] = value.split(":");
  const minPx = Number(minRaw);
  const maxPx = Number(maxRaw);
  if (!captionId || !visualId || extra.length > 0 || !Number.isFinite(minPx) || !Number.isFinite(maxPx) || minPx > maxPx) {
    throw new Error("--expect-gap must be captionId:visualId:minPx:maxPx (for example caption-1:video-1:0:6).");
  }
  return { captionId, visualId, minPx, maxPx };
}
