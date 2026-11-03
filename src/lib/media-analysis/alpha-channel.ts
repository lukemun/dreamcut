import type { ProbeResult } from "./schema";

/**
 * L2 per-asset derivation over the L1 ffprobe record. Keep this rule out of
 * the probe stage so it can evolve without re-reading the source file.
 */
export function probeHasAlphaChannel(probe: Pick<ProbeResult, "pixel_format"> & { video_alpha_mode?: string | null } | null | undefined): boolean {
  if (!probe) return false;
  if (probe.video_alpha_mode === "1") return true;

  const pixelFormat = probe.pixel_format?.toLowerCase() ?? "";
  return /^(?:yuva|gbrap|rgba|argb|bgra|abgr|ya)/.test(pixelFormat);
}
