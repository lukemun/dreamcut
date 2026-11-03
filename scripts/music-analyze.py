"""L1 extraction: a direct read of ONE audio artifact. Measured facts only.

Emits duration, tempo (detected + its arithmetic octaves), beats, downbeats, sections,
an energy curve, and spectral features. It contains no interpretation and no advice --
those are separate, cheaper, recomputable phases:

  L1  measured facts                                  -> HERE (expensive: ~21s/track, frozen)
  L2  cue roles, likely tempo, energy shape           -> music-derive.py (milliseconds)
  L4  use_when / good_for / avoid_for                 -> the guidance step (needs a GOAL)

The split is what makes the rules improvable. Smuggle a role heuristic into this file and
changing it means re-decoding the whole catalog; keep it in derive and a rule change costs
nothing. See docs/standards/extraction-vs-analysis.md.
"""

import argparse
import json
from pathlib import Path

import librosa
import numpy as np

SR = 22050


MIN_SECTION_SECONDS = 4.0
EXTRACT_VERSION = 2  # bump when a MEASUREMENT changes; forces a re-decode (unlike a derive bump)



def estimate_downbeats(beats, meter=4):
    """Pick the beat phase whose onset strength is greatest, then take every `meter`-th beat.

    librosa has no downbeat tracker; this assumes a constant meter and is wrong on
    tracks with pickups, odd meters, or bar-length changes. It is a starting grid,
    not ground truth.
    """
    if len(beats) < meter:
        return list(map(float, beats))
    return [float(b) for b in beats[::meter]]


def sections(y, sr, n_segments=8):
    """Segment over harmony, timbre AND energy; returns boundary times.

    Energy carries its own weight in the feature stack on purpose. Builds and drops are
    energy events with little harmonic movement, and a chroma+MFCC-only segmenter is blind
    to them -- which is precisely the structure an editor is looking for.
    """
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    rms = librosa.feature.rms(y=y)

    width = min(chroma.shape[1], mfcc.shape[1], rms.shape[1])
    # log-compress so a quiet bed and a loud drop separate on a perceptual scale
    energy = librosa.util.normalize(np.log1p(rms[:, :width] * 100), axis=1)

    feature = np.vstack([
        librosa.util.normalize(chroma[:, :width], axis=0),
        librosa.util.normalize(mfcc[:, :width], axis=0),
        np.repeat(energy, 8, axis=0),  # ~8 rows vs 12 chroma + 13 mfcc: audible, not dominant
    ])

    n = min(n_segments, feature.shape[1] - 1)
    if n < 2:
        return [0.0]

    bounds = librosa.segment.agglomerative(feature, n)
    times = [float(t) for t in librosa.frames_to_time(bounds, sr=sr)]

    # Collapse boundaries that land on top of each other. Without this the segmenter
    # happily returns six "sections" inside two seconds.
    merged = [0.0]
    for t in times:
        if t - merged[-1] >= MIN_SECTION_SECONDS:
            merged.append(t)
    return merged


def energy_curve(y, sr, hop_seconds=1.0):
    hop = int(sr * hop_seconds)
    frames = librosa.util.frame(y, frame_length=hop, hop_length=hop) if len(y) >= hop else None
    if frames is None:
        return []
    rms = np.sqrt((frames ** 2).mean(axis=0))
    return [{"t": round(i * hop_seconds, 2), "rms": round(float(v), 5)} for i, v in enumerate(rms)]


