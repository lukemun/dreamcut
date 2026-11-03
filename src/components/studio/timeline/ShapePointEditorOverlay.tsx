"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { contourPathD, resolveShapeProps, shapeContoursAt, shapeFrameAt, type ShapeContour } from "@/lib/timeline/shapes";
import {
  deletePointEverywhere, insertPointEverywhere, moveHandle, movePoint, nearestSegment, pointEditPatch, segmentCount, toggleSmooth, type PointRef,
} from "@/lib/timeline/shape-point-edit";

type Vec = [number, number];
type Drag = { ref: PointRef; part: "point" | "in" | "out"; start: Vec; base: ShapeContour[]; latest: ShapeContour[] | null };

/**
 * Points of the selected freeform shape, drawn over the preview. Drag a point or a curve handle
 * (Alt keeps the opposite handle where it is), double-click an edge to add a point, double-click a
 * point to switch it between corner and curve, and Delete removes the selected point. Drags preview
 * live and commit once on release, so each edit is one undo step.
 */
export function ShapePointEditorOverlay({ element, playheadSec, compositionDimensions, onPreview, onCommit }: {
  element: CompositionElement | null;
  playheadSec: number;
  compositionDimensions: { width: number; height: number };
  onPreview: (patch: Record<string, unknown> | null) => void;
  onCommit: (patch: Record<string, unknown>) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [selected, setSelected] = useState<PointRef | null>(null);
  const elementId = element?.id ?? null;
  useEffect(() => setSelected(null), [elementId]);

  const { width: W, height: H } = compositionDimensions;
  const props = element?.props ?? {};
  const shape = resolveShapeProps(props);
  const local = element ? playheadSec - element.timeline_start : -1;
  const active = element != null && element.type === "shape" && shape.shape_kind === "path"
    && local >= 0 && local < element.duration;
  // The outline at the playhead: a keyframed shape shows its morph, and edits key that moment.
  const contours = active ? shapeContoursAt(props, local, shape) : shape.shape_contours;

  useEffect(() => {
    if (!active || !selected) return;
    // A click anywhere but a point, handle or edge lets go of the point, so Delete removes the clip again.
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest("[data-shape-point],[data-shape-handle],[data-shape-edge]"))) setSelected(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Taken before the editor's own Delete, which would remove the whole clip.
      event.preventDefault();
      event.stopImmediatePropagation();
      const patch = deletePointEverywhere(props, selected);
      if (patch) { onCommit(patch); setSelected(null); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, onCommit, props, selected]);

  if (!active || !element) return null;
  const frame = shapeFrameAt(props, local, W, H);
  const w = shape.shape_width * H, h = shape.shape_height * H;
  const angle = frame.rotationDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const toCanvas = (x: number, y: number): Vec => {
    const lx = x * w * frame.scale, ly = y * h * frame.scale;
    return [frame.centerX + lx * cos - ly * sin, frame.centerY + lx * sin + ly * cos];
  };
  // A canvas-space movement as a movement in the unit box (undo the turn, the scale and the size).
  const toUnitDelta = (dx: number, dy: number): Vec => {
    const s = Math.max(frame.scale, 1e-6);
    return [(dx * cos + dy * sin) / s / Math.max(w, 1e-6), (-dx * sin + dy * cos) / s / Math.max(h, 1e-6)];
  };
  const pointerToCanvas = (event: { clientX: number; clientY: number }): Vec => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width * W, (event.clientY - rect.top) / rect.height * H];
  };
  const pixelsPerUnit = svgRef.current ? svgRef.current.getBoundingClientRect().width / W : 1;
  const r = 6 / Math.max(pixelsPerUnit, 1e-6);

  const beginDrag = (event: ReactPointerEvent<SVGElement>, ref: PointRef, part: Drag["part"]) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(ref);
    dragRef.current = { ref, part, start: pointerToCanvas(event), base: contours, latest: null };
    const onMove = (move: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const [cx, cy] = pointerToCanvas(move);
      const [dx, dy] = toUnitDelta(cx - drag.start[0], cy - drag.start[1]);
      const p = drag.base[drag.ref.contour].points[drag.ref.point];
      const next = drag.part === "point"
        ? movePoint(drag.base, drag.ref, p.x + dx, p.y + dy)
        : moveHandle(drag.base, drag.ref, drag.part, [(p[drag.part]?.[0] ?? 0) + dx, (p[drag.part]?.[1] ?? 0) + dy], move.altKey);
      drag.latest = next;
      onPreview(pointEditPatch(props, local, next));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.latest) onCommit(pointEditPatch(props, local, drag.latest));
      onPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const addPointAt = (event: React.MouseEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const [cx, cy] = pointerToCanvas(event);
    const [ux, uy] = toUnitDelta(cx - frame.centerX, cy - frame.centerY);
    const hit = nearestSegment(contours, [ux, uy], [w * frame.scale, h * frame.scale]);
    if (!hit) return;
    const added = insertPointEverywhere(props, hit.contour, hit.segment, hit.t);
    onCommit(added.patch);
    setSelected(added.ref);
  };

  // The outline in canvas space, segment by segment, so an edge can be double-clicked.
  const canvasContours: ShapeContour[] = contours.map((contour) => ({
    closed: contour.closed,
    points: contour.points.map((p) => {
      const [x, y] = toCanvas(p.x, p.y);
      const handle = (offset?: [number, number]) => {
        if (!offset) return undefined;
        const [hx, hy] = toCanvas(p.x + offset[0], p.y + offset[1]);
        return [hx - x, hy - y] as [number, number];
      };
      return { x, y, in: handle(p.in), out: handle(p.out) };
    }),
  }));
  const selectedPoint = selected ? contours[selected.contour]?.points[selected.point] : undefined;

  return (
    <svg ref={svgRef} data-shape-point-editor="true" viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 5, pointerEvents: "none" }}>
      {canvasContours.map((contour, ci) => Array.from({ length: segmentCount(contour) }, (_, s) => {
        const a = contour.points[s], b = contour.points[(s + 1) % contour.points.length];
        const d = contourPathD({ closed: false, points: [{ x: a.x, y: a.y, out: a.out }, { x: b.x, y: b.y, in: b.in }] });
        return (
          <g key={`${ci}-${s}`}>
            <path d={d} fill="none" stroke="var(--canvas-handle-edge)" strokeWidth={3 * r / 6} />
            <path d={d} fill="none" stroke="var(--canvas-handle-line)" strokeWidth={1.5 * r / 6} />
            <path d={d} fill="none" stroke="transparent" strokeWidth={r * 2.4} data-shape-edge={`${ci}-${s}`}
              style={{ pointerEvents: "stroke", cursor: "copy" }} onDoubleClick={addPointAt} />
          </g>
        );
      }))}
      {selected && selectedPoint ? (["in", "out"] as const).map((side) => {
        const offset = selectedPoint[side];
        if (!offset) return null;
        const [px, py] = toCanvas(selectedPoint.x, selectedPoint.y);
        const [hx, hy] = toCanvas(selectedPoint.x + offset[0], selectedPoint.y + offset[1]);
        return (
          <g key={side}>
            <line x1={px} y1={py} x2={hx} y2={hy} stroke="var(--canvas-handle-line)" strokeWidth={r / 4} />
            <circle cx={hx} cy={hy} r={r * 0.75} fill="var(--canvas-handle)" stroke="var(--canvas-handle-edge)" strokeWidth={r / 4}
              role="button" aria-label={side === "in" ? "Curve in" : "Curve out"} data-shape-handle={side}
              style={{ pointerEvents: "all", cursor: "grab" }} onPointerDown={(event) => beginDrag(event, selected, side)} />
          </g>
        );
      }) : null}
      {canvasContours.map((contour, ci) => contour.points.map((p, pi) => {
        const isSelected = selected?.contour === ci && selected.point === pi;
        const curved = Boolean(contours[ci].points[pi].in || contours[ci].points[pi].out);
        const size = isSelected ? r * 1.25 : r;
        const common = {
          fill: isSelected ? "var(--canvas-handle)" : "var(--canvas-handle-edge)",
          stroke: isSelected ? "var(--canvas-handle-edge)" : "var(--canvas-handle)",
          strokeWidth: r / 3,
          role: "button",
          tabIndex: 0,
          "aria-label": `Point ${pi + 1}`,
          "aria-pressed": isSelected,
          "data-shape-point": `${ci}-${pi}`,
          style: { pointerEvents: "all" as const, cursor: "move" },
          onPointerDown: (event: ReactPointerEvent<SVGElement>) => beginDrag(event, { contour: ci, point: pi }, "point"),
          onDoubleClick: (event: React.MouseEvent<SVGElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onCommit(pointEditPatch(props, local, toggleSmooth(contours, { contour: ci, point: pi })));
          },
          onFocus: () => setSelected({ contour: ci, point: pi }),
        };
        // Curve points are round, corners are square.
        return curved
          ? <circle key={`${ci}-${pi}`} cx={p.x} cy={p.y} r={size} {...common} />
          : <rect key={`${ci}-${pi}`} x={p.x - size} y={p.y - size} width={size * 2} height={size * 2} {...common} />;
      }))}
    </svg>
  );
}
