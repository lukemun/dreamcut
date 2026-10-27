"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  evaluateMotionKeyframes,
  motionKeyframesFromPoints,
  type MotionCurveKeyframe,
  type MotionCurveKeyframes,
  type MotionCurvePoint,
} from "@/lib/timeline/captions";

const WIDTH = 320;
const HEIGHT = 218;
const LEFT = 38;
const TOP = 18;
const PLOT_WIDTH = 254;
const PLOT_HEIGHT = 146;
const MIN_GAP = 0.025;

type DragTarget =
  | { kind: "point"; index: number }
  | { kind: "in"; index: number }
  | { kind: "out"; index: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneKeyframes(value: MotionCurveKeyframes): MotionCurveKeyframes {
  return value.map((keyframe) => ({
    ...keyframe,
    inHandle: [...keyframe.inHandle],
    outHandle: [...keyframe.outHandle],
  }));
}

function graphPoint(time: number, progress: number) {
  return {
    x: LEFT + time * PLOT_WIDTH,
    y: TOP + (1 - progress) * PLOT_HEIGHT,
  };
}

function curvePath(keyframes: MotionCurveKeyframes) {
  return keyframes.map((keyframe, index) => {
    const point = graphPoint(keyframe.time, keyframe.progress);
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = keyframes[index - 1];
    const outgoing = graphPoint(
      previous.time + previous.outHandle[0],
      previous.progress + previous.outHandle[1],
    );
    const incoming = graphPoint(
      keyframe.time + keyframe.inHandle[0],
      keyframe.progress + keyframe.inHandle[1],
    );
    return `C ${outgoing.x} ${outgoing.y} ${incoming.x} ${incoming.y} ${point.x} ${point.y}`;
  }).join(" ");
}

function automaticKeyframes(keyframes: MotionCurveKeyframes) {
  return motionKeyframesFromPoints(
    keyframes.map(({ time, progress }) => [time, progress] as MotionCurvePoint),
  );
}

export function MotionCurveEditor({
  value,
  onCommit,
}: {
  value: MotionCurveKeyframes;
  onCommit: (value: MotionCurveKeyframes) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef(cloneKeyframes(value));
  const valueRef = useRef(value);
  const draggingRef = useRef<DragTarget | null>(null);
  const [draft, setDraft] = useState(() => cloneKeyframes(value));
  const [selected, setSelected] = useState(() => Math.min(2, value.length - 1));
  const valueSignature = JSON.stringify(value);
  valueRef.current = value;

  useEffect(() => {
    if (draggingRef.current) return;
    const next = cloneKeyframes(valueRef.current);
    draftRef.current = next;
    setDraft(next);
    setSelected((current) => Math.min(current, next.length - 1));
  }, [valueSignature]);

  const publishDraft = (next: MotionCurveKeyframes) => {
    draftRef.current = next;
    setDraft(next);
  };

  const pointerCoordinates = (event: { clientX: number; clientY: number }) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      time: clamp((((event.clientX - bounds.left) / bounds.width) * WIDTH - LEFT) / PLOT_WIDTH, 0, 1),
      progress: clamp(1 - (((event.clientY - bounds.top) / bounds.height) * HEIGHT - TOP) / PLOT_HEIGHT, 0, 1),
    };
  };

  const movePoint = (index: number, time: number, progress: number) => {
    const next = cloneKeyframes(draftRef.current);
    const previous = next[index - 1];
    const following = next[index + 1];
    if (!previous || !following) return;
    next[index].time = clamp(time, previous.time + MIN_GAP, following.time - MIN_GAP);
    next[index].progress = clamp(progress, previous.progress, following.progress);
    const smoothed = automaticKeyframes(next);
    smoothed[index].linked = next[index].linked;
    publishDraft(smoothed);
  };

  const moveHandle = (kind: "in" | "out", index: number, time: number, progress: number) => {
    const next = cloneKeyframes(draftRef.current);
    const keyframe = next[index];
    const previous = next[index - 1];
    const following = next[index + 1];
    if (kind === "in" && previous) {
      const dx = clamp(time - keyframe.time, previous.time - keyframe.time, 0);
      const dy = clamp(progress - keyframe.progress, previous.progress - keyframe.progress, 0);
      keyframe.inHandle = [dx, dy];
      if (keyframe.linked && following && dx !== 0) {
        const outX = keyframe.outHandle[0] || (following.time - keyframe.time) / 3;
        keyframe.outHandle = [
          outX,
          clamp((dy / dx) * outX, 0, following.progress - keyframe.progress),
        ];
      }
    } else if (kind === "out" && following) {
      const dx = clamp(time - keyframe.time, 0, following.time - keyframe.time);
      const dy = clamp(progress - keyframe.progress, 0, following.progress - keyframe.progress);
      keyframe.outHandle = [dx, dy];
      if (keyframe.linked && previous && dx !== 0) {
        const inX = keyframe.inHandle[0] || -(keyframe.time - previous.time) / 3;
        keyframe.inHandle = [
          inX,
          clamp((dy / dx) * inX, previous.progress - keyframe.progress, 0),
        ];
      }
    }
    publishDraft(next);
  };

  const addPointAt = (time: number) => {
    if (draftRef.current.length >= 12 || time <= MIN_GAP || time >= 1 - MIN_GAP) return;
    if (draftRef.current.some((keyframe) => Math.abs(keyframe.time - time) < MIN_GAP)) return;
    const progress = evaluateMotionKeyframes(draftRef.current, time);
    const points = draftRef.current
      .map(({ time: pointTime, progress: pointProgress }) => [pointTime, pointProgress] as MotionCurvePoint)
      .concat([[time, progress]])
      .sort((first, second) => first[0] - second[0]);
    const next = motionKeyframesFromPoints(points);
    const nextIndex = next.findIndex((keyframe) => Math.abs(keyframe.time - time) < 0.0001);
    setSelected(nextIndex);
    publishDraft(next);
    onCommit(cloneKeyframes(next));
  };

  const addPoint = () => {
    let widestIndex = 0;
    let widest = 0;
    for (let index = 0; index < draftRef.current.length - 1; index += 1) {
      const width = draftRef.current[index + 1].time - draftRef.current[index].time;
      if (width > widest) {
        widest = width;
        widestIndex = index;
      }
    }
    addPointAt(
      (draftRef.current[widestIndex].time + draftRef.current[widestIndex + 1].time) / 2,
    );
  };

  const deleteSelected = () => {
    if (selected <= 0 || selected >= draftRef.current.length - 1 || draftRef.current.length <= 2) return;
    const next = automaticKeyframes(
      draftRef.current.filter((_, index) => index !== selected),
    );
    setSelected(Math.min(selected, next.length - 2));
    publishDraft(next);
    onCommit(cloneKeyframes(next));
  };

  const handleGraphKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if ((event.key === "Delete" || event.key === "Backspace") && selected > 0 && selected < draft.length - 1) {
      event.preventDefault();
      deleteSelected();
      return;
    }
    const step = event.shiftKey ? 0.05 : 0.01;
    const keyframe = draftRef.current[selected];
    if (!keyframe || selected === 0 || selected === draft.length - 1) return;
    if (event.key === "ArrowLeft") movePoint(selected, keyframe.time - step, keyframe.progress);
    else if (event.key === "ArrowRight") movePoint(selected, keyframe.time + step, keyframe.progress);
    else if (event.key === "ArrowDown") movePoint(selected, keyframe.time, keyframe.progress - step);
    else if (event.key === "ArrowUp") movePoint(selected, keyframe.time, keyframe.progress + step);
    else return;
    event.preventDefault();
    onCommit(cloneKeyframes(draftRef.current));
  };

  const selectedKeyframe = draft[selected] ?? draft[0];
  const selectedPoint = graphPoint(selectedKeyframe.time, selectedKeyframe.progress);
  const incomingPoint = graphPoint(
    selectedKeyframe.time + selectedKeyframe.inHandle[0],
    selectedKeyframe.progress + selectedKeyframe.inHandle[1],
  );
  const outgoingPoint = graphPoint(
    selectedKeyframe.time + selectedKeyframe.outHandle[0],
    selectedKeyframe.progress + selectedKeyframe.outHandle[1],
  );

  return (
    <div className="grid gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full touch-none select-none rounded-lg border border-[var(--chrome-line)] bg-[var(--chrome-raised)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
        role="application"
        aria-label="Camera motion curve editor"
        tabIndex={0}
        data-testid="camera-curve-editor"
        onKeyDown={handleGraphKey}
        onDoubleClick={(event) => {
          const coordinates = pointerCoordinates(event);
          if (coordinates) addPointAt(coordinates.time);
        }}
        onPointerMove={(event) => {
          const target = draggingRef.current;
          const coordinates = pointerCoordinates(event);
          if (!target || !coordinates) return;
          if (target.kind === "point") movePoint(target.index, coordinates.time, coordinates.progress);
          else moveHandle(target.kind, target.index, coordinates.time, coordinates.progress);
        }}
        onPointerUp={() => {
          if (!draggingRef.current) return;
          draggingRef.current = null;
          onCommit(cloneKeyframes(draftRef.current));
        }}
        onPointerCancel={() => {
          draggingRef.current = null;
        }}
      >
        {[0.25, 0.5, 0.75].map((position) => (
          <g key={position}>
            <line x1={LEFT + position * PLOT_WIDTH} y1={TOP} x2={LEFT + position * PLOT_WIDTH} y2={TOP + PLOT_HEIGHT} stroke="var(--chrome-line)" />
            <line x1={LEFT} y1={TOP + position * PLOT_HEIGHT} x2={LEFT + PLOT_WIDTH} y2={TOP + position * PLOT_HEIGHT} stroke="var(--chrome-line)" />
          </g>
        ))}
        <line x1={LEFT} y1={TOP + PLOT_HEIGHT} x2={LEFT + PLOT_WIDTH} y2={TOP} stroke="var(--ink-muted)" strokeDasharray="5 5" opacity="0.45" />
        <path d={curvePath(draft)} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />

        {selected > 0 ? <line x1={selectedPoint.x} y1={selectedPoint.y} x2={incomingPoint.x} y2={incomingPoint.y} stroke="var(--ink-secondary)" strokeWidth="1.5" /> : null}
        {selected < draft.length - 1 ? <line x1={selectedPoint.x} y1={selectedPoint.y} x2={outgoingPoint.x} y2={outgoingPoint.y} stroke="var(--ink-secondary)" strokeWidth="1.5" /> : null}
        {selected > 0 ? (
          <circle
            cx={incomingPoint.x}
            cy={incomingPoint.y}
            r="6"
            fill="var(--chrome-panel)"
            stroke="var(--chrome-focus-ring)"
            strokeWidth="2"
            aria-label="Incoming tangent handle"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              draggingRef.current = { kind: "in", index: selected };
            }}
          />
        ) : null}
        {selected < draft.length - 1 ? (
          <circle
            cx={outgoingPoint.x}
            cy={outgoingPoint.y}
            r="6"
            fill="var(--chrome-panel)"
            stroke="var(--chrome-focus-ring)"
            strokeWidth="2"
            aria-label="Outgoing tangent handle"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              draggingRef.current = { kind: "out", index: selected };
            }}
          />
        ) : null}

        {draft.map((keyframe, index) => {
          const point = graphPoint(keyframe.time, keyframe.progress);
          return (
            <circle
              key={`${index}-${keyframe.time}`}
              cx={point.x}
              cy={point.y}
              r={selected === index ? 9 : 6}
              fill={selected === index ? "var(--chrome-panel)" : "var(--ink)"}
              stroke={selected === index ? "var(--chrome-focus-ring)" : "var(--ink)"}
              strokeWidth="3"
              className="cursor-grab active:cursor-grabbing"
              role="button"
              tabIndex={0}
              aria-label={`Motion point ${index + 1}, time ${keyframe.time.toFixed(2)}, progress ${keyframe.progress.toFixed(2)}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(index);
                }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setSelected(index);
                if (index > 0 && index < draft.length - 1) {
                  draggingRef.current = { kind: "point", index };
                }
              }}
            />
          );
        })}
        <text x={LEFT + PLOT_WIDTH / 2} y={HEIGHT - 35} fill="var(--ink-muted)" fontSize="11" textAnchor="middle">TIME →</text>
        <text x="13" y={TOP + PLOT_HEIGHT / 2} fill="var(--ink-muted)" fontSize="11" textAnchor="middle" transform={`rotate(-90 13 ${TOP + PLOT_HEIGHT / 2})`}>PROGRESS →</text>
      </svg>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={addPoint} disabled={draft.length >= 12}>
          Add point
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={deleteSelected}
          disabled={selected === 0 || selected === draft.length - 1}
        >
          Delete point
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            const next = cloneKeyframes(draftRef.current);
            next[selected].linked = !next[selected].linked;
            publishDraft(next);
            onCommit(cloneKeyframes(next));
          }}
        >
          Handles: {selectedKeyframe.linked ? "linked" : "broken"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.76rem] text-[var(--ink-secondary)]">
        <span>Double-click to add · Delete removes</span>
        <span className="font-mono tabular-nums">
          Point {selected + 1}: {selectedKeyframe.time.toFixed(2)}s, {selectedKeyframe.progress.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
