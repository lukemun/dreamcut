import type { TimelineElement } from "@/components/studio/timeline/types";

import { HDR_CODE_VIDEO_RECIPE } from "../media-analysis/color-profile";
import { awaitsRenderAuthority, preparedSourceEncoding, readPreparation } from "./media-preparation";
import { validatePreviewProxy } from "./preview-proxy-validation";

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
