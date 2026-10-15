/** Pack consecutive items into responsive rows without changing their sort order.
 * Small portrait cards retain room for labels; sparse last rows do not inflate. */
export function mediaGalleryWidths(ratios: readonly number[], width: number, targetHeight = 220, gap = 12, minWidth = 140, maxPerRow = Infinity): number[] {
  return mediaGalleryRows(ratios, width, targetHeight, gap, minWidth, maxPerRow).widths;
}

const safeRatio = (r: number) => Number.isFinite(r) && r > 0 ? r : 1;

/** Widths plus one shared media height per row: the shortest natural height in the row.
 * A card widened to its label floor shows its media at that height (contained, not cropped),
 * so every picture in a row starts and ends on the same lines. */
export function mediaGalleryRows(ratios: readonly number[], width: number, targetHeight = 220, gap = 12, minWidth = 140, maxPerRow = Infinity): { widths: number[]; heights: number[] } {
  if (!Number.isFinite(width) || width <= 0) return { widths: ratios.map(() => 0), heights: ratios.map(() => 0) };
  const preferred = ratios.map(r => Math.min(width, Math.max(Math.min(minWidth, width), targetHeight * safeRatio(r))));
  const result: number[] = [], heights: number[] = [];
  let cursor = 0;
  const limit = Math.max(1, Math.min(maxPerRow, Math.floor((width + gap) / (Math.min(minWidth, width) + gap))));
  while (cursor < preferred.length) {
    const row: number[] = [];
    let sum = 0;
    while (cursor + row.length < preferred.length && row.length < limit) {
      const next = preferred[cursor + row.length];
      if (row.length && sum + next + gap * row.length > width) {
        const before = Math.abs((width - gap * (row.length - 1)) / sum - 1);
        const after = Math.abs((width - gap * row.length) / (sum + next) - 1);
        if (before <= after) break;
        row.push(next); sum += next; break;
      }
      row.push(next); sum += next;
    }
    const available = Math.max(1, width - gap * (row.length - 1));
    const last = cursor + row.length === preferred.length;
    const scale = Math.min(last ? 1 : Infinity, available / sum);
    const scaled = row.map(w => w * scale);
    const floor = Math.min(minWidth, width);
    if (scaled.some(w => w < floor)) {
      const flexible = row.reduce((total, w) => total + Math.max(0, w - floor), 0);
      const remaining = Math.max(0, Math.min(sum, available) - floor * row.length);
      result.push(...row.map(w => floor + (flexible ? Math.max(0, w - floor) / flexible * remaining : 0)));
    } else result.push(...scaled);
    const start = cursor;
    const natural = result.slice(start).map((w, i) => w / safeRatio(ratios[start + i]));
    // A row of only floored (narrow portrait) cards keeps the target height rather than growing.
    const floored = row.every((w, i) => w > targetHeight * safeRatio(ratios[start + i]) + 0.5);
    const rowHeight = Math.min(...natural, floored ? targetHeight : Infinity);
    heights.push(...row.map(() => rowHeight));
    cursor += row.length;
  }
  return { widths: result, heights };
}
