"use client";
import { useId, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";
import { FILM_HALATION_TINT, filmLookPlan, filmTintVector, hasFilmLookData, resolveFilmLookAtTime } from "../timeline/film-look";

const TABLE_STEPS = 33;
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Standard film look, in the same order as canvaskit-film.ts on the placed picture in composition
 * pixels: split tone, vignette and grain, then halation and bloom screened on top. Split tone is
 * the shader's luma-only offset written as per-channel tables; the vignette is the same radial
 * curve as an image multiplied in; grain is SVG fractal noise seeded by the shared grain step, so
 * it moves on the same 24-per-second clock but is not the CanvasKit pattern. Arithmetic steps run on premultiplied colour, so the final
 * `in SourceAlpha` restores the picture's own alpha.
 */
export function FilmLookFilter({ props, seconds, width, height, children }: { props?: Record<string, unknown> | null; seconds: number; width: number; height: number; children: ReactNode }) {
  const id = `film-look-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Keep the wrapper while the clip carries the effect so keyed strengths never remount video decoders.
  if (!hasFilmLookData(props)) return children;
  const look = resolveFilmLookAtTime(props, seconds);
  const plan = look ? filmLookPlan(look, width, height) : null;
  const filter = plan ? (() => {
    const shadow = filmTintVector(plan.shadowHue), highlight = filmTintVector(plan.highlightHue);
    const table = (channel: 0 | 1 | 2) => Array.from({ length: TABLE_STEPS }, (_, i) => {
      const luma = i / (TABLE_STEPS - 1), w = smoothstep(0, 1, Math.min(1, Math.max(0, luma + plan.balance * 0.5)));
      return (0.5 + plan.splitTone * 0.3 * ((1 - w) * shadow[channel] * (1 - luma) + w * highlight[channel] * luma)).toFixed(4);
    }).join(" ");
    const stops = Array.from({ length: 9 }, (_, i) => {
      // Gradient offset 1 is the half-diagonal, which is the shader's d = 1 (a corner).
      const d = i / 8;
      const value = Math.round(255 * (1 - plan.vignette * smoothstep(plan.vignetteSize - plan.vignetteSoftness * 0.5, plan.vignetteSize + plan.vignetteSoftness * 0.5, d)));
      return `<stop offset='${(i / 8).toFixed(3)}' stop-color='rgb(${value},${value},${value})'/>`;
    }).join("");
    const vignette = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><defs><radialGradient id='v' gradientUnits='userSpaceOnUse' cx='${width / 2}' cy='${height / 2}' r='${Math.hypot(width, height) / 2}'>${stops}</radialGradient></defs><rect width='100%' height='100%' fill='url(#v)'/></svg>`)}`;
    const cell = Math.max(0.5, plan.grainSize * plan.scale);
    // The shader's glow curve, per channel: x · clamp((x − t)/(1 − t))² · tint · strength.
    const glowTable = (strength: number, tint: number) => Array.from({ length: TABLE_STEPS }, (_, i) => {
      const x = i / (TABLE_STEPS - 1), k = Math.min(1, Math.max(0, (x - plan.threshold) / Math.max(1 - plan.threshold, 0.001)));
      return Math.min(1, x * k * k * tint * strength).toFixed(4);
    }).join(" ");
    const glow = (strength: number, tint: readonly number[], radius: number, name: string) => strength > 0 ? <>
      <feComponentTransfer in="SourceGraphic" result={`${name}-light`}>
        <feFuncR type="table" tableValues={glowTable(strength, tint[0]!)} /><feFuncG type="table" tableValues={glowTable(strength, tint[1]!)} /><feFuncB type="table" tableValues={glowTable(strength, tint[2]!)} />
      </feComponentTransfer>
      {/* Only the glow itself is opaque, as in the shader, so its blur never darkens past the picture's edge. */}
      <feColorMatrix in={`${name}-light`} type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 1 1 1 0 0" result={`${name}-lit`} />
      <feGaussianBlur in={`${name}-lit`} stdDeviation={radius * plan.scale / 2} result={`${name}-blur`} />
    </> : null;
    return <filter id={id} x="0" y="0" width={width} height={height} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse">
      <feColorMatrix in="SourceGraphic" type="matrix" result="luma" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" />
      <feComponentTransfer in="luma" result="split-table">
        <feFuncR type="table" tableValues={table(0)} /><feFuncG type="table" tableValues={table(1)} /><feFuncB type="table" tableValues={table(2)} /><feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="split-table" operator="arithmetic" k1="0" k2="1" k3={plan.splitTone > 0 ? 1 : 0} k4={plan.splitTone > 0 ? -0.5 : 0} result="split" />
      <feImage href={vignette} x="0" y="0" width={width} height={height} preserveAspectRatio="none" result="vignette-map" />
      <feComposite in="split" in2="vignette-map" operator="arithmetic" k1={plan.vignette > 0 ? 1 : 0} k2={plan.vignette > 0 ? 0 : 1} k3="0" k4="0" result="vignetted" />
      <feTurbulence type="fractalNoise" baseFrequency={Math.min(0.7, 1 / cell)} numOctaves={2} seed={plan.grainStep % 9973} stitchTiles="noStitch" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 0.5" result="grain" />
      <feComposite in="vignetted" in2="grain" operator="arithmetic" k1="0" k2="1" k3={plan.grain * 0.6} k4={-plan.grain * 0.15} result="grained" />
      <feComposite in="grained" in2="SourceAlpha" operator="in" result="toned" />
      {glow(plan.halation * 1.4, FILM_HALATION_TINT, plan.halationRadius, "halation")}
      {glow(plan.bloom * 1.1, [1, 1, 1], plan.bloomRadius, "bloom")}
      {plan.halation > 0 ? <feBlend in="halation-blur" in2="toned" mode="screen" result="toned" /> : null}
      {plan.bloom > 0 ? <feBlend in="bloom-blur" in2="toned" mode="screen" result="toned" /> : null}
    </filter>;
  })() : null;
  return <>
    {filter ? <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs>{filter}</defs></svg> : null}
    <AbsoluteFill data-film-look-filter={id} style={{ filter: filter ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
