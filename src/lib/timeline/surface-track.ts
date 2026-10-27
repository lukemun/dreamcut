import { z } from "zod";
import { resolveSpeedStepSegments, speedStepFrame } from "./speed-steps";
import { resolveMediaTransformAtTime } from "./media-transform";
import { projectSourceToComposition } from "./source-projection";
import type { CompositionElement } from "../render/composition-adapters";

const pointSchema = z.tuple([z.number().finite().min(-1).max(2), z.number().finite().min(-1).max(2)]);
export const surfaceQuadSchema = z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]).refine(points => {
  const turns=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
  return turns.every(v=>v>1e-8)||turns.every(v=>v< -1e-8);
}, "Corners must form a non-collapsed convex surface in clockwise order");
export type SurfaceQuad = z.infer<typeof surfaceQuadSchema>;
export const surfaceSampleSchema = z.object({ t: z.number().finite().min(0).describe("Source second of this sample on the footage's own clock."),
  quad: surfaceQuadSchema.describe("The surface's four corners at t, top-left, top-right, bottom-right, bottom-left, as fractions of the source frame."),
  visible: z.boolean().describe("Whether the surface is in view at t."), confidence: z.number().finite().min(0).max(1).describe("Tracking confidence at t, 0 to 1.") }).strict();
export const surfaceTrackSchema = z.object({
  version: z.literal(1).describe("Track format version; always 1."), id: z.string().min(1).max(128).describe("The track's id from surface_track_status."),
  parentId: z.string().min(1).describe("The footage clip on the timeline the surface is in."), sourceUrl: z.string().min(1).describe("That footage's source URL."),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).describe("Fingerprint of that footage."), width: z.number().int().positive().max(16384).describe("Footage width in pixels."), height: z.number().int().positive().max(16384).describe("Footage height in pixels."),
  referenceTime: z.number().finite().min(0).describe("Source second the corners were first placed on."), samples: z.array(surfaceSampleSchema).min(1).max(1801).describe("Tracked corners over time, copied unchanged from surface_track_status."),
  visibleFrom: z.number().finite().min(0).describe("First source second the attachment shows."), visibleTo: z.number().finite().min(0).describe("Last source second the attachment shows."),
}).strict().superRefine((track, ctx) => {
  if (track.visibleTo < track.visibleFrom || track.samples.some((s, i) => i > 0 && s.t <= track.samples[i - 1].t))
    ctx.addIssue({ code: "custom", message: "Surface samples must be ordered and visibility range valid" });
});
export type SurfaceTrack = z.infer<typeof surfaceTrackSchema>;
export function readSurfaceTrack(value: unknown): SurfaceTrack | null {
  const parsed = surfaceTrackSchema.safeParse(value); return parsed.success ? parsed.data : null;
}
export function sampleSurface(track: SurfaceTrack, t: number): SurfaceQuad | null {
  if (t < track.visibleFrom || t > track.visibleTo || t < track.samples[0].t || t > track.samples.at(-1)!.t) return null;
  const right = track.samples.findIndex(s => s.t >= t);
  const b = track.samples[right], a = track.samples[Math.max(0, right - 1)];
  if (Math.abs(b.t - t) < 1e-6) return b.visible ? b.quad : null;
  if (!a.visible || !b.visible || b.t - a.t > .15) return null;
  const p = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a.quad.map((v, i) => [v[0] + (b.quad[i][0] - v[0]) * p, v[1] + (b.quad[i][1] - v[1]) * p]) as SurfaceQuad;
}
/** Projective mapping from unit square to ordered TL/TR/BR/BL corners. */
export function quadMatrixValues(quad: SurfaceQuad, size: number | [number,number] = 1000): number[] | null {
  const uv = [[0,0],[1,0],[1,1],[0,1]];
  const rows = quad.flatMap(([x,y], i) => { const [u,v] = uv[i]; return [[u,v,1,0,0,0,-x*u,-x*v,x],[0,0,0,u,v,1,-y*u,-y*v,y]]; });
  for (let col=0; col<8; col++) {
    let pivot=col; for (let r=col+1;r<8;r++) if (Math.abs(rows[r][col])>Math.abs(rows[pivot][col])) pivot=r;
    if (Math.abs(rows[pivot][col])<1e-9) return null;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const div=rows[col][col]; rows[col]=rows[col].map(v=>v/div);
    for(let r=0;r<8;r++) if(r!==col) { const factor=rows[r][col]; rows[r]=rows[r].map((v,i)=>v-factor*rows[col][i]); }
  }
  const [a,b,c,d,e,f,g,h]=rows.map(r=>r[8]);
  const [sx,sy]=typeof size === "number" ? [size,size] : size;
  return [a/sx,d/sx,0,g/sx,b/sy,e/sy,0,h/sy,0,0,1,0,c,f,0,1];
}
/** CSS and GPU backends consume the same projective solution. */
export function quadMatrix(quad: SurfaceQuad, size: number | [number,number] = 1000): string | null {
  const values=quadMatrixValues(quad,size);
  return values ? `matrix3d(${values.join(',')})` : null;
}
/** A full-source cutout carries the original source clock and fingerprint. */
export function isSurfaceSource(track: SurfaceTrack, parent: CompositionElement) {
  const mediaPath=(value:string)=>{try{return new URL(value, "http://dreamcut.local").pathname;}catch{return value;}};
  if (parent.source_url && mediaPath(parent.source_url) === mediaPath(track.sourceUrl)) return true;
  // Prepared playback swaps the tracked footage for its own preview proxy (render/prepared-sources.ts).
  const proxies = [parent.props?.runtime_preview_source_url, parent.props?.preview_source_url].filter((url): url is string => typeof url === "string");
  if (parent.id === track.parentId && parent.source_url && proxies.some(url => mediaPath(url) === mediaPath(parent.source_url!))) return true;
  const receipt = parent.props?.custom_cutout_receipt as {source_sha256?:string;source_interval_seconds?:number[]} | undefined;
  return parent.props?.has_alpha === true && receipt?.source_sha256 === track.sourceSha256
    && receipt.source_interval_seconds?.[0] === 0;
}
/** Candidates are in back-to-front compositing order. Follow the visible copy. */
export function surfacePresentationParent(track: SurfaceTrack, parents: CompositionElement[], frame: number, fps=30) {
  return parents.findLast(parent => (parent.id === track.parentId || parent.props?.has_alpha === true)
    && frame >= Math.round(parent.timeline_start*fps)
    && frame < Math.round((parent.timeline_start+parent.duration)*fps) && isSurfaceSource(track,parent));
}
export function trackedQuadAtFrame(track: SurfaceTrack, parent: CompositionElement | undefined, timelineFrame: number, canvas: {width:number;height:number}, fps=30, presentedSourceTime?: number): SurfaceQuad | null {
  if (!parent || !isSurfaceSource(track,parent)) return null;
  const localFrame=timelineFrame-Math.round(parent.timeline_start*fps);
  if(localFrame<0 || localFrame>=Math.round(parent.duration*fps)) return null;
  const segments=resolveSpeedStepSegments(parent);
  const sourceTime=segments.length ? speedStepFrame(segments,localFrame,fps).sourceTimeSeconds
    : Math.round(parent.trim_start*fps)/fps+localFrame/fps*parent.playback_rate;
  const quad=sampleSurface(track,presentedSourceTime ?? sourceTime); if(!quad) return null;
  if(parent.props?.media_orientation || parent.props?.media_mirror || parent.props?.surfaceMode === "wall") return null;
  const transform=resolveMediaTransformAtTime(parent.props,localFrame/fps);
  const {transformed_rect:r}=projectSourceToComposition({source_width:track.width,source_height:track.height,
    composition_width:canvas.width,composition_height:canvas.height,fit:"contain",media_scale:transform.scale,
    media_offset_x:transform.offsetX,media_offset_y:transform.offsetY,timeline_time_seconds:0,timeline_start_seconds:0});
  return quad.map(([x,y])=>[r.x+x*r.width,r.y+y*r.height]) as SurfaceQuad;
}
