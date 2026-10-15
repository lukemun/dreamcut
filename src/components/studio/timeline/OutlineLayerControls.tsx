"use client";
import { useEffect, useState } from "react";
import type { TimelineElement } from "./types";

export function OutlineLayerControls({ element, onPatch }: { element: TimelineElement; onPatch: (props: Record<string, unknown>) => void }) {
  const savedWidth = Number(element.props?.outline_width ?? 8);
  const [width, setWidth] = useState(savedWidth);
  useEffect(() => setWidth(savedWidth), [element.id, savedWidth]);
  return <div style={{ padding: 16, display: "grid", gap: 14 }}>
    <strong>Outline appearance</strong>
    <label style={{ display: "grid", gridTemplateColumns: "64px 1fr 44px", gap: 8, alignItems: "center" }}>
      Width
      <input aria-label="Outline width" type="range" min={0} max={64} step={1} value={width}
        onChange={(event) => setWidth(Number(event.target.value))}
        onPointerUp={() => onPatch({ outline_width: width })}
        onKeyUp={() => onPatch({ outline_width: width })}
        onBlur={() => { if (width !== savedWidth) onPatch({ outline_width: width }); }} />
      <span>{width}px</span>
    </label>
    <label style={{ display: "flex", alignItems: "center", gap: 16 }}>Color
      <input aria-label="Outline color" type="color" value={String(element.props?.outline_color ?? "#ffffff")}
        onChange={(event) => onPatch({ outline_color: event.target.value })} />
    </label>
  </div>;
}
