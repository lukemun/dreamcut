/**
 * Sourced editing standards — the single source of truth for the timeline QC gate.
 *
 * Every constant here traces to a PRIMARY source, recorded in
 * `docs/research/2026-07-12-video-editing-failure-modes/`. The `source` field on each
 * export names it. Do not add a number here that you cannot cite: the whole point of this
 * file is that an agent (and a human) can trust it without re-deriving it.
 *
 * This is the timeline analogue of `src/lib/design-canvases/layout-constants.ts` in the app —
 * same doctrine: constants from a standard, fed to a checker, which emits structured findings
 * the agent reasons over as TEXT. Per `docs/standards/spek-agent-design-standards.md` §14.4,
 * the agent never computes a position or judges a geometry; it reads measured findings.
 */

/** The composition frame rate. Everything in this file is quantized against it. */
export const FPS = 30;

/** One frame, in seconds, at FPS. Handy because most standards are written in frames or ms. */
export const FRAME_SECONDS = 1 / FPS;

export const msToFrames = (ms: number) => (ms / 1000) * FPS;
export const framesToMs = (frames: number) => (frames / FPS) * 1000;

// ---------------------------------------------------------------------------
// Delivery targets — safe zones
// ---------------------------------------------------------------------------

/**
 * Where a video is going. Safe areas are UNDEFINED without this: the same 1080x1920
 * canvas has a materially different legal area on TikTok than on a website.
 */
export type DeliveryTarget =
  | "tiktok"
  | "reels" // Instagram + Facebook Reels (Meta publishes one spec for both)
  | "shorts"
  | "feed" // Meta in-feed video
  | "web"; // no platform chrome — the full frame is legal

export const DELIVERY_TARGETS = ["tiktok", "reels", "shorts", "feed", "web"] as const satisfies readonly DeliveryTarget[];

/** The published numeric social safe zones describe ad creative, not organic uploads. */
export type CaptionSafeAreaMode = "paid_ad" | "organic";
export const CAPTION_SAFE_AREA_MODES = ["paid_ad", "organic"] as const satisfies readonly CaptionSafeAreaMode[];

export function isCaptionSafeAreaMode(value: unknown): value is CaptionSafeAreaMode {
  return typeof value === "string" && CAPTION_SAFE_AREA_MODES.includes(value as CaptionSafeAreaMode);
}

export function isDeliveryTarget(value: unknown): value is DeliveryTarget {
  return typeof value === "string" && DELIVERY_TARGETS.includes(value as DeliveryTarget);
}

/**
 * A safe area, in pixels, against a reference canvas.
 *
 * `railBelow` models TikTok's L-SHAPE: the right-side action rail (like/comment/share)
 * widens the right margin below a fraction of frame height. A single rectangle would
 * pass content that TikTok's buttons cover, so the shape is not negotiable.
 */
export type SafeArea = {
  target: DeliveryTarget;
  reference: { width: number; height: number };
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** The right margin widens to `right` below this fraction of frame height. Null = plain rectangle. */
  rail: { belowFraction: number; right: number } | null;
  source: string;
};

/**
 * Meta (Instagram + Facebook Reels).
 *
 * Meta publishes this in prose — "at least 14% of the top, 35% of the bottom, and 6% on each
 * side ... free from text, logos, or other important creative elements" — and ships a
 * safe-zone template. We downloaded the template and measured its alpha channel: top 270px
 * (14.06%), bottom 672px (35.00%), left 64px (5.93%), right 65px (6.02%) at 1080x1920.
 * Prose and file agree.
 *
 * The template does not model the right-side action rail (like / comment / share / audio
 * disc), which overlays playback on organic and paid alike. Measured off Instagram Reels
 * overlay templates: the rail begins near y=860 (44.8% of frame height) and needs 193px of
 * right clearance below it — the same L-shape TikTok's entry already models. Without it the
 * checker blesses right-edge captions the rail then covers.
 *
 * NOTE: this REPLACES the app's `CANVAS_SAFE_AREA_9_16.bottomMargin = 340`, which is roughly
 * half the real bottom margin and was sourced from a secondary (a bootcamp deck).
 */
