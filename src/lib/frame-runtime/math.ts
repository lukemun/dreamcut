/** Independent, piecewise numeric animation helpers. */
export function interpolate(value: number, input: number[], output: number[], options: {
  extrapolateLeft?: "clamp" | "extend" | "identity";
  extrapolateRight?: "clamp" | "extend" | "identity";
  easing?: (value: number) => number;
} = {}): number {
  if (input.length < 2 || input.length !== output.length || input.some((v, i) => i > 0 && v <= input[i - 1])) throw new Error("Interpolation requires matching, increasing ranges");
  if (value < input[0]) {
    if (options.extrapolateLeft === "identity") return value;
    if (options.extrapolateLeft === "clamp") return output[0];
  }
  if (value > input[input.length - 1]) {
    if (options.extrapolateRight === "identity") return value;
    if (options.extrapolateRight === "clamp") return output[output.length - 1];
  }
  let i = 0;
  while (i < input.length - 2 && value > input[i + 1]) i++;
  const t = (value - input[i]) / (input[i + 1] - input[i]);
  return output[i] + (output[i + 1] - output[i]) * (options.easing ? options.easing(t) : t);
}
export const Easing = {
  bezier: (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
    if (x <= 0 || x >= 1) return x;
    const curve = (t: number, a: number, b: number) => 3 * (1-t)**2*t*a + 3*(1-t)*t*t*b + t**3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 35; i++) {
      const t = (lo + hi) / 2;
      if (curve(t, x1, x2) < x) lo = t; else hi = t;
    }
    return curve((lo + hi) / 2, y1, y2);
  },
};
export function mediaTime(frame: number, fps: number, trimBefore = 0, playbackRate = 1) {
  return (trimBefore + Math.max(0, frame) * playbackRate) / fps;
}
