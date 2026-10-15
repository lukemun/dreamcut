"use client";
import type {Recolor} from "../timeline/recolor";


import { useId, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill } from "@/lib/frame-runtime";

import {
  buildColorGradeFilterDescriptor,
  type ColorGrade,
} from "../timeline/color-grade";
import type { ColorGradeLut } from "../timeline/cube-lut";
import { LutCanvasFilter } from "./LutCanvasFilter";

export function ColorGradeFilter({
  grade,
  lut,
  mountIdentity = false,
  sourceOrientationStyle,
  sourceRecolor,
  children,
}: {
  grade: ColorGrade;
  lut?: ColorGradeLut | null;
  mountIdentity?: boolean;
  sourceRecolor?:Recolor;
  sourceOrientationStyle?:Pick<CSSProperties,"transform"|"transformOrigin">;
  children: ReactNode;
}) {
  const reactId = useId();
  // Animated grades must keep the same wrapper tree at identity and non-identity
  // values. Returning the raw video at identity remounts its decoder on the first
  // graded frame, which presents as a flash in the interactive player.
  const descriptor = buildColorGradeFilterDescriptor(grade, { includeIdentity: mountIdentity });
  if (!descriptor && !lut) return children;

  if (lut) {
    return <LutCanvasFilter sourceRecolor={sourceRecolor} sourceOrientationStyle={sourceOrientationStyle} lut={lut} descriptor={descriptor ?? buildColorGradeFilterDescriptor(grade, { includeIdentity: true })!}>{children}</LutCanvasFilter>;
  }
  if (!descriptor) return children;

  const filterId = `color-grade-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const matrix = [
    descriptor.redGain, 0, 0, 0, 0,
    0, descriptor.greenGain, 0, 0, 0,
    0, 0, descriptor.blueGain, 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="linearRGB"
          >
            <feComponentTransfer in="SourceGraphic" result="exposure">
              <feFuncR type="linear" slope={descriptor.exposureSlope} />
              <feFuncG type="linear" slope={descriptor.exposureSlope} />
              <feFuncB type="linear" slope={descriptor.exposureSlope} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feColorMatrix in="exposure" type="matrix" values={matrix} result="whiteBalance" />
            <feComponentTransfer in="whiteBalance" result="contrast">
              <feFuncR type="linear" slope={descriptor.contrastSlope} intercept={descriptor.contrastIntercept} />
              <feFuncG type="linear" slope={descriptor.contrastSlope} intercept={descriptor.contrastIntercept} />
              <feFuncB type="linear" slope={descriptor.contrastSlope} intercept={descriptor.contrastIntercept} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feComponentTransfer in="contrast" result="tone">
              <feFuncR type={descriptor.toneActive ? "table" : "identity"} tableValues={descriptor.toneActive ? descriptor.toneTable.join(" ") : undefined} />
              <feFuncG type={descriptor.toneActive ? "table" : "identity"} tableValues={descriptor.toneActive ? descriptor.toneTable.join(" ") : undefined} />
              <feFuncB type={descriptor.toneActive ? "table" : "identity"} tableValues={descriptor.toneActive ? descriptor.toneTable.join(" ") : undefined} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feColorMatrix in="tone" type="saturate" values={String(descriptor.saturation)} result="saturation" />
            <feColorMatrix in="saturation" type="hueRotate" values={String(descriptor.hueDegrees)} result="hue" />
            <feComponentTransfer in="hue" result="lift">
              <feFuncR type="linear" slope={descriptor.liftSlope[0]} intercept={descriptor.liftIntercept[0]} />
              <feFuncG type="linear" slope={descriptor.liftSlope[1]} intercept={descriptor.liftIntercept[1]} />
              <feFuncB type="linear" slope={descriptor.liftSlope[2]} intercept={descriptor.liftIntercept[2]} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feComponentTransfer in="lift" result="gamma">
              <feFuncR type="gamma" amplitude="1" exponent={descriptor.gammaExponent[0]} offset="0" />
              <feFuncG type="gamma" amplitude="1" exponent={descriptor.gammaExponent[1]} offset="0" />
              <feFuncB type="gamma" amplitude="1" exponent={descriptor.gammaExponent[2]} offset="0" />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feComponentTransfer in="gamma" result="gain">
              <feFuncR type="linear" slope={descriptor.gainSlope[0]} />
              <feFuncG type="linear" slope={descriptor.gainSlope[1]} />
              <feFuncB type="linear" slope={descriptor.gainSlope[2]} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feComponentTransfer in="gain">
              <feFuncR type="table" tableValues={descriptor.masterCurveTable.join(" ")} />
              <feFuncG type="table" tableValues={descriptor.masterCurveTable.join(" ")} />
              <feFuncB type="table" tableValues={descriptor.masterCurveTable.join(" ")} />
              <feFuncA type="identity" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <AbsoluteFill data-color-grade-filter={filterId} style={{ filter: `url(#${filterId})` }}>{children}</AbsoluteFill>
    </>
  );
}
