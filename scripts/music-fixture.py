"""Synthesize a ground-truth audio fixture for verifying scripts/music-analyze.py.

Real music has no labelled structure, so it cannot tell you whether the analyzer is
right -- only whether its output looks plausible. This builds a track whose tempo and
section boundaries are known by construction, so the analyzer's read can be checked
against fact.

    ./.venv-music/bin/python scripts/music-fixture.py --out /tmp/fixture-120bpm.wav
    ./.venv-music/bin/python scripts/music-analyze.py /tmp/fixture-120bpm.wav --out /tmp/f.json

Ground truth: 120 BPM (beat every 0.5s, 128 beats), 64s long, four sections --
    0-16s  quiet   -> expect intro / bed
    16-32s rising  -> expect build
    32-48s peak    -> expect hook
    48-64s quiet   -> expect outro

Caught three real analyzer bugs on first run: an energy-blind segmenter, an unbounded
downbeat snap that dragged the intro cue 18s forward, and cues emitted with end < start.
Re-run it after touching cue or section logic.
"""

import argparse

import numpy as np
import soundfile as sf

SR = 22050
BPM = 120
DURATION = 64.0


def amplitude_at(seconds):
    """The known energy contour the analyzer is expected to recover."""
    if seconds < 16:
        return 0.15
    if seconds < 32:
        return 0.15 + 0.55 * ((seconds - 16) / 16)
    if seconds < 48:
        return 0.95
    return 0.18


def click(amp, rng):
    """A decaying percussive burst with harmonic content -- not a pure tone.

    A sine would be more tonal than any real instrument and trips the spectral guards
    in music-analyze.py, which is a different test than the one this fixture is for.
    """
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    envelope = np.exp(-t * 35)
    tone = np.sin(2 * np.pi * 180 * t) + 0.5 * np.sin(2 * np.pi * 360 * t) + 0.3 * rng.standard_normal(n)
    return amp * envelope * tone


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    t = np.arange(int(SR * DURATION)) / SR
    y = np.zeros_like(t)

    beat_period = 60.0 / BPM
    beats = np.arange(0, DURATION, beat_period)
    for beat in beats:
        c = click(amplitude_at(beat), rng)
        i = int(beat * SR)
        end = min(i + len(c), len(y))
        y[i:end] += c[: end - i]

    # A sustained pad so sections differ spectrally, not only in level.
    pad = 0.06 * np.sin(2 * np.pi * 110 * t) * np.array([amplitude_at(x) for x in t])
    y = y + pad
    y = y / np.max(np.abs(y)) * 0.9

    sf.write(args.out, y, SR)
    print(f"{args.out}\nground truth: {BPM} BPM, {len(beats)} beats, sections at 0/16/32/48s")


if __name__ == "__main__":
    main()
