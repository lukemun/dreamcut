"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { GRADIENT_MAP_LUMA, hasGradientMapData, resolveGradientMapAtTime } from "../timeline/gradient-map";

/**
 * Standard color map: the same steps as CANVASKIT_GRADIENT_MAP_SKSL. Luminance of the
 * unpremultiplied sRGB colour, stretched about 0.5 by contrast (SVG clamps to 0..1),
 * a three-entry table per channel (a linear three-stop ramp), then an arithmetic mix
 * with the source by amount. Alpha is untouched.
 */
export function GradientMapFilter({ props, seconds, children }: { props?: Record<string, unknown> | null; seconds: number; children: ReactNode }) {
  const id = `gradient-map-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Keep the wrapper while the clip carries the effect so a keyed flash never remounts video decoders.
  if (!hasGradientMapData(props)) return children;
  const map = resolveGradientMapAtTime(props, seconds);
  const level = map ? GRADIENT_MAP_LUMA.map((weight) => weight * map.contrast).concat([0, 0.5 - 0.5 * map.contrast]).join(" ") : "";
  return <>
    {map ? <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values={`${level} ${level} ${level} 0 0 0 1 0`} result="level" />
        <feComponentTransfer in="level" result="mapped">
          <feFuncR type="table" tableValues={map.stops.map((stop) => stop[0]).join(" ")} />
          <feFuncG type="table" tableValues={map.stops.map((stop) => stop[1]).join(" ")} />
          <feFuncB type="table" tableValues={map.stops.map((stop) => stop[2]).join(" ")} />
          <feFuncA type="identity" />
        </feComponentTransfer>
        <feComposite in="mapped" in2="SourceGraphic" operator="arithmetic" k1="0" k2={map.amount} k3={1 - map.amount} k4="0" />
      </filter>
    </defs></svg> : null}
    <AbsoluteFill data-gradient-map-filter={id} style={{ filter: map ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
