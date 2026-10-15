export type TickerSegment = {
  text: string;
  color?: string;
  fontWeight?: number;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function readTickerSegments(value: unknown): TickerSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : "";
    if (!text) return [];
    const color = typeof record.color === "string" && HEX_COLOR.test(record.color)
      ? record.color
      : undefined;
    const fontWeight = typeof record.fontWeight === "number" && Number.isFinite(record.fontWeight)
      ? Math.max(100, Math.min(900, Math.round(record.fontWeight / 100) * 100))
      : undefined;
    return [{ text, color, fontWeight }];
  });
}
