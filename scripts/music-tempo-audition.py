"""Lay a click at each metrical candidate over the track, so the octave is decided by ear.

Beat trackers routinely return a tempo an octave off, and the detected number carries no signal
about which octave is right. Counting a track by hand is slow and error-prone; hearing a click
lock (or drift) against it takes seconds.

    pnpm music-tempo-audition "music-catalog/audio/reference/<track>.opus"

Writes one excerpt per candidate next to the track as <name>.tempo-<bpm>.wav. Play them; the
right tempo is the one whose click sits on the beat for the whole excerpt rather than sliding.
Then record it: pnpm music-promote <file> --vocals … --confirm-tempo <bpm>
"""

import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

SR = 22050
CLICK_HZ = 1800.0


def click_track(bpm, duration, sr=SR):
    """A dry, high click on each beat at `bpm` — deliberately harsh so it is easy to hear drift."""
    out = np.zeros(int(sr * duration))
    period = 60.0 / bpm
    n = int(sr * 0.03)
    t = np.arange(n) / sr
    ping = np.sin(2 * np.pi * CLICK_HZ * t) * np.exp(-t * 120)
    for beat in np.arange(0, duration, period):
        i = int(beat * sr)
        end = min(i + n, len(out))
        out[i:end] += ping[: end - i]
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--seconds", type=float, default=20.0, help="excerpt length")
    parser.add_argument("--start", type=float, help="excerpt start; defaults to the densest passage")
    args = parser.parse_args()

    source = Path(args.input)
    sidecar = source.with_suffix("").with_suffix(".analysis.json")
    if not sidecar.exists():
        sidecar = Path(str(source.with_suffix("")) + ".analysis.json")

    y, sr = librosa.load(str(source), sr=SR, mono=True)

    if sidecar.exists():
        analysis = json.loads(sidecar.read_text())
        candidates = analysis.get("tempo", {}).get("candidates_bpm") or []
    else:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        base = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
        candidates = [round(base / 2, 2), round(base, 2), round(base * 2, 2)]

    if not candidates:
        print("No tempo candidates — the track has no trackable beat, so there is no octave to choose.")
        return

    # Audition where the track is actually playing. A sparse intro makes every candidate sound
    # plausible, which is the one thing the excerpt must not do.
    if args.start is not None:
        start = args.start
    else:
        rms = librosa.feature.rms(y=y)[0]
        times = librosa.times_like(rms, sr=sr)
        loudest = float(times[int(np.argmax(rms))])
        start = max(0.0, min(loudest - args.seconds / 2, len(y) / sr - args.seconds))

    excerpt = y[int(start * sr) : int((start + args.seconds) * sr)]
    duration = len(excerpt) / sr
    if duration < 2:
        print("Track is too short to audition.")
        return

    print(f"Auditioning {source.name} from {start:.1f}s ({duration:.0f}s excerpt)\n")
    for bpm in candidates:
        mixed = 0.7 * excerpt + 0.5 * click_track(bpm, duration)[: len(excerpt)]
        peak = np.max(np.abs(mixed)) or 1.0
        out = Path(f"{str(source.with_suffix(''))}.tempo-{bpm:g}.wav")
        sf.write(str(out), mixed / peak * 0.9, sr)
        print(f"  {bpm:>7.2f} BPM  ->  {out.name}")

    print(
        f"\nPlay them. The right tempo is the one whose click stays on the beat for the whole excerpt;\n"
        f"a wrong octave sounds busy or half-speed but still lands, so listen for DRIFT, not density.\n"
        f"Then: pnpm music-promote \"{source}\" --vocals ... --confirm-tempo <bpm>"
    )


if __name__ == "__main__":
    main()
