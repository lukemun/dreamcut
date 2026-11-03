"""Prepare sample-aligned stems and source-time hit maps; never edits a timeline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import traceback

parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("--out", required=True)
parser.add_argument("--source-sha256", required=True)
args = parser.parse_args()
directory = Path(args.out)
directory.mkdir(parents=True, exist_ok=True)

def publish(payload):
    temporary = directory / "manifest.tmp"
    temporary.write_text(json.dumps(payload) + "\n")
    temporary.replace(directory / "manifest.json")

def status(message):
    publish({"state": "preparing", "message": message, "pid": os.getpid()})

try:
    status("Loading instrument separation model…")
    import numpy as np
    import soundfile as sf
    import torch
    import librosa
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(4)
    torch.manual_seed(0)
    model = get_model("htdemucs").cpu().eval()
    sample_rate = model.samplerate
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-nostdin", "-i", args.input,
        "-map", "0:a:0", "-vn", "-ar", str(sample_rate), "-ac", "2", "-f", "f32le", "-"], timeout=180)
    audio = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).copy()
    duration = len(audio) / sample_rate
    if not 0 < duration <= 1800:
        raise ValueError("Instrument separation supports tracks up to 30 minutes.")
    reference = audio.mean(axis=1)
    mean, std = float(reference.mean()), max(float(reference.std()), 1e-8)
    status("Separating drums, bass, vocals and accompaniment…")
    with torch.no_grad():
        tensor = torch.from_numpy((audio.T - mean) / std)
        separated = apply_model(model, tensor[None], device="cpu", shifts=0, split=True,
                                overlap=0.25, progress=True, num_workers=0)[0].cpu().numpy() * std + mean

    def analyze(samples, name):
        mono = samples.mean(axis=1)
        buckets = np.array_split(np.abs(mono), min(len(mono), 12000))
        peaks = [round(float(bucket.max()), 6) for bucket in buckets]
        y = librosa.resample(mono, orig_sr=sample_rate, target_sr=22050)
        hop = 128
        envelope = librosa.onset.onset_strength(y=y, sr=22050, hop_length=hop)
        frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=22050, hop_length=hop,
            pre_max=3, post_max=3, pre_avg=12, post_avg=12, delta=0.025, wait=2)
        # Normalize against the actual strongest attack. A percentile of ALL
        # envelope frames clips many real attacks to 1 and destroys their rank.
        scale = max(float(np.max(envelope[frames])) if len(frames) else 0, 1e-8)
        hits = []
        for frame in frames:
            time = float(librosa.frames_to_time(frame, sr=22050, hop_length=hop))
            center = int(time * sample_rate)
            amplitude = float(np.max(np.abs(mono[max(0, center-512):min(len(mono), center+2048)])))
            if time < duration and amplitude > 0.0005:
                hits.append({"time_seconds": round(time, 6), "strength": min(1.0, float(envelope[frame]) / scale)})
        return {"id": name, "peaks": peaks, "hits": hits, "rms": float(np.sqrt(np.mean(mono ** 2)))}

    status("Finding hits in each instrument…")
    lanes = []
    # The original mix is kept as a separate audition authority. All outputs have
    # exactly the decoded source sample count; there is no independent rescaling.
    sf.write(directory / "mix.wav", audio, sample_rate, subtype="FLOAT")
    lanes.append(analyze(audio, "mix"))
    for name, samples in zip(model.sources, separated):
        samples = samples.T
        if len(samples) != len(audio):
            raise ValueError("Separated stem length differs from source.")
        sf.write(directory / f"{name}.wav", samples, sample_rate, subtype="FLOAT")
        lanes.append(analyze(samples, name))
    if hashlib.sha256(Path(args.input).read_bytes()).hexdigest() != args.source_sha256:
        raise ValueError("Source changed during separation; retry.")
    publish({"state": "ready", "source_sha256": args.source_sha256, "model": "htdemucs",
             "sample_rate": sample_rate, "sample_count": len(audio), "duration": duration, "lanes": lanes})
except Exception as error:
    traceback.print_exc()
    publish({"state": "failed", "message": str(error) or "Instrument separation failed."})
    raise
