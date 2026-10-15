"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { recolorMatrix, resolveRecolor } from "../timeline/recolor";

export function RecolorFilter({ props, children }: { props?: Record<string, unknown> | null; children: ReactNode }) {
  const id = `recolor-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const effect = resolveRecolor(props);
  // Retain the wrapper when disabled so amount changes do not remount video decoders.
  const mounted = props?.recolor_color !== undefined || props?.paper_fill_color !== undefined;
  if (!mounted) return children;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={recolorMatrix(effect).join(" ")} />
      </filter>
    </defs></svg>
    <AbsoluteFill style={{ filter: effect.amount > 0 ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
