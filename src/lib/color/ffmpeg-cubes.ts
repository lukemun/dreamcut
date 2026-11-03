/**
 * .cube LUTs generated from the colour reference, for FFmpeg's `lut3d`. Media preparation uses them
 * instead of zscale/tonemap filters, so SDR derivatives match the editor's own output transform and
 * need no optional FFmpeg libraries on any platform.
 */
import fs from "node:fs";
import { inputToWorking, sourcePeakRelative, workingToDisplay, type SourceColorSpace } from "./io-transforms";
import type { Vec3 } from "./matrices";

export function cubeText(size: number, transform: (rgb: Vec3) => Vec3, title: string): string {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"];
  // .cube order: red changes fastest, then green, then blue.
  for (let b = 0; b < size; b += 1) for (let g = 0; g < size; g += 1) for (let r = 0; r < size; r += 1) {
    const out = transform([r / (size - 1), g / (size - 1), b / (size - 1)]);
    lines.push(out.map((v) => Math.min(1, Math.max(0, v)).toFixed(6)).join(" "));
  }
  return `${lines.join("\n")}\n`;
}

/** HDR code values (as carried in a code-value authority) to the editor's SDR display picture at identity grade. */
export function hdrToSdrDisplayCube(source: SourceColorSpace, maxCllNits?: number | null, size = 65): string {
  const sourcePeak = sourcePeakRelative(source, maxCllNits);
  return cubeText(size, (rgb) => workingToDisplay(inputToWorking(rgb, source), { sourcePeak }), `DreamCut ${source.transfer} ${source.primaries} to SDR`);
}

export function writeCube(file: string, text: string) {
  fs.writeFileSync(file, text);
  return file;
}

/** Escape a file path for an FFmpeg filtergraph option (Windows drive colons and backslashes). */
export function filterPath(file: string) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
