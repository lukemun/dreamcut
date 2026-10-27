import argparse
import json
from pathlib import Path

import librosa
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("--out", required=True)
args = parser.parse_args()

y, sr = librosa.load(args.input, sr=22050, mono=True)
tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
tempo_value = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()

# The beat tracker describes the steady pulse. Onset detection is deliberately
# separate: editors also need off-beat drum hits and short tonal attacks. HPSS is
# useful evidence for those labels, but it cannot identify an instrument with
# certainty, so every hit carries a confidence and the UI calls tonal hits an
# estimate rather than ground truth.
hop_length = 256
harmonic, percussive = librosa.effects.hpss(y, margin=(1.0, 2.5))
total_onsets = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
harmonic_onsets = librosa.onset.onset_strength(y=harmonic, sr=sr, hop_length=hop_length)
percussive_onsets = librosa.onset.onset_strength(y=percussive, sr=sr, hop_length=hop_length)
hit_frames = librosa.onset.onset_detect(
    onset_envelope=total_onsets,
    sr=sr,
    hop_length=hop_length,
    units="frames",
    pre_max=3,
    post_max=3,
    pre_avg=8,
    post_avg=8,
    # High sensitivity is intentional: the editor lets people hide categories
    # and choose a narrower snap set, while an omitted hit cannot be recovered.
    delta=0.04,
    wait=2,
)

def robust_scale(values):
    scale = float(np.percentile(values, 95)) if len(values) else 1.0
    return max(scale, 1e-9)

harmonic_scale = robust_scale(harmonic_onsets)
percussive_scale = robust_scale(percussive_onsets)
total_scale = robust_scale(total_onsets)
hits = []
for frame in hit_frames:
    start = max(0, int(frame) - 1)
    end = min(len(total_onsets), int(frame) + 2)
    harmonic_score = float(np.mean(harmonic_onsets[start:end])) / harmonic_scale
    percussive_score = float(np.mean(percussive_onsets[start:end])) / percussive_scale
    strength = min(1.0, float(np.mean(total_onsets[start:end])) / total_scale)
    combined = harmonic_score + percussive_score
    balance = 0.0 if combined <= 1e-9 else (harmonic_score - percussive_score) / combined
    if balance >= 0.12:
        kind = "synth"
    elif balance <= -0.12:
        kind = "drum"
    else:
        kind = "other"
    hits.append({
        "time_seconds": float(librosa.frames_to_time(frame, sr=sr, hop_length=hop_length)),
        "kind": kind,
        "confidence": min(1.0, abs(balance)),
        "strength": strength,
    })

result = {
    "input": args.input,
    "detector": "librosa.beat.beat_track",
    "source_duration_seconds": len(y) / sr,
    "tempo_bpm": tempo_value,
    "tempo_candidates_bpm": [tempo_value / 2, tempo_value, tempo_value * 2],
    "tempo_confirmed": False,
    "beats_seconds": beats,
    "hits": hits,
    "hit_detector": "librosa.onset.onset_detect + HPSS classification",
    "note": "Confirm the metrical level before cutting; half/double-tempo errors are expected.",
}
Path(args.out).parent.mkdir(parents=True, exist_ok=True)
Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
print(args.out)
