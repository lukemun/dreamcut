/**
 * Loudness-referenced audio gain — the math behind the volume fader.
 *
 * A clip's stored `volume` is a linear gain the composition/render consume directly.
 * The fader reads that gain in **dB, 0 dB = unity (the clip as-is)** — mute at the
 * floor, + boosts. Nothing is auto-leveled on placement: what the fader shows is exactly
 * the gain, no hidden reference. The role reference (ROLE_LOUDNESS_TARGETS) is used only
 * by the DELIBERATE Normalize action and by the informational resulting-LUFS readout —
 * it never silently moves a clip's gain.
 */

import { ROLE_LOUDNESS_TARGETS, type LoudnessRole } from "@/lib/qc/standards";

/** Fader travel in dB relative to unity. At/below MIN is mute; MAX is the boost ceiling. */
export const FADER_MIN_DB = -40;
export const FADER_MAX_DB = 12;

/** Absolute linear-gain ceiling. Normalizing a quiet source up to a role target can
 *  need a large gain (e.g. a -40 LUFS clip → -16 narrator target ≈ 15.8×), so the
 *  stored gain is allowed well past unity; true-peak clipping is caught by the
 *  post-render loudness gate, not by clamping here. */
export const MAX_ABS_GAIN = 16;

const ratioToDb = (ratio: number) => 20 * Math.log10(ratio);

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Linear gain that moves `sourceLufs` onto `targetLufs`. */
export function referenceGainFor(sourceLufs: number | null | undefined, targetLufs: number): number {
  if (sourceLufs == null || !Number.isFinite(sourceLufs)) return 1;
  return clamp(10 ** ((targetLufs - sourceLufs) / 20), 1 / MAX_ABS_GAIN, MAX_ABS_GAIN);
}

/** The gain a DELIBERATE Normalize would set, given a clip's loudness and lane role. */
export function defaultPlacementGain(sourceLufs: number | null | undefined, role: LoudnessRole | null): number {
  if (role == null) return 1;
  return Number(referenceGainFor(sourceLufs, ROLE_LOUDNESS_TARGETS[role]).toFixed(4));
}

/** Fader dB (0 = unity) → stored linear gain. `null` or at/below the floor = mute (0). */
export function faderDbToGain(db: number | null): number {
  if (db == null || db <= FADER_MIN_DB) return 0;
  return Number(clamp(10 ** (clamp(db, FADER_MIN_DB, FADER_MAX_DB) / 20), 0, MAX_ABS_GAIN).toFixed(4));
}

/** Stored linear gain → fader dB (0 = unity). Gain 0 (mute) → `null`. */
export function gainToFaderDb(gain: number): number | null {
  if (gain <= 0) return null;
  return Number(clamp(ratioToDb(gain), FADER_MIN_DB, FADER_MAX_DB).toFixed(1));
}

/** The integrated loudness a clip will sit at, given its source loudness and gain. */
export function resultingLufs(sourceLufs: number | null | undefined, gain: number): number | null {
  if (sourceLufs == null || !Number.isFinite(sourceLufs) || gain <= 0) return null;
  return Number((sourceLufs + ratioToDb(gain)).toFixed(1));
}

/** Map a lane key to the role whose loudness reference it uses (null = unity). */
export function roleForLaneKey(laneKey: string | null | undefined): LoudnessRole | null {
  if (!laneKey) return null;
  if (laneKey === "audio_narrator") return "narrator";
  if (laneKey.startsWith("music")) return "music";
  if (laneKey.startsWith("sound_effect")) return "sfx";
  return null;
}

/** Resolve the deliberate Normalize target for a placed element.
 * Video clips with embedded speech are narration even on a generic visual lane. */
export function roleForAudioElement(
  element: { type: string; lane_key?: string | null; props?: Record<string, unknown> | null },
): LoudnessRole | null {
  if (
    element.type === "video_clip"
    && (
      element.lane_key?.startsWith("visual_presenter")
      || element.props?.audio_role === "narrator"
      || typeof element.props?.preview_audio_source_url === "string"
    )
  ) {
    return "narrator";
  }
  return roleForLaneKey(element.lane_key);
}
