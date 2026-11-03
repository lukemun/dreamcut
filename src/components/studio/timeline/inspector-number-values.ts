/** Display precision must not quantize a creator's exact entry. */
export function formatInspectorNumber(value: number, step: number, precision?: number, preservePrecision = false, wholeNumber = false): string {
  if (wholeNumber) return String(Math.round(value));
  return preservePrecision ? String(value) : value.toFixed(precision ?? Math.max(0, `${step}`.split('.')[1]?.length ?? 0));
}

export function inspectorNumberCommit(raw: string | undefined, min: number, max: number, step: number, precision?: number, preservePrecision = false, wholeNumber = false) {
  const parsed = raw == null ? NaN : Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;
  const low = wholeNumber ? Math.ceil(min) : min;
  const high = wholeNumber ? Math.floor(max) : max;
  if (low > high) return null;
  const value = Math.min(high, Math.max(low, wholeNumber ? Math.round(parsed) : parsed));
  const text = formatInspectorNumber(value, step, precision, preservePrecision, wholeNumber);
  return {value: Number(text), text};
}

/** Gestures start from stored precision unless the creator is actively typing. */
export function inspectorNumberGestureStart(display: string, draft: string | null, exactValue?: number, preservePrecision = false): number {
  if (draft !== null) return Number.parseFloat(draft);
  return preservePrecision && exactValue !== undefined && Number.isFinite(exactValue) ? exactValue : Number.parseFloat(display);
}
