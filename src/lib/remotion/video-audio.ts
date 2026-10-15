export function shouldPlayEmbeddedVideoAudio() {
  return true;
}

export function resolveEmbeddedVideoVolume<TVolume>(
  _props: Record<string, unknown> | null | undefined,
  volume: TVolume,
): TVolume {
  return volume;
}
