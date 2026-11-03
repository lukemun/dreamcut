/** Pure contract shared by the client waveform extractor (computeClientPeaks),
 * the editor's missing-peaks effect, and the peaks persistence route. Keeping
 * the three on one type set and one batch cap is what prevents the 400/retry
 * loop: the client must never count an element as "missing" that it cannot
 * compute, and must never post a body the route's schema rejects. */

/** Element types whose audio peaks the client extractor decodes and the peaks
 * route persists. Deliberately narrower than WAVEFORM_SUPPORTED_TYPES:
 * video_clip is waveform-*renderable* (peaks may arrive via split/duplicate
 * carry-over), but neither the client extractor nor the route computes or
 * accepts video container audio — counting video clips as "missing" re-fires
 * the compute effect on every elements change, forever. */
export const AUDIO_PEAK_ELEMENT_TYPES = new Set([
  "music",
  "vo_segment",
  "vo_full",
  "sound_effect",
]);

/** The peaks route's bodySchema caps items at 20 per POST. A media-heavy
 * project can exceed that in one cold load, so the client chunks. */
export const PEAKS_PERSIST_MAX_ITEMS = 20;

type PeakSourceElementLike = {
  type: string;
  source_url: string | null;
  _peaks?: number[];
};

/** Deduplicated source URLs that still need peaks and have not been attempted
 * this editor session. The attempted set is the retry guard: a source that
 * fails to decode or persist is not retried on every elements change. */
export function selectMissingPeakSourceUrls(
  elements: PeakSourceElementLike[],
  attempted: ReadonlySet<string>,
): string[] {
  const urls = elements
    .filter(
      (el) =>
        AUDIO_PEAK_ELEMENT_TYPES.has(el.type)
        && typeof el.source_url === "string"
        && el.source_url.length > 0
        && !el._peaks,
    )
    .map((el) => el.source_url as string);
  return [...new Set(urls)].filter((url) => !attempted.has(url));
}

/** Split persist items into route-acceptable batches. */
export function chunkPeakPersistItems<T>(
  items: T[],
  maxItems: number = PEAKS_PERSIST_MAX_ITEMS,
): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    chunks.push(items.slice(i, i + maxItems));
  }
  return chunks;
}

/** Clamp one extracted peak sample into the route schema's [-1, 1] range.
 * Decoded float32 PCM legitimately exceeds ±1.0 on hot masters and
 * inter-sample peaks; an unclamped 1.0231 fails the schema and rejects the
 * whole POST with a 400. Extraction takes abs(), so the floor is 0. */
export function clampPeakSample(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}

/** Downsample decoded mono PCM into max-amplitude bins without dropping the
 * non-divisible tail. This is the browser fallback equivalent of the
 * preprocessing worker's deterministic PCM16 peak recipe. */
export function extractMaxPeakSamples(
  samples: ArrayLike<number>,
  targetSamples: number,
): number[] {
  const sampleCount = Math.min(Math.max(1, Math.floor(targetSamples)), samples.length);
  if (sampleCount === 0) return [];
  const peaks: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const start = Math.floor((index * samples.length) / sampleCount);
    const end = Math.floor(((index + 1) * samples.length) / sampleCount);
    let max = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      const absolute = Math.abs(samples[sourceIndex] ?? 0);
      if (absolute > max) max = absolute;
    }
    peaks.push(Number(clampPeakSample(max).toFixed(4)));
  }
  return peaks;
}
