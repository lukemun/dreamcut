export function waveformPath(peaks: number[], duration: number, start: number, span: number) {
  const scale = Math.max(0.0001, ...peaks);
  let d = "";
  for (let x = 0; x < 900; x += 2) {
    const a = Math.max(0, Math.floor((start + x / 900 * span) / duration * peaks.length));
    const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil((start + (x + 2) / 900 * span) / duration * peaks.length)));
    const amplitude = Math.min(33, Math.max(...peaks.slice(a, b), 0) / scale * 33);
    d += `M${x},${40 - amplitude}V${40 + amplitude}`;
  }
  return d;
}