export const SAFE_AREA_REELS: SafeArea = {
  target: "reels",
  reference: { width: 1080, height: 1920 },
  top: 270,
  bottom: 672,
  left: 64,
  right: 65,
  rail: { belowFraction: 0.448, right: 193 },
  source: "Meta Ads Guide + measured from Meta's own Reels safe-zone template (research part 04); action rail measured from Instagram Reels overlay templates",
};

/**
 * TikTok.
 *
 * TikTok publishes NO prose percentages — only a downloadable template ZIP. We pulled it and
 * measured: on TikTok's own 720x1280 canvas, top 160 / bottom 440 / left 80 / right 80,
 * widening to 200 below 43.8% of frame height (the action rail). Scaled to 1080x1920:
 * 240 / 660 / 120 / 120->300.
 *
 * The blog-circulated figures (top 130 / bottom 483 / right 140) do NOT match TikTok's file.
 */
export const SAFE_AREA_TIKTOK: SafeArea = {
  target: "tiktok",
  reference: { width: 1080, height: 1920 },
  top: 240,
  bottom: 660,
  left: 120,
  right: 120,
  rail: { belowFraction: 0.438, right: 300 },
  source: "Measured from TikTok's own safe-zone template (research part 04; raw/measure-safe-zones.py)",
};

/**
 * YouTube Shorts publishes no safe zone. This is a genuine publisher gap, not a research gap.
 * We fall back to the stricter of the two known verticals so we don't silently ship into chrome.
 */
export const SAFE_AREA_SHORTS: SafeArea = {
  target: "shorts",
  reference: { width: 1080, height: 1920 },
  top: 270,
  bottom: 672,
  left: 120,
  right: 120,
  rail: null,
  source: "YouTube publishes no Shorts safe zone (research part 04) — conservative fallback: strictest of Meta/TikTok",
};

/**
 * SMPTE ST 2046-1 title-safe: 90% of frame (5% each edge). EBU R 95 states the same as a
 * graphics safe area of 5%. Used for `feed` and `web`, where there is no platform chrome but
 * broadcast-style edge safety still applies.
 */
export const TITLE_SAFE_FRACTION = 0.9;

/**
 * Resolve the safe area for a delivery target on a canvas, scaled from the reference.
 *
 * `mode` is retained for API compatibility — projects store a caption-safe-area mode and the
 * editor exposes the selector — but since 2026-09-19 it no longer changes the geometry:
 * organic and paid-ad resolve to the same measured platform template. Why: the templates
 * measure *player chrome* (header, caption block, action rail), which is identically
 * positioned on organic uploads and paid placements. The only ad-specific extra is the CTA
 * cluster at the bottom, which makes the template *more* conservative there — the safe
 * failure direction. Organic previously fell back to a 5% SMPTE graphics-safe box, which
 * blessed content that Instagram's own UI then covered on real organic uploads (observed
 * 2026-09-19: 9:16 Reels losing top and right-side content after upload). Full-frame visual
 * review at the delivery gate remains required regardless of mode.
 */
