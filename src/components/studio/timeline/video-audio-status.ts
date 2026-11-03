import { readVolumeEnvelopePoints } from "@/lib/timeline/volume-envelope";
import type { TimelineElement } from "./types";

/** Source audio presence and mix state are different from picture/speech linking. */
export function videoAudioStatus(element: TimelineElement | null, laneMuted = false) {
  if (!element || element.type !== "video_clip") return null;
  const present = element.props?.runtime_source_has_audio;
  if (present === false) return { state: "none", label: "No audio", description: "This video source has no audio track." } as const;
  if (present !== true) return { state: "unknown", label: "Audio unknown", description: "Audio presence has not been checked for this video." } as const;
  if (laneMuted) return { state: "muted", label: "Muted", description: "This video has audio, but its timeline lane is muted." } as const;
  if (readVolumeEnvelopePoints(element, element.duration).every(point => point.volume === 0)) {
    return { state: "muted", label: "Muted", description: "This video has audio, but its clip volume is muted. Open Audio to raise the volume." } as const;
  }
  return { state: "available", label: "Audio", description: "This video has audio and its clip volume is enabled." } as const;
}
