export type VideoPlaybackWindow = {
  id: string;
  laneKey: string;
  timelineStart: number;
  duration: number;
};

export function collectTightlySyncedVideoIds(entries: VideoPlaybackWindow[]): Set<string> {
  const ids = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index]!;
    const currentEnd = current.timelineStart + current.duration;
    for (let candidateIndex = index + 1; candidateIndex < entries.length; candidateIndex += 1) {
      const candidate = entries[candidateIndex]!;
      if (current.laneKey === candidate.laneKey) continue;
      const candidateEnd = candidate.timelineStart + candidate.duration;
      const overlaps = current.timelineStart < candidateEnd
        && candidate.timelineStart < currentEnd;
      if (!overlaps) continue;
      ids.add(current.id);
      ids.add(candidate.id);
    }
  }
  return ids;
}

export function requiresTightVideoSync({
  id,
  hasSeparatePreviewAudio,
  hasAudibleEmbeddedAudio,
  isSilentCompositingLayer = false,
  isSpeechLinked = false,
  tightlySyncedVideoIds,
}: {
  id: string;
  hasSeparatePreviewAudio: boolean;
  hasAudibleEmbeddedAudio: boolean;
  isSilentCompositingLayer?: boolean;
  isSpeechLinked?: boolean;
  tightlySyncedVideoIds: ReadonlySet<string>;
}): boolean {
  if (isSpeechLinked) return true;
  // Alpha/matte overlays are visually subordinate to the narration-bearing
  // picture. Forcing their browser decoder back to a two-frame tolerance can
  // create a corrective-seek loop at a word-level edit, stalling the Player
  // even though the layer is silent. Export remains frame-exact; live preview
  // lets this layer recover without owning the shared clock.
  if (isSilentCompositingLayer && !hasSeparatePreviewAudio && !hasAudibleEmbeddedAudio) {
    return false;
  }
  // A video-only proxy and its separately mounted audio proxy must share the
  // tighter clock. Otherwise Remotion may allow the video to drift within its
  // normal preview tolerance while captions remain locked to the audio clock.
  return hasSeparatePreviewAudio || hasAudibleEmbeddedAudio || tightlySyncedVideoIds.has(id);
}

export function shouldPauseTimelineForVideoBuffering({
  hasSeparatePreviewAudio,
  hasAudibleEmbeddedAudio,
  isSpeechLinked = false,
}: {
  hasSeparatePreviewAudio: boolean;
  hasAudibleEmbeddedAudio: boolean;
  isSpeechLinked?: boolean;
}): boolean {
  // Only a muxed, audible video owns the speech clock. When narration is
  // detached, its Audio node is the clock authority and the picture is a
  // follower (including speech-linked alpha cutouts). Asking a follower to
  // pauseWhenBuffering can stall Remotion's frame clock while the independent
  // HTML audio keeps advancing — the exact audio-running/frozen-picture drift
  // this policy is meant to prevent. Followers are premounted and corrected to
  // the audio clock, but cannot stop it.
  void hasSeparatePreviewAudio;
  void isSpeechLinked;
  return hasAudibleEmbeddedAudio;
}

export function shouldPauseTimelineForAudioBuffering(type: string): boolean {
  // Narration remains the authoritative playback clock. A short decorative
  // effect must never stall the entire Player at its cue boundary: doing so
  // makes the picture freeze and can replay nearby speech when playback
  // resumes. Sound effects are premounted and may be skipped on a cold miss;
  // longer-form narration/music retain Remotion's buffering protection.
  return type !== "sound_effect";
}

/** Warm the next source-bound decoder before a speed-step handoff. */
export function speedSegmentPremountFrames(segmentCount: number, fps: number, isRendering: boolean) {
  return !isRendering && segmentCount > 1 ? Math.max(1, Math.round(fps / 2)) : 0;
}
