import { runMotionScript } from "@/lib/local-store/motion-script-runner";
import { SOURCE_CANVAS_TRACK_PROP, type SourceCanvasTrack } from "@/lib/timeline/source-projection";

type DensityRender = { media_path: string; width: number; height: number; canvas_track: SourceCanvasTrack | null };
type ClipLike = { type: string; source_url?: string | null; props?: Record<string, unknown> | null };

/** The motion-graphic render a clip plays, as the project-relative path its receipt records. */
export function motionRenderPath(projectId: string, sourceUrl: string | null | undefined): { compositionId: string; renderPath: string } | null {
  const prefix = `/api/projects/${projectId}/media/`;
  if (!sourceUrl?.startsWith(prefix)) return null;
  const relative = decodeURIComponent(sourceUrl.slice(prefix.length).split(/[?#]/)[0]);
  const match = /^hyperframes\/([^/]+)\/[^/]+\.webm$/.exec(relative);
  return match && !relative.includes("..") && !/@\d+x\.webm$/.test(relative) ? { compositionId: match[1], renderPath: `media/${relative}` } : null;
}

/**
 * A 2K or 4K export renders each motion graphic again at that density, at export time, from the
 * composition and values its clip already plays: the 1080-canvas render the editor uses would
 * otherwise be stretched. Graphics whose code has changed since their render keep that render and
 * are reported, so the export still completes.
 */
export async function withDensityMotionGraphics<T extends ClipLike>(projectId: string, elements: T[], pixelScale: number,
  options: { signal?: AbortSignal; onStep?: (done: number, total: number) => void } = {},
  render: (projectId: string, compositionId: string, renderPath: string, signal?: AbortSignal) => Promise<DensityRender> = renderAtDensity): Promise<{ elements: T[]; kept: string[] }> {
  if (pixelScale <= 1) return { elements, kept: [] };
  const renders = new Map<string, DensityRender | null>(), kept: string[] = [];
  const total = new Set(elements.flatMap((element) => element.type === "video_clip" ? [motionRenderPath(projectId, element.source_url)?.renderPath ?? []].flat() : [])).size;
  if (total) options.onStep?.(0, total);
  const result: T[] = [];
  for (const element of elements) {
    const motion = element.type === "video_clip" ? motionRenderPath(projectId, element.source_url) : null;
    if (!motion) { result.push(element); continue; }
    if (!renders.has(motion.renderPath)) {
      try {
        renders.set(motion.renderPath, await render(projectId, motion.compositionId, motion.renderPath, options.signal));
      } catch (error) {
        // Stopping the export stops it; any other failure keeps that graphic's editor render.
        if (options.signal?.aborted) throw error;
        kept.push(`${motion.compositionId}: ${error instanceof Error ? error.message : String(error)}`);
        renders.set(motion.renderPath, null);
      }
      options.onStep?.(renders.size, total);
    }
    const dense = renders.get(motion.renderPath);
    if (!dense) { result.push(element); continue; }
    result.push({
      ...element,
      source_url: `/api/projects/${projectId}/${dense.media_path}`,
      props: { ...element.props, ...(dense.canvas_track ? { [SOURCE_CANVAS_TRACK_PROP]: dense.canvas_track } : {}) },
    });
  }
  return { elements: result, kept };
}

async function renderAtDensity(projectId: string, compositionId: string, renderPath: string, signal?: AbortSignal) {
  const { result } = await runMotionScript<DensityRender>("hyperframes-overlay", ["density", projectId, compositionId, "--render", renderPath, "--json"], { signal });
  return result;
}
