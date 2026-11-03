#!/usr/bin/env python3
"""Spectral-gate denoiser for stationary background noise in a speech take.

Classic noise-profile spectral subtraction (STFT magnitude gating with
oversubtraction, a spectral floor, temporal mask smoothing, and overlap-add).
Deterministic, local, numpy-only — no models, no downloads.

Usage:
  denoise-take-audio-spectral-gate.py in.wav out.wav --noise-start S --noise-end E
      [--reduction-db 15] [--oversubtract 1.6]

The noise window must contain ONLY the background (a speech gap). Reduction is
capped (default 15 dB) so residual noise stays natural rather than gated dead.
"""
import argparse
import wave

import numpy as np

FRAME = 2048
HOP = FRAME // 4


def stft(x: np.ndarray) -> np.ndarray:
    window = np.hanning(FRAME)
    pad = (-(len(x) - FRAME)) % HOP
    x = np.pad(x, (0, pad))
    frames = np.lib.stride_tricks.sliding_window_view(x, FRAME)[::HOP]
    return np.fft.rfft(frames * window, axis=1)


def istft(spec: np.ndarray, length: int) -> np.ndarray:
    window = np.hanning(FRAME)
    out = np.zeros(spec.shape[0] * HOP + FRAME)
    norm = np.zeros_like(out)
    frames = np.fft.irfft(spec, n=FRAME, axis=1)
    for i, frame in enumerate(frames):
        out[i * HOP:i * HOP + FRAME] += frame * window
        norm[i * HOP:i * HOP + FRAME] += window ** 2
    norm[norm < 1e-8] = 1e-8
    return (out / norm)[:length]


def denoise_channel(x: np.ndarray, sr: int, noise_start: float, noise_end: float,
                    reduction_db: float, oversubtract: float) -> np.ndarray:
    spec = stft(x)
    mag = np.abs(spec)
    n0 = int(noise_start * sr / HOP)
    n1 = max(n0 + 4, int(noise_end * sr / HOP))
    noise_mag = np.percentile(mag[n0:n1], 80, axis=0)  # robust profile
    floor = 10 ** (-reduction_db / 20)
    gain = 1.0 - oversubtract * (noise_mag[None, :] / np.maximum(mag, 1e-12))
    gain = np.clip(gain, floor, 1.0)
    # Temporal smoothing kills musical noise: median over 5 frames per bin.
    k = 5
    padded = np.pad(gain, ((k // 2, k // 2), (0, 0)), mode="edge")
    smooth = np.lib.stride_tricks.sliding_window_view(padded, k, axis=0)
    gain = np.median(smooth, axis=2)
    return istft(spec * gain, len(x))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("outfile")
    parser.add_argument("--noise-start", type=float, required=True)
    parser.add_argument("--noise-end", type=float, required=True)
    parser.add_argument("--reduction-db", type=float, default=15.0)
    parser.add_argument("--oversubtract", type=float, default=1.6)
    args = parser.parse_args()

    with wave.open(args.infile, "rb") as handle:
        sr = handle.getframerate()
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        if width != 2:
            raise SystemExit("Expected 16-bit PCM input")
        raw = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16)
    samples = raw.reshape(-1, channels).astype(np.float64) / 32768.0

    cleaned = np.stack([
        denoise_channel(samples[:, ch], sr, args.noise_start, args.noise_end,
                        args.reduction_db, args.oversubtract)
        for ch in range(channels)
    ], axis=1)
    cleaned = np.clip(cleaned, -1.0, 1.0)

    with wave.open(args.outfile, "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes((cleaned * 32767.0).astype(np.int16).tobytes())
    print(f"denoised {args.infile} -> {args.outfile} (sr={sr}, ch={channels})")


if __name__ == "__main__":
    main()
