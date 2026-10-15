import { LOUDNESS_TARGETS, type DeliveryTarget } from "@/lib/qc/standards";

/**
 * Post-render loudness gate: compares the ebur128 numbers `pnpm probe` already
 * measures against the sourced targets in LOUDNESS_TARGETS. This is the
 * enforcement half of STANDARD_ENFORCEMENT.LOUDNESS_TARGETS: "post-render" —
 * the targets existed and the measurement existed, but nothing compared them,
 * so a 10-LU-hot mix passed verification silently.
 *
 * Only sourced numbers gate. Platforms without a published figure (TikTok,
 * Reels, Meta feed, bare web) get their measured values REPORTED, never judged
 * against an invented threshold — the same discipline LOUDNESS_TARGETS itself
 * documents ("we do NOT repeat the widely-circulated unsourced figures").
 */

/** Delivery targets whose platform publishes a loudness figure we carry. */
const DELIVERY_LOUDNESS_KEY: Partial<Record<DeliveryTarget, keyof typeof LOUDNESS_TARGETS>> = {
  // Shorts is YouTube; YouTube publishes its normalization target.
  shorts: "youtube",
};

/**
 * Grace band around the integrated target. EBU Tech 3341 uses ±0.5 LU as its
 * compliance tolerance; we borrow the same figure as a measurement-jitter
 * allowance for the streaming targets rather than claiming platforms publish one.
 */
export const LOUDNESS_TOLERANCE_LU = 0.5;

export type LoudnessMeasurement = {
  integratedLufs: number;
  truePeakDbfs: number;
};

export type LoudnessFinding = {
  severity: "blocker" | "warning" | "info";
  code:
    | "loudness_unmeasurable"
    | "true_peak_over_ceiling"
    | "integrated_above_target"
    | "loudness_within_target"
    | "no_published_target";
  message: string;
};

export type LoudnessReport = {
  ok: boolean;
  deliveryTarget: DeliveryTarget;
  /** The sourced target applied, or null when the platform publishes none. */
  applied: { key: string; lufs: number | null; truePeakDb: number; source: string } | null;
  measured: LoudnessMeasurement;
  findings: LoudnessFinding[];
};

const format = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : "unmeasurable");

/**
 * `expectsAudio` should be true when the timeline carries unmuted explicit audio
 * elements (music / vo / sfx) — an unmeasurable loudness then means the mix went
 * missing, which is a delivery defect, not a measurement gap.
 */
export function loudnessReport(
  deliveryTarget: DeliveryTarget,
  measured: LoudnessMeasurement,
  expectsAudio: boolean,
): LoudnessReport {
  const findings: LoudnessFinding[] = [];
  const key = DELIVERY_LOUDNESS_KEY[deliveryTarget] ?? null;
  const target = key ? LOUDNESS_TARGETS[key]! : null;
  const measurable = Number.isFinite(measured.integratedLufs) && Number.isFinite(measured.truePeakDbfs);

  if (!measurable) {
    findings.push(expectsAudio
      ? {
          severity: "blocker",
          code: "loudness_unmeasurable",
          message: "Timeline has unmuted audio elements but the render's loudness could not be measured — the mix is likely missing from the export.",
        }
      : {
          severity: "info",
          code: "loudness_unmeasurable",
          message: "No measurable audio in the render (none expected from the timeline).",
        });
  } else if (target && key) {
    if (measured.truePeakDbfs > target.truePeakDb) {
      findings.push({
        severity: "blocker",
        code: "true_peak_over_ceiling",
        message: `True peak ${format(measured.truePeakDbfs)} dBFS exceeds the ${target.truePeakDb} dBTP ceiling (${target.source}); platform transcodes risk clipping.`,
      });
    }
    if (target.lufs != null && measured.integratedLufs > target.lufs + LOUDNESS_TOLERANCE_LU) {
      findings.push({
        severity: "warning",
        code: "integrated_above_target",
        message: `Integrated ${format(measured.integratedLufs)} LUFS is ${(measured.integratedLufs - target.lufs).toFixed(1)} LU above the ${target.lufs} LUFS target (${target.source}); the platform will turn it down and the headroom loss is permanent.`,
      });
    }
    if (findings.length === 0) {
      findings.push({
        severity: "info",
        code: "loudness_within_target",
        message: `Integrated ${format(measured.integratedLufs)} LUFS, true peak ${format(measured.truePeakDbfs)} dBFS — within the ${target.source} target.`,
      });
    }
  } else {
    findings.push({
      severity: "info",
      code: "no_published_target",
      message: `Measured integrated ${format(measured.integratedLufs)} LUFS, true peak ${format(measured.truePeakDbfs)} dBFS. ${deliveryTarget} publishes no loudness target we carry; reported, not gated.`,
    });
  }

  return {
    ok: !findings.some((finding) => finding.severity === "blocker"),
    deliveryTarget,
    applied: target && key ? { key, ...target } : null,
    measured,
    findings,
  };
}

/** Audio element types whose presence means the render must carry a measurable mix. */
export const EXPLICIT_AUDIO_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

export function timelineExpectsAudio(
  elements: ReadonlyArray<{ type: string; lane_key: string; volume: number; removed_at: string | null }>,
  mutedLaneKeys: readonly string[],
): boolean {
  const muted = new Set(mutedLaneKeys);
  return elements.some((element) =>
    element.removed_at == null
    && EXPLICIT_AUDIO_TYPES.has(element.type)
    && element.volume > 0
    && !muted.has(element.lane_key),
  );
}
