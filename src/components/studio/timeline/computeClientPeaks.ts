"use client";

import { ensureAudioContextRunning } from "@/lib/browser/capabilities";
import { catalogAudioPreviewUrl } from "@/lib/remotion/catalog-audio-preview";
import {
  chunkPeakPersistItems,
  extractMaxPeakSamples,
  selectMissingPeakSourceUrls,
} from "@/lib/timeline/peaks";

const TARGET_SAMPLES = 2000;

type PeakResult = {
  source_url: string;
  peaks: number[];
  source_duration_seconds: number;
};

/**
 * Decode an audio file in the browser and extract waveform peaks.
 */
export async function decodeAndExtractPeaks(url: string): Promise<PeakResult | null> {
  try {
    const response = await fetch(catalogAudioPreviewUrl(url));
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();

    const audioCtx = new AudioContext();
    let decoded: AudioBuffer;
    try {
      // Decoding does not require a running output clock in modern browsers.
      // Resuming first can leave this promise waiting indefinitely behind an
      // autoplay gesture gate, which used to make waveforms silently disappear.
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        // Older iOS Safari is the exception: retry after a best-effort resume.
        await ensureAudioContextRunning(audioCtx);
        decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      }
    } finally {
      await audioCtx.close();
    }

    const channelData = decoded.getChannelData(0);
    const durationSeconds = decoded.duration;
    const peaks = extractMaxPeakSamples(channelData, TARGET_SAMPLES);

    return { source_url: url, peaks, source_duration_seconds: durationSeconds };
  } catch {
    return null;
  }
}

type TimelineElementLike = {
  type: string;
  source_url: string | null;
  _peaks?: number[];
};

/**
 * For audio elements missing peaks, decode in the browser and POST to the server.
 * Returns the computed peaks so the caller can merge them into editor state.
 *
 * `attemptedUrls` is the per-editor-session in-flight/success guard, marked
 * SYNCHRONOUSLY before any await so StrictMode cannot start duplicate work.
 * Failed decodes are released from the guard so a later editor refresh or
 * interaction can retry them instead of hiding the waveform for the session.
 */
export async function computeAndPersistMissingPeaks(
  projectId: string,
  elements: TimelineElementLike[],
  attemptedUrls: Set<string>,
): Promise<PeakResult[]> {
  const uniqueUrls = selectMissingPeakSourceUrls(elements, attemptedUrls);
  if (uniqueUrls.length === 0) return [];
  for (const url of uniqueUrls) attemptedUrls.add(url);

  // Decode in parallel (but limit concurrency to avoid overwhelming the browser)
  const results: PeakResult[] = [];
  const BATCH_SIZE = 3;
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    let prepared: PeakResult[] = [];
    try {
      const response = await fetch(`/api/projects/${projectId}/timeline/peaks/prepare`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: batch }),
      });
      if (response.ok) prepared = (await response.json()).items;
    } catch { /* Browser fallback remains available for non-local media. */ }
    const batchResults = await Promise.all(batch.map(url => prepared.find(item => item.source_url === url) ?? decodeAndExtractPeaks(url)));
    for (let index = 0; index < batchResults.length; index += 1) {
      const result = batchResults[index];
      if (result) {
        results.push(result);
      } else {
        attemptedUrls.delete(batch[index]!);
      }
    }
  }

  if (results.length === 0) return [];

  // Persist to server, chunked to the route schema's items cap. Non-fatal —
  // peaks are still usable for this session even if persistence fails; a
  // rejected chunk is surfaced once here and never retried this session.
  for (const chunk of chunkPeakPersistItems(results)) {
    try {
      const response = await fetch(`/api/projects/${projectId}/timeline/peaks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chunk.map((r) => ({
            source_url: r.source_url,
            peaks: r.peaks,
            source_duration_seconds: r.source_duration_seconds,
          })),
        }),
      });
      if (!response.ok) {
        console.warn(
          `timeline/peaks persist rejected (${response.status}) for ${chunk.length} source(s); waveform remains available in this session`,
        );
      }
    } catch {
      // Network failure — same non-fatal policy as a rejected chunk.
    }
  }

  return results;
}
