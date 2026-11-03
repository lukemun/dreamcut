import { quantizeVisualFrameSpan } from "./frame-quantization";
/** Display-referred SDR brightness (0–100%). This is not calibrated IRE/nits. */
export function lumaWaveform(rgba: Uint8ClampedArray, width: number, height: number) {
  const bins = new Uint32Array(width * 101);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (rgba[i + 3]! < 128) continue;
    const brightness = Math.round((0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255 * 100);
    bins[(100 - brightness) * width + x]!++;
  }
  return bins;
}

/** Three side-by-side display-referred channel waveforms, each retaining the
 * source's horizontal ordering. Channels are levels, not hue/saturation. */
export function rgbParade(rgba: Uint8ClampedArray, width: number, height: number) {
  const bins = new Uint32Array(width * 3 * 101);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (rgba[i + 3]! < 128) continue;
    for (let channel = 0; channel < 3; channel++) {
      const level = Math.round(rgba[i + channel]! / 255 * 100);
      bins[(100 - level) * width * 3 + channel * width + x]!++;
    }
  }
  return bins;
}

/** Whether a presented preview frame (timeline frames at the project rate) lies inside a
 * clip's timeline span (seconds), using the renderer's own frame quantization. */
export function scopeFrameInsideClip(frame: number, clip: { timeline_start: number; duration: number }, fps: number) {
  if (!Number.isFinite(frame)) return false;
  const span = quantizeVisualFrameSpan(clip.timeline_start, clip.duration, { fps, minFrames: 1 });
  return frame >= span.startFrame && frame < span.endFrame;
}
