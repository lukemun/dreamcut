"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import { useEffect, type PointerEvent } from "react";
import { Check, Crosshair } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Keycap } from "@/components/ui/keycap";
import {
  frameTagPoints,
  type FrameTag,
  type FrameTagPoint,
} from "@/lib/review/frame-tag-types";

type Props = {
  armed: boolean;
  busy: boolean;
  tags: FrameTag[];
  playheadSec: number;
  onPick: (point: FrameTagPoint) => void;
  onCancel: () => void;
};

export function framePointsVisibleAtPlayhead(tags: FrameTag[], playheadSec: number) {
  const halfFrame = 0.5 / currentFrameRate();
  return tags.flatMap((tag) => {
    if (Math.abs(tag.timeline_seconds - playheadSec) > halfFrame) return [];
    return frameTagPoints(tag).map((point, index) => ({ tag, point, index }));
  });
}

export function normalizedFramePoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): FrameTagPoint {
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}

export function framePointPrompt(pointCount: number) {
  if (pointCount === 0) return "Click to add marks";
  return `${pointCount} mark${pointCount === 1 ? "" : "s"} · keep clicking`;
}

export function FramePointOverlay({
  armed,
  busy,
  tags,
  playheadSec,
  onPick,
  onCancel,
}: Props) {
  const visiblePoints = framePointsVisibleAtPlayhead(tags, playheadSec);
  const visiblePaths = tags
    .filter((tag) => Math.abs(tag.timeline_seconds - playheadSec) <= 0.5 / currentFrameRate())
    .map((tag) => ({ tag, points: frameTagPoints(tag) }))
    .filter(({ points }) => points.length > 1);

  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter") return;
      if (event.key === "Enter" && (
        event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey
        || (event.target instanceof Element && event.target.closest(
          'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
        ))
      )) return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [armed, onCancel]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!armed || busy || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onPick(normalizedFramePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    ));
  };

  return (
    <div
      data-frame-point-overlay="true"
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: armed ? 42 : 24,
        cursor: armed ? "crosshair" : undefined,
        pointerEvents: armed ? "auto" : "none",
      }}
    >
      {visiblePaths.length > 0 ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          {visiblePaths.map(({ tag, points }) => (
            <polyline
              key={tag.id}
              points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
              fill="none"
              stroke="var(--timeline-review-marker-color)"
              strokeWidth="0.45"
              strokeDasharray="1.2 0.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : null}

      {visiblePoints.map(({ tag, point, index }) => (
        <div
          key={`${tag.id}:${index}`}
          aria-label={`${tag.label} point ${index + 1}`}
          style={{
            position: "absolute",
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            width: 24,
            height: 24,
            transform: "translate(-50%, -50%)",
            display: "grid",
            placeItems: "center",
            border: "2px solid var(--timeline-review-marker-color)",
            borderRadius: "50%",
            background: "rgba(7, 10, 14, 0.72)",
            color: "var(--timeline-review-marker-color)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
          }}
        >
          <span
            style={{
              position: "absolute",
              // Near the right edge the label sits left of the pin so the frame never cuts it off.
              ...(point.x > 0.8 ? { right: "calc(100% + 6px)" } : { left: "calc(100% + 6px)" }),
              top: "50%",
              transform: "translateY(-50%)",
              padding: "2px 5px",
              borderRadius: "var(--edge-control-inner)",
              background: "rgba(7, 10, 14, 0.86)",
              color: "var(--timeline-review-marker-color)",
              font: "700 11px var(--font-mono, monospace)",
              whiteSpace: "nowrap",
            }}
          >
            {tag.label}
          </span>
          <Crosshair aria-hidden="true" size={14} strokeWidth={2.4} />
        </div>
      ))}

      {armed ? (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 11px",
            border: "1px solid color-mix(in srgb, var(--timeline-review-marker-color) 70%, transparent)",
            borderRadius: 999,
            background: "rgba(7, 10, 14, 0.86)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <Crosshair aria-hidden="true" size={14} />
          {framePointPrompt(visiblePoints.length)}
          {/* Enter and Escape also finish; the key on the button is the one to press. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-[var(--edge-pill)] px-2.5 text-xs bg-white/12 text-white hover:bg-white/20 hover:text-white"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }}
            aria-label="Done (Enter)"
            aria-keyshortcuts="Enter Escape"
            title="Done (Enter)"
          >
            <Check aria-hidden="true" />
            Done
            <Keycap>↵</Keycap>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