export function safeAreaFor(
  target: DeliveryTarget,
  canvas: { width: number; height: number },
  mode: CaptionSafeAreaMode = "paid_ad",
): SafeArea {
  void mode; // See note above: retained for compatibility; both modes resolve identically.

  const base =
    target === "tiktok" ? SAFE_AREA_TIKTOK
    : target === "reels" ? SAFE_AREA_REELS
    : target === "shorts" ? SAFE_AREA_SHORTS
    : null;

  if (base) {
    const sx = canvas.width / base.reference.width;
    const sy = canvas.height / base.reference.height;
    return {
      ...base,
      reference: { ...canvas },
      top: Math.round(base.top * sy),
      bottom: Math.round(base.bottom * sy),
      left: Math.round(base.left * sx),
      right: Math.round(base.right * sx),
      rail: base.rail ? { ...base.rail, right: Math.round(base.rail.right * sx) } : null,
    };
  }

  // feed / web: SMPTE title-safe, 5% each edge.
  const inset = (1 - TITLE_SAFE_FRACTION) / 2;
  return {
    target,
    reference: { ...canvas },
    top: Math.round(canvas.height * inset),
    bottom: Math.round(canvas.height * inset),
    left: Math.round(canvas.width * inset),
    right: Math.round(canvas.width * inset),
    rail: null,
    source: "SMPTE ST 2046-1 title-safe 90% / EBU R 95 graphics safe area 5% (research part 04)",
  };
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export const CAPTION = {
  /**
   * Editorial review buffer inside the top safe-area boundary.
   *
   * This is deliberately an advisory comfort margin, not a platform safety claim:
   * a caption may technically clear platform chrome while still looking pinned to
   * the top edge. QC surfaces the proposed move for human approval and never applies it.
   */
  topSafeAreaComfortBufferFraction: 0.025,

  /**
   * Reading speed. Netflix: 20 CPS adult, 17 children. BBC: 160-180 WPM.
   * We gate on Netflix's adult CPS — the most directly checkable.
   */
  maxCharsPerSecond: 20,
  childMaxCharsPerSecond: 17,

  /** Netflix: minimum 20 frames on screen; maximum 7 seconds. */
  minDurationFrames: 20,
  maxDurationSeconds: 7,

  /** Netflix: max 42 characters per line, max 2 lines. */
  maxCharsPerLine: 42,
  maxLines: 2,

  /**
   * BBC line height as a fraction of FRAME HEIGHT.
   * 16:9 -> 7-8%; 9:16 -> 3.9-4.5%. On a 1080x1920 canvas that is 75-86px.
   * We gate on the LOWER bound as a hard legibility floor.
   */
  minHeightFractionVertical: 0.039,
  minHeightFractionLandscape: 0.07,

  /**
   * Netflix shot-change rule: a caption boundary may sit ON the cut, 2 frames BEFORE it,
   * or >= 12 frames away. The 1-11 frame neighbourhood is BANNED (it reads as a flicker).
   * Netflix specifies these in half-seconds; 12 frames is the 24fps figure, which is
   * 15 frames at 30fps.
   */
  cutProximityBannedMinFrames: 1,
  cutProximityBannedMaxFrames: 15,
  cutProximityLeadFramesAllowed: 2,

  /**
   * Gap between consecutive captions.
   *
   * Netflix, verbatim: "Subtitles must have a MINIMUM OF 2 FRAMES between them." And:
   * "any gaps between subtitles of 3-11 frames inclusive must be closed to 2 frames...
   * Gaps between subtitles should either be 2 frames or half a second or more."
   * Half a second at 30fps is 15 frames (Netflix states this scaling explicitly).
   *
   * So the ALLOWED set is: exactly 2 frames, or >= 15 frames. Everything else is banned —
   * INCLUDING 0 and 1, which are below Netflix's stated 2-frame minimum.
   *
   * BBC points at the same defect from the other end: a gap that is used at all should be
   * >= 1s (preferably 1.5s), because anything shorter "produces a very jerky effect".
   *
   * WHY THIS IS SPELLED OUT: the first cut of this file declared `minGapFrames: 2` and then
   * only ever checked a 3..15 banned BAND — so 0- and 1-frame gaps passed silently, and the
   * caption instrument (which butts each cue against the next) produced a 0-frame gap on
   * EVERY pair while the gate reported a clean pass. Encode the allowed SET, not a band.
   */
  minGapFrames: 2,
  /** Half a second at 30fps — the "or more" arm of Netflix's rule. */
  longGapMinFrames: 15,
  advisoryGapSeconds: 1,

  source:
    "Netflix Timed Text Style Guide; BBC Subtitle Guidelines; DCMP Captioning Key (research part 02)",
  topSafeAreaComfortSource:
    "DreamCut editorial review policy: flag near-edge titles and suggest the adjustment; never move them automatically.",
} as const;

/**
 * Netflix's gap rule as a predicate over the ALLOWED set: exactly 2 frames, or >= 15 (half a
 * second at 30fps). Anything else — 0, 1, or 3..14 — is a defect.
 *
 * Both the QC gate and the caption instrument MUST use this one function, so a caption the
 * instrument emits can never be a caption the gate would reject.
 */
export function isAllowedCaptionGapFrames(gapFrames: number): boolean {
  return gapFrames === CAPTION.minGapFrames || gapFrames >= CAPTION.longGapMinFrames;
}

// ---------------------------------------------------------------------------
// Cuts, pacing, safety
// ---------------------------------------------------------------------------

export const CUTS = {
  /**
   * ITU-R BT.1702-3 photosensitivity limit: more than 3 flashes per second over >25% of
   * screen area is a seizure risk, and FAST CUTTING IS EXPLICITLY COUNTED AS FLASHES.
   *
   * ffmpeg has no photosensitivity filter, so if we don't compute this, nobody does.
   * This is the one check in the file that is a SAFETY issue rather than a craft issue.
   */
  maxCutsPerSecond: 3,

  /**
   * Average shot length fell to under 4s in films post-2000 (Cutting, 160 films).
   * Advisory only — a short-form edit is legitimately faster than a feature.
   */
  advisoryAverageShotLengthSeconds: 4,

  /** The editor's own floor: 3 frames (0.1s). Shorter than this is not a shot. */
  minShotFrames: 3,

  source: "ITU-R BT.1702-3; Cutting et al. via Cinemetrics (research part 01)",
} as const;

/** EBU R37 A/V sync tolerance: audio may LEAD by 40ms, or LAG by 60ms. ~1-2 frames at 30fps. */
export const AV_SYNC = {
  maxAudioLeadMs: 40,
  maxAudioLagMs: 60,
  source: "EBU R37 (research part 01)",
} as const;

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export const AUDIO = {
  /**
   * Speech intelligibility. WHO Guidelines for Community Noise: the signal-to-noise ratio
   * "should be 15-18 dBA" for complete sentence intelligibility.
   *
   * It is a BAND, not a point, and WHO credits Lazarus (1990) — NOT ANSI. The common
   * "+15 dB per ANSI" attribution does not hold (ANSI S12.60 puts SNR out of scope).
   *
   * We can't measure true dBA SNR from the timeline alone, but we CAN check the ratio of
   * VO gain to music gain where they overlap, which catches the gross failure: music at or
   * above narration.
   */
  speechSnrDbaBand: [15, 18] as const,

  /**
   * A linear gain ratio corresponding to roughly -15 dB of music under speech.
   * 10^(-15/20) ~= 0.178. If music gain / VO gain exceeds this where they overlap, the
   * narration is at risk of being buried.
   */
  maxMusicToVoiceGainRatio: 0.18,

  /** Minimum fade to avoid a click/pop at a hard audio edit. */
  minEdgeFadeSeconds: 0.01,

  source: "WHO Guidelines for Community Noise (Lazarus 1990); EBU R128 (research part 03)",
} as const;

// ---------------------------------------------------------------------------
// Per-role loudness references (the "0 dB" the volume fader is measured against)
// ---------------------------------------------------------------------------

/**
 * The integrated-loudness a clip is defaulted to when it is placed, chosen by its
 * lane role. This is what makes the volume fader meaningful: "0 dB" on the fader
 * means the clip sits at its role reference, regardless of how hot or quiet the
 * source file happens to be. Trim ± from there.
 *
 * These are anchored to the delivery mix, not invented:
 *   - `narrator` sits just under the social integrated target (LOUDNESS_TARGETS.youtube
 *     = -14 LUFS) so the voice lands near where the platform normalizes to.
 *   - `music` sits a comfortable bed below the voice — 12 LU under, safely inside the
 *     AUDIO.maxMusicToVoiceGainRatio (0.18 ≈ -15 dB) ceiling so the voice never buries.
 *   - `sfx` sits between: present, but under the voice.
 * Roles a lane doesn't map to (e.g. captions) have no reference and use unity.
 */
export const ROLE_LOUDNESS_TARGETS = {
  narrator: -16,
  music: -28,
  sfx: -18,
} as const satisfies Record<string, number>;

export type LoudnessRole = keyof typeof ROLE_LOUDNESS_TARGETS;

// ---------------------------------------------------------------------------
// Prominent text inside authored containers
// ---------------------------------------------------------------------------

/**
 * Prominent labels in cards, pills, and infographic regions must use the space
 * deliberately. An overflow-only check can "repair" a label by shrinking it until
 * it technically fits while leaving it unreadably timid. These bounds therefore gate
 * both overfill and underfill from measured rendered-ink geometry.
 *
 * This is a DreamCut craft standard rather than a platform specification.
 * It was promoted after the 2026-07-19 conversion-card review; keep the numbers here so
 * generators and QC share one authority instead of copying thresholds into scripts.
 */
export const PROMINENT_TEXT_CONTAINER_FIT = {
  minWidthOccupancy: 0.72,
  maxWidthOccupancy: 0.92,
  minHeightOccupancy: 0.28,
  maxHeightOccupancy: 0.72,
  minPaddingPx: 12,
  centerTolerancePx: 4,
  source: "DreamCut prominent-container typography standard",
} as const;

/**
 * Integrated loudness targets, in LUFS, by destination. Platforms normalize TO these; a mix
 * far off target gets turned up or down, changing the balance the editor chose.
 *
 * Only numbers we could find on an official page are here. Where a platform does not publish
 * one, it is `null` — we do NOT repeat the widely-circulated unsourced figures.
 */
export const LOUDNESS_TARGETS: Record<string, { lufs: number | null; truePeakDb: number; source: string }> = {
  ebuR128: { lufs: -23, truePeakDb: -1, source: "EBU R 128" },
  atscA85: { lufs: -24, truePeakDb: -2, source: "ATSC A/85" },
  youtube: { lufs: -14, truePeakDb: -1, source: "YouTube published normalization target" },
  spotify: { lufs: -14, truePeakDb: -1, source: "Spotify published normalization target" },
};

/**
 * Coverage contract for exported standards. `timeline` means checkTimeline enforces it;
 * `post-render` means it requires measured media and is enforced by the verification pass;
 * `informational` means no deterministic failure is justified from timeline data alone.
 * Keep this explicit: an unclassified constant must fail the standards coverage test.
 */
export const STANDARD_ENFORCEMENT = {
  FPS: "timeline",
  FRAME_SECONDS: "informational",
  DELIVERY_TARGETS: "timeline",
  CAPTION_SAFE_AREA_MODES: "timeline",
  SAFE_AREA_REELS: "timeline",
  SAFE_AREA_TIKTOK: "timeline",
  SAFE_AREA_SHORTS: "timeline",
  TITLE_SAFE_FRACTION: "timeline",
  CAPTION: "timeline",
  CUTS: "timeline",
  AV_SYNC: "timeline",
  AUDIO: "timeline",
  ROLE_LOUDNESS_TARGETS: "informational",
  PROMINENT_TEXT_CONTAINER_FIT: "timeline",
  LOUDNESS_TARGETS: "post-render",
} as const satisfies Record<string, "timeline" | "post-render" | "informational">;
