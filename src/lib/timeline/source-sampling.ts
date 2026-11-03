import {COMPOSITION_FPS} from './frame-quantization';

/**
 * Preview decodes a proxy made by ffmpeg `fps=30` (prepare-editor-media.ts). That filter
 * gives each source frame the output slot round(pts × 30) and shows, in slot p, the last
 * source frame whose presentation time is strictly before (p + ½) / 30. Export decodes the
 * original and returns the frame covering the requested time. Sampling the original at the
 * slot midpoint therefore selects the frame the creator saw in preview, at any source rate
 * (23.976, 25, 29.97, 59.94, variable) and without knowing that rate.
 *
 * All arithmetic is on integer microseconds, matching decoded-sample intervals
 * (gpu-preview/sample-time.ts), so no epsilon is needed at slot boundaries.
 */
const US = 1_000_000;

/** The proxy's cadence conversion at the project rate. previewMatchedSourceSampleUs models exactly this filter. */
export function previewProxyFpsFilter(fps: number = COMPOSITION_FPS) {
  return `fps=${fps}:eof_action=pass`;
}
/** The 30 fps filter, kept for callers that prepare at the default rate. */
export const PREVIEW_PROXY_FPS_FILTER = previewProxyFpsFilter(COMPOSITION_FPS);

/** Microsecond start of proxy slot p, as the proxy's decoded timestamps round it. */
function slotStartUs(slot: number, fps: number) {
  return Math.round(slot * US / fps);
}

/** The proxy slot that covers a source time in microseconds (what preview shows). */
export function proxySlotAtUs(timeUs: number, fps = COMPOSITION_FPS) {
  if (!Number.isSafeInteger(timeUs) || timeUs < 0) throw Error('Source time must be a non-negative integer microsecond');
  let slot = Math.floor(timeUs * fps / US);
  while (slot > 0 && slotStartUs(slot, fps) > timeUs) slot--;
  while (slotStartUs(slot + 1, fps) <= timeUs) slot++;
  return slot;
}

/**
 * Original-media sample time (microseconds) that selects the source frame shown by proxy
 * slot `slot`: one microsecond before the slot midpoint, so a source frame that starts
 * exactly on the midpoint belongs to the next slot, as ffmpeg's half-up rounding decides.
 */
export function proxySlotSampleUs(slot: number, fps = COMPOSITION_FPS) {
  if (!Number.isSafeInteger(slot) || slot < 0) throw Error('Proxy slot must be a non-negative integer');
  return Math.max(0, Math.round((2 * slot + 1) * US / (2 * fps)) - 1);
}

/** Map an authored source time to the original-media sample time that matches preview. */
export function previewMatchedSourceSampleUs(sourceSeconds: number, fps = COMPOSITION_FPS) {
  if (!Number.isFinite(sourceSeconds)) throw Error('Source time must be finite');
  return proxySlotSampleUs(proxySlotAtUs(Math.max(0, Math.round(sourceSeconds * US)), fps), fps);
}

/** Original-media sample time for a composition frame. The preview-matched rule is defined by
 * the proxy the creator previewed. It applies when that proxy runs at the composition rate; a
 * proxy at another rate (not yet re-prepared after a rate change, or HDR alpha held at 30) or no
 * proxy at all has nothing to match, so the exact source time is sampled. */
export function originalMediaSampleUs(sourceSeconds: number, compositionFps: number, proxyFps: number | null = COMPOSITION_FPS) {
  return proxyFps === compositionFps ? previewMatchedSourceSampleUs(sourceSeconds, compositionFps) : Math.max(0, Math.round(sourceSeconds * US));
}

/** The frame rate a validated preview proxy was prepared at; receipts before rates existed are 30. */
export function previewProxyFrameRate(props: Record<string, unknown> | null | undefined): number | null {
  const proof = props?.preview_proxy_validation as {ok?: unknown; frame_rate?: unknown} | undefined;
  if (proof?.ok !== true) return null;
  return typeof proof.frame_rate === 'number' && proof.frame_rate > 0 ? proof.frame_rate : COMPOSITION_FPS;
}
