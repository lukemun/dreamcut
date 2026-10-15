export type SourceColorProbe = {
  color_transfer: string | null;
  color_primaries: string | null;
  pixel_format: string | null;
};

export const COLOR_MANAGED_VIDEO_RECIPE = "apple-hdr-sdr-authority-v2";

export const COLOR_MANAGED_ALPHA_VIDEO_RECIPE = "apple-hdr-sdr-alpha-authority-v1";

export function sourceNeedsSdrRenderAuthority(probe: SourceColorProbe): boolean {
  const transfer = probe.color_transfer?.toLowerCase() ?? "";
  const primaries = probe.color_primaries?.toLowerCase() ?? "";
  const pixelFormat = probe.pixel_format?.toLowerCase() ?? "";
  return transfer === "arib-std-b67"
    || transfer === "smpte2084"
    || primaries === "bt2020"
    || /p10|p12|10le|12le/.test(pixelFormat);
}
