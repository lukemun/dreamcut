"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { TIMELINE_ASPECT_RATIOS, TIMELINE_ASPECT_RATIO_VALUES, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import type { TimelineAspectRatio } from "./types";

export const VIDEO_SHAPES = TIMELINE_ASPECT_RATIO_VALUES;
export type VideoShape = TimelineAspectRatioValue;
const SHAPE_NAMES = Object.fromEntries(TIMELINE_ASPECT_RATIOS.map(({ value, shape }) => [value, shape.toLowerCase()])) as Record<VideoShape, string>;
const GLYPH: Record<VideoShape, { width: number; height: number }> = {
  "9:16": { width: 7, height: 12 }, "4:5": { width: 9, height: 11 }, "1:1": { width: 10, height: 10 }, "16:9": { width: 13, height: 8 },
};

/**
 * The project's video shape (output aspect ratio). Same saved value as Export's
 * aspect ratio; changing it records one Undo step and the workspace layout follows.
 */
export function VideoShapeControl({ value, onChange, disabled = false }: {
  value: TimelineAspectRatio;
  onChange: (value: VideoShape) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span id="video-shape-label">Shape</span>
      <SegmentedControl size="sm" role="group" aria-labelledby="video-shape-label">
        {VIDEO_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            aria-pressed={value === shape}
            aria-label={`${shape} ${SHAPE_NAMES[shape]}`}
            title={`${shape} ${SHAPE_NAMES[shape]}`}
            disabled={disabled}
            onClick={() => { if (value !== shape) onChange(shape); }}
          >
            <span aria-hidden="true" style={{ display: "block", ...GLYPH[shape], border: "1.5px solid currentColor", borderRadius: 2, boxSizing: "border-box", flexShrink: 0 }} />
            {shape}
          </button>
        ))}
      </SegmentedControl>
    </div>
  );
}
