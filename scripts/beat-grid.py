import argparse
import json
from pathlib import Path

import librosa
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("--out", required=True)
# A tempo the creator or the music's maker states (a generated track's prompt, a
# catalog entry). Fitting a fixed grid near it beats hoping the tracker lands on the
# right metrical level, and a generated track's tempo is usually exact.
parser.add_argument("--bpm", type=float)
args = parser.parse_args()
if args.bpm is not None and not 40 <= args.bpm <= 240:
    parser.error("--bpm must be between 40 and 240")

METER = 4
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

# The pulse evidence for grids, downbeats and drops: all onsets plus the kick band,
# where bars are usually marked. Smoothed slightly so a grid a few ms off still scores.
frame_rate = sr / hop_length
# librosa's onset envelope keeps the kick on the same clock as the hits above; a raw
# centred-STFT difference fires about 25 ms before the attack.
kick = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length, fmax=150, n_mels=16)
spectrum = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop_length))
low_bins = librosa.fft_frequencies(sr=sr, n_fft=2048) < 150
frames = min(len(kick), len(total_onsets), spectrum.shape[1])
kick, onset_mix = kick[:frames], total_onsets[:frames]
pulse = onset_mix / robust_scale(onset_mix) + 1.5 * kick / robust_scale(kick)
pulse = np.convolve(pulse, np.hanning(5) / np.hanning(5).sum(), mode="same")
duration = len(y) / sr

def sample(envelope, seconds):
    position = np.clip(np.asarray(seconds) * frame_rate, 0, len(envelope) - 1.001)
    index = position.astype(int)
    fraction = position - index
    return envelope[index] * (1 - fraction) + envelope[index + 1] * fraction

def grid_strength(beat_times):
    """0 when beats sit no higher on the pulse than the track's average moment, toward 1 as only beats carry it.

    Compared with the whole envelope, not the half-beats: house and techno put an
    open hi-hat on every off-beat.
    """
    if len(beat_times) < 4:
        return 0.0
    on = float(np.mean(sample(pulse, np.asarray(beat_times))))
    return float(np.clip(1 - float(np.mean(pulse)) / (on + 1e-9), 0, 1))

def fit_fixed_grid(hint):
    """The constant tempo within 4% of the hint, and its phase, that puts the most pulse on the beats."""
    def best_phase(bpm):
        period = 60 / bpm
        phases = np.linspace(0, period, 48, endpoint=False)
        grid = np.arange(0, duration - period, period)
        scores = sample(pulse, phases[:, None] + grid[None, :]).mean(axis=1)
        index = int(np.argmax(scores))
        return float(scores[index]), float(phases[index])
    candidates = [(best_phase(bpm), bpm) for bpm in np.arange(hint * 0.96, hint * 1.04, 0.05)]
    (_, _), coarse = max(candidates)
    (_, phase), bpm = max((best_phase(bpm), bpm) for bpm in np.arange(coarse - 0.05, coarse + 0.05, 0.002))
    return float(bpm), np.arange(phase, duration, 60 / bpm)

beat_source = "tracker"
if args.bpm is not None:
    fitted_bpm, fitted_beats = fit_fixed_grid(args.bpm)
    # A track that does not keep a steady tempo near the hint keeps its tracked beats.
    if grid_strength(fitted_beats) >= max(0.15, grid_strength(beats) - 0.05):
        tempo_value, beats, beat_source = fitted_bpm, [float(t) for t in fitted_beats if t < duration], "fixed_tempo_fit"

