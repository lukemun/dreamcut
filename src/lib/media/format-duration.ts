/** One clock for media lengths on every Library and Storyboard card: minutes, then seconds to hundredths (0:06.00). */
export function formatMediaDuration(seconds: number): string {
  const safe = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100) / 100;
  return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(2).padStart(5, "0")}`;
}
