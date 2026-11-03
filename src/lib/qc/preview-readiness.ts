import { COLOR_MANAGED_VIDEO_RECIPE, COLOR_MANAGED_ALPHA_VIDEO_RECIPE, LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES } from "@/lib/media-analysis/color-profile";
import { shouldUseWebAudioForPreviewNarration } from "@/lib/remotion/preview-narration-audio";
import { timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import { proxyDimensionsAllowed } from "@/lib/remotion/preview-proxy-contract";

export type PreviewMediaFact = {
  url: string;
  readable: boolean;
  codec: string | null;
  width: number | null;
  height: number | null;
  pixelFormat: string | null;
  fps: number | null;
  durationSeconds: number | null;
  frameCount?: number | null;
  colorSpace?: string | null;
  colorTransfer?: string | null;
  colorPrimaries?: string | null;
  hasAudio?: boolean;
  sha256?: string | null;
};

export type PreviewElement = {
  id: string;
  type: string;
  source_url?: string | null;
  timeline_start: number;
  duration: number;
  trim_start?: number | null;
  playback_rate?: number | null;
  volume?: number | null;
  props?: Record<string, unknown> | null;
  removed_at?: string | null;
};

export type PreviewReadinessFinding = {
  severity: "blocker" | "warning";
  code: string;
  elementId?: string;
  message: string;
};

export type PreviewReadinessReport = {
  ok: boolean;
  findings: PreviewReadinessFinding[];
  summary: {
    videoCount: number;
    distinctPreviewCount: number;
    peakMountedDecoders: number;
    peakAtSeconds: number;
    peakDecodedMegapixelsPerSecond: number;
  };
};

const PREMOUNT_SECONDS = 1.5;
const MAX_PREVIEW_WIDTH = 720;
const MAX_PREVIEW_HEIGHT = 1280;
// Alpha animations are commonly stacked above a presenter and other motion
// layers. A 720x1280 alpha decode is individually legal but too expensive in
// those real workshop compositions, so give layered motion a tighter budget.
const MAX_ALPHA_PREVIEW_WIDTH = 540;
const MAX_ALPHA_PREVIEW_HEIGHT = 960;
// Five concurrent browser video decoders has repeatedly produced audible
// stutter in layered workshop timelines, even when narration is split out and
// every visual uses a 360x640 proxy. Keep review playback below that boundary.
const MAX_MOUNTED_VIDEO_DECODERS = 4;
export const SINGLE_MUXED_NARRATION_CLOCK =
  "single-muxed-picture-and-baked-narration-clock-v1";

function hasVerifiedMuxedNarrationClock(
  element: PreviewElement,
  fact: PreviewMediaFact,
): boolean {
  if (element.props?.preview_audio_architecture !== SINGLE_MUXED_NARRATION_CLOCK) {
    return false;
  }
  const recipe = element.props?.preview_audio_recipe;
  const previewHash = element.props?.preview_proxy_sha256;
  if (typeof recipe !== "object" || recipe == null || Array.isArray(recipe)) {
    return false;
  }
  const receipt = recipe as Record<string, unknown>;
  return fact.hasAudio === true
    && element.volume === 1
    && element.props?.source_timing_preserved === true
    && typeof previewHash === "string"
    && previewHash.length === 64
    && fact.sha256 === previewHash
    && typeof receipt.gain_baked_into_muxed_media === "number"
    && receipt.gain_baked_into_muxed_media > 0
    && receipt.authored_element_gain === 1
    && receipt.video_stream_treatment === "packet-copy"
    && receipt.timing_preserved === true
    && typeof receipt.duration_seconds === "number"
    && fact.durationSeconds != null
    && Math.abs(receipt.duration_seconds - fact.durationSeconds) <= 1 / 30 + 0.001;
}

function previewPremountSeconds(element: PreviewElement): number {
  const requested = element.props?.preview_premount_seconds;
  return typeof requested === "number" && Number.isFinite(requested) && requested >= 0
    ? requested
    : PREMOUNT_SECONDS;
}

export function resolvedPreviewUrl(element: PreviewElement): string | null {
  const candidate = element.props?.preview_source_url;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : element.source_url ?? null;
}

function normalizedMediaIdentity(url: string) {
  return url.split(/[?#]/, 1)[0];
}

function requiresRgbParentReceipt(element: PreviewElement): boolean {
  if (element.props?.has_alpha !== true) return false;
  if (element.props?.rgb_parent_authority_required === true) return true;
  return typeof element.props?.mask_recipe === "string"
    && element.props.mask_recipe.trim().length > 0;
}

export function assessPreviewReadiness(
  elements: PreviewElement[],
  facts: Map<string, PreviewMediaFact>,
  readableAudioUrls: Set<string> = new Set(),
): PreviewReadinessReport {
  const videos = elements.filter((element) => element.type === "video_clip" && !element.removed_at);
  const renderAuthorityStills = elements.filter((element) =>
    element.type === "still"
    && !element.removed_at
    && element.props?.render_authority_required === true
  );
  const findings: PreviewReadinessFinding[] = [];

  for (const element of renderAuthorityStills) {
    const renderUrl = element.source_url ?? null;
    const previewUrl = typeof element.props?.preview_source_url === "string"
      ? element.props.preview_source_url
      : null;
    if (!renderUrl || !previewUrl) {
      findings.push({ severity: "blocker", code: "still_render_authority_missing", elementId: element.id, message: "A render-authority still must declare both source_url and preview_source_url." });
      continue;
    }
    if (renderUrl === previewUrl) {
      findings.push({ severity: "blocker", code: "still_render_authority_not_distinct", elementId: element.id, message: `Render and workshop still sources are identical: ${renderUrl}` });
      continue;
    }
    const renderFact = facts.get(renderUrl);
    const previewFact = facts.get(previewUrl);
    if (!renderFact?.readable || !previewFact?.readable) {
      findings.push({ severity: "blocker", code: "still_render_authority_unreadable", elementId: element.id, message: `Render or workshop still is unreadable (${renderUrl}; ${previewUrl}).` });
      continue;
    }
    if (
      renderFact.width == null || renderFact.height == null
      || previewFact.width == null || previewFact.height == null
      || renderFact.width < previewFact.width * 2
      || renderFact.height < previewFact.height * 2
    ) {
      findings.push({ severity: "blocker", code: "still_render_authority_undersized", elementId: element.id, message: `Render still must be at least 2× the workshop derivative in each dimension (${renderFact.width ?? "?"}×${renderFact.height ?? "?"} vs ${previewFact.width ?? "?"}×${previewFact.height ?? "?"}).` });
    }
  }

  for (const element of videos) {
    if (typeof element.props?.preview_source_url !== "string" || !element.props.preview_source_url.trim()) {
      findings.push({ severity: "blocker", code: "preview_proxy_required", elementId: element.id, message: "Every video requires an explicit prepared preview proxy; original-source fallback is forbidden." });
    }
    const url = resolvedPreviewUrl(element);
    const previewAudioUrl = element.props?.preview_audio_source_url;
    const declaredRenderAuthority = element.props?.render_authority_source_url;
    const framingReceiptPath = element.props?.framing_receipt_path;
    if (typeof framingReceiptPath === "string" && framingReceiptPath.length > 0) {
      const previewUrl = typeof element.props?.preview_source_url === "string"
        ? element.props.preview_source_url
        : null;
      const minimum = element.props?.preview_render_parity_minimum_ssim;
      const samples = element.props?.preview_render_parity_samples;
      const hashesPresent = typeof element.props?.render_authority_sha256 === "string"
        && element.props.render_authority_sha256.length === 64
        && typeof element.props?.preview_proxy_sha256 === "string"
        && element.props.preview_proxy_sha256.length === 64;
      const samplesPass = typeof minimum === "number"
        && Array.isArray(samples)
        && samples.length >= 3
        && samples.every((sample) => typeof sample === "object" && sample != null
          && typeof (sample as Record<string, unknown>).source_second === "number"
          && typeof (sample as Record<string, unknown>).ssim_all === "number"
          && Number((sample as Record<string, unknown>).ssim_all) >= minimum);
      if (
        typeof declaredRenderAuthority !== "string"
        || declaredRenderAuthority.length === 0
        || !previewUrl
        || !hashesPresent
        || !samplesPass
      ) {
        findings.push({
          severity: "blocker",
          code: "framed_preview_render_parity_missing",
          elementId: element.id,
          message: "Receipt-bound presenter framing requires an explicit full-resolution render authority, its paired preview, both current hashes, and at least three passing decoded-frame parity samples.",
        });
      }
    }
    if (typeof declaredRenderAuthority === "string" && declaredRenderAuthority.length > 0) {
      const mountedRenderAuthority = element.source_url;
      if (
        !mountedRenderAuthority
        || normalizedMediaIdentity(mountedRenderAuthority)
          !== normalizedMediaIdentity(declaredRenderAuthority)
      ) {
        findings.push({
          severity: "blocker",
          code: "render_authority_source_mismatch",
          elementId: element.id,
          message: `Mounted render source and declared render authority disagree (${mountedRenderAuthority ?? "missing"}; ${declaredRenderAuthority}). Replace the authority/proxy pair atomically and regenerate its receipt.`,
        });
      }
      const previewUrl = typeof element.props?.preview_source_url === "string"
        ? element.props.preview_source_url
        : null;
      const renderFact = facts.get(declaredRenderAuthority);
      const previewFact = previewUrl ? facts.get(previewUrl) : null;
      const expectedRenderHash = element.props?.render_authority_sha256;
      const expectedPreviewHash = element.props?.preview_proxy_sha256;
      if (
        typeof expectedRenderHash === "string"
        && (!renderFact?.sha256 || renderFact.sha256 !== expectedRenderHash)
      ) {
        findings.push({
          severity: "blocker",
          code: "render_authority_fingerprint_mismatch",
          elementId: element.id,
          message: "Declared render authority does not match its recorded SHA-256 fingerprint. Rebuild the paired preview from the current authority.",
        });
      }
      if (
        typeof expectedPreviewHash === "string"
        && (!previewFact?.sha256 || previewFact.sha256 !== expectedPreviewHash)
      ) {
        findings.push({
          severity: "blocker",
          code: "preview_proxy_fingerprint_mismatch",
          elementId: element.id,
          message: "Workshop preview does not match its recorded SHA-256 fingerprint. Regenerate it from the current render authority.",
        });
      }
    }
    if (typeof previewAudioUrl === "string" && element.props?.preview_source_url && !readableAudioUrls.has(previewAudioUrl)) {
      findings.push({ severity: "blocker", code: "preview_audio_unreadable", elementId: element.id, message: `Dedicated preview audio is missing or unreadable: ${previewAudioUrl}` });
    }
    if (typeof previewAudioUrl === "string") {
      const previewAudioFact = facts.get(previewAudioUrl);
      if (
        previewAudioFact?.readable
        && (previewAudioFact.width != null || previewAudioFact.height != null)
      ) {
        findings.push({
          severity: "blocker",
          code: "preview_audio_must_be_audio_only",
          elementId: element.id,
          message: "Dedicated preview audio must be an audio-only, timing-identical clock; a muxed video container can stall interactive playback.",
        });
      }
    }
    if (!url) {
      findings.push({ severity: "blocker", code: "preview_source_missing", elementId: element.id, message: "Video has no preview source." });
      continue;
    }
    if (requiresRgbParentReceipt(element)) {
      const renderUrl = element.source_url ?? null;
      const previewUrl = typeof element.props?.preview_source_url === "string" ? element.props.preview_source_url : null;
      const parentRenderUrl = typeof element.props?.rgb_parent_authority_source_url === "string" ? element.props.rgb_parent_authority_source_url : null;
      const parentPreviewUrl = typeof element.props?.rgb_parent_preview_source_url === "string" ? element.props.rgb_parent_preview_source_url : null;
      const expectedHashes = [
        [renderUrl, element.props?.rgb_derivative_sha256],
        [previewUrl, element.props?.rgb_preview_derivative_sha256],
        [parentRenderUrl, element.props?.rgb_parent_authority_sha256],
        [parentPreviewUrl, element.props?.rgb_parent_preview_sha256],
      ] as const;
      const startFrame = element.props?.rgb_parent_start_frame;
      const frameCount = element.props?.rgb_parent_frame_count;
      const minimum = element.props?.rgb_parent_parity_minimum_ssim;
      const renderSamples = element.props?.rgb_parent_parity_samples;
      const previewSamples = element.props?.rgb_parent_preview_parity_samples;
      const samplesPass = (samples: unknown) => typeof minimum === "number"
        && Array.isArray(samples)
        && samples.length >= 3
        && samples.every((sample) => typeof sample === "object" && sample != null
          && typeof (sample as Record<string, unknown>).derivative_frame === "number"
          && typeof (sample as Record<string, unknown>).parent_frame === "number"
          && typeof (sample as Record<string, unknown>).ssim_all === "number"
          && Number((sample as Record<string, unknown>).ssim_all) >= minimum);
      if (!renderUrl || !previewUrl || !parentRenderUrl || !parentPreviewUrl
        || typeof startFrame !== "number" || typeof frameCount !== "number" || frameCount < 1) {
        findings.push({ severity: "blocker", code: "alpha_rgb_parent_receipt_missing", elementId: element.id, message: "RGB-bearing alpha media must declare render/preview parent authorities plus its parent start frame and frame count." });
      } else {
        const factsForPair = [renderUrl, previewUrl, parentRenderUrl, parentPreviewUrl].map((candidate) => facts.get(candidate));
        if (factsForPair.some((fact) => !fact?.readable)) {
          findings.push({ severity: "blocker", code: "alpha_rgb_parent_unreadable", elementId: element.id, message: "An RGB-bearing alpha derivative or its declared render/preview parent authority is unreadable." });
        }
        if (factsForPair.some((fact) => fact?.readable && fact.colorSpace !== "bt709")) {
          findings.push({ severity: "blocker", code: "alpha_rgb_parent_not_bt709", elementId: element.id, message: "RGB-bearing alpha derivatives and both parent authorities must report BT.709 color space." });
        }
      }
      if (expectedHashes.some(([candidate, expected]) => typeof candidate !== "string" || typeof expected !== "string" || expected.length !== 64 || facts.get(candidate)?.sha256 !== expected)) {
        findings.push({ severity: "blocker", code: "alpha_rgb_parent_hash_mismatch", elementId: element.id, message: "An RGB-bearing alpha derivative or parent authority does not match its recorded SHA-256 fingerprint." });
      }
      if (!samplesPass(renderSamples) || !samplesPass(previewSamples)) {
        findings.push({ severity: "blocker", code: "alpha_rgb_parent_parity_missing", elementId: element.id, message: "RGB-bearing alpha render and preview derivatives each require at least three source-mapped SSIM samples meeting the declared threshold." });
      }
    }
    if ([COLOR_MANAGED_VIDEO_RECIPE,COLOR_MANAGED_ALPHA_VIDEO_RECIPE,...LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES].includes(String(element.props?.proxy_recipe))) {
      const renderUrl = element.source_url ?? null;
      const previewUrl = typeof element.props?.preview_source_url === "string" ? element.props.preview_source_url : null;
      if (!renderUrl || !previewUrl || renderUrl === previewUrl) {
        findings.push({ severity: "blocker", code: "video_color_authority_pair_missing", elementId: element.id, message: "Color-managed HDR video requires distinct source_url render authority and preview_source_url proxy." });
      } else {
        const renderFact = facts.get(renderUrl);
        const previewFact = facts.get(previewUrl);
        if (!renderFact?.readable || !previewFact?.readable) {
          findings.push({ severity: "blocker", code: "video_color_authority_pair_unreadable", elementId: element.id, message: `Color-managed render authority or proxy is unreadable (${renderUrl}; ${previewUrl}).` });
        } else {
          const explicitBt709 = (fact: PreviewMediaFact) => fact.colorSpace === "bt709" && fact.colorTransfer === "bt709" && fact.colorPrimaries === "bt709";
          if (!explicitBt709(renderFact) || !explicitBt709(previewFact)) {
            findings.push({ severity: "blocker", code: "video_color_authority_not_bt709", elementId: element.id, message: "Color-managed render authority and preview proxy must both be explicitly tagged BT.709." });
          }
          if (renderFact.frameCount == null || previewFact.frameCount == null || renderFact.frameCount !== previewFact.frameCount) {
            findings.push({ severity: "blocker", code: "video_color_authority_frame_mismatch", elementId: element.id, message: `Color-managed authority/proxy frame counts differ (${renderFact.frameCount ?? "?"} vs ${previewFact.frameCount ?? "?"}).` });
          }
          if (renderFact.durationSeconds == null || previewFact.durationSeconds == null || Math.abs(renderFact.durationSeconds - previewFact.durationSeconds) > 1 / 30 + 0.001) {
            findings.push({ severity: "blocker", code: "video_color_authority_duration_mismatch", elementId: element.id, message: `Color-managed authority/proxy durations differ (${renderFact.durationSeconds ?? "?"} vs ${previewFact.durationSeconds ?? "?"}).` });
          }
          const minimum = element.props?.color_parity_minimum_ssim;
          const samples = element.props?.color_parity_samples;
          if (typeof minimum !== "number" || !Array.isArray(samples) || samples.length < 3
            || samples.some((sample) => typeof sample !== "object" || sample == null || typeof (sample as Record<string, unknown>).ssim_all !== "number" || Number((sample as Record<string, unknown>).ssim_all) < minimum)) {
            findings.push({ severity: "blocker", code: "video_color_authority_parity_missing", elementId: element.id, message: "Color-managed authority/proxy requires at least three distributed SSIM samples meeting its declared threshold." });
          }
        }
      }
    }
    const fact = facts.get(url);
    if (!fact?.readable) {
      findings.push({ severity: "blocker", code: "preview_unreadable", elementId: element.id, message: `Preview is missing or unreadable: ${url}` });
      continue;
    }
    if (fact.hasAudio === true && (element.volume ?? 1) > 0) {
      const hasDedicatedAudioClock =
        typeof previewAudioUrl === "string" && previewAudioUrl.length > 0;
      const declaresMuxedAudioClock =
        element.props?.preview_audio_architecture === SINGLE_MUXED_NARRATION_CLOCK;
      const hasValidMuxedAudioClock = hasVerifiedMuxedNarrationClock(element, fact);
      if (declaresMuxedAudioClock && !hasValidMuxedAudioClock) {
        findings.push({
          severity: "blocker",
          code: "preview_muxed_audio_receipt_invalid",
          elementId: element.id,
          message: "Single-clock muxed narration requires unity timeline gain plus matching proxy hash, baked-gain, packet-copy, and timing-preservation receipts.",
        });
      } else if (!hasDedicatedAudioClock && !hasValidMuxedAudioClock) {
        findings.push({
          severity: "blocker",
          code: "preview_audio_clock_missing",
          elementId: element.id,
          message: "Audible preview video must use either a dedicated preview audio clock or a verified single muxed picture-and-baked-narration clock.",
        });
      } else if (
        hasDedicatedAudioClock
        && shouldUseWebAudioForPreviewNarration(element)
      ) {
        findings.push({
          severity: "blocker",
          code: "preview_narration_requires_web_audio",
          elementId: element.id,
          message: "Narration is not review-ready while its preview gain requires Web Audio. Bake the authored gain into a timing-identical preview clock and declare preview_audio_baked_gain so speech remains on the native media clock.",
        });
      }
    }
    const isAlphaPreview = element.props?.has_alpha === true;
    const maxWidth = isAlphaPreview ? MAX_ALPHA_PREVIEW_WIDTH : MAX_PREVIEW_WIDTH;
    const maxHeight = isAlphaPreview ? MAX_ALPHA_PREVIEW_HEIGHT : MAX_PREVIEW_HEIGHT;
    if (fact.width == null || fact.height == null || !proxyDimensionsAllowed(fact.width, fact.height, isAlphaPreview)) {
      const code = isAlphaPreview ? "preview_alpha_oversized" : "preview_oversized";
      findings.push({
        severity: "blocker",
        code,
        elementId: element.id,
        message: `Preview ${url} is ${fact.width ?? "?"}×${fact.height ?? "?"}; ${isAlphaPreview ? "layered alpha motion" : "workshop media"} must fit ${maxWidth}×${maxHeight} in either orientation.`,
      });
    }
    if (fact.fps == null || Math.abs(fact.fps - 30) > 0.01) {
      findings.push({ severity: "blocker", code: "preview_cadence_mismatch", elementId: element.id, message: `Preview ${url} is ${fact.fps ?? "unknown"} fps; this composition is 30 fps CFR.` });
    }
    if (fact.codec === "h264" && fact.pixelFormat !== "yuv420p") {
      findings.push({ severity: "blocker", code: "preview_h264_pixel_format", elementId: element.id, message: `H.264 preview ${url} uses ${fact.pixelFormat ?? "unknown"}; browser workshop proxies require 8-bit yuv420p.` });
    }
    const neededSourceEnd = timelineTimeToSourceTime(element, element.duration);
    if (fact.durationSeconds != null && neededSourceEnd > fact.durationSeconds + 1 / 30) {
      findings.push({ severity: "blocker", code: "preview_too_short", elementId: element.id, message: `Preview ${url} ends before the mapped source interval (${neededSourceEnd.toFixed(3)}s needed, ${fact.durationSeconds.toFixed(3)}s available).` });
    }
  }

  const events: Array<{ at: number; delta: 1 | -1; pixelsPerSecond: number }> = [];
  for (const element of videos) {
    const url = resolvedPreviewUrl(element);
    const fact = url ? facts.get(url) : null;
    const pixelsPerSecond = fact?.width && fact?.height && fact?.fps ? fact.width * fact.height * fact.fps : 0;
    events.push({ at: Math.max(0, element.timeline_start - previewPremountSeconds(element)), delta: 1, pixelsPerSecond });
    events.push({ at: element.timeline_start + element.duration, delta: -1, pixelsPerSecond });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let mounted = 0;
  let decodedPixelsPerSecond = 0;
  let peakMountedDecoders = 0;
  let peakDecodedPixelsPerSecond = 0;
  let peakAtSeconds = 0;
  for (const event of events) {
    mounted += event.delta;
    decodedPixelsPerSecond += event.delta * event.pixelsPerSecond;
    if (mounted > peakMountedDecoders) {
      peakMountedDecoders = mounted;
      peakAtSeconds = event.at;
    }
    peakDecodedPixelsPerSecond = Math.max(peakDecodedPixelsPerSecond, decodedPixelsPerSecond);
  }
  if (peakMountedDecoders > MAX_MOUNTED_VIDEO_DECODERS) {
    findings.push({ severity: "blocker", code: "preview_decoder_fanout", message: `The assembled preview mounts ${peakMountedDecoders} video decoders near ${peakAtSeconds.toFixed(2)}s, including premounted and opacity-zero clips; the workshop budget is ${MAX_MOUNTED_VIDEO_DECODERS}. Reduce the overlap, remove invisible decoding, or use a preview-only flattened interval while preserving editable render authority.` });
  }

  return {
    ok: !findings.some((finding) => finding.severity === "blocker"),
    findings,
    summary: {
      videoCount: videos.length,
      distinctPreviewCount: new Set(videos.map(resolvedPreviewUrl).filter(Boolean)).size,
      peakMountedDecoders,
      peakAtSeconds,
      peakDecodedMegapixelsPerSecond: Number((peakDecodedPixelsPerSecond / 1_000_000).toFixed(2)),
    },
  };
}