def estimate_downbeats(beat_times):
    """Pick the bar phase where the kick lands hardest and the harmony changes most.

    Assumes a constant 4/4 bar. Pickups, odd meters and bar-length changes put it
    off by a beat or more, which the confidence cannot always show.
    """
    if len(beat_times) < METER * 4:
        return "unknown"
    times = np.asarray(beat_times)
    chroma = librosa.feature.chroma_stft(S=spectrum[:, :frames] ** 2, sr=sr, hop_length=hop_length)
    edges = np.clip((np.concatenate([times, [duration]]) * frame_rate).astype(int), 0, frames - 1)
    per_beat = np.stack([chroma[:, a:max(b, a + 1)].mean(axis=1) for a, b in zip(edges[:-1], edges[1:])], axis=1)
    per_beat /= np.linalg.norm(per_beat, axis=0, keepdims=True) + 1e-9
    change = np.concatenate([[0.0], 1 - (per_beat[:, 1:] * per_beat[:, :-1]).sum(axis=0)])
    def z(values):
        return (values - values.mean()) / (values.std() + 1e-9)
    # The strongest kick within 60 ms of each beat: tracked beats wobble around the attack.
    reach = int(0.06 * frame_rate)
    beat_index = np.clip((times * frame_rate).astype(int), 0, frames - 1)
    kick_at_beat = np.array([kick[max(0, f - reach):f + reach + 1].max() for f in beat_index])
    evidence = z(kick_at_beat) + z(change)
    scores = np.array([evidence[phase::METER].mean() for phase in range(METER)])
    ranked = np.sort(scores)[::-1]
    phase = int(np.argmax(scores))
    return {
        "meter": METER,
        "seconds": [float(t) for t in times[phase::METER]],
        "confidence": float(np.clip((ranked[0] - ranked[1]) / 1.0, 0, 1)),
    }

def find_drops(downbeat_times, limit=8, min_bass_rise_db=9.0, min_level_rise_db=6.0):
    """Bar starts where the two bars after are much louder, in the bass or overall, than the two bars before.

    Mastered music is compressed, so a drop barely moves overall loudness; the bass
    coming back does. The tracker drops beats in quiet intros, which is exactly
    where a drop starts, so the bar grid is extended across the whole source at its
    median bar length.
    """
    if len(downbeat_times) < 2:
        return []
    bar = float(np.median(np.diff(downbeat_times)))
    first, last = downbeat_times[0], downbeat_times[-1]
    bar_starts = np.concatenate([first - bar * np.arange(int(first // bar), 0, -1), downbeat_times,
                                 last + bar * np.arange(1, int((duration - last) // bar) + 1)])
    bar_starts = bar_starts[(bar_starts >= 0) & (bar_starts < duration)]
    if len(bar_starts) < 5:
        return []
    power = spectrum[:, :frames] ** 2
    bass = 10 * np.log10(power[low_bins].sum(axis=0) + 1e-9)
    level = 10 * np.log10(power.mean(axis=0) + 1e-9)
    edges = np.clip((np.concatenate([bar_starts, [duration]]) * frame_rate).astype(int), 0, frames - 1)
    def per_bar(curve):
        return np.array([curve[a:max(b, a + 1)].mean() for a, b in zip(edges[:-1], edges[1:])])
    bass_bars, level_bars = per_bar(bass), per_bar(level)
    def rise(bars, at):
        return float(bars[at:at + 2].mean() - bars[at - 2:at].mean())
    candidates = []
    for at in range(2, len(bar_starts) - 1):
        bass_rise, level_rise = rise(bass_bars, at), rise(level_bars, at)
        if bass_rise >= min_bass_rise_db or level_rise >= min_level_rise_db:
            candidates.append((max(bass_rise / min_bass_rise_db, level_rise / min_level_rise_db), at, bass_rise, level_rise))
    chosen = []
    for candidate in sorted(candidates, reverse=True):
        if all(abs(candidate[1] - other[1]) >= 4 for other in chosen):
            chosen.append(candidate)
    return [{"time_seconds": float(bar_starts[at]), "bass_rise_db": round(bass_rise, 1), "level_rise_db": round(level_rise, 1)}
            for _, at, bass_rise, level_rise in sorted(chosen[:limit], key=lambda item: item[1])]

downbeats = estimate_downbeats(beats)
drops = find_drops(downbeats["seconds"]) if downbeats != "unknown" else []

result = {
    "input": args.input,
    "detector": "librosa.beat.beat_track" if beat_source == "tracker" else "fixed tempo grid fit near the hint",
    "source_duration_seconds": duration,
    "tempo_bpm": tempo_value,
    "tempo_candidates_bpm": [tempo_value / 2, tempo_value, tempo_value * 2],
    "tempo_confirmed": False,
    "tempo_hint_bpm": args.bpm,
    "beat_source": beat_source,
    "grid_strength": grid_strength(beats),
    "beats_seconds": beats,
    "downbeats": downbeats,
    "drops": drops,
    "hits": hits,
    "hit_detector": "librosa.onset.onset_detect + HPSS classification",
    "note": "Confirm the metrical level before cutting; half/double-tempo errors are expected. Downbeats assume 4/4.",
}
Path(args.out).parent.mkdir(parents=True, exist_ok=True)
Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
print(args.out)
