"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { edgeAuraMatrices } from "../timeline/edge-aura";
import { paperContourMatrix } from "../timeline/paper-contour";

export function PaperContourFilter({ props, seconds, children }: { props?: Record<string, unknown> | null; seconds: number; children: ReactNode }) {
  const id = `contour-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const matrix = paperContourMatrix(props, seconds);
  const ring = edgeAuraMatrices(props?.edge_aura, seconds);
  if (props?.edge_aura != null && !ring) return null;
  if (!matrix && !ring) return children;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        {ring ? <>
          <feColorMatrix in="SourceGraphic" type="matrix" values={ring.inner.join(" ")} result="inner" />
          <feColorMatrix in="SourceGraphic" type="matrix" values={ring.outer.join(" ")} result="outer" />
          <feComposite in="inner" in2="outer" operator="in" result="ring" />
          <feComposite in="ring" in2="SourceAlpha" operator="in" />
        </> : <feColorMatrix type="matrix" values={matrix!.join(" ")} />}
      </filter>
    </defs></svg>
    <AbsoluteFill style={{ filter: `url(#${id})` }}>{children}</AbsoluteFill>
  </>;
}
