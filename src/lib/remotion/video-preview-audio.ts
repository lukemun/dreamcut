import type { CompositionElement } from "@/lib/render/composition-adapters";

export function resolvePreviewAudioSource(
  element: Pick<CompositionElement, "props" | "volume">,
  isRendering: boolean,
): string | null {
  if (isRendering || element.volume <= 0) return null;
  // A reversed clip previews only its prepared backward track; forward sound would contradict the picture.
  if (element.props?.playback_reverse === true) {
    const reversed = element.props.runtime_preview_audio_reverse_source_url;
    return typeof reversed === "string" && reversed.length > 0 && reversedPreviewAudioDuration(element) ? reversed : null;
  }
  // Runtime cache repair may replace a legacy muxed render file with a small
  // timing-identical audio-only clock. It is deliberately authoritative only
  // in preview and is stripped before persistence.
  const candidate = element.props?.runtime_preview_audio_source_url ?? element.props?.preview_audio_source_url;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/** Length of the source sound behind a prepared reversed preview track, or null when none is ready. */
export function reversedPreviewAudioDuration(element: Pick<CompositionElement, "props">): number | null {
  const value = Number(element.props?.runtime_preview_audio_reverse_duration);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Source time on the reversed preview track: source time `s` sits at `duration - s`. */
export function reversedPreviewAudioTime(element: Pick<CompositionElement, "props">, sourceSeconds: number): number | null {
  const duration = reversedPreviewAudioDuration(element);
  return duration == null ? null : Math.max(0, duration - sourceSeconds);
}
