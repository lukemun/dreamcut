import { z } from "zod";

/** A catalog sampling plan covers the clip, without claiming continuous observation. */
export const VIDEO_DESCRIPTION_RECIPE = "video-descriptions-v1";
export const videoFrameDescriptionSchema = z.object({
  id: z.string().min(1).max(120),
  time_seconds: z.number().finite().nonnegative(),
  description: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(100)).max(24),
}).strict();
export type VideoFrameDescription = z.infer<typeof videoFrameDescriptionSchema>;
export const videoDescriptionSchema = z.object({
  schema_version: z.literal(1),
  recipe: z.literal(VIDEO_DESCRIPTION_RECIPE),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  duration_seconds: z.number().finite().positive(),
  summary: z.string().trim().min(1).max(4000),
  tags: z.array(z.string().trim().min(1).max(100)).max(50),
  frames: z.array(videoFrameDescriptionSchema).min(1).max(10000),
  summary_input_ids: z.array(z.string()).min(1).max(10000),
  uncertainties: z.array(z.string()).max(100),
}).strict();
export type VideoDescription = z.infer<typeof videoDescriptionSchema>;

export function videoDescriptionTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Video duration must be positive");
  if (duration > 9998) throw new Error("Video exceeds the bounded description plan; split analysis into source windows");
  const times = Array.from({ length: Math.ceil(duration) }, (_, i) => i).filter(t => t < duration - 0.05);
  const last = Math.max(0, duration - Math.min(0.05, duration / 2));
  if (!times.length || last - times.at(-1)! > 0.01) times.push(Number(last.toFixed(6)));
  return times;
}

export function validateVideoFrames(frames: VideoFrameDescription[], duration: number): void {
  const times = videoDescriptionTimes(duration);
  if (frames.length !== times.length || frames.some((frame, i) => Math.abs(frame.time_seconds - times[i]!) > 0.001)) {
    throw new Error("Video descriptions must include every planned sample across the whole clip (one per second plus the ending)");
  }
  if (new Set(frames.map(f => f.id)).size !== frames.length) throw new Error("Duplicate frame description id");
}

export function validateVideoDescription(value: unknown): VideoDescription {
  const description = videoDescriptionSchema.parse(value);
  validateVideoFrames(description.frames, description.duration_seconds);
  if (description.summary_input_ids.length !== description.frames.length
    || description.frames.some((frame, i) => frame.id !== description.summary_input_ids[i])) {
    throw new Error("Video summary must reference all frame descriptions in source order");
  }
  return description;
}

export function videoSearchQuery(query: string) {
  const words = query.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const ending = words.some(word => word === "ending" || word === "end");
  const beginning = words.some(word => word === "beginning" || word === "start");
  return { terms: words.filter(word => !["ending", "end", "beginning", "start"].includes(word)).map(word => word === "cats" ? "cat" : word),
    position: ending ? "ending" : beginning ? "beginning" : null };
}

export function videoSearchTextMatches(text: string, terms: string[]): boolean {
  const words = new Set((text.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(word => word === "cats" ? "cat" : word));
  return terms.every(term => words.has(term));
}

export function matchingVideoFrames(frames: VideoFrameDescription[], query: string, duration?: number): VideoFrameDescription[] {
  const { terms, position } = videoSearchQuery(query);
  if (!terms.length && !position) return [];
  const end = duration ?? frames.at(-1)?.time_seconds ?? 0;
  return frames.filter(frame => {
    if (position === "ending" && frame.time_seconds < end * 0.75) return false;
    if (position === "beginning" && frame.time_seconds > end * 0.25) return false;
    const text = `${frame.description} ${frame.tags.join(" ")}`.toLocaleLowerCase();
    return videoSearchTextMatches(text, terms);
  });
}

export type VideoCatalogDescription = {
  status: "ready" | "pending" | "stale" | "failed";
  summary: string | null;
  duration_seconds: number | null;
  tags: string[];
  frames: VideoFrameDescription[];
  coverage: string;
  reason: string | null;
};
