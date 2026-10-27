import { execFileSync } from "node:child_process";

import type { Canvas, Rect } from "@/lib/instruments/frame-state";

/**
 * Finds the inclusive pixel bounds whose RGB difference exceeds `threshold`.
 *
 * The frame-state instrument renders the same frame twice and removes exactly one caption from
 * the second render. Scanning their difference measures what the viewer can actually see: the
 * loaded font's glyphs, stroke, shadow, animation and antialiasing. It deliberately does not use
 * the CSS line box, because that box contains vertical leading that is not visible ink.
 */
export function boundsOfRgbDifference(
  rgb: Buffer,
  canvas: Canvas,
  threshold = 8,
): Rect | null {
  const expected = canvas.width * canvas.height * 3;
  if (rgb.length < expected) {
    throw new Error(`RGB difference buffer is ${rgb.length} bytes; expected at least ${expected}.`);
  }

  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += 1) {
    const offset = pixel * 3;
    if (Math.max(rgb[offset]!, rgb[offset + 1]!, rgb[offset + 2]!) <= threshold) continue;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, top, right, bottom };
}

export function measureRenderedDifferenceBounds(
  frameWithCaption: string,
  frameWithoutCaption: string,
  canvas: Canvas,
  threshold = 8,
): Rect | null {
  const rgb = execFileSync(
    "ffmpeg",
    [
      "-v", "error",
      "-i", frameWithCaption,
      "-i", frameWithoutCaption,
      "-filter_complex", "[0:v][1:v]blend=all_mode=difference",
      "-frames:v", "1",
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-",
    ],
    { maxBuffer: 1024 * 1024 * 256 },
  );
  return boundsOfRgbDifference(rgb, canvas, threshold);
}
