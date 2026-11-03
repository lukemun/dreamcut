import { execFile } from "node:child_process";
import { promisify } from "node:util";

type DescriptionProbe = {
  streams?: Array<{ duration?: string; nb_frames?: string; avg_frame_rate?: string }>;
  format?: { duration?: string };
};

/** Describe the picture's span, not a longer audio tail in the same container. */
export function videoDescriptionDurationFromProbe(probe: DescriptionProbe): number {
  const video = probe.streams?.[0];
  if (!video) throw new Error("No video stream to describe");
  const [numerator, denominator = "1"] = (video.avg_frame_rate ?? "").split("/");
  const rate = Number(numerator) / Number(denominator);
  const frameDuration = Number(video.nb_frames) / rate;
  for (const seconds of [Number(video.duration), frameDuration, Number(probe.format?.duration)]) {
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  throw new Error("Could not read video duration for descriptions");
}

export async function probeVideoDescriptionDuration(source: string): Promise<number> {
  const { stdout } = await promisify(execFile)("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=duration,nb_frames,avg_frame_rate:format=duration", "-of", "json", source,
  ], { timeout: 60_000 });
  return videoDescriptionDurationFromProbe(JSON.parse(stdout) as DescriptionProbe);
}
