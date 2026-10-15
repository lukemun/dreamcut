type TrimInput = {
  trimStart: number;
  trimEnd: number | null;
  sourceDuration: number;
  peakCount: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getWaveformPeakSlice({
  trimStart,
  trimEnd,
  sourceDuration,
  peakCount,
}: TrimInput): { startIndex: number; endIndex: number } {
  if (peakCount <= 1 || sourceDuration <= 0) {
    return { startIndex: 0, endIndex: Math.max(1, peakCount) };
  }

  const clampedTrimStart = clamp(trimStart, 0, sourceDuration);
  const remainingAfterTailTrim = trimEnd != null
    ? clamp(sourceDuration - trimEnd, 0, sourceDuration)
    : sourceDuration;
  const effectiveEnd = Math.max(clampedTrimStart, remainingAfterTailTrim);

  const startIndex = clamp(Math.floor((clampedTrimStart / sourceDuration) * peakCount), 0, peakCount - 1);
  const endIndex = clamp(Math.ceil((effectiveEnd / sourceDuration) * peakCount), startIndex + 1, peakCount);

  return { startIndex, endIndex };
}
