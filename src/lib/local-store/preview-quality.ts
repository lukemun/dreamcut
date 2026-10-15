import { readProjectFrameRate } from "./store";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";
import { enqueueMediaPreparation, readPreparation } from "./media-preparation";
import { resolveLocalMediaSource } from "./audio-effects";
import { validatePreviewProxy } from "./preview-proxy-validation";
import type { PreviewQuality } from "../preview-quality";

/** Resolve the worker's prepared package. No playback-time transcoding. */
export function hydratePreviewQuality(projectId: string, sourceUrl: string | null, props: Record<string, unknown>, quality: PreviewQuality): Record<string, unknown> {
  if (!sourceUrl) return props;
  let source = resolveLocalMediaSource(projectId, sourceUrl, { allowReferencedProject: true });
  const archival = typeof props.archival_source_url === "string" ? resolveLocalMediaSource(projectId, props.archival_source_url, { allowReferencedProject: true }) : null;
  if (archival) {
    const ready = readPreparation(archival.sourceProjectId, archival.relativePath);
    if (sourceUrl === props.archival_source_url || (ready?.render && source?.relativePath === ready.render && source.sourceProjectId === archival.sourceProjectId)) source = archival;
  }
  if (!source) return props;
  // Proxies run at the consuming project's frame rate; a rate change re-prepares like a quality change.
  const frameRate = readProjectFrameRate(projectId);
  const preparation = enqueueMediaPreparation(source.sourceProjectId, source.relativePath, false, frameRate);
  if (!preparation) return props;
  // A quality upgrade retains the previous, source-bound proxy. Keep it playable
  // until the replacement passes preparation, including when that upgrade fails.
  const preview = preparation.preview ? `/api/projects/${source.sourceProjectId}/media/${preparation.preview.split("/").map(encodeURIComponent).join("/")}` : null;
  const proof = validatePreviewProxy(preview, preparation.alpha === true, preparation.prepared_preview_quality);
  if (preparation.state !== "ready" || (preparation.preview_quality ?? "prepared") !== quality || (preparation.preview_frame_rate ?? COMPOSITION_FPS) !== frameRate || !preparation.preview) {
    if (preview && proof.ok) return { ...props, runtime_preview_source_url: preview, preview_proxy_validation: proof,
      runtime_preview_preparation: { state: "ready", quality, using_previous: true, upgrade_state: preparation.state, error: preparation.error } };
    return { ...props, preview_proxy_validation: { ...validatePreviewProxy(null, props.has_alpha === true), ok: false }, runtime_preview_preparation: { state: preparation.state, quality, error: preparation.error } };
  }
  return { ...props, runtime_preview_source_url: preview, preview_proxy_validation: proof, runtime_preview_preparation: { state: "ready", quality } };
}
