"use client";
import type { Recolor } from "../timeline/recolor";

import type { CSSProperties, ReactNode } from "react";

import { buildColorGradeFilterDescriptor, type ColorGrade } from "../timeline/color-grade";
import type { ColorGradeLut } from "../timeline/cube-lut";
import type { SourceColorSpace } from "../color/io-transforms";
import { GradeCanvasFilter } from "./GradeCanvasFilter";

export function ColorGradeFilter({
  grade,
  lut,
  source,
  maxCllNits,
  mountIdentity = false,
  sourceOrientationStyle,
  sourceRecolor,
  children,
}: {
  grade: ColorGrade;
  lut?: ColorGradeLut | null;
  /** The clip's source colour space; HDR sources are tone-mapped here. Defaults to SDR Rec.709. */
  source?: SourceColorSpace;
  /** The source's MaxCLL, when it declares one; sets where PQ highlights start to roll off. */
  maxCllNits?: number | null;
  mountIdentity?: boolean;
  sourceRecolor?: Recolor;
  sourceOrientationStyle?: Pick<CSSProperties, "transform" | "transformOrigin">;
  children: ReactNode;
}) {
  // Animated grades must keep the same wrapper tree at identity and non-identity
  // values. Returning the raw video at identity remounts its decoder on the first
  // graded frame, which presents as a flash in the interactive player.
  const descriptor = buildColorGradeFilterDescriptor(grade, { includeIdentity: mountIdentity || !!lut, source, maxCllNits });
  if (!descriptor) return children;
  return <GradeCanvasFilter sourceRecolor={sourceRecolor} sourceOrientationStyle={sourceOrientationStyle} lut={lut} descriptor={descriptor}>{children}</GradeCanvasFilter>;
}
