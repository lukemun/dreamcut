import { hasValidatedPreviewProxy } from "./preview-proxy-contract";

export type PreviewableVideoElement = {
  type?: string;
  props?: Record<string, unknown> | null;
};

const PROJECT_LOCAL_MEDIA = /^\/api\/projects\/[^/]+\/media\//;
const PNG_SOURCE = /\.png(?:\?.*)?$/;

export function resolveVideoPlaybackSource(
  element: PreviewableVideoElement,
  renderSource: string | null,
  isRendering: boolean,
) {
  if (isRendering) return renderSource;
  if (element.type === "video_clip" && !hasValidatedPreviewProxy(element.props)) return null;
  const previewSource = element.props?.runtime_preview_source_url ?? element.props?.preview_source_url;
  return typeof previewSource === "string" && previewSource.length > 0
    ? previewSource
    : renderSource;
}

/** Bound decoded still-image size in the live Player; export keeps the source pixels.
 * 640px wide is sufficient for the typical portrait viewer. A full-canvas RGBA
 * layer uses ~2.8 MiB here versus ~4.6 MiB at 828px; transparent padding still
 * consumes decode/GPU memory, so dense cutout stacks benefit from this bound.
 */
export function resolveStillPlaybackSource(source: string, isRendering: boolean, duration: number, props?: Record<string, unknown> | null) {
  // Distance-field channels are data: lossy optimization changes ring geometry.
  if (props?.edge_aura != null || props?.contour_model != null) return source;
  if(isRendering)return source;
  const prepared=props?.runtime_still_preview as {source_url?:unknown;url?:unknown;preview_hash?:unknown;preserve_original?:unknown}|undefined;
  if(prepared?.source_url===source&&prepared.preserve_original===true)return source;
  if(prepared?.source_url===source&&typeof prepared.url==='string'
    &&/^\/api\/projects\/[^/]+\/media\/\.prepared\/editor-still-v1\/[a-f0-9]{64}\/preview\.png$/.test(prepared.url)
    &&typeof prepared.preview_hash==='string'&&/^[a-f0-9]{64}$/.test(prepared.preview_hash))return prepared.url;
  if (isRendering || duration > 1.1 || !PROJECT_LOCAL_MEDIA.test(source) || !PNG_SOURCE.test(source)) {
    return source;
  }
  return `/_next/image?url=${encodeURIComponent(source)}&w=640&q=75`;
}

/** Dense local still runs need a small lookahead, not seconds of mounted layers. */
export function stillPreviewPremountSeconds(source: string | null, duration: number, isRendering: boolean) {
  return !isRendering && source != null && PROJECT_LOCAL_MEDIA.test(source)
    && PNG_SOURCE.test(source) && duration <= 1.1
    ? 0.6
    : 2;
}
