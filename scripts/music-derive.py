"""L2 per-item analysis: read one track's L1 extraction and derive its structure.

Reads `<name>.extract.json` and NOTHING ELSE. It never opens the audio. That is the whole
point: every judgment here — which section is a bed, which is the hook, which metrical
candidate is plausible — is a *rule* applied to measured facts, so changing the rule
re-derives in milliseconds instead of re-decoding the catalog (~21s/track).

    ./.venv-music/bin/python scripts/music-derive.py <track>.extract.json --out <track>.derive.json

Levels (see docs/standards/extraction-vs-analysis.md):
  L1  beats, downbeats, sections, energy curve, tempo candidates   -> music-analyze.py (frozen)
  L2  cue roles, likely_bpm, energy shape                          -> HERE (recomputable)
  L4  use_when / good_for / avoid_for                              -> the guidance step; a
      "should" needs a GOAL and never belongs in a descriptive layer.
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np

MIN_CUE_SECONDS = 2.0
DERIVE_VERSION = 2  # bump when a rule below changes; it is the recompute signal

# Human tempo preference peaks near here. A beat tracker's octave is ambiguous and the detected
# value carries no signal about which one is right, so candidates are RANKED by log-distance from
# this centre. It ranks; it never decides — 172 BPM is real for drum'n'bass, and a prior with
# override authority would only trade one confident wrong answer for another.
PERCEPTUAL_CENTRE_BPM = 110.0


def rank_tempo_candidates(candidates):
    ranked = sorted(candidates, key=lambda bpm: abs(math.log2(bpm / PERCEPTUAL_CENTRE_BPM)))
    return [round(bpm, 2) for bpm in ranked]


def snap(value, grid, max_distance=None):
    """Snap to the nearest grid time, but only within max_distance.

    The bound matters: a quiet intro yields no tracked beats, so the nearest downbeat can be tens
    of seconds away and an unbounded snap silently drags the cue boundary there.
    """
    if not grid:
        return float(value)
    nearest = float(min(grid, key=lambda g: abs(g - value)))
    if max_distance is not None and abs(nearest - value) > max_distance:
        return float(value)
    return nearest


def cue_candidates(extraction):
    """Name each section by its energy shape. Roles are RULES over L1, not measurements."""
    bounds = extraction["sections_seconds"]
    duration = extraction["duration_seconds"]
    curve = extraction["energy_curve"]
    downbeats = extraction["downbeats_seconds"]
    bpm = extraction["tempo"]["detected_bpm"]

    if not curve or len(bounds) < 2:
        return []

    tolerance = (4 * 60.0 / bpm) if bpm > 0 else 0.0
    times = np.array([p["t"] for p in curve])
    rms = np.array([p["rms"] for p in curve])
    edges = list(bounds) + [duration]

    segs = []
    for i in range(len(edges) - 1):
        start, end = edges[i], edges[i + 1]
        mask = (times >= start) & (times < end)
        if not mask.any():
            continue
        seg = rms[mask]
        slope = float(np.polyfit(np.arange(len(seg)), seg, 1)[0]) if len(seg) > 2 else 0.0
        segs.append({"start": start, "end": end, "mean": float(seg.mean()), "slope": slope})
    if not segs:
        return []

    means = np.array([s["mean"] for s in segs])
    quiet, loud = means.min(), means.max()
    span = (loud - quiet) or 1.0
    peak_idx = int(means.argmax())

    cues = []
    for i, s in enumerate(segs):
        rel = (s["mean"] - quiet) / span
        rising = s["slope"] > 0 and rel < 0.9

        if i == 0:
            role, label = "intro", "Opening"
        elif i == len(segs) - 1:
            role, label = "outro", "Ending"
        elif i == peak_idx:
            role, label = "hook", "Peak energy"
        elif rising and i + 1 == peak_idx:
            role, label = "build", "Build into the peak"
        elif rel < 0.35:
            role, label = "bed", "Low-energy bed"
        else:
            role, label = "custom", f"Section {i + 1}"

        start = snap(s["start"], downbeats, tolerance)
        end = snap(s["end"], downbeats, tolerance)
        if end - start < MIN_CUE_SECONDS:
            end = min(start + MIN_CUE_SECONDS, duration)
        if end - start < MIN_CUE_SECONDS:
            continue

        cues.append({
            "id": f"{role}_{i + 1}",
            "label": label,
            "start_seconds": round(start, 3),
            "end_seconds": round(end, 3),
            "role": role,
            # use_when / avoid_when stay EMPTY here. They say what you *should* do, which needs a
            # goal, and a goal is L4. The guidance step fills them; the descriptive layer does not.
            "use_when": [],
            "avoid_when": [],
            "evidence": {
                "relative_energy": round(float(rel), 3),
                "slope": round(s["slope"], 6),
                "section_index": i,
                "unsnapped_start": round(s["start"], 3),
                "unsnapped_end": round(s["end"], 3),
            },
        })

    # A cue the schema would reject is worse than no cue.
    return [c for c in cues if c["end_seconds"] > c["start_seconds"]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("extraction")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    extraction = json.loads(Path(args.extraction).read_text())

    if extraction.get("status") == "unusable":
        result = {
            "derive_version": DERIVE_VERSION,
            "extraction_input": args.extraction,
            "status": "unusable",
            "cue_candidates": [],
            "note": extraction.get("note", "No trackable beat; nothing to derive."),
        }
        Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
        print(args.out)
        return

    ranked = rank_tempo_candidates(extraction["tempo"]["candidates_bpm"])
    rms = np.array([p["rms"] for p in extraction["energy_curve"]]) if extraction["energy_curve"] else np.array([0.0])
    dynamic_range = float(rms.max() - rms.min())

    result = {
        "derive_version": DERIVE_VERSION,
        "extraction_input": args.extraction,
        "level": "L2 — reads only this track's L1 extraction; never the audio",
        "status": "proposal",
        "tempo": {
            "likely_bpm": ranked[0] if ranked else None,
            "candidates_ranked_bpm": ranked,
            "confirmed": False,
            "basis": (
                f"Ranked by log-distance from the {PERCEPTUAL_CENTRE_BPM:.0f} BPM preference centre, "
                "most plausible first. A ranking is not a measurement — confirm by ear "
                "(pnpm music-tempo-audition)."
            ),
        },
        "energy": {
            "mean_rms": round(float(rms.mean()), 5),
            "dynamic_range_rms": round(dynamic_range, 5),
            "shape": "dynamic" if dynamic_range > 0.05 else "flat",
        },
        "cue_candidates": cue_candidates(extraction),
        "note": (
            "Every field here is a RULE applied to measured facts, not a measurement. Roles come from "
            "the energy contour, so a track whose structure is not energy-driven yields mostly 'custom'. "
            "Re-derive freely: this never touches the audio."
        ),
    }

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(args.out)


if __name__ == "__main__":
    main()
