"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, MoveIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SliderScrubControl } from "./InspectorNumericControls";
import { clampMediaScale, resolveMediaTransformAtTime, type MediaTransformProps } from "@/lib/timeline/media-transform";
import { containRect, transformForSourceCenter, visibleSourceRect, type FrameSize } from "@/lib/timeline/framing-geometry";
import { resolveVideoPlaybackSource } from "@/lib/remotion/video-preview-source";
import { timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";

import type { TimelineElement } from "./types";

type DraftStrings = { scale: string; offsetX: string; offsetY: string };

type Props = {
  element: TimelineElement;
  composition: FrameSize;
  localPlayheadSeconds: number;
  editMediaScale: string;
  editMediaOffsetX: string;
  editMediaOffsetY: string;
  setEditMediaScale: (value: string) => void;
  setEditMediaOffsetX: (value: string) => void;
  setEditMediaOffsetY: (value: string) => void;
  previewVisualTransform: (overrides?: DraftStrings) => void;
  clearVisualTransformPreview: () => void;
  commitVisualTransformValues: (values: DraftStrings) => void | Promise<unknown>;
  resetVisualTransform: () => void;
};

function parseTransform(scale: string, offsetX: string, offsetY: string): MediaTransformProps {
  return {
    scale: clampMediaScale(Number.parseFloat(scale) || 1),
    offsetX: Math.max(-1, Math.min(1, Number.parseFloat(offsetX) || 0)),
    offsetY: Math.max(-1, Math.min(1, Number.parseFloat(offsetY) || 0)),
  };
}

function formatDraft(transform: MediaTransformProps): DraftStrings {
  return {
    scale: transform.scale.toFixed(2),
    offsetX: transform.offsetX.toFixed(3),
    offsetY: transform.offsetY.toFixed(3),
  };
}

export function VisualFramingEditor({
  element,
  composition,
  localPlayheadSeconds,
  editMediaScale,
  editMediaOffsetX,
  editMediaOffsetY,
  setEditMediaScale,
  setEditMediaOffsetX,
  setEditMediaOffsetY,
  previewVisualTransform,
  clearVisualTransformPreview,
  commitVisualTransformValues,
  resetVisualTransform,
}: Props) {
  const sourceStageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; deltaX: number; deltaY: number } | null>(null);
  const [stageSize, setStageSize] = useState<FrameSize>({ width: 280, height: 240 });
  const [intrinsicSize, setIntrinsicSize] = useState<FrameSize>(() => ({
    width: typeof element.props?.source_width === "number" ? element.props.source_width : 1080,
    height: typeof element.props?.source_height === "number" ? element.props.source_height : 1920,
  }));
  const clearPreviewRef = useRef(clearVisualTransformPreview);
  clearPreviewRef.current = clearVisualTransformPreview;
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => () => { if (dirtyRef.current) clearPreviewRef.current(); }, []);
  const [saving, setSaving] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  const transform = useMemo(
    () => parseTransform(editMediaScale, editMediaOffsetX, editMediaOffsetY),
    [editMediaOffsetX, editMediaOffsetY, editMediaScale],
  );
  const crop = useMemo(
    () => visibleSourceRect(intrinsicSize, composition, transform),
    [composition, intrinsicSize, transform],
  );
  const sourceRect = useMemo(() => containRect(intrinsicSize, stageSize), [intrinsicSize, stageSize]);
  const playbackSource = element.type === "video_clip"
    ? resolveVideoPlaybackSource(element, element.source_url, false)
    : element.source_url;
  const sourceTime = Math.max(0, timelineTimeToSourceTime(element, localPlayheadSeconds));
  const isProcessedSource = typeof element.props?.proxy_transform === "string";

  const drawResult = useCallback(() => {
    const canvas = resultCanvasRef.current;
    const media = element.type === "video_clip" ? videoRef.current : imageRef.current;
    if (!canvas || !media || !mediaReady) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#080808";
    context.fillRect(0, 0, width, height);
    const base = containRect(intrinsicSize, { width, height });
    const drawWidth = base.width * transform.scale;
    const drawHeight = base.height * transform.scale;
    const drawX = (width - drawWidth) / 2 + transform.offsetX * width / 2;
    const drawY = (height - drawHeight) / 2 + transform.offsetY * height / 2;
    context.drawImage(media, drawX, drawY, drawWidth, drawHeight);
  }, [element.type, intrinsicSize, mediaReady, transform]);

  useEffect(() => {
    const stage = sourceStageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDirty(false);
    setMediaReady(false);
    setMediaError(false);
  }, [element.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaReady || !Number.isFinite(video.duration)) return;
    const target = Math.min(Math.max(0, video.duration - 0.04), sourceTime);
    if (Math.abs(video.currentTime - target) > 0.025) video.currentTime = target;
    else drawResult();
  }, [drawResult, mediaReady, sourceTime]);

  useEffect(() => {
    drawResult();
  }, [drawResult]);

  const updateDraft = useCallback((next: MediaTransformProps) => {
    const values = formatDraft(next);
    setEditMediaScale(values.scale);
    setEditMediaOffsetX(values.offsetX);
    setEditMediaOffsetY(values.offsetY);
    previewVisualTransform(values);
    setDirty(true);
  }, [previewVisualTransform, setEditMediaOffsetX, setEditMediaOffsetY, setEditMediaScale]);

  const normalizedPoint = useCallback((event: PointerEvent | ReactPointerEvent) => ({
    x: Math.max(0, Math.min(1, (event.clientX - (sourceStageRef.current?.getBoundingClientRect().left ?? 0) - sourceRect.x) / sourceRect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - (sourceStageRef.current?.getBoundingClientRect().top ?? 0) - sourceRect.y) / sourceRect.height)),
  }), [sourceRect]);

  const onCropPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = normalizedPoint(event);
    dragRef.current = {
      pointerId: event.pointerId,
      deltaX: point.x - (crop.x + crop.width / 2),
      deltaY: point.y - (crop.y + crop.height / 2),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCropPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = normalizedPoint(event);
    updateDraft(transformForSourceCenter(intrinsicSize, composition, transform.scale, {
      x: point.x - drag.deltaX,
      y: point.y - drag.deltaY,
    }));
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const cancelDraft = () => {
    const committed = resolveMediaTransformAtTime(element.props, localPlayheadSeconds);
    const values = formatDraft(committed);
    setEditMediaScale(values.scale);
    setEditMediaOffsetX(values.offsetX);
    setEditMediaOffsetY(values.offsetY);
    clearVisualTransformPreview();
    setDirty(false);
  };

  return (
    <div data-visual-framing-editor className="grid gap-3 rounded-xl border border-[var(--chrome-line-strong)] bg-[var(--chrome-deep)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <strong className="text-sm text-[var(--ink)]">Frame in canvas</strong>
        </div>
        {isProcessedSource ? <span className="shrink-0 rounded-full border border-[var(--chrome-line-strong)] bg-[var(--chrome-raised)] px-2 py-1 text-[0.72rem] font-semibold text-[var(--ink)]">Processed source</span> : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.62fr)] gap-3">
        <div className="grid content-start gap-1.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">Source</span>
          <div ref={sourceStageRef} className="relative h-60 overflow-hidden rounded-lg border border-[var(--chrome-line-strong)] bg-black">
            {element.type === "video_clip" ? (
              <video
                ref={videoRef}
                src={playbackSource ?? undefined}
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 size-full object-contain"
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (video.videoWidth > 0 && video.videoHeight > 0) setIntrinsicSize({ width: video.videoWidth, height: video.videoHeight });
                  setMediaReady(true);
                }}
                onLoadedData={drawResult}
                onSeeked={drawResult}
                onError={() => setMediaError(true)}
              />
            ) : (
              <img
                ref={imageRef}
                src={playbackSource ?? undefined}
                alt="Selected source"
                className="absolute inset-0 size-full object-contain"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) setIntrinsicSize({ width: image.naturalWidth, height: image.naturalHeight });
                  setMediaReady(true);
                  requestAnimationFrame(drawResult);
                }}
                onError={() => setMediaError(true)}
              />
            )}
            {!mediaReady && !mediaError ? <span className="absolute inset-0 grid place-items-center text-sm text-white/80">Loading frame…</span> : null}
            {mediaError ? <span className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-white">This playback source could not be decoded.</span> : null}
            <button
              type="button"
              aria-label="Drag visible frame"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              className="absolute grid touch-none place-items-center border-2 border-white bg-white/8 shadow-[0_0_0_999px_rgba(0,0,0,0.48)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
              style={{
                left: sourceRect.x + crop.x * sourceRect.width,
                top: sourceRect.y + crop.y * sourceRect.height,
                width: Math.max(18, crop.width * sourceRect.width),
                height: Math.max(18, crop.height * sourceRect.height),
                cursor: "grab",
              }}
            >
              <MoveIcon aria-hidden="true" className="size-5 text-white drop-shadow" />
            </button>
          </div>
        </div>

        <div className="grid content-start gap-1.5">
          <span className="text-[13px] font-medium text-[var(--ink)]">Result</span>
          <div className="overflow-hidden rounded-lg border border-[var(--chrome-line-strong)] bg-black" style={{ aspectRatio: `${composition.width} / ${composition.height}` }}>
            <canvas ref={resultCanvasRef} width={270} height={Math.round(270 * composition.height / composition.width)} className="block size-full" />
          </div>
          <span className="text-center font-mono text-[0.72rem] text-[var(--ink-secondary)]">{(transform.scale * 100).toFixed(0)}% · Horizontal {(transform.offsetX * 50).toFixed(1)}% · Vertical {(transform.offsetY * 50).toFixed(1)}%</span>
        </div>
      </div>

      {isProcessedSource ? <p className="m-0 rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-2.5 text-[0.8rem] leading-5 text-[var(--ink)]">Processed file — reframing can’t restore removed pixels.</p> : null}

      <div className="grid gap-1.5">
        <span className="text-xs text-[var(--ink-secondary)]">Size</span>
        <SliderScrubControl
          label="Framing size" value={String(transform.scale * 100)}
          min={10} max={300} step={1} fallback={100} unit="%" density="compact" disabled={saving}
          onChange={(value) => updateDraft({ ...transform, scale: Number(value) / 100 })}
          onCommit={(value) => { if (value != null) updateDraft({ ...transform, scale: Number(value) / 100 }); }}
          onCancel={cancelDraft}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Button variant="default" size="studio" disabled={!dirty || saving} onClick={async () => {
          setSaving(true);
          try {
            const saved = await commitVisualTransformValues(formatDraft(transform));
            if (saved !== false) setDirty(false);
          } finally { setSaving(false); }
        }}>
          <CheckIcon data-icon="inline-start" /> {saving ? "Saving framing…" : "Apply framing"}
        </Button>
        <Button variant="outline" size="studio" disabled={!dirty} onClick={cancelDraft}>Cancel</Button>
        <Button variant="outline" size="icon-lg" title="Reset framing" aria-label="Reset framing" onClick={() => { clearVisualTransformPreview(); resetVisualTransform(); setDirty(false); }}>
          <RotateCcwIcon />
        </Button>
      </div>
    </div>
  );
}
