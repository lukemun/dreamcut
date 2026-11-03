"use client";

export function isTimelineShelfDebugEnabled(): boolean {
  return true;
}

export function logTimelineShelf(scope: string, payload?: Record<string, unknown>): void {
  if (!isTimelineShelfDebugEnabled()) return;
  if (payload) {
    console.log(`[timeline-shelf] ${scope}`, payload);
    return;
  }
  console.log(`[timeline-shelf] ${scope}`);
}