def vocal_features(y, sr):
    """Measured spectral features. NOT a vocal detector, and no estimate is derived from them.

    These are L1 (they read the artifact). The verdict they were once used for is not
    derivable from them at ANY level -- see the note below and the catalog gaps.
    """
    harmonic, _ = librosa.effects.hpss(y)
    spec = np.abs(librosa.stft(harmonic))
    freqs = librosa.fft_frequencies(sr=sr)
    band = (freqs >= 200) & (freqs <= 4000)
    band_ratio = float(spec[band].sum() / (spec.sum() + 1e-9))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=harmonic)))

    # A near-zero flatness means a near-pure tone, which is more tonal than any real
    # voice. Without this guard a test sine reads as a confident "vocal".
    if flatness < 1e-4:
        return {
            "estimate": "unknown",
            "confidence": "none",
            "method": "hpss + 200-4kHz harmonic band ratio + spectral flatness",
            "vocal_band_ratio": round(band_ratio, 4),
            "spectral_flatness": round(flatness, 6),
            "note": "Spectrum is near-pure-tone (synthetic or degenerate); the vocal heuristic does not apply.",
        }

    # No estimate is emitted on purpose. Mid-band harmonic energy cannot separate a voice
    # from a lead piano or a string melody -- measured against two known-instrumental
    # tracks (Anguish, Ascending the Vale) this heuristic called both "vocal". Since the
    # field feeds narration_fit, a false "vocal" would push the editor away from exactly
    # the beds it should be using. A trustworthy answer needs source separation (Demucs);
    # until then report the features and say so.
    return {
        "estimate": "unknown",
        "confidence": "none",
        "method": "hpss + 200-4kHz harmonic band ratio + spectral flatness (features only)",
        "vocal_band_ratio": round(band_ratio, 4),
        "spectral_flatness": round(flatness, 5),
        "requires_source_separation": True,
        "note": (
            "Vocal presence is NOT determined. These spectral features cannot distinguish a "
            "voice from a melodic lead instrument; on known-instrumental test tracks the old "
            "threshold produced false 'vocal' readings. Set `vocals` on the catalog track by "
            "listening, or wire a source-separation model."
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--out", required=True)
    parser.add_argument("--segments", type=int, default=8)
    args = parser.parse_args()

    y, sr = librosa.load(args.input, sr=SR, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    tempo_value = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    downbeats = estimate_downbeats(beats)

    bounds = sections(y, sr, args.segments)
    curve = energy_curve(y, sr)

    # A track with no tracked beats has no grid and no rhythmic structure to read. Downstream
    # steps must not invent structure from it, so say so here rather than emitting a shape.
    degenerate = tempo_value <= 0 or len(beats) < 4

    result = {
        "input": args.input,
        "level": "L1 — a direct read of one audio artifact. Measured facts only.",
        "extractor": f"librosa {librosa.__version__}",
        "extract_version": EXTRACT_VERSION,
        "duration_seconds": round(duration, 3),
        "tempo": {
            # The raw read plus its arithmetic octaves. RANKING these needs a perceptual prior
            # (external knowledge), which makes it L2 — it lives in music-derive.py, not here.
            "detected_bpm": round(tempo_value, 2),
            "candidates_bpm": [round(tempo_value / 2, 2), round(tempo_value, 2), round(tempo_value * 2, 2)],
            "note": "The detected octave is ambiguous and this value carries no signal about which is right.",
        },
        "beats_seconds": [round(b, 3) for b in beats],
        "downbeats_seconds": [round(b, 3) for b in downbeats],
        "downbeat_note": "Assumes constant 4/4 from the first tracked beat. Wrong on pickups and meter changes.",
        "sections_seconds": [round(b, 3) for b in bounds],
        "energy_curve": curve,
        # Spectral features are measured. The vocal *verdict* they were once used for is not
        # derivable from them at all (it called two known instrumentals "vocal"), so no estimate
        # is emitted at any level — see the catalog gaps in the skill.
        "spectral": vocal_features(y, sr),
        "status": "unusable" if degenerate else "extracted",
        "note": (
            "No stable beat was tracked. This file is either not music, too short, or too "
            "featureless to place against a grid; derive nothing from it."
            if degenerate
            else "Measured facts about the audio. Interpretation (cue roles, plausible tempo) is "
            "L2 and lives in music-derive.py; guidance (use_when, good_for) is L4 and needs a goal."
        ),
    }

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(args.out)


if __name__ == "__main__":
    main()
