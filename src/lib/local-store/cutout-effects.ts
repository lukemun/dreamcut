import type { TimelineElement } from "@/components/studio/timeline/types";
import type { CutoutEffects, CutoutVersion } from "@/lib/timeline/cutout-effects";
import { readCustomCutouts, type CustomCutoutReceipt } from "./custom-cutouts";
import { mediaFileSha256, resolveLocalMediaSource } from "./audio-effects";
import { readPreparation, enqueueMediaPreparation } from "./media-preparation";
import { validatePreviewProxy } from "./preview-proxy-validation";
import { applyElementPatch } from "./element-patch";
import { validateSurfaceTrackSource } from "./surface-track";
import type { TimelineElementPatch } from "@/lib/timeline/contracts";

export function applyPreparedElementPatch(element: TimelineElement, input: TimelineElementPatch, options: { fps?: number } = {}) {
  const patch = { ...input };
  if (patch.props?.surface_track != null) {
    if(element.type !== "caption_text") throw Object.assign(Error("Surface attachments require text"),{status:400});
    validateSurfaceTrackSource(element.project_id,patch.props.surface_track);
  }
  if (patch.props?.cutout_effects !== undefined && JSON.stringify(patch.props.cutout_effects) !== JSON.stringify(element.props?.cutout_effects)) {
    patch.props = { ...patch.props, cutout_effects: prepareCutoutEffects(element, patch.props.cutout_effects) };
  }
  return applyElementPatch(element, patch, options);
}

/** Resolve trusted source versions at the safe-write boundary, never from browser URLs. */
export function prepareCutoutEffects(element: TimelineElement, requested: unknown): CutoutEffects {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
  const state = requested as Partial<CutoutEffects> | null;
  if (!state || typeof state.background !== "boolean" || typeof state.scratchpad !== "boolean") return fail("Invalid cutout effect selection.");
  const receipt = element.props?.custom_cutout_receipt as CustomCutoutReceipt | undefined;
  const catalog = readCustomCutouts(element.project_id).cutouts;
  const trusted = catalog.find(r => r.cutout_id === receipt?.cutout_id);
  if (!trusted || trusted.output_relative_path !== receipt?.output_relative_path) return fail("This cutout has no reversible source record.");
  const url = (relative: string) => `/api/projects/${element.project_id}/media/${relative.split("/").map(encodeURIComponent).join("/")}`;
  if (element.source_url !== url(trusted.output_relative_path)) return fail("The cutout source no longer matches its effect record.");
  const verify = (relative: string, hash: string) => {
    const media = resolveLocalMediaSource(element.project_id, url(relative));
    if (!media || mediaFileSha256(media.absolutePath) !== hash) fail("An effect source is missing or changed. Restore it before switching effects.");
  };
  const previous = element.props?.cutout_effects as CutoutEffects | undefined;
  const result: CutoutEffects = { ...previous, schema_version: 1, background: state.background, scratchpad: state.scratchpad };
  if (!state.background) {
    verify(trusted.source_relative_path, trusted.source_sha256);
    const prepared = readPreparation(element.project_id, trusted.source_relative_path) ?? enqueueMediaPreparation(element.project_id, trusted.source_relative_path);
    if (prepared?.state === "failed") return fail("Original preview preparation failed. Retry preparation in Media before switching effects.");
    if (!prepared || prepared.state !== "ready" || !prepared.preview || !prepared.duration) return fail("Preparing the original preview. Try again when media preparation finishes.");
    result.original = { source_url: url(prepared.render ?? trusted.source_relative_path), preview_source_url: url(prepared.preview),
      duration: prepared.duration, offset: trusted.source_interval_seconds[0], alpha: false };
  } else if (!state.scratchpad && trusted.scratchpad_treatment) {
    const treatment = trusted.scratchpad_treatment;
    const clean = catalog.find(r => r.cutout_id === treatment.parent_cutout_id);
    if (!clean || JSON.stringify(clean.source_interval_seconds) !== JSON.stringify(trusted.source_interval_seconds)) return fail("The clean cutout is unavailable. Restore its source first.");
    verify(clean.output_relative_path, treatment.parent_sha256);
    let preview = clean.preview?.relative_path;
    if (preview && clean.preview) verify(preview, clean.preview.sha256);
    else {
      const prepared = readPreparation(element.project_id, clean.output_relative_path) ?? enqueueMediaPreparation(element.project_id, clean.output_relative_path);
      if (prepared?.state === "failed") return fail("Clean cutout preview preparation failed. Retry preparation in Media before switching effects.");
      if (prepared?.state !== "ready" || !prepared.preview) return fail("Preparing the clean cutout preview. Try again when media preparation finishes.");
      preview = prepared.preview;
    }
    result.clean = { source_url: url(clean.output_relative_path), preview_source_url: url(preview), duration: clean.output_duration_seconds, offset: 0, alpha: true };
  }
  const selected: CutoutVersion | undefined = !state.background ? result.original : !state.scratchpad && trusted.scratchpad_treatment ? result.clean : undefined;
  if (selected && !validatePreviewProxy(selected.preview_source_url, selected.alpha).ok) return fail("This effect version needs a valid low-resolution preview before it can be selected.");
  return result;
}
