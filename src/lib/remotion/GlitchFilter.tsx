"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { glitchPlan, hasGlitchData, resolveGlitchAtTime } from "../timeline/glitch";

const CHANNELS = [
  "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
  "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
] as const;

/**
 * Standard glitch: SVG primitives drawing the shared `glitchPlan` in composition
 * pixels, step for step with canvasKitDrawGlitch. Base minus blocks, shifted blocks
 * (feOffset in the block's subregion, wrapped around the frame), smears (feTile of a one-pixel column or row),
 * then red/green/blue copies screened together with red right and blue left.
 */
export function GlitchFilter({ props, seconds, width, height, children }: { props?: Record<string, unknown> | null; seconds: number; width: number; height: number; children: ReactNode }) {
  const id = `glitch-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Keep the wrapper while the clip carries the effect so a keyed burst never remounts video decoders.
  if (!hasGlitchData(props)) return children;
  const glitch = resolveGlitchAtTime(props, seconds);
  const plan = glitch ? glitchPlan(glitch, width, height) : null;
  const active = !!plan && (plan.blocks.length > 0 || plan.split > 0);
  return <>
    {plan && active ? <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>
      <filter id={id} x="0" y="0" width="100%" height="100%" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        {plan.blocks.map((block, index) => <feFlood key={`m${index}`} floodColor="#ffffff" floodOpacity="1" x={block.rect.x} y={block.rect.y} width={block.rect.width} height={block.rect.height} result={`m${index}`} />)}
        {plan.blocks.length ? <feMerge result="mask">{plan.blocks.map((_, index) => <feMergeNode key={index} in={`m${index}`} />)}</feMerge> : null}
        {plan.blocks.length ? <feComposite in="SourceGraphic" in2="mask" operator="out" result="base" /> : <feOffset in="SourceGraphic" dx="0" dy="0" result="base" />}
        {plan.blocks.map((block, index) => {
          const r = block.rect;
          // A shifted band wraps around the frame, as canvasKitDrawGlitch draws it.
          if (block.kind === "shift") return [
            <feOffset key={`s${index}`} in="SourceGraphic" dx={block.dx} dy="0" x={r.x} y={r.y} width={r.width} height={r.height} result={`s${index}`} />,
            <feOffset key={`w${index}`} in="SourceGraphic" dx={block.dx - Math.sign(block.dx) * width} dy="0" x={r.x} y={r.y} width={r.width} height={r.height} result={`w${index}`} />,
            <feMerge key={`b${index}`} x={r.x} y={r.y} width={r.width} height={r.height} result={`b${index}`}><feMergeNode in={`s${index}`} /><feMergeNode in={`w${index}`} /></feMerge>,
          ];
          const line = block.axis === "x" ? { x: block.line, y: r.y, width: 1, height: r.height } : { x: r.x, y: block.line, width: r.width, height: 1 };
          return [
            <feOffset key={`l${index}`} in="SourceGraphic" dx="0" dy="0" {...line} result={`l${index}`} />,
            <feTile key={`b${index}`} in={`l${index}`} x={r.x} y={r.y} width={r.width} height={r.height} result={`b${index}`} />,
          ];
        })}
        <feMerge result="glitched"><feMergeNode in="base" />{plan.blocks.map((_, index) => <feMergeNode key={index} in={`b${index}`} />)}</feMerge>
        {plan.split > 0 ? <>
          <feColorMatrix in="glitched" type="matrix" values={CHANNELS[0]} result="red0" />
          <feOffset in="red0" dx={plan.split} dy="0" result="red" />
          <feColorMatrix in="glitched" type="matrix" values={CHANNELS[1]} result="green" />
          <feColorMatrix in="glitched" type="matrix" values={CHANNELS[2]} result="blue0" />
          <feOffset in="blue0" dx={-plan.split} dy="0" result="blue" />
          <feBlend in="green" in2="red" mode="screen" result="rg" />
          <feBlend in="blue" in2="rg" mode="screen" />
        </> : null}
      </filter>
    </defs></svg> : null}
    <AbsoluteFill data-glitch-filter={id} style={{ filter: active ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
