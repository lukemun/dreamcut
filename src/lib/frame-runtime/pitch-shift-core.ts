/**
 * The preview pitch shifter's signal processing, as plain JavaScript source so the AudioWorklet
 * (pitch-shift-worklet.ts) and Node tests run the same code. Export applies the same ratio with
 * FFmpeg's asetrate + atempo (timeline/audio-pitch.ts); atempo is also a waveform-aligned
 * overlap-add stretcher, so preview and export belong to one family of algorithm.
 *
 * Method: pitch-synchronous WSOLA with resampled grains. Every 512 output samples a new grain
 * of 1024 reads the input at `ratio` times speed (pitch × ratio) and is Hann-windowed into the
 * output. Its input start sits near the point that keeps a constant delay (so timing never
 * drifts) and is chosen within ±1 voice period by the best waveform correlation with the
 * previous grain's continuation, so overlapping grains add in phase. A fixed-spacing two-head
 * shifter instead adds two copies about 20 ms apart, heard as echo (see pitch-shift-core.test.ts).
 * A phase vocoder was not chosen: it needs longer frames (more delay) and smears speech phase.
 * Delay: about 28 ms when lowering pitch (a few ms more or less around a transient), up to
 * 40 ms at +12 semitones, constant over time.
 */
export const PITCH_SHIFTER_SOURCE = `
function createPitchShifter(sampleRate, channels) {
  const scale = sampleRate / 48000;
  const H = Math.max(64, Math.round(512 * scale)), N = 2 * H;
  const SEARCH = Math.max(32, Math.round(400 * scale));
  const SIZE = 1 << 17, MASK = SIZE - 1;
  const window = new Float32Array(N);
  for (let j = 0; j < N; j++) window[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / N);
  const input = [], output = [];
  for (let c = 0; c < channels; c++) { input.push(new Float32Array(SIZE)); output.push(new Float32Array(SIZE)); }
  const mono = new Float32Array(SIZE);
  let written = 0, produced = 0, nextGrain = 0, previous = null;

  function delay(ratio) { return SEARCH + Math.ceil((1 + ratio) * N / 2) + 2; }
  function similarity(a, b, length, stride) {
    let ab = 0, aa = 0;
    for (let m = 0; m < length; m += stride) {
      const x = mono[(a + m) & MASK], y = mono[(b + m) & MASK];
      ab += x * y; aa += x * x;
    }
    return ab / Math.sqrt(aa + 1e-9);
  }
  function grain(ratio) {
    const ideal = Math.round(nextGrain - delay(ratio) + (1 - ratio) * N / 2);
    let start = ideal;
    if (previous !== null) {
      const target = Math.floor(previous + ratio * H), length = Math.max(32, Math.round(ratio * H));
      let energy = 0;
      for (let m = 0; m < length; m += 2) energy += mono[(target + m) & MASK] ** 2;
      // Silence has nothing to align; holding the ideal start keeps the delay steady.
      if (energy > 1e-10 * length) {
        let best = similarity(ideal, target, length, 2), offset = 0;
        for (let d = -SEARCH; d <= SEARCH; d += 2) {
          const score = similarity(ideal + d, target, length, 2);
          if (score > best + 1e-9) { best = score; offset = d; }
        }
        const coarse = offset;
        best = -Infinity;
        for (let d = coarse - 1; d <= coarse + 1; d++) {
          const score = similarity(ideal + d, target, length, 1);
          if (score > best) { best = score; offset = d; }
        }
        start = ideal + offset;
      }
    }
    for (let c = 0; c < channels; c++) {
      const from = input[c], to = output[c];
      for (let j = 0; j < N; j++) {
        const position = start + ratio * j, i = Math.floor(position), f = position - i;
        to[(nextGrain + j) & MASK] += window[j] * (from[i & MASK] * (1 - f) + from[(i + 1) & MASK] * f);
      }
    }
    previous = start;
    nextGrain += H;
  }
  /** blocks in and out are arrays of channel Float32Arrays of equal length. */
  function process(inBlock, outBlock, ratio) {
    const frames = outBlock[0].length, sources = inBlock.length;
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        const value = sources ? inBlock[Math.min(c, sources - 1)][i] : 0;
        input[c][(written + i) & MASK] = value; sum += value;
      }
      mono[(written + i) & MASK] = sum / channels;
    }
    written += frames;
    for (let i = 0; i < frames; i++) {
      if (ratio === 1) {
        // Unshifted: pass straight through with no delay. Entering it drops every pending grain tail,
        // so none is summed back in when shifting resumes.
        // Only samples not yet played, up to the last grain's end, can hold a tail.
        if (previous !== null || nextGrain > produced) for (const channel of output) for (let k = produced; k < nextGrain + N; k++) channel[k & MASK] = 0;
        for (let c = 0; c < outBlock.length; c++) outBlock[c][i] = input[Math.min(c, channels - 1)][produced & MASK];
        produced++; nextGrain = produced; previous = null;
        continue;
      }
      while (nextGrain <= produced) grain(ratio);
      for (let c = 0; c < outBlock.length; c++) {
        const channel = output[Math.min(c, channels - 1)];
        outBlock[c][i] = channel[produced & MASK];
      }
      for (let c = 0; c < channels; c++) output[c][produced & MASK] = 0;
      produced++;
    }
  }
  return { process, delay };
}
`;

/** The shifter as a function, for tests and offline checks outside an AudioWorklet. */
export function loadPitchShifter(): (sampleRate: number, channels: number) => {
  process: (inBlock: Float32Array[], outBlock: Float32Array[], ratio: number) => void;
  delay: (ratio: number) => number;
} {
  return new Function(`${PITCH_SHIFTER_SOURCE}\nreturn createPitchShifter;`)();
}
