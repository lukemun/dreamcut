"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { readSurfaceTrack, trackedQuadAtFrame } from "@/lib/timeline/surface-track";
import {
  captionDisplayText,
  captionFontFamily,
  captionPresetBaseXY,
  captionTypographyCSS,
  resolveCaptionAnchorLayout,
  resolveCaptionContentRect,
  resolveCaptionFontSizePx,
  resolveCaptionProps,
} from "@/lib/timeline/captions";

export type CaptionPointerDownPayload = {
  elementId: string;
  pointerClientX: number;
  pointerClientY: number;
  frameWidthPx: number;
  frameHeightPx: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
  initialAbsX: number;
  initialAbsY: number;
};

type Props = {
  elements: CompositionElement[];
  playheadSec: number;
  compositionDimensions: { width: number; height: number };
  selectedCaptionId: string | null;
  onCaptionPointerDown: (payload: CaptionPointerDownPayload) => void;
  onCaptionSelect?: (id: string) => void;
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sourceAspectRatioAtTime(elements: CompositionElement[], timeSec: number) {
  const visual = elements.find((element) =>
    element.lane_key.startsWith("visual_")
    && timeSec >= element.timeline_start
    && timeSec < element.timeline_start + element.duration,
  );
  const width = readFiniteNumber(visual?.props?.source_width);
  const height = readFiniteNumber(visual?.props?.source_height);
  return width != null && height != null && width > 0 && height > 0 ? width / height : null;
}

export function TimelineCaptionCanvasOverlay({
  elements,
  playheadSec,
  compositionDimensions,
  selectedCaptionId,
  onCaptionPointerDown,
  onCaptionSelect,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const update = () => {
      const rect = overlay.getBoundingClientRect();
      setOverlaySize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, []);

  const activeCaptions = useMemo(() => elements.filter((element) =>
    element.type === "caption_text"
    && element.lane_key.startsWith("captions_")
    && !element.props?.disabled
    && resolveCaptionProps(element.props).text.trim().length > 0
    && playheadSec >= element.timeline_start
    && playheadSec < element.timeline_start + element.duration,
  ), [elements, playheadSec]);

  const outputRatio = compositionDimensions.width / compositionDimensions.height;
  const compositionScale = overlaySize.width > 0
    ? overlaySize.width / compositionDimensions.width
    : 0;

  return (
    <div
      ref={overlayRef}
      data-caption-canvas-overlay="true"
      style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}
    >
      {compositionScale > 0 ? activeCaptions.map((element) => {
        const props = resolveCaptionProps(element.props);
        const track=readSurfaceTrack(element.props?.surface_track);
        if(track) {
          const quad=trackedQuadAtFrame(track,elements.find(e=>e.id===track.parentId),Math.round(playheadSec*30),compositionDimensions);
          if(!quad)return null;
          return <svg key={element.id} viewBox={`0 0 ${compositionDimensions.width} ${compositionDimensions.height}`} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
            <polygon points={quad.map(p=>p.join(",")).join(" ")} fill="transparent" stroke={selectedCaptionId===element.id?"#38a5ff":"none"} strokeWidth={2/compositionScale}
              role="button" tabIndex={0} aria-label={`Select text: ${props.text}`} style={{pointerEvents:"auto",cursor:"pointer"}}
              onClick={e=>{e.stopPropagation();onCaptionSelect?.(element.id);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onCaptionSelect?.(element.id);}}}/>
          </svg>;
        }
        const contentRect = resolveCaptionContentRect(
          sourceAspectRatioAtTime(elements, element.timeline_start),
          outputRatio,
        );
        const anchor = resolveCaptionAnchorLayout(props, contentRect);
        const fallback = captionPresetBaseXY(props.positionPreset, props.maxWidth);
        const absX = props.groupLayout || props.benchmarkStackLayout
          ? (anchor.x - contentRect.left) / contentRect.width
          : props.absX ?? fallback.x;
        const absY = props.groupLayout || props.benchmarkStackLayout
          ? (anchor.y - contentRect.top) / contentRect.height
          : props.absY ?? fallback.y;
        const selected = selectedCaptionId === element.id;
        const captionFontSizePx = resolveCaptionFontSizePx(
          props,
          props.maxWidth * contentRect.width * compositionDimensions.width,
        );
        const displayText = captionDisplayText(props);
        const anchorTransform = `translate(${anchor.horizontal.transformBaseX}, ${anchor.vertical.transformBaseY})`;
        const surfaceTransform = props.surfaceMode === "wall"
          ? `perspective(${props.surfacePerspectivePx * compositionScale}px) translateZ(${props.surfaceDepthPx * compositionScale}px) rotateX(${props.surfaceRotateXDeg}deg) rotateY(${props.surfaceRotateYDeg}deg) rotateZ(${props.surfaceRotateZDeg}deg) skew(${props.surfaceSkewXDeg}deg, ${props.surfaceSkewYDeg}deg)`
          : "";

        return (
          <button
            key={element.id}
            type="button"
            aria-label={`Select text: ${props.text}`}
            title="Drag to move"
            data-caption-canvas-element-id={element.id}
            data-caption-canvas-selected={selected ? "true" : "false"}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCaptionPointerDown({
                elementId: element.id,
                pointerClientX: event.clientX,
                pointerClientY: event.clientY,
                frameWidthPx: overlaySize.width,
                frameHeightPx: overlaySize.height,
                contentWidthRatio: contentRect.width,
                contentHeightRatio: contentRect.height,
                initialAbsX: absX,
                initialAbsY: absY,
              });
            }}
            style={{
              position: "absolute",
              left: anchor.horizontal.left,
              top: anchor.vertical.top,
              width: `${props.maxWidth * contentRect.width * 100}%`,
              minHeight: Math.max(18, captionFontSizePx * compositionScale * 1.05),
              margin: 0,
              padding: 0,
              border: selected ? "2px solid #67e8f9" : "2px solid transparent",
              borderRadius: 3,
              outline: "none",
              background: "transparent",
              color: "transparent",
              WebkitTextStrokeColor: "transparent",
              textShadow: "none",
              fontFamily: captionFontFamily(props.fontPreset),
              fontSize: captionFontSizePx * compositionScale,
              lineHeight: 1.05,
              whiteSpace: props.singleLine ? "nowrap" : "pre-wrap",
              textAlign: props.textAlign,
              textTransform: "none",
              cursor: "move",
              pointerEvents: "auto",
              transform: `${anchorTransform} ${surfaceTransform}`.trim(),
              transformOrigin: "center center",
              ...captionTypographyCSS(props.fontPreset),
            }}
          >
            {displayText}
          </button>
        );
      }) : null}
    </div>
  );
}
