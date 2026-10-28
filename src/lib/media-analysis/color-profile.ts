export type SourceColorProbe = {
  color_transfer: string | null;
  color_primaries: string | null;
  pixel_format: string | null;
};

export const COLOR_MANAGED_VIDEO_RECIPE = "apple-hdr-sdr-authority-v2";

/**
 * Opaque HDR (HLG or PQ) on every platform: FFmpeg converts only the YUV matrix, keeping the HDR code
 * values, and tags the result BT.709 so browsers hand those values to the grade shader untouched. The
 * receipt's `source_encoding` tells the shader how to decode them; tone mapping happens at output.
 */
export const HDR_CODE_VIDEO_RECIPE = "ffmpeg-hdr-code-authority-v1";

/**
 * The preview proxy of opaque HDR, made straight from the source in one pass (hardware decode and encode
 * where available) with the same matrix-only conversion as HDR_CODE_VIDEO_RECIPE, so a clip can be placed
 * and previewed before its full-resolution authority exists. That authority is made when an export needs it.
 */
export const HDR_CODE_PREVIEW_RECIPE = "ffmpeg-hdr-code-preview-v1";

/**
 * HDR alpha (a cutout cut from HDR phone footage): the same matrix-only code-value conversion as
 * HDR_CODE_VIDEO_RECIPE in a VP9-alpha WebM (CRF 18, lossless when the alpha would leave its measured
 * tolerance), with the same `source_encoding`, so a cutout and its footage decode identically.
 */
export const HDR_CODE_ALPHA_VIDEO_RECIPE = "ffmpeg-hdr-code-alpha-authority-v2";
/** v1 was an unreleased build (2026-10-26) whose matte merge shifted colours by a few levels; its packages are prepared again. */

/** Recipes whose HDR authorities hold code values the grade shader decodes; any other HDR package is prepared again. */
export const CURRENT_HDR_CODE_RECIPES: readonly string[] = [HDR_CODE_VIDEO_RECIPE, HDR_CODE_ALPHA_VIDEO_RECIPE];

/**
 * Superseded HDR alpha: tone-mapped to SDR by avconvert at preparation, so its subject never matched the
 * code-value footage. Records made with it stay readable; preparing again moves them to HDR_CODE_ALPHA_VIDEO_RECIPE.
 * v2: VP9 CRF 18 alpha authority, verified against measured alpha tolerances (v1 was lossless with an exact alpha hash).
 */
export const COLOR_MANAGED_ALPHA_VIDEO_RECIPE = "apple-hdr-sdr-alpha-authority-v2";
export const LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES = ["apple-hdr-sdr-alpha-authority-v1"] as const;

export function sourceNeedsSdrRenderAuthority(probe: SourceColorProbe): boolean {
  const transfer = probe.color_transfer?.toLowerCase() ?? "";
  const primaries = probe.color_primaries?.toLowerCase() ?? "";
  const pixelFormat = probe.pixel_format?.toLowerCase() ?? "";
  return transfer === "arib-std-b67"
    || transfer === "smpte2084"
    || primaries === "bt2020"
    || /p10|p12|10le|12le/.test(pixelFormat);
}
