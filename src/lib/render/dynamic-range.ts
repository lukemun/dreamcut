/**
 * Whether an HDR (HLG) export suits a timeline. An HLG export places SDR pictures (screen
 * recordings, UI, text, graphics, ordinary video) at BT.2408 reference white, HLG 75%. Measured on
 * macOS (Core Image, the path Safari and Chrome hand HLG video to on an EDR display), HLG 75% equals
 * UI white only with at least 3× display headroom: 0.89 at 2× and 0.50 (half the light) with none.
 * Chrome's own SDR tone-map gives 0.50 too. So a mostly-SDR video exported as HDR looks dim and grey
 * next to the page on many screens, while the Standard export always shows its white at UI white.
 * HDR is only worth it when most of the picture is HDR camera footage.
 */
type ElementLike = { type?: string; timeline_start?: number; duration?: number; props?: unknown };

/** HDR footage must fill at least this share of the running time before HDR is suggested. */
export const HDR_SUGGESTION_SHARE = 0.5;

function isHdrFootage(element: ElementLike) {
  if (element.type !== "video_clip") return false;
  const transfer = (element.props as { source_color_space?: { transfer?: unknown } } | undefined)?.source_color_space?.transfer;
  return transfer === "hlg" || transfer === "pq";
}

/** Share (0–1) of the timeline's running time during which an HLG or PQ camera clip is on screen. */
export function hdrFootageShare(elements: ReadonlyArray<ElementLike>): number {
  const span = (element: ElementLike) => {
    const start = Number(element.timeline_start ?? 0), end = start + Number(element.duration ?? 0);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] as const : null;
  };
  const total = Math.max(0, ...elements.map((element) => span(element)?.[1] ?? 0));
  if (total <= 0) return 0;
  const hdr = elements.filter(isHdrFootage).map(span).filter((s) => s !== null).sort((a, b) => a[0] - b[0]);
  let covered = 0, reach = 0;
  for (const [start, end] of hdr) {
    if (end > reach) covered += end - Math.max(start, reach);
    reach = Math.max(reach, end);
  }
  return Math.min(1, covered / total);
}

/** True when an HDR export suits the timeline: HDR camera footage fills most of it. */
export function hdrSuitsTimeline(elements: ReadonlyArray<ElementLike>) {
  return hdrFootageShare(elements) >= HDR_SUGGESTION_SHARE;
}

/** Plain-words warning for an HDR export of a mostly-SDR timeline; null when HDR suits it. */
export function hdrExportWarning(elements: ReadonlyArray<ElementLike>): string | null {
  return hdrSuitsTimeline(elements) ? null
    : "Most of this video isn't HDR footage, so in HDR its text and screen recordings look dim on many screens, YouTube included. Choose Standard.";
}
