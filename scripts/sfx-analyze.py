#!/usr/bin/env python3
"""Extract reproducible placement metadata from short sound effects."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf


ANALYSIS_VERSION = "sfx-l1-v3"
AUDIBLE_FRAME_DBFS = -50.0
MIN_AUDIBLE_FRACTION = 0.12
MIN_INTEGRATED_LUFS = -35.0
MIN_TRUE_PEAK_DBTP = -20.0


def ffmpeg_loudness(path: Path) -> dict[str, float]:
    command = [
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    match = re.search(r"\{\s*\"input_i\".*?\}", result.stderr, flags=re.DOTALL)
    if not match:
        return {}
    payload = json.loads(match.group(0))
    values = {
        "integrated_lufs": payload.get("input_i"),
        "true_peak_dbtp": payload.get("input_tp"),
        "loudness_range_lu": payload.get("input_lra"),
    }
    return {key: round(float(value), 2) for key, value in values.items() if value not in (None, "-inf", "inf")}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def analyze(path: Path) -> dict[str, object]:
    info = sf.info(path)
    audio, sample_rate = librosa.load(path, sr=None, mono=True)
    duration = len(audio) / sample_rate
    hop_length = max(64, round(sample_rate / 200))
    frame_length = max(512, 2 ** int(np.ceil(np.log2(sample_rate * 0.025))))
    rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length, center=True)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sample_rate, hop_length=hop_length)
    peak_frame = int(np.argmax(rms)) if len(rms) else 0
    peak_time = min(duration, float(times[peak_frame]) if len(times) else 0.0)
    peak_db = float(librosa.amplitude_to_db(np.array([max(float(np.max(rms)), 1e-12)]), ref=1.0)[0])
    frame_db = librosa.amplitude_to_db(np.maximum(rms, 1e-12), ref=1.0)
    active = np.flatnonzero(frame_db >= AUDIBLE_FRAME_DBFS)
    audible_fraction = float(len(active) / len(rms)) if len(rms) else 0.0
    loudness = ffmpeg_loudness(path)
    if len(active) == 0:
        audibility_status = "silent"
    elif audible_fraction < MIN_AUDIBLE_FRACTION:
        audibility_status = "sparse"
    elif (loudness.get("true_peak_dbtp", peak_db) < MIN_TRUE_PEAK_DBTP
          or ("integrated_lufs" in loudness and loudness["integrated_lufs"] < MIN_INTEGRATED_LUFS)):
        audibility_status = "too_quiet"
    else:
        audibility_status = "audible"
    active_start = max(0.0, float(times[active[0]]) - frame_length / (2 * sample_rate)) if len(active) else 0.0
    active_end = min(duration, float(times[active[-1]]) + frame_length / (2 * sample_rate)) if len(active) else 0.0
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sample_rate, n_fft=frame_length, hop_length=hop_length)[0]
    weights = np.maximum(rms, 1e-12)
    spectral_centroid = float(np.average(centroid[:len(weights)], weights=weights[:len(centroid)]))
    peak_ratio = peak_time / duration if duration > 0 else 0.5
    peak_position = "front" if peak_ratio < 0.35 else "tail" if peak_ratio > 0.65 else "center"

    return {
        "sha256": sha256(path),
        "duration_seconds": round(duration, 6),
        "sample_rate_hz": int(sample_rate),
        "channels": int(info.channels),
        "analysis": {
            "version": ANALYSIS_VERSION,
            "codec": info.subtype.lower(),
            **loudness,
            "audibility_status": audibility_status,
            "audible_fraction": round(audible_fraction, 4),
            "active_start_seconds": round(active_start, 4),
            "active_end_seconds": round(active_end, 4),
            "peak_time_seconds": round(peak_time, 4),
            "peak_position": peak_position,
            "spectral_centroid_hz": round(spectral_centroid, 1),
            "analyzed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    print(json.dumps({str(Path(item)): analyze(Path(item)) for item in args.files}, indent=2))


if __name__ == "__main__":
    main()
