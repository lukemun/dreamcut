import type { TimelineElement } from "@/components/studio/timeline/types";

import { preparedSourceEncoding, readPreparation } from "./media-preparation";
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
