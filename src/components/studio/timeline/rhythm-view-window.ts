/** A view is source time only: it never trims the timeline clip. */
export function rhythmViewWindow(start: number, span: number, rangeStart: number, rangeEnd: number) {
  const length = Math.max(0.001, rangeEnd - rangeStart);
  const minimum = Math.min(0.25, length);
  const boundedSpan = Math.max(minimum, Math.min(length, Number.isFinite(span) ? span : length));
  const boundedStart = Math.max(rangeStart, Math.min(rangeEnd - boundedSpan, Number.isFinite(start) ? start : rangeStart));
  return { start: boundedStart, span: boundedSpan, end: boundedStart + boundedSpan };
}

export function zoomRhythmView(start: number, span: number, factor: number, anchor: number, rangeStart: number, rangeEnd: number) {
  const focus = Math.max(start, Math.min(start + span, anchor));
  const nextSpan = rhythmViewWindow(start, span * factor, rangeStart, rangeEnd).span;
  return rhythmViewWindow(focus - (focus - start) / span * nextSpan, nextSpan, rangeStart, rangeEnd);
}

export async function readRhythmResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let data: T & { error?: string };
  try { data = JSON.parse(raw); }
  catch { throw new Error("Rhythm analysis is temporarily unavailable. Retrying…"); }
  if (!response.ok) throw new Error(data.error || "Could not load rhythm analysis. Retrying…");
  return data;
}
