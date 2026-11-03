/** Optional solid-paper fill. Invalid or absent colors leave source pixels alone. */
export function resolvePaperFill(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/** Recolor RGB without changing alpha; compose shadows after this filter. */
export function paperFillMatrix(value: unknown): string | null {
  const color = resolvePaperFill(value);
  if (!color) return null;
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  return `${rgb.map((channel) => `0 0 0 0 ${channel}`).join(" ")} 0 0 0 1 0`;
}

export function paperFillFilter(value: unknown): string | null {
  const color = resolvePaperFill(value);
  return color ? `url(#paper-fill-${color.slice(1)})` : null;
}
