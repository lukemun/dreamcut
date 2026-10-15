type PreviewNarrationAudioElement = {
  id?: string | null;
  timeline_start?: number | null;
  duration?: number | null;
  trim_start?: number | null;
  trim_end?: number | null;
  playback_rate?: number | null;
  volume?: number | null;
  props?: Record<string, unknown> | null;
};

// A gain this close to unity is not worth moving spoken audio onto Web Audio's
// separate scheduling path. The native media element is capped at 1.0 in
// preview (at most 0.42 dB below a 1.05 source), while the final render retains
// the exact authored gain. This keeps ordinary narration on the stable clock.
export const PREVIEW_NATIVE_CLOCK_GAIN_CEILING = 1.05;

export function readPreviewAudioBakedGain(element: PreviewNarrationAudioElement) {
  if (!element.props?.preview_audio_source_url && element.props?.runtime_preview_audio_source_url) return 1;
  const candidate = Number(element.props?.preview_audio_baked_gain);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
}

export function shouldUseWebAudioForPreviewNarration(element: PreviewNarrationAudioElement) {
  const bakedGain = readPreviewAudioBakedGain(element);
  if (Number(element.volume) / bakedGain > PREVIEW_NATIVE_CLOCK_GAIN_CEILING) return true;
  const envelope = element.props?.volume_envelope;
  return Array.isArray(envelope)
    && envelope.some(
      (point) =>
        Number((point as { volume?: unknown })?.volume) / bakedGain
        > PREVIEW_NATIVE_CLOCK_GAIN_CEILING,
    );
}

export function previewNarrationGain(
  gain: number,
  useWebAudio: boolean,
  bakedGain = 1,
) {
  const effectiveGain = gain / bakedGain;
  if (useWebAudio) return effectiveGain;
  return Math.min(1, Math.max(0, effectiveGain));
}

/**
 * Remotion reuses one pool of HTMLAudioElements. Once a pooled tag has been
 * routed through createMediaElementSource() for an amplified clip, reusing
 * that tag later as "native" media can leave it playing into a disconnected
 * Web Audio node — its clock advances but it is silent. Keep timeline <Audio>
 * tracks homogeneous in preview so moving/remounting an SFX cannot poison the
 * next music or voice owner of that tag. Rendering keeps authored topology.
 */
export function shouldUseWebAudioForTimelineTrack(
  isRendering: boolean,
  authoredTopologyUsesWebAudio: boolean,
) {
  return isRendering ? authoredTopologyUsesWebAudio : true;
}

/**
 * Replace an audio clock when an edit changes its clip's source-time mapping.
 * Otherwise React can preserve a native <Audio> instance whose picture has
 * moved or been retrimmed, leaving the voice on stale timing until reload.
 * The Player and every unrelated clip stay mounted.
 */
export function previewAudioPlaybackIdentity(
  element: PreviewNarrationAudioElement,
  sourceUrl: string,
  useWebAudioApi?: boolean,
) {
  return [
    element.id ?? "",
    sourceUrl,
    Number(element.timeline_start) || 0,
    Number(element.duration) || 0,
    Number(element.trim_start) || 0,
    Number(element.trim_end) || 0,
    Number(element.playback_rate) || 1,
    useWebAudioApi === true ? "web-audio" : "native-media",
  ].join("|");
}
