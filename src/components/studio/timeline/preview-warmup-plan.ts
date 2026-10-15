import type { CompositionElement } from "@/lib/render/composition-adapters";
import { resolvePreviewAudioSource } from "@/lib/remotion/video-preview-audio";
import { catalogAudioPreviewUrl } from "@/lib/remotion/catalog-audio-preview";
import { resolveStillPlaybackSource, resolveVideoPlaybackSource } from "@/lib/remotion/video-preview-source";
import { timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import { projectCompoundPreviews } from "@/lib/timeline/compound-preview";

const AUDIO_ELEMENT_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

export type PreviewWarmupCandidate = {
  elementId: string;
  kind: "image" | "video" | "audio";
  sourceUrl: string;
  preloadKey: string;
  sourceTimeSeconds: number;
  activeAtPlayhead: boolean;
};

type PreviewWarmupOptions = {
  lookaheadSeconds?: number;
  lookbehindSeconds?: number;
  visualLimit?: number;
  audioLimit?: number;
};

/**
 * Start fetching the exact proxy and source window well before Remotion mounts
 * the incoming clip.  The old 2.5s window was too narrow for VP9 alpha proxies
 * (and for a cold browser cache): metadata could arrive while the first frame
 * was still undecoded, producing a hitch at every editorial boundary.
 */
export const IMMINENT_CUT_LOOKAHEAD_SECONDS = 8;

function overlapsWindow(element: CompositionElement, start: number, end: number) {
  return element.timeline_start < end && element.timeline_start + element.duration > start;
}

function isActiveAt(element: CompositionElement, seconds: number) {
  return element.timeline_start <= seconds && seconds < element.timeline_start + element.duration;
}

function sourceTimeAt(element: CompositionElement, playheadSeconds: number) {
  const localSeconds = Math.max(0, playheadSeconds - element.timeline_start);
  return Math.max(0, timelineTimeToSourceTime(element, localSeconds));
}

function priorityAt(playheadSeconds: number, candidate: PreviewWarmupCandidate, element: CompositionElement) {
  if (candidate.activeAtPlayhead) return 0;
  if (element.timeline_start >= playheadSeconds) return 1 + element.timeline_start - playheadSeconds;
  return 10_000 + playheadSeconds - (element.timeline_start + element.duration);
}

/**
 * Resolve the exact browser media mounted by the preview, rather than warming
 * render-authority URLs that Remotion will not use during live review.
 */
export function buildPreviewWarmupPlan(
  elements: CompositionElement[],
  playheadSeconds: number,
  options: PreviewWarmupOptions = {},
): PreviewWarmupCandidate[] {
  const lookaheadSeconds = options.lookaheadSeconds ?? 18;
  const lookbehindSeconds = options.lookbehindSeconds ?? 2;
  const visualLimit = options.visualLimit ?? 5;
  const audioLimit = options.audioLimit ?? 6;
  const windowStart = Math.max(0, playheadSeconds - lookbehindSeconds);
  const windowEnd = playheadSeconds + lookaheadSeconds;

  const inWindow = projectCompoundPreviews(elements, false).filter((element) => overlapsWindow(element, windowStart, windowEnd));

  const visualEntries = inWindow
    .filter((element) => element.type === "still" || element.type === "video_clip")
    .map((element) => {
      const sourceUrl = element.type === "still" && element.source_url
        ? resolveStillPlaybackSource(element.source_url, false, element.duration, element.props)
        : resolveVideoPlaybackSource(element, element.source_url, false);
      if (!sourceUrl) return null;
      const activeAtPlayhead = isActiveAt(element, playheadSeconds);
      const sourceTimeSeconds = sourceTimeAt(element, playheadSeconds);
      const kind = element.type === "still" ? "image" as const : "video" as const;
      return {
        element,
        candidate: {
          elementId: element.id,
          kind,
          sourceUrl,
          preloadKey: kind === "video" ? `${sourceUrl}#trim=${element.trim_start}` : sourceUrl,
          sourceTimeSeconds,
          activeAtPlayhead,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => priorityAt(playheadSeconds, a.candidate, a.element) - priorityAt(playheadSeconds, b.candidate, b.element));

  // A busy composition can have several long-running backgrounds and alpha
  // overlays active at once. If those consume every warmup slot, a short edit
  // arriving at the playhead has to seek cold and playback visibly stalls at
  // the cut. Reserve all but one slot (up to three) for the next imminent video
  // boundaries, then fill the remaining budget with the normal active-first
  // priority order.
  const imminentReservationCount = Math.min(3, Math.max(0, visualLimit - 1));
  const imminent = visualEntries
    .filter(({ candidate, element }) => (
      !candidate.activeAtPlayhead
      && element.type === "video_clip"
      && element.timeline_start >= playheadSeconds
      && element.timeline_start - playheadSeconds <= IMMINENT_CUT_LOOKAHEAD_SECONDS
    ))
    .slice(0, imminentReservationCount);
  const imminentIds = new Set(imminent.map(({ element }) => element.id));
  const general = visualEntries
    .filter(({ element }) => !imminentIds.has(element.id))
    .slice(0, Math.max(0, visualLimit - imminent.length));
  const visuals = [...general, ...imminent]
    .sort((a, b) => priorityAt(playheadSeconds, a.candidate, a.element) - priorityAt(playheadSeconds, b.candidate, b.element))
    .map(({ candidate }) => candidate);

  const audio = inWindow
    .flatMap((element) => {
      const previewAudioSource = resolvePreviewAudioSource(element, false);
      const sourceUrl = previewAudioSource
        ?? (AUDIO_ELEMENT_TYPES.has(element.type) && element.source_url ? catalogAudioPreviewUrl(element.source_url) : null);
      if (!sourceUrl) return [];
      const activeAtPlayhead = isActiveAt(element, playheadSeconds);
      return [{
        element,
        candidate: {
          elementId: element.id,
          kind: "audio" as const,
          sourceUrl,
          preloadKey: `${sourceUrl}#trim=${element.trim_start}`,
          sourceTimeSeconds: sourceTimeAt(element, playheadSeconds),
          activeAtPlayhead,
        },
      }];
    })
    .sort((a, b) => priorityAt(playheadSeconds, a.candidate, a.element) - priorityAt(playheadSeconds, b.candidate, b.element))
    .slice(0, audioLimit)
    .map(({ candidate }) => candidate);

  const seen = new Set<string>();
  // Audio can pause the shared clock when it arrives cold. Start these small
  // requests before asking the browser to decode several video GOPs.
  return [...audio, ...visuals].filter((candidate) => {
    if (seen.has(candidate.preloadKey)) return false;
    seen.add(candidate.preloadKey);
    return true;
  });
}
