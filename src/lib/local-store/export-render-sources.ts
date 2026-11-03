import type { TimelineElement } from "@/components/studio/timeline/types";

import { HDR_CODE_VIDEO_RECIPE } from "../media-analysis/color-profile";
import { awaitsRenderAuthority, preparedSourceEncoding, readPreparation } from "./media-preparation";
import { validatePreviewProxy } from "./preview-proxy-validation";
import { resolveLocalMediaSource } from "./audio-effects";

/** Export still decodes the original. Its sampling clock needs the verified
 * proxy cadence that preview uses; omitting that proof changes frame selection.
 * Only existing preparation is read here: rendering never queues a new proxy. */
export function withExportPreviewCadence(projectId: string, elements: readonly TimelineElement[], deps = {
  preview: (project: string, element: TimelineElement): { url: string | null; quality: unknown } => {
    const props = element.props ?? {};
    let local = element.source_url ? resolveLocalMediaSource(project, element.source_url, { allowReferencedProject: true }) : null;
    const archival = typeof props.archival_source_url === "string" ? resolveLocalMediaSource(project, props.archival_source_url, { allowReferencedProject: true }) : null;
    if (archival) {
      const original = readPreparation(archival.sourceProjectId, archival.relativePath);
      if (element.source_url === props.archival_source_url || (original?.render === local?.relativePath && local?.sourceProjectId === archival.sourceProjectId)) local = archival;
    }
    const prepared = local ? readPreparation(local.sourceProjectId, local.relativePath) : null;
    // readPreparation rejects replaced-source stat fingerprints. Do not then
    // revive its obsolete proxy through a durable preview_source_url fallback.
    if ((prepared && prepared.source !== local?.relativePath) || (!prepared && props.media_preparation_recipe === "editor-media-v1")) return { url: null, quality: undefined };
    if (prepared?.preview) return { url: `/api/projects/${local!.sourceProjectId}/media/${prepared.preview.split("/").map(encodeURIComponent).join("/")}`, quality: prepared.prepared_preview_quality };
    const declared = props.runtime_preview_source_url ?? props.preview_source_url;
    return { url: typeof declared === "string" ? declared : null, quality: (props.preview_proxy_validation as { quality?: unknown } | undefined)?.quality };
  },
  validate: (url: string | null, alpha: boolean, quality: unknown) => validatePreviewProxy(url, alpha, quality),
}): TimelineElement[] {
  return elements.map(element => {
    if (element.type !== "video_clip") return element;
    const preview = deps.preview(projectId, element);
    return { ...element, props: { ...element.props,
      preview_proxy_validation: deps.validate(preview.url, element.props?.has_alpha === true, preview.quality),
    } };
  });
}

/**
 * The GPU exporter decodes SDR only. A clip placed before HDR sources were converted (a
 * cutout cut from HDR phone footage, registered as its own render source) still points at
 * the HDR file; its prepared package holds an SDR render copy. Export uses that copy, the
 * same choice the editor makes when it loads the clip. The saved timeline is not changed.
 */
export function sdrExportSources(projectId: string, elements: readonly TimelineElement[], deps = {
  isHdr: (url: string, alpha: boolean) => validatePreviewProxy(url, alpha).hdr,
  preparedRender: (source: string) => { const prepared = readPreparation(projectId, source); return prepared?.state === "ready" ? prepared.render ?? null : null; },
  preparedEncoding: (source: string) => preparedSourceEncoding(readPreparation(projectId, source)),
}): TimelineElement[] {
  const prefix = `/api/projects/${projectId}/media/`;
  const url = (relative: string) => prefix + relative.split("/").map(encodeURIComponent).join("/");
  return elements.map((element) => {
    if (element.type !== "video_clip" || !element.source_url?.startsWith(prefix)) return element;
    if (!deps.isHdr(element.source_url, element.props?.has_alpha === true)) return element;
    const archival = typeof element.props?.archival_source_url === "string" ? element.props.archival_source_url : element.source_url;
    if (!archival.startsWith(prefix)) return element;
    const prepared = deps.preparedRender(decodeURIComponent(archival.slice(prefix.length)));
    if (!prepared) return element;
    const render = url(prepared);
    // A code-value HDR authority needs its decode description, or the grade would read HLG/PQ as SDR.
    const encoding = deps.preparedEncoding?.(decodeURIComponent(archival.slice(prefix.length)));
    const props = encoding && !element.props?.source_color_space ? { ...element.props, source_color_space: encoding } : element.props;
    return render === element.source_url && props === element.props ? element : { ...element, source_url: render, props };
  });
}

/** The imported original a clip renders from directly, which is also its preparation package's key. */
function packageSource(projectId: string, element: TimelineElement) {
  const prefix = `/api/projects/${projectId}/media/`;
  if (element.type !== "video_clip" || !element.source_url?.startsWith(prefix)) return null;
  const source = decodeURIComponent(element.source_url.slice(prefix.length));
  return source.startsWith(".prepared/") ? null : source;
}

/** Sources of clips bound to an HDR original whose full-resolution authority is made only when an export needs it. */
export function sourcesAwaitingRenderAuthority(projectId: string, elements: readonly TimelineElement[], read = (source: string) => readPreparation(projectId, source)): string[] {
  return [...new Set(elements.flatMap((element) => {
    const source = packageSource(projectId, element);
    return source && awaitsRenderAuthority(read(source)) ? [source] : [];
  }))];
}

/**
 * Clips placed while their authority was deferred name the HDR original with the code-value decode
 * (`source_color_space`). Once the authority exists every renderer reads it instead, as a clip placed
 * after it would. The saved timeline is not changed.
 */
export function deferredRenderAuthorities(projectId: string, elements: readonly TimelineElement[], read = (source: string) => readPreparation(projectId, source)): TimelineElement[] {
  const prefix = `/api/projects/${projectId}/media/`;
  return elements.map((element) => {
    const source = packageSource(projectId, element);
    if (!source || !element.props?.source_color_space) return element;
    const prepared = read(source);
    if (prepared?.state !== "ready" || !prepared.render || prepared.render === source || prepared.color_management?.recipe_id !== HDR_CODE_VIDEO_RECIPE) return element;
    return { ...element, source_url: prefix + prepared.render.split("/").map(encodeURIComponent).join("/") };
  });
}

/**
 * What a frame check draws for each clip, matching the editor. A clip bound to an HDR original draws its
 * authority once it exists (deferredRenderAuthorities); until then the original would reach the renderer
 * already tone-mapped by the browser and be decoded as HLG/PQ a second time (oversaturated, too red), so
 * it draws the preview proxy the editor shows, which holds the same code values. Returns the clips and
 * the sources drawn from their proxy, for the report. The saved timeline is not changed.
 */
export function frameCheckRenderSources(projectId: string, elements: readonly TimelineElement[], read = (source: string) => readPreparation(projectId, source)) {
  const prefix = `/api/projects/${projectId}/media/`;
  const fromProxy: string[] = [];
  const clips = deferredRenderAuthorities(projectId, elements, read).map((element) => {
    const source = packageSource(projectId, element);
    if (!source || !element.props?.source_color_space) return element;
    const prepared = read(source);
    if (!awaitsRenderAuthority(prepared) || !prepared?.preview) return element;
    fromProxy.push(source);
    return { ...element, source_url: prefix + prepared.preview.split("/").map(encodeURIComponent).join("/") };
  });
  return { clips, fromProxy: [...new Set(fromProxy)] };
}
