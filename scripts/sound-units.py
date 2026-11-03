"""Isolate single sound-effect units from separated stems; never edits a timeline.

extract: within one source window, find attacks in each chosen stem, decompose the
overlapping events with onset-constrained NMF (one spectral template set per event),
and write each event's Wiener-masked audio as its own WAV, the equal-span time cut it
replaces (for comparison), measured features, leakage and a sines-plus-noise model
the synth can rebuild it from.
score: compare a rebuilt sound with the unit it was fitted to.
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys
import traceback

# Set before numpy loads: unbounded BLAS threads made small matrices ~15x slower.
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "4")
import numpy as np
import soundfile as sf

VERSION = "sound-units@1"
N_FFT = 2048
HOP = 256
PAD = 0.25
BANDS = np.geomspace(40.0, 16000.0, 13)  # 12 log-spaced noise bands
ENV_POINTS = 64


def stft(y):
    import librosa
    return librosa.stft(y, n_fft=N_FFT, hop_length=HOP, window="hann", center=True)


def istft(spec, length):
    import librosa
    return librosa.istft(spec, hop_length=HOP, window="hann", center=True, length=length)


def a_weight_db(freqs):
    import librosa
    return librosa.A_weighting(np.maximum(freqs, 1.0))


def onset_envelope(mono, sr):
    """A-weighted spectral flux: the full-band mean, or a quarter of the mel range when
    that band carries a sudden rise of its own.

    A quiet attack in an otherwise empty band (a noise burst under a loud sweep's tail)
    still stands out, where a full-band sum would bury it. Bands are scaled by the
    square root of their share of the loudest band, so sub-bass rumble does not fire.
    """
    import librosa
    fmax = min(16000, sr / 2)
    mel = librosa.feature.melspectrogram(y=mono, sr=sr, n_fft=N_FFT, hop_length=HOP, n_mels=96, fmax=fmax)
    weights = 10 ** (a_weight_db(librosa.mel_frequencies(n_mels=96, fmax=fmax)) / 10)
    mel = mel * weights[:, None]
    log = librosa.power_to_db(mel, ref=float(mel.max()) + 1e-12, top_db=70)
    flux = np.maximum(0, np.diff(log, axis=1, prepend=log[:, :1]))
    total = flux.mean(axis=0)
    peak_total = max(float(total.max()), 1e-9)
    curves = [band.mean(axis=0) for band in np.array_split(flux, 4, axis=0)]
    loudest = max(float(c.max()) for c in curves) + 1e-9
    per_band = [c / loudest * math.sqrt(float(c.max()) / loudest) for c in curves]
    return np.maximum(total / peak_total, 0.8 * np.max(per_band, axis=0) / max(float(np.max(per_band)), 1e-9))


def detect_onsets(mono, sr, floor_db):
    """Attack frames with strength relative to the stem's strongest attack."""
    import librosa
    envelope = onset_envelope(mono, sr)
    frames = librosa.onset.onset_detect(onset_envelope=envelope, sr=sr, hop_length=HOP, backtrack=False,
                                        pre_max=4, post_max=4, pre_avg=24, post_avg=8, delta=0.08, wait=8)
    rms = librosa.feature.rms(y=mono, frame_length=N_FFT, hop_length=HOP, center=True)[0]
    reference = max(float(rms.max()), 1e-9)
    scale = max(float(envelope.max()), 1e-9)
    found = []
    for frame in frames:
        # Loudness reached just after the attack decides audibility, not the flux alone.
        level = float(rms[frame:frame + 12].max()) if frame < len(rms) else 0.0
        if 20 * math.log10(max(level, 1e-12) / reference) < floor_db:
            continue
        found.append({"frame": int(frame), "strength": float(envelope[frame] / scale), "level": level})
    return found, envelope


def nmf_events(V, onsets, frames_per_second, iterations=160, seed=0):
    """KL-NMF where each event owns three templates (attack, body, tail) that may only sound from its onset.

    Zero activations stay zero under multiplicative updates, so the onset constraint
    holds exactly. A penalty that grows with time since onset hands newly arriving
    energy to the newest event that fits it; one free background template absorbs
    what no event explains.
    """
    rng = np.random.default_rng(seed)
    F, T = V.shape
    eps = 1e-10
    K = len(onsets)
    components = []  # (event index or -1, kind)
    W_cols, H_rows, penalty_rows = [], [], []
    pre = max(1, int(0.03 * frames_per_second))
    for index, onset in enumerate(onsets):
        start = max(0, onset - 2)
        before = V[:, max(0, onset - pre - 1):max(1, onset - 1)].mean(axis=1)
        attack = V[:, onset:min(T, onset + 3)].mean(axis=1)
        body = V[:, onset:min(T, onset + int(0.18 * frames_per_second))].mean(axis=1)
        tail = V[:, min(T - 1, onset + 3):min(T, onset + int(0.5 * frames_per_second))].mean(axis=1) if onset + 3 < T else body
        rises = [np.maximum(attack - before, 0), np.maximum(body - before, 0), np.maximum(tail - before, 0)]
        # Support excludes bins that were clearly fading as this event began (falling at
        # its attack and 20% down over its body window): there an earlier
        # sound's tail is decaying, and a template free to grow there would take it over.
        # Steady or rising bins stay, so a sound arriving over a busy band keeps it.
        fading = (attack < before) & (body < 0.8 * before) & (before > 1e-3 * before.max())
        support = ~(np.convolve(fading.astype(float), np.ones(5), mode="same") >= 5)
        for kind, template in zip(("attack", "body", "tail"), rises):
            template = template + 1e-3 * template.max() + eps + 1e-4 * rng.random(F) * (template.max() + eps)
            template = template * support
            W_cols.append(template / (template.sum() + eps))
            h = np.zeros(T)
            h[start:] = V[:, start:].sum(axis=0) / K + eps
            H_rows.append(h)
            since = np.clip((np.arange(T) - onset) / frames_per_second, 0, None)
            rate = {"attack": 8.0, "body": 2.0, "tail": 0.5}[kind]
            penalty_rows.append(rate * since)
            components.append((index, kind))
    quiet = V.sum(axis=0)
    floor_frames = np.argsort(quiet)[:max(1, T // 8)]
    background = V[:, floor_frames].mean(axis=1) + eps
    W_cols.append(background / background.sum())
    H_rows.append(np.full(T, quiet.min() + eps))
    penalty_rows.append(np.full(T, 0.4))
    components.append((-1, "background"))

    W = np.stack(W_cols, axis=1)
    H = np.stack(H_rows, axis=0)
    level = V.sum(axis=0, keepdims=True).mean() + eps
    P = np.stack(penalty_rows, axis=0) * level * 0.02
    ones = np.ones_like(V)
    for _ in range(iterations):
        R = V / (W @ H + eps)
        H *= (W.T @ R) / (W.T @ ones + P + eps)
        R = V / (W @ H + eps)
        W *= (R @ H.T) / (ones @ H.T + eps)
        norms = W.sum(axis=0, keepdims=True) + eps
        W /= norms
        H *= norms.T
    return W, H, components


def active_span(audio, sr, onset_sample, floor_db=-48.0, release=0.03):
    """From just before the attack to where the unit's envelope stays below floor_db."""
    mono = np.abs(audio).max(axis=1)
    win = max(1, int(0.01 * sr))
    env = np.convolve(mono, np.ones(win) / win, mode="same")
    peak = max(float(env[onset_sample:].max()) if onset_sample < len(env) else 0.0, 1e-12)
    above = np.where(env[onset_sample:] > peak * 10 ** (floor_db / 20))[0]
    end = onset_sample + (int(above[-1]) if len(above) else win)
    start = max(0, onset_sample - int(0.008 * sr))
    return start, min(len(audio), end + int(release * sr))


def fade(audio, sr, fade_in=0.003, fade_out=0.02):
    out = audio.copy()
    n_in, n_out = min(len(out), int(fade_in * sr)), min(len(out), int(fade_out * sr))
    if n_in:
        out[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        out[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return out


def secondary_attack_db(mono, sr):
    """Strongest attack after the first 60 ms relative to the opening attack (lower is cleaner)."""
    if len(mono) < HOP * 4:
        return None
    envelope = onset_envelope(mono, sr)
    head = int(0.06 * sr / HOP) + 1
    if len(envelope) <= head + 1:
        return None
    first = float(envelope[:head].max())
    later = float(envelope[head:].max())
    return round(20 * math.log10(max(later, 1e-9) / max(first, 1e-9)), 2)


def features(audio, sr, onset_offset):
    """Measured character of one unit (seconds relative to the unit file's start)."""
    import librosa
    mono = audio.mean(axis=1)
    freqs = np.fft.rfftfreq(N_FFT, 1 / sr)
    # Perceptual (A-weighted) power: separated stems carry inaudible sub rumble that
    # would otherwise dominate every share and centroid.
    raw = np.abs(stft(mono)) ** 2
    S = raw * (10 ** (a_weight_db(freqs) / 10))[:, None]
    energy = S.sum(axis=0) + 1e-12
    times = np.arange(S.shape[1]) * HOP / sr
    env_db = 10 * np.log10(energy / energy.max())
    peak_frame = int(np.argmax(energy))
    attack = max(0.0, times[peak_frame] - onset_offset)
    after = np.where(env_db[peak_frame:] < -20)[0]
    decay = float(times[peak_frame + after[0]] - times[peak_frame]) if len(after) else float(times[-1] - times[peak_frame])
    active = env_db > -30
    weights = energy * active
    centroid_t = (freqs[:, None] * S).sum(axis=0) / energy
    centroid = float((centroid_t * weights).sum() / weights.sum())
    # Flatness over the band the unit occupies (5th to 95th energy percentile): empty
    # bins elsewhere would make band-limited noise look tonal.
    cumulative = np.cumsum(raw.sum(axis=1)) / max(float(raw.sum()), 1e-20)
    low_edge = freqs[int(np.searchsorted(cumulative, 0.05))]
    high_edge = freqs[min(len(freqs) - 1, int(np.searchsorted(cumulative, 0.95)))]
    band = (freqs >= max(40.0, low_edge)) & (freqs <= max(high_edge, low_edge * 2, 80.0))
    flat = librosa.feature.spectral_flatness(S=np.sqrt(raw[band]) + 1e-9)[0]
    flatness = float((flat * weights).sum() / weights.sum())
    low_share = float(S[freqs < 250].sum() / S.sum())
    harmonic, percussive = librosa.decompose.hpss(np.sqrt(S), margin=1.0)
    harmonic_share = float((harmonic ** 2).sum() / max(((harmonic ** 2) + (percussive ** 2)).sum(), 1e-12))
    # Sweep: centroid motion in octaves per second over the loud frames.
    loud = np.where(env_db > -18)[0]
    sweep = 0.0
    if len(loud) >= 4 and times[loud[-1]] - times[loud[0]] > 0.04:
        slope = np.polyfit(times[loud], np.log2(np.maximum(centroid_t[loud], 20)), 1, w=energy[loud])[0]
        sweep = float(slope)
    profile_edges = BANDS
    profile = []
    total = raw.sum()
    for low, high in zip(profile_edges[:-1], profile_edges[1:]):
        share = raw[(freqs >= low) & (freqs < high)].sum() / total
        profile.append({"low_hz": round(float(low), 1), "high_hz": round(float(high), 1),
                        "level_db": round(10 * math.log10(max(share, 1e-12)), 1)})
    length = len(mono) / sr
    return {
        "duration_seconds": round(length, 4), "attack_seconds": round(float(attack), 4),
        "decay_seconds": round(decay, 4), "spectral_centroid_hz": round(centroid, 1),
        "spectral_flatness": round(flatness, 4), "low_energy_share": round(low_share, 4),
        "harmonic_share": round(harmonic_share, 4), "centroid_sweep_octaves_per_second": round(sweep, 3),
        "peak_seconds": round(float(times[peak_frame]), 4), "frequency_profile": profile,
        "envelope_db": [round(float(v), 1) for v in np.interp(np.linspace(0, times[-1], 32), times, env_db)],
    }


def character(f):
    """Plain-word type from measured features; thresholds tuned on separated SFX stems.

    Flatness is measured inside the unit's own band: about 0.2 and above is noise
    (whooshes, the noise of a thump), below about 0.06 is pitched.
    """
    length, centroid, flatness = f["duration_seconds"], f["spectral_centroid_hz"], f["spectral_flatness"]
    if length < 0.09 and centroid > 1200:
        return "click"
    if f["low_energy_share"] > 0.4 and centroid < 700:
        return "boom" if f["decay_seconds"] > 0.45 else "thump"
    if abs(f["centroid_sweep_octaves_per_second"]) > 6 and flatness < 0.2:
        return "sweep"
    if flatness >= 0.2 and length > 0.15:
        return "whoosh"
    if f["attack_seconds"] > 0.15:
        return "swell"
    if flatness < 0.06 and f["harmonic_share"] > 0.6:
        return "tonal"
    return "hit"


def fit_model(audio, sr, kind):
    """Sines-plus-noise description of a unit for the synth to rebuild.

    Time points are denser near the start, where attacks need resolution. Partials:
    one ridge that may glide anywhere (a falling sweep, a thump's pitch drop), found
    frame by frame where one peak stands far above the rest of the spectrum, then up
    to three stable peaks of the long-window mean spectrum. Twelve log-spaced noise
    bands carry the remaining energy as RMS amplitudes (Parseval over 2048 points).
    """
    import librosa
    mono = audio.mean(axis=1)
    length = len(mono) / sr
    n = N_FFT
    padded = np.pad(mono, (0, max(0, n - len(mono))))
    spec = np.abs(librosa.stft(padded, n_fft=n, hop_length=HOP, window="hann", center=True))
    freqs = np.fft.rfftfreq(n, 1 / sr)
    bin_hz = freqs[1]
    frame_times = np.arange(spec.shape[1]) * HOP / sr
    points = length * np.linspace(0, 1, ENV_POINTS) ** 1.7
    window = np.hanning(n)
    win_sum, win_power = window.sum(), (window ** 2).sum()
    loudness = (spec ** 2).sum(axis=0)
    loud = 10 * np.log10(loudness / max(float(loudness.max()), 1e-20) + 1e-20) > -40
    usable = (freqs >= 30) & (freqs <= 12000)
    harmonic_mask = np.zeros_like(spec, dtype=bool)

    def peak_at(t, j):
        a, b, c = spec[j - 1, t], spec[j, t], spec[j + 1, t]
        denominator = a - 2 * b + c
        shift = 0.5 * (a - c) / denominator if denominator != 0 else 0.0
        return freqs[j] + float(np.clip(shift, -0.5, 0.5)) * bin_hz, 2 * b / win_sum

    def track(frequencies, amplitudes):
        logf = np.interp(points, frame_times, np.log2(np.maximum(frequencies, 20)))
        return {"hz": [round(float(2 ** v), 2) for v in logf],
                "amp": [round(float(v), 6) for v in np.interp(points, frame_times, amplitudes)]}

    partials = []
    ridge_f, ridge_a = np.zeros(spec.shape[1]), np.zeros(spec.shape[1])
    lo_bin, hi_bin = int(np.argmax(usable)), len(freqs) - 2 - int(np.argmax(usable[::-1]))
    for t in range(spec.shape[1]):
        column = spec[lo_bin:hi_bin, t]
        j = lo_bin + int(np.argmax(column))
        prominence = 20 * math.log10(max(float(spec[j, t]), 1e-12) / max(float(np.median(column)), 1e-12))
        if loud[t] and prominence > 24 and 1 <= j < len(freqs) - 1:
            ridge_f[t], ridge_a[t] = peak_at(t, j)
            harmonic_mask[max(0, j - 3):j + 4, t] = True
    if (ridge_a > 0).sum() >= 3:
        filled = np.where(ridge_a > 0, ridge_f, np.nan)
        valid = np.where(~np.isnan(filled))[0]
        ridge_f = np.interp(np.arange(len(filled)), valid, filled[valid])
        partials.append(track(ridge_f, ridge_a))
    # Stable partials: peaks well above the local floor of the long-window mean spectrum.
    big = 8192
    long_spec = np.abs(librosa.stft(np.pad(mono, (0, max(0, big - len(mono)))), n_fft=big, hop_length=HOP, window="hann", center=True)).mean(axis=1)
    long_freqs = np.fft.rfftfreq(big, 1 / sr)
    smooth = np.convolve(long_spec, np.ones(61) / 61, mode="same") + 1e-12
    prominence = 20 * np.log10((long_spec + 1e-12) / smooth)
    candidates = [k for k in range(3, len(long_freqs) - 3)
                  if 30 <= long_freqs[k] <= 6000 and long_spec[k] == long_spec[k - 3:k + 4].max() and prominence[k] > 9]
    candidates.sort(key=lambda k: -long_spec[k])
    picked = []
    ridge_median = float(np.median(ridge_f[ridge_a > 0])) if (ridge_a > 0).any() else None
    for k in candidates:
        hz = long_freqs[k]
        if ridge_median and abs(math.log2(hz / ridge_median)) < 0.1:
            continue
        if all(abs(math.log2(hz / other)) > 0.08 for other in picked):
            picked.append(hz)
        if len(picked) == 3:
            break
    for hz in picked:
        center = int(round(hz / bin_hz))
        track_f, track_a = np.zeros(spec.shape[1]), np.zeros(spec.shape[1])
        for t in range(spec.shape[1]):
            lo, hi = max(1, center - 2), min(len(freqs) - 2, center + 3)
            j = lo + int(np.argmax(spec[lo:hi, t]))
            track_f[t], track_a[t] = peak_at(t, j)
            harmonic_mask[max(0, j - 3):j + 4, t] = True
        partials.append(track(track_f, track_a))
    noise_power = np.where(harmonic_mask, 0.0, spec ** 2)
    bands = []
    for low, high in zip(BANDS[:-1], BANDS[1:]):
        rows = (freqs >= low) & (freqs < high)
        power = 2 * noise_power[rows].sum(axis=0) / (n * win_power)
        bands.append({"hz": round(float(math.sqrt(low * high)), 1), "width_hz": round(float(high - low), 1),
                      "rms": [round(float(v), 6) for v in np.interp(points, frame_times, np.sqrt(power))]})
    left, right = audio[:, 0], audio[:, -1]
    l_energy, r_energy = float((left ** 2).sum()), float((right ** 2).sum())
    pan = (math.sqrt(r_energy) - math.sqrt(l_energy)) / max(math.sqrt(r_energy) + math.sqrt(l_energy), 1e-12)
    mid, side = (left + right) / 2, (left - right) / 2
    width = min(1.0, math.sqrt(float((side ** 2).sum()) / max(float((mid ** 2).sum()), 1e-12)))
    peak_seconds = float(frame_times[int(np.argmax(loudness))])
    return {"schema_version": 1, "kind": kind, "duration_seconds": round(length, 4),
            "peak_seconds": round(min(peak_seconds, length), 5),
            "times": [round(float(v), 5) for v in points], "partials": partials, "bands": bands,
            "pan": round(pan, 3), "width": round(width, 3)}


def log_mel(audio, sr):
    import librosa
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    mel = librosa.feature.melspectrogram(y=mono, sr=sr, n_fft=N_FFT, hop_length=HOP, n_mels=64, fmax=min(16000, sr / 2))
    return 10 * np.log10(mel + 1e-10)


def compare(reference, candidate, sr_ref, sr_cand):
    """Spectral match of a rebuild: per-band level error and envelope correlation."""
    import librosa
    if sr_cand != sr_ref:
        candidate = librosa.resample(candidate.T, orig_sr=sr_cand, target_sr=sr_ref).T
    n = min(len(reference), len(candidate))
    a, b = log_mel(reference[:n], sr_ref), log_mel(candidate[:n], sr_ref)
    top = max(a.max(), b.max())
    a, b = np.maximum(a, top - 60), np.maximum(b, top - 60)
    spectrum_error = float(np.abs(a.mean(axis=1) - b.mean(axis=1)).mean())
    env_a, env_b = a.max(axis=0), b.max(axis=0)
    correlation = float(np.corrcoef(env_a, env_b)[0, 1]) if env_a.std() > 0 and env_b.std() > 0 else 0.0
    frame_error = float(np.abs(a - b).mean())
    return {"mean_spectrum_error_db": round(spectrum_error, 2), "envelope_correlation": round(correlation, 3),
            "time_frequency_error_db": round(frame_error, 2),
            "length_ratio": round(len(candidate) / max(len(reference), 1), 3)}


def extract(args):
    out = Path(args.out)
    (out / "units").mkdir(parents=True, exist_ok=True)
    (out / "time-cuts").mkdir(parents=True, exist_ok=True)
    stems_dir = Path(args.stems_dir)
    hints = json.loads(args.events) if args.events else []
    stems = [s for s in args.stems.split(",") if s]
    units = []
    for stem in stems:
        info = sf.info(stems_dir / f"{stem}.wav")
        sr = info.samplerate
        first = max(0, int((args.start - PAD) * sr))
        last = min(info.frames, int((args.end + PAD) * sr))
        audio, _ = sf.read(stems_dir / f"{stem}.wav", start=first, stop=last, dtype="float32", always_2d=True)
        mono = audio.mean(axis=1)
        if not np.any(np.abs(mono) > 1e-5):
            continue
        detected, _ = detect_onsets(mono, sr, args.floor_db)
        fps = sr / HOP
        def in_window(frame):
            t = first / sr + frame * HOP / sr
            return args.start - 0.02 <= t <= args.end
        detected = [d for d in detected if in_window(d["frame"])]
        stem_hints = [h for h in hints if h.get("stem") in (None, stem)]
        if stem_hints:
            # A named event snaps to the nearest detected attack within 60 ms; an event
            # with no attack nearby keeps its own time and is reported as not detected.
            chosen = []
            for hint in stem_hints:
                frame = int(round((hint["time_seconds"] - first / sr) * fps))
                near = [d for d in detected if abs(d["frame"] - frame) <= int(0.06 * fps)]
                if hint.get("stem") is None and not near:
                    continue
                best = min(near, key=lambda d: abs(d["frame"] - frame)) if near else {"frame": frame, "strength": 0.0, "level": 0.0}
                chosen.append({**best, "label": hint.get("label"), "requested_seconds": hint["time_seconds"], "detected": bool(near)})
            # Unrequested attacks still get templates so they cannot leak into named units.
            others = [dict(d, hidden=True) for d in detected if all(abs(d["frame"] - c["frame"]) > 2 for c in chosen)]
            events = sorted(chosen + others, key=lambda e: e["frame"])
        else:
            events = [dict(d, detected=True) for d in detected]
        if not events:
            continue
        stereo = [stft(audio[:, c]) for c in range(audio.shape[1])]
        X = stft(mono)
        V = np.abs(X)
        W, H, components = nmf_events(V, [e["frame"] for e in events], fps)
        parts = np.stack([np.outer(W[:, i], H[i]) for i in range(W.shape[1])])
        total = parts.sum(axis=0) + 1e-10
        power = parts ** 2
        power_total = power.sum(axis=0) + 1e-20
        mix_power = np.abs(X) ** 2
        for index, event in enumerate(events):
            if event.get("hidden"):
                continue
            mine = [i for i, (owner, _) in enumerate(components) if owner == index]
            mask = power[mine].sum(axis=0) / power_total
            unit = np.stack([istft(S * mask, len(audio)) for S in stereo], axis=1)
            onset_sample = event["frame"] * HOP
            start, end = active_span(unit, sr, onset_sample)
            # End where the event's own modelled energy has died away, so a soft mask's
            # residue of later sounds does not stretch the unit.
            # The first time it stays below -35 dB of its peak for 100 ms ends it; a later
            # bump is residue of another sound, not this one.
            own_energy = (parts[mine].sum(axis=0) ** 2).sum(axis=0)[event["frame"]:]
            if len(own_energy):
                peak_at = int(np.argmax(own_energy))
                quiet = own_energy < own_energy.max() * 10 ** (-35 / 10)
                run = max(1, int(0.1 * fps))
                for frame in range(peak_at, len(quiet) - run + 1):
                    if quiet[frame:frame + run].all():
                        end = min(end, (event["frame"] + frame + 1) * HOP + int(0.03 * sr))
                        break
            end = min(end, start + int(args.max_unit_seconds * sr))
            clip = fade(unit[start:end], sr)
            cut = fade(audio[start:end], sr)
            span = slice(start // HOP, max(start // HOP + 1, end // HOP))
            # Model-based leakage: in the time cut, the share of energy the decomposition
            # assigns to other events; in the unit, the residual cross-talk a soft mask leaves.
            own_share = (parts[mine].sum(axis=0) / total)[:, span]
            cut_foreign = float(((1 - own_share) * mix_power[:, span]).sum() / max(mix_power[:, span].sum(), 1e-20))
            m = mask[:, span]
            # Under soft masking the expected interference is the m(1-m) share of what passes.
            passed = float((m * mix_power[:, span]).sum())
            unit_cross = float((m * (1 - m) * mix_power[:, span]).sum() / max(passed, 1e-20))
            retained = float((m ** 2 * mix_power[:, span]).sum()) / max(float((own_share ** 2 * mix_power[:, span]).sum()), 1e-20)
            time_seconds = (first + onset_sample) / sr
            f = features(clip, sr, (onset_sample - start) / sr)
            kind = character(f)
            label = event.get("label") or kind
            name = f"{stem}{len(units) + 1:03d}-{stem}-{''.join(c if c.isalnum() else '-' for c in label.lower()).strip('-')[:40]}"
            sf.write(out / "units" / f"{name}.wav", clip, sr, subtype="PCM_24")
            sf.write(out / "time-cuts" / f"{name}.wav", cut, sr, subtype="PCM_24")
            cut_secondary = secondary_attack_db(cut.mean(axis=1), sr)
            unit_secondary = secondary_attack_db(clip.mean(axis=1), sr)
            # Isolation quality first; a weak or missing attack lowers trust in the onset.
            attack_trust = 0.6 + 0.4 * min(1.0, 2 * event.get("strength", 0)) if event.get("detected") else 0.5
            confidence = max(0.0, min(1.0, (1 - unit_cross) * attack_trust))
            units.append({
                "name": name, "stem": stem, "label": label, "character": kind,
                "file": f"units/{name}.wav", "time_cut_file": f"time-cuts/{name}.wav",
                "onset_seconds": round(time_seconds, 4),
                "source_start_seconds": round((first + start) / sr, 4),
                "source_end_seconds": round((first + end) / sr, 4),
                "requested_seconds": event.get("requested_seconds"), "attack_detected": bool(event.get("detected")),
                "attack_strength": round(float(event.get("strength", 0)), 3),
                "features": f,
                "leakage": {
                    "time_cut_foreign_share": round(cut_foreign, 4),
                    "unit_residual_crosstalk": round(unit_cross, 4),
                    "reduction_db": round(10 * math.log10(max(cut_foreign, 1e-6) / max(unit_cross, 1e-6)), 2),
                    "time_cut_secondary_attack_db": cut_secondary,
                    "unit_secondary_attack_db": unit_secondary,
                    "own_energy_retained": round(min(1.0, retained), 3),
                },
                "confidence": round(confidence, 3),
                "model": fit_model(clip, sr, kind) if args.models else None,
                "sample_rate": sr, "channels": int(clip.shape[1]),
            })
    # Named events always stay; detected ones keep the loudest, clearest attacks.
    named = [u for u in units if u["requested_seconds"] is not None]
    found = sorted((u for u in units if u["requested_seconds"] is None), key=lambda u: -u["attack_strength"] * u["confidence"])
    units = sorted(named + found[:max(0, args.max_units - len(named))], key=lambda u: u["onset_seconds"])
    for number, unit in enumerate(units, 1):
        renamed = f"{number:02d}-{unit['name'].split('-', 1)[1]}"
        for key, folder in (("file", "units"), ("time_cut_file", "time-cuts")):
            (out / folder / f"{unit['name']}.wav").rename(out / folder / f"tmp-{renamed}.wav")
        unit["name"] = renamed
    for unit in units:
        for key, folder in (("file", "units"), ("time_cut_file", "time-cuts")):
            (out / folder / f"tmp-{unit['name']}.wav").rename(out / folder / f"{unit['name']}.wav")
            unit[key] = f"{folder}/{unit['name']}.wav"
    for folder in ("units", "time-cuts"):
        for stale in (out / folder).glob("*.wav"):
            if not any(stale.name == f"{u['name']}.wav" for u in units):
                stale.unlink()
    result = {"version": VERSION, "start_seconds": args.start, "end_seconds": args.end, "stems": stems,
              "units": units}
    (out / "units.json").write_text(json.dumps(result) + "\n")
    json.dump({"ok": True, "units": len(units)}, sys.stdout)


def score(args):
    reference, sr_ref = sf.read(args.unit, dtype="float32", always_2d=True)
    candidate, sr_cand = sf.read(args.synth, dtype="float32", always_2d=True)
    json.dump(compare(reference, candidate, sr_ref, sr_cand), sys.stdout)


parser = argparse.ArgumentParser()
commands = parser.add_subparsers(dest="command", required=True)
e = commands.add_parser("extract")
e.add_argument("--stems-dir", required=True)
e.add_argument("--stems", default="drums,bass,other")
e.add_argument("--start", type=float, required=True)
e.add_argument("--end", type=float, required=True)
e.add_argument("--out", required=True)
e.add_argument("--events", default="")
e.add_argument("--max-units", type=int, default=16)
e.add_argument("--max-unit-seconds", type=float, default=4.0)
e.add_argument("--floor-db", type=float, default=-36.0)
e.add_argument("--models", action="store_true")
s = commands.add_parser("score")
s.add_argument("--unit", required=True)
s.add_argument("--synth", required=True)

if __name__ == "__main__":
    try:
        parsed = parser.parse_args()
        extract(parsed) if parsed.command == "extract" else score(parsed)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        json.dump({"ok": False, "message": str(error) or "Sound unit extraction failed."}, sys.stdout)
        sys.exit(1)
