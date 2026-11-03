import { applyLaneVisibility } from "@/lib/render/composition-adapters";
/**
 * check-timeline — the deterministic QC gate.
 *
 * Measures a timeline against the sourced standards in `./standards.ts` and returns
 * STRUCTURED FINDINGS. No model, no render, no network. Runs in milliseconds.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A VLM CALL
 * ---------------------------------------------
 * The research (docs/research/2026-07-12-video-editing-failure-modes/) established that a
 * vision model cannot do this job:
 *   - GPT-4o scores 0.8% on ScreenSpot-Pro (locating a target on a >1080p screen).
 *   - GPT-4V produces a correct bounding box 0.12% of the time at IoU 0.9.
 *   - On spatial consistency (COMFORT) GPT-4o scores BELOW a random baseline.
 *   - Anthropic's own docs call coordinate outputs "approximate".
 *   - And self-correction LOWERS accuracy (GPT-4 GSM8K 95.5 -> 91.5 -> 89.0), so an agent
 *     re-reading its own render is not a check.
 *
 * Every question in this file is answerable EXACTLY from the timeline JSON. So we answer it
 * exactly, for free, and spend the model's eyes only on what cannot be computed (is the
 * subject cropped, is this frame ugly, is the text illegible against a busy background).
 *
 * This mirrors `check_layout` in the app (src/lib/design-canvases/) and obeys
 * docs/standards/spek-agent-design-standards.md §14.3 (never make the agent count) and
 * §14.4 (never make the agent compute a position — hand it measured coordinates).
 */

import {
  AUDIO,
  AV_SYNC,
  CAPTION,
  CUTS,
  FPS,
  isAllowedCaptionGapFrames,
  msToFrames,
  safeAreaFor,
  type CaptionSafeAreaMode,
  type DeliveryTarget,
  type SafeArea,
} from "./standards";
import type { CaptionMeasurements, MeasuredCaption } from "./measure-captions";
import { captionTimingFindings } from "@/lib/timeline/caption-timing-validation";
import { isCaptionsLane } from "@/lib/timeline/lanes";
import { checkInternalBoundaryContracts } from "./internal-boundaries";
import { checkSemanticSequenceContracts } from "./semantic-sequence";
import { checkTextContainerFitContracts } from "./text-container-fit";
import { checkPresenterContinuityContracts } from "./presenter-continuity";

// ---------------------------------------------------------------------------
// Input shapes — a structural subset of the timeline row, so this is unit-testable
// without a project on disk.
// ---------------------------------------------------------------------------

export type QcElement = {
  id: string;
  type: string;
  lane_key: string;
  timeline_start: number;
  duration: number;
  volume: number;
  fade_in: number;
  fade_out: number;
  props: Record<string, unknown> | null;
  removed_at?: string | null;
  /** Where the media came from. Catalog audio serves from /api/music-catalog/media/<status>/<file>. */
  source_url?: string | null;
};

export type QcInput = {
  elements: QcElement[];
  canvas: { width: number; height: number };
  target: DeliveryTarget;
  captionSafeAreaMode?: CaptionSafeAreaMode;
  /**
   * Font-accurate caption sizes from `measure-captions.ts`, keyed by element id.
   *
   * When supplied, caption geometry findings are FACTS and BLOCK. When absent, they are
   * suspicions from a conservative estimate and only WARN. There is no third state: the gate
   * either measured, or it says out loud that it did not.
   */
  measured?: CaptionMeasurements;
  /**
   * Lanes muted in the editor. The renderer silences their sound (`applyLaneVisibility` in
   * render/composition-adapters.ts), so their audio elements never reach the export — and the gate
   * must judge what will actually ship, not what is merely on the timeline. Without this, an
   * audition stack (several candidate tracks, all but one muted) trips every music check on takes
   * that were never going to render.
   */
  mutedLaneKeys?: string[];
  /** Lanes hidden in the editor: their stills and text never reach the export. */
  hiddenLaneKeys?: string[];
};

export type Severity = "blocker" | "warning" | "advisory";

export type Finding = {
  code: string;
  severity: Severity;
  /** The element this is about, when it is about one. */
  elementId?: string;
  /** Where on the timeline, in seconds, when the finding is time-located. */
  atSeconds?: number;
  /** Plain-language statement of what is wrong. */
  message: string;
  /** What we measured, and what the standard allows — so the agent never re-derives either. */
  measured: string;
  limit: string;
  /** The primary source behind the limit. */
  source: string;
  /** The concrete remedy, in the editor's own units. The agent applies this; it does not invent one. */
  remedy: string;
};

export type QcReport = {
  ok: boolean;
  /** True when caption geometry was measured with the real loaded font, not estimated. */
  captionGeometryMeasured: boolean;
  target: DeliveryTarget;
  canvas: { width: number; height: number };
  counts: Record<Severity, number>;
  findings: Finding[];
  /** Pre-computed facts the agent would otherwise have to COUNT (spek §14.3). */
  summary: {
    durationSeconds: number;
    visualCutFrames: number[];
    shotCount: number;
    captionCount: number;
    averageShotLengthSeconds: number | null;
  };
};

// ---------------------------------------------------------------------------
// Geometry — we compute caption boxes the SAME WAY TimelineComposition renders them.
// If these two drift, the check is lying. They are kept adjacent deliberately.
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

export type CaptionBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  fontSizePx: number;
  lines: number;
  text: string;
  /** True when this box came from a real font measurement rather than an estimate. */
  measured: boolean;
};

/**
 * Caption bounding box in canvas pixels.
 *
 * TWO MODES, and the difference decides whether a finding can BLOCK:
 *
 * - **Measured** (`measured` supplied): the real wrapped size of the real loaded face, from
 *   `measure-captions.ts`. This is truth. A violation here is a fact, so it blocks.
 * - **Estimated** (no `measured`): average glyph width, no DOM. Deliberately CONSERVATIVE —
 *   it over-estimates height so it errs toward flagging. A violation here is a suspicion, so
 *   it warns and tells you to measure.
 *
 * Do NOT add per-font glyph-width guesses to the estimate. A prior Teko guess let a real
 * four-line caption pass as two lines — which is precisely the "gate launders the defect"
 * failure this whole file exists to prevent. If you need the truth, measure it.
 */
export function captionBox(
  el: QcElement,
  canvas: { width: number; height: number },
  measured?: MeasuredCaption,
): CaptionBox {
  const p = el.props ?? {};
  const text = str(p.text, "");
  const fontSizePx = num(p.fontSizePx, 42);
  const maxWidth = num(p.maxWidth, 0.78);
  const positionPreset = str(p.positionPreset, "bottom_center");
  const absX = typeof p.absX === "number" ? p.absX : null;
  const absY = typeof p.absY === "number" ? p.absY : null;
  const offsetX = num(p.offsetX, 0);
  const offsetY = num(p.offsetY, 0);

  const boxWidth = maxWidth * canvas.width;

  let lines: number;
  let boxHeight: number;
  if (measured) {
    lines = measured.lines;
    boxHeight = measured.height;
  } else {
    const glyphWidthEm = 0.5;
    const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSizePx * glyphWidthEm)));
    lines = text
      .split("\n")
      .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    boxHeight = lines * fontSizePx * 1.2; // 1.2 line-height, conservative
  }

  // Horizontal — mirrors TimelineComposition CaptionSequence.
  let left: number;
  if (absX != null) {
    left = absX * canvas.width;
  } else if (positionPreset.endsWith("left")) {
    left = 0;
  } else if (positionPreset.endsWith("right")) {
    left = canvas.width - boxWidth;
  } else {
    left = (canvas.width - boxWidth) / 2;
  }
  left += offsetX * canvas.width;

  // Vertical — TimelineComposition anchors top at 11%, center at 50% (mid), bottom at 82% (baseline).
  let top: number;
  if (absY != null) {
    top = absY * canvas.height;
  } else if (positionPreset.startsWith("top")) {
    top = 0.11 * canvas.height;
  } else if (positionPreset.startsWith("bottom")) {
    top = 0.82 * canvas.height - boxHeight; // bottom edge sits at 82%
  } else {
    top = 0.5 * canvas.height - boxHeight / 2;
  }
  top += offsetY * canvas.height;

  // The right edge is the INK edge when measured (the text's real width), and the container
  // edge when estimated (we don't know where the ink stops, so we assume the worst).
  const rightEdge = measured ? left + measured.width : left + boxWidth;

  return {
    left: Math.round(left),
    top: Math.round(top),
    right: Math.round(rightEdge),
    bottom: Math.round(top + boxHeight),
    fontSizePx,
    lines,
    text,
    measured: measured != null,
  };
}

/** Does a box violate the safe area? Returns the violated edges, honoring TikTok's L-shape rail. */
function safeAreaViolations(box: CaptionBox, safe: SafeArea, canvas: { width: number; height: number }) {
  const violated: string[] = [];
  if (box.top < safe.top) violated.push(`top (${box.top}px < ${safe.top}px)`);
  if (box.bottom > canvas.height - safe.bottom) {
    violated.push(`bottom (${box.bottom}px > ${canvas.height - safe.bottom}px)`);
  }
  if (box.left < safe.left) violated.push(`left (${box.left}px < ${safe.left}px)`);

  // The right edge is the L: below `rail.belowFraction` of frame height the margin widens.
  const railTop = safe.rail ? safe.rail.belowFraction * canvas.height : Infinity;
  const boxEntersRail = safe.rail != null && box.bottom > railTop;
  const rightMargin = boxEntersRail && safe.rail ? safe.rail.right : safe.right;
  if (box.right > canvas.width - rightMargin) {
    violated.push(
      `right (${box.right}px > ${canvas.width - rightMargin}px${boxEntersRail ? " — inside the action rail" : ""})`,
    );
  }
  return violated;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const isActive = (el: QcElement) => !el.removed_at && el.props?.disabled !== true;
const isVisual = (el: QcElement) => el.lane_key.startsWith("visual_");
const isCaption = (el: QcElement) => el.type === "caption_text";
const isVoice = (el: QcElement) => (
  el.type === "vo_segment"
  || el.type === "vo_full"
  || (el.type === "video_clip" && el.lane_key.startsWith("visual_presenter"))
);
const isMusic = (el: QcElement) => el.type === "music";

const toFrame = (sec: number) => Math.round(sec * FPS);
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function checkTimeline(input: QcInput): QcReport {
  const { canvas, target } = input;
  const safe = safeAreaFor(target, canvas, input.captionSafeAreaMode ?? "paid_ad");
  const muted = new Set(input.mutedLaneKeys ?? []);
  const hidden = new Set(input.hiddenLaneKeys ?? []);
  const elements = input.elements.filter((el) => isActive(el)
    && applyLaneVisibility({ ...el, volume: el.volume ?? 1 }, muted, hidden) !== null);
  const findings: Finding[] = [];

  findings.push(...checkInternalBoundaryContracts(elements));
  findings.push(...checkSemanticSequenceContracts(elements));
  findings.push(...checkTextContainerFitContracts(elements));
  findings.push(...checkPresenterContinuityContracts(elements));

  for (const element of elements) {
    const contract = element.props?.saved_mark_contract;
    if (contract == null || typeof contract !== "object" || Array.isArray(contract)) continue;
    const record = contract as Record<string, unknown>;
    const expectedFrame = typeof record.frame_number === "number" && Number.isInteger(record.frame_number)
      ? record.frame_number
      : null;
    const expectation = str(record.expectation, "");
    const stateIdsPresent = ["spatial_motion_id", "entry_state_id", "landing_state_id"]
      .every((key) => str(record[key], "").length > 0);
    if (
      expectedFrame == null
      || expectation !== "motion_onset"
      || element.type !== "video_clip"
      || toFrame(element.timeline_start) !== expectedFrame
      || !stateIdsPresent
    ) {
      findings.push({
        code: "saved_mark_motion_contract_failed",
        severity: "blocker",
        elementId: element.id,
        atSeconds: element.timeline_start,
        message: "A saved review mark no longer begins its named source motion on the approved output frame.",
        measured: `timeline frame ${toFrame(element.timeline_start)}; contract frame ${expectedFrame ?? "missing"}; type ${element.type}`,
        limit: "motion_onset contracts require a video clip beginning on the exact saved frame with named entry, motion, and landing spatial states.",
        source: "Product walkthrough saved-mark and spatial-state contract",
        remedy: "Restore the real motion clip to the saved frame and keep its spatial-state IDs bound before rebuilding the timeline.",
      });
    }
  }

  for (const element of input.elements.filter(isActive)) {
    if (element.type === "caption_text" && !isCaptionsLane(element.lane_key)) {
      findings.push({
        code: "caption_not_on_editable_lane",
        severity: "blocker",
        elementId: element.id,
        atSeconds: element.timeline_start,
        message: "Caption renders but is not on an editor-recognized caption lane.",
        measured: `lane_key: ${element.lane_key}`,
        limit: "caption_text elements must use a numeric captions_<index> lane key.",
        source: "Timeline editor caption-lane contract",
        remedy: "Move the element to captions_0 or another numeric captions_<index> lane so it appears in the editable caption UI.",
      });
    }
  }

  const visuals = elements.filter(isVisual).sort((a, b) => a.timeline_start - b.timeline_start);
  const captions = elements.filter(isCaption).sort((a, b) => a.timeline_start - b.timeline_start);

  // Cut frames = boundaries for scene-defining visuals. Small overlays do not
  // cover the >25% picture area required by the photosensitivity standard and
  // must not turn a staggered card/grid entrance into a false flash-rate block.
  // `media_scale` is expressed against the composition; scale² is therefore a
  // conservative occupied-area estimate for contained overlays.
  const sceneDefiningVisuals = visuals.filter((visual) => {
    if (visual.props?.scene_defining_visual === false) return false;
    const scale = typeof visual.props?.media_scale === "number" ? visual.props.media_scale : 1;
    return scale * scale >= 0.25;
  });
  const cutFrames = Array.from(
    new Set(
      sceneDefiningVisuals.flatMap((v) => [toFrame(v.timeline_start), toFrame(v.timeline_start + v.duration)]),
    ),
  ).sort((a, b) => a - b);

  const durationSeconds = elements.reduce(
    (max, el) => Math.max(max, el.timeline_start + el.duration),
    0,
  );

  // --- 1. Captions -----------------------------------------------------------
  for (const cap of captions) {
    const box = captionBox(cap, canvas, input.measured?.[cap.id]);
    const text = box.text.trim();
    // A geometry violation is a BLOCKER when it was measured with the real font, and a
    // WARNING when it was merely estimated. The gate never asserts more than it knows.
    const geometrySeverity: Severity = box.measured ? "blocker" : "warning";

    if (
      (cap.props?.caption_single_line_contract === true || cap.props?.caption_follow_audio === true)
      && box.lines !== 1
    ) {
      findings.push({
        code: "caption_single_line_contract_failed",
        severity: geometrySeverity,
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "A caption designated as single-line wraps onto multiple lines.",
        measured: `${box.lines} rendered lines`,
        limit: "exactly 1 rendered line",
        source: "Founder-approved single-line walkthrough caption contract (2026-08-15)",
        remedy: "Reduce the font size, shorten the phrase grouping, or widen the caption container until measured rendering is one line.",
      });
    }

    const railContract = cap.props?.caption_fixed_rail_contract;
    if (railContract != null && typeof railContract === "object" && !Array.isArray(railContract)) {
      const rail = railContract as Record<string, unknown>;
      const expectedAbsY = typeof rail.abs_y === "number" ? rail.abs_y : null;
      const expectedWidth = typeof rail.source_width === "number" ? rail.source_width : null;
      const expectedHeight = typeof rail.source_height === "number" ? rail.source_height : null;
      if (
        expectedAbsY == null
        || Math.abs(num(cap.props?.absY, Number.NaN) - expectedAbsY) > 0.0001
        || num(cap.props?.source_width, Number.NaN) !== expectedWidth
        || num(cap.props?.source_height, Number.NaN) !== expectedHeight
      ) {
        findings.push({
          code: "caption_fixed_rail_contract_failed",
          severity: "blocker",
          elementId: cap.id,
          atSeconds: cap.timeline_start,
          message: "A caption drifted away from its founder-marked composition-space rail.",
          measured: `absY ${String(cap.props?.absY)}; source ${String(cap.props?.source_width)}x${String(cap.props?.source_height)}`,
          limit: `absY ${String(expectedAbsY)} in ${String(expectedWidth)}x${String(expectedHeight)} caption space`,
          source: "Founder-marked walkthrough caption rail contract",
          remedy: "Restore the caption's fixed rail coordinates and authored composition geometry before review.",
        });
      }
    }

    for (const timingFinding of captionTimingFindings(cap)) {
      findings.push({
        code: timingFinding.code,
        severity: "blocker",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: timingFinding.message,
        measured: timingFinding.index == null ? "caption timing contract" : `word ${timingFinding.index + 1}`,
        limit: "Active-word captions require ordered, transcript-matching, frame-renderable timings inside the caption duration.",
        source: "Active-word caption timing contract",
        remedy: "Regenerate captions from forced alignment or switch this caption to Phrase timing.",
      });
    }

    // Condensed burned-in captions are allowed when verbatim speech cannot fit all hard
    // delivery constraints, but the editorial change must never be invisible.
    if (cap.props?.caption_condensed === true) {
      const sourceText = str(cap.props.caption_source_text, "").trim();
      findings.push({
        code: sourceText ? "caption_condensed" : "caption_condensed_missing_source",
        severity: sourceText ? "advisory" : "warning",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: sourceText
          ? "On-screen wording was condensed from the aligned speech."
          : "Caption is marked condensed but does not preserve its verbatim source text.",
        measured: sourceText ? `source: “${sourceText}” → caption: “${text}”` : `caption: “${text}”`,
        limit: "Every condensed cue must retain props.caption_source_text with the exact aligned words.",
        source: "DreamCut editor-agent condensation policy",
        remedy: sourceText
          ? "Review the before→after wording for names, numbers, claims, negation, and CTA intent."
          : "Set props.caption_source_text to the exact aligned words before rendering.",
      });
    }

    // 1a. Safe area.
    const violated = safeAreaViolations(box, safe, canvas);
    const isContinuousTickerCrawl = cap.props?.ticker_motion === "crawl_left";
    if (violated.length > 0) {
      const edges = `the ${violated.map((v) => v.split(" ")[0]).join(", ")} edge${violated.length > 1 ? "s" : ""}`;
      findings.push({
        code: isContinuousTickerCrawl ? "caption_safe_area_motion_exception" : "caption_outside_safe_area",
        severity: isContinuousTickerCrawl ? "advisory" : geometrySeverity,
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: isContinuousTickerCrawl
          ? `Continuous ticker intentionally traverses ${edges} while entering and exiting the frame.`
          : box.measured
          ? `Caption sits under ${target} UI chrome on ${edges}.`
          : `Estimated caption box may sit under ${target} UI chrome on ${edges} — run with font measurement to decide.`,
        measured: `${box.measured ? "measured" : "ESTIMATED"} box ${box.left},${box.top} -> ${box.right},${box.bottom} on ${canvas.width}x${canvas.height}; violated: ${violated.join("; ")}`,
        limit: `${target} safe area: top ${safe.top}, bottom ${safe.bottom}, left ${safe.left}, right ${safe.right}${safe.rail ? ` (right widens to ${safe.rail.right} below ${Math.round(safe.rail.belowFraction * 100)}% height)` : ""}`,
        source: isContinuousTickerCrawl ? "Continuous ticker motion contract" : safe.source,
        remedy: isContinuousTickerCrawl
          ? "Confirm the text is fully readable near the midpoint and completely offscreen at both motion endpoints."
          : box.measured
          ? `Move the caption inside the safe area — adjust props.absX / props.absY / props.maxWidth.`
          : `Re-run qc with font measurement (it is on by default) to confirm.`,
      });
    }

    // Technical safety is not the same as comfortable composition. Surface titles
    // that only barely clear the top boundary so the editor can approve a proposed
    // move; this finding never authorizes an automatic layout change.
    const topComfortBuffer = Math.round(canvas.height * CAPTION.topSafeAreaComfortBufferFraction);
    const topClearance = box.top - safe.top;
    if (
      violated.length === 0
      && topClearance >= 0
      && topClearance < topComfortBuffer
    ) {
      const suggestedMove = topComfortBuffer - topClearance;
      findings.push({
        code: "caption_near_top_safe_edge",
        severity: "advisory",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "Caption technically clears the top safe zone but sits too close to the boundary for comfortable composition.",
        measured: `${box.measured ? "measured" : "ESTIMATED"} top ${box.top}px; safe boundary ${safe.top}px; clearance ${topClearance}px`,
        limit: `Review comfort buffer: at least ${topComfortBuffer}px inside the top safe boundary`,
        source: CAPTION.topSafeAreaComfortSource,
        remedy: `Suggest moving the caption down ${suggestedMove}px for human approval. Do not apply the adjustment automatically.`,
      });
    }

    // 1b. Legibility floor — BBC line height as a fraction of frame height.
    const isVertical = canvas.height > canvas.width;
    const minFraction = isVertical
      ? CAPTION.minHeightFractionVertical
      : CAPTION.minHeightFractionLandscape;
    const minPx = Math.round(minFraction * canvas.height);
    if (box.fontSizePx < minPx) {
      findings.push({
        code: "caption_below_legibility_floor",
        severity: "warning",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "Caption is below the BBC legibility floor for this frame size.",
        measured: `${box.fontSizePx}px = ${((box.fontSizePx / canvas.height) * 100).toFixed(1)}% of frame height`,
        limit: `>= ${minPx}px (${(minFraction * 100).toFixed(1)}% of frame height)`,
        source: CAPTION.source,
        remedy: `Raise props.fontSizePx to at least ${minPx}.`,
      });
    }

    // Contrast cannot be inferred from text color alone because the video background changes.
    // Require a background-independent separation treatment, then keep the sampled-frame taste
    // question as the final check against real pixels.
    const styleVariant = str(cap.props?.styleVariant, "cinematic");
    if (
      styleVariant !== "bold_outline"
      && styleVariant !== "boxed"
      && styleVariant !== "yellow_banner"
      && styleVariant !== "black_card"
      && styleVariant !== "benchmark_card"
    ) {
      findings.push({
        code: "caption_contrast_unprotected",
        severity: "warning",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "Caption contrast depends on the underlying video frame.",
        measured: `styleVariant: ${styleVariant}`,
        limit: "Use a background-independent contrast treatment and confirm it on sampled rendered frames.",
        source: "DreamCut editor-agent contrast policy",
        remedy: "Use bold_outline, boxed, yellow_banner, or black_card, then inspect rendered caption frames.",
      });
    }

    // 1c. Reading speed.
    if (text.length > 0 && cap.duration > 0 && cap.props?.caption_word_by_word !== true) {
      const cps = text.length / cap.duration;
      const maxCps = cap.props?.child_audience === true
        ? CAPTION.childMaxCharsPerSecond
        : CAPTION.maxCharsPerSecond;
      if (cps > maxCps) {
        const needed = (text.length / maxCps).toFixed(2);
        // A cue explicitly accepted as fast verbatim is still REPORTED — the relaxation is
        // never allowed to become invisible — but it is named for what it is rather than
        // presented as an unnoticed defect.
        const acceptedFast = cap.props?.caption_fast_verbatim === true;
        findings.push({
          code: acceptedFast ? "caption_fast_verbatim" : "caption_too_fast",
          severity: "warning",
          elementId: cap.id,
          atSeconds: cap.timeline_start,
          message: acceptedFast
            ? "Caption exceeds the subtitle reading-speed limit — accepted as fast verbatim (the speaker talks faster than the limit and the words are unaltered)."
            : "Caption is on screen too briefly to be read.",
          measured: `${cps.toFixed(1)} chars/sec (${text.length} chars in ${cap.duration.toFixed(2)}s)`,
          limit: `<= ${maxCps} chars/sec${cap.props?.child_audience === true ? " (child audience)" : ""}`,
          source: acceptedFast
            ? `${CAPTION.source} — NOTE: the limit governs SUBTITLES (text substituting for audio). Its applicability to burned-in captions that merely reinforce audible speech is UNSOURCED; --allow-fast-verbatim is an explicit product choice, not a sourced standard.`
            : CAPTION.source,
          remedy: acceptedFast
            ? `Accepted. To conform instead, condense the wording via --condensation (the verbatim source is preserved on the row).`
            : `Extend duration to >= ${needed}s, or cut the text to <= ${Math.floor(maxCps * cap.duration)} chars.`,
        });
      }
    }

    // 1d. Duration bounds.
    const durFrames = toFrame(cap.duration);
    if (durFrames < CAPTION.minDurationFrames && cap.props?.caption_word_by_word !== true) {
      const acceptedRapidFragment = cap.props?.caption_rapid_fragment === true;
      findings.push({
        code: acceptedRapidFragment ? "caption_rapid_fragment" : "caption_too_short",
        severity: acceptedRapidFragment ? "advisory" : "warning",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: acceptedRapidFragment
          ? "Caption uses the explicit rapid social-fragment rhythm and is shorter than subtitle timing guidance."
          : "Caption flashes — below the minimum time on screen.",
        measured: `${durFrames} frames`,
        limit: `>= ${CAPTION.minDurationFrames} frames`,
        source: acceptedRapidFragment
          ? `Founder-directed rapid social-caption grammar (2026-07-28); compared against ${CAPTION.source}`
          : CAPTION.source,
        remedy: acceptedRapidFragment
          ? "Accepted for redundant burned-in social captions. Use subtitle timing mode when captions must replace the audio."
          : `Extend duration to >= ${(CAPTION.minDurationFrames / FPS).toFixed(3)}s.`,
      });
    }
    if (cap.duration > CAPTION.maxDurationSeconds) {
      findings.push({
        code: "caption_too_long",
        severity: "advisory",
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "Caption lingers past the maximum recommended time on screen.",
        measured: `${cap.duration.toFixed(2)}s`,
        limit: `<= ${CAPTION.maxDurationSeconds}s`,
        source: CAPTION.source,
        remedy: "Split the caption or shorten its duration.",
      });
    }

    const declaredWordLimit = cap.props?.caption_word_limit;
    if (typeof declaredWordLimit === "number" && Number.isInteger(declaredWordLimit) && declaredWordLimit > 0) {
      const displayedWordCount = text.match(/\S+/g)?.length ?? 0;
      if (displayedWordCount > declaredWordLimit) {
        findings.push({
          code: "caption_word_limit_exceeded",
          severity: "blocker",
          elementId: cap.id,
          atSeconds: cap.timeline_start,
          message: "Caption exceeds its declared on-screen word ceiling.",
          measured: `${displayedWordCount} words`,
          limit: `<= ${declaredWordLimit} words`,
          source: "Caption row grouping contract",
          remedy: "Regenerate from alignment with the declared word limit or remove the stale limit declaration.",
        });
      }
    }

    // 1e. Line discipline.
    if (box.lines > CAPTION.maxLines) {
      findings.push({
        code: "caption_too_many_lines",
        severity: geometrySeverity,
        elementId: cap.id,
        atSeconds: cap.timeline_start,
        message: "Caption wraps to more lines than the standard allows.",
        measured: box.measured ? `${box.lines} lines (measured, ${input.measured?.[cap.id]?.loadedFamily ?? "?"})` : `~${box.lines} lines (ESTIMATED)`,
        limit: `<= ${CAPTION.maxLines} lines`,
        source: CAPTION.source,
        remedy: "Shorten the text, raise props.maxWidth, or split into two captions.",
      });
    }

    // 1f. Shot-change proximity — Netflix bans the 1..15-frame neighbourhood (at 30fps).
    const capStart = toFrame(cap.timeline_start);
    const capEnd = toFrame(cap.timeline_start + cap.duration);
    for (const edge of cap.props?.caption_word_by_word === true ? [] : [capStart, capEnd]) {
      for (const cut of cutFrames) {
        const delta = edge - cut;
        const dist = Math.abs(delta);
        const isAllowedLead = delta === -CAPTION.cutProximityLeadFramesAllowed;
        if (
          dist >= CAPTION.cutProximityBannedMinFrames
          && dist <= CAPTION.cutProximityBannedMaxFrames
          && !isAllowedLead
        ) {
          findings.push({
            code: "caption_near_cut",
            severity: "warning",
            elementId: cap.id,
            atSeconds: edge / FPS,
            message: "Caption boundary lands just beside a cut — reads as a flicker.",
            measured: `${dist} frame${dist === 1 ? "" : "s"} from the cut at ${(cut / FPS).toFixed(3)}s`,
            limit: `on the cut, exactly ${CAPTION.cutProximityLeadFramesAllowed} frames before it, or >= ${CAPTION.cutProximityBannedMaxFrames + 1} frames away`,
            source: CAPTION.source,
            remedy: `Snap the boundary to the cut (${(cut / FPS).toFixed(3)}s) or move it >= ${((CAPTION.cutProximityBannedMaxFrames + 1) / FPS).toFixed(3)}s away.`,
          });
          break;
        }
      }
    }
  }

  const wordByWordCount = captions.filter((caption) => caption.props?.caption_word_by_word === true).length;
  if (wordByWordCount > 0) {
    findings.push({
      code: "caption_word_by_word_sequence",
      severity: "advisory",
      atSeconds: captions.find((caption) => caption.props?.caption_word_by_word === true)?.timeline_start ?? 0,
      message: "Word-by-word caption timing is enabled for part of the timeline.",
      measured: `${wordByWordCount} word cue${wordByWordCount === 1 ? "" : "s"}`,
      limit: "Every word cue must be explicitly marked and handed continuously to the next word cue.",
      source: "DreamCut editor-agent word-by-word caption policy",
      remedy: "Inspect the opening at full speed for missing words or unreadable flashes.",
    });
  }

  // 1g. Gaps between consecutive captions.
  for (let i = 0; i < captions.length - 1; i++) {
    const a = captions[i]!;
    const b = captions[i + 1]!;
    const gap = toFrame(b.timeline_start) - toFrame(a.timeline_start + a.duration);
    const continuousWordHandoff = a.props?.caption_word_by_word === true && gap === 0;
    if (!continuousWordHandoff && !isAllowedCaptionGapFrames(gap)) {
      const belowMinimum = gap < CAPTION.minGapFrames;
      findings.push({
        code: "caption_gap_jitter",
        severity: "warning",
        elementId: b.id,
        atSeconds: b.timeline_start,
        message: belowMinimum
          ? "Captions are butted together with no gap — below the minimum separation."
          : "Gap between captions is in the banned range — produces a jerky flicker.",
        measured: `${gap} frame${gap === 1 ? "" : "s"}`,
        limit: `exactly ${CAPTION.minGapFrames} frames, or >= ${CAPTION.longGapMinFrames} frames`,
        source: CAPTION.source,
        remedy: `Set the gap to exactly ${CAPTION.minGapFrames} frames (pull this caption's start back, or the previous caption's end in), or open it to >= ${CAPTION.longGapMinFrames} frames.`,
      });
    }
  }

  // 1h. Concurrent captions must not collide on screen. Accumulating stacks (several
  // cards visible at once) put multiple caption boxes on screen simultaneously — the
  // per-caption checks above are blind to their spatial relationship.
  const stackMinGapPx = Math.round(canvas.height * 0.0125); // ~24px at 1920
  for (let i = 0; i < captions.length; i++) {
    for (let j = i + 1; j < captions.length; j++) {
      const a = captions[i]!;
      const b = captions[j]!;
      if (!overlaps(a.timeline_start, a.timeline_start + a.duration, b.timeline_start, b.timeline_start + b.duration)) continue;
      const boxA = captionBox(a, canvas, input.measured?.[a.id]);
      const boxB = captionBox(b, canvas, input.measured?.[b.id]);
      const horizontallyAligned = boxA.left < boxB.right && boxB.left < boxA.right;
      if (!horizontallyAligned) continue;
      const verticalGap = Math.max(boxA.top, boxB.top) - Math.min(boxA.bottom, boxB.bottom);
      const measuredPair = boxA.measured && boxB.measured;
      if (verticalGap < 0) {
        findings.push({
          code: "caption_boxes_overlap",
          severity: measuredPair ? "blocker" : "warning",
          elementId: b.id,
          atSeconds: Math.max(a.timeline_start, b.timeline_start),
          message: measuredPair
            ? "Two captions are on screen at the same time and their boxes overlap."
            : "Two concurrent captions may overlap (estimated boxes) — run with font measurement to decide.",
          measured: `${measuredPair ? "measured" : "ESTIMATED"} boxes y ${boxA.top}-${boxA.bottom} and y ${boxB.top}-${boxB.bottom} overlap by ${-verticalGap}px during ${Math.max(a.timeline_start, b.timeline_start).toFixed(2)}s-${Math.min(a.timeline_start + a.duration, b.timeline_start + b.duration).toFixed(2)}s`,
          limit: `concurrent caption boxes must not intersect; keep >= ${stackMinGapPx}px vertical separation`,
          source: "DreamCut stacked-card assembly regression",
          remedy: "Adjust props.absY (or font size / maxWidth) so concurrent captions stack with clear separation.",
        });
      } else if (verticalGap < stackMinGapPx) {
        findings.push({
          code: "caption_boxes_crowded",
          severity: "warning",
          elementId: b.id,
          atSeconds: Math.max(a.timeline_start, b.timeline_start),
          message: "Two concurrent captions nearly touch — the stack reads as one merged block.",
          measured: `${verticalGap}px vertical gap between concurrent caption boxes`,
          limit: `>= ${stackMinGapPx}px (1.25% of frame height)`,
          source: "DreamCut stacked-card assembly regression",
          remedy: "Open the vertical gap via props.absY.",
        });
      }
    }
  }

  // --- 2. Photosensitivity — the one SAFETY check. ---------------------------
  // ITU-R BT.1702-3: >3 flashes/sec over >25% of screen is a seizure risk, and fast cutting
  // counts as flashes. ffmpeg has no filter for this. If we don't compute it, nobody does.
  if (cutFrames.length > 1) {
    for (let i = 0; i < cutFrames.length; i++) {
      const windowStart = cutFrames[i]!;
      const inWindow = cutFrames.filter((f) => f >= windowStart && f < windowStart + FPS);
      if (inWindow.length > CUTS.maxCutsPerSecond) {
        findings.push({
          code: "photosensitivity_flash_rate",
          severity: "blocker",
          atSeconds: windowStart / FPS,
          message:
            "Cut rate exceeds the photosensitivity limit — this is a seizure risk, not a taste call.",
          measured: `${inWindow.length} cuts within 1s starting at ${(windowStart / FPS).toFixed(2)}s`,
          limit: `<= ${CUTS.maxCutsPerSecond} cuts per second (full-frame changes count as flashes)`,
          source: CUTS.source,
          remedy: `Lengthen shots in this window so no 1-second span carries more than ${CUTS.maxCutsPerSecond} cuts.`,
        });
        break; // one finding per timeline is enough to block; the remedy is regional
      }
    }
  }

  // --- 3. Shot length --------------------------------------------------------
  for (const v of visuals) {
    if (toFrame(v.duration) < CUTS.minShotFrames) {
      findings.push({
        code: "shot_too_short",
        severity: "warning",
        elementId: v.id,
        atSeconds: v.timeline_start,
        message: "Shot is too short to register.",
        measured: `${toFrame(v.duration)} frames`,
        limit: `>= ${CUTS.minShotFrames} frames`,
        source: CUTS.source,
        remedy: `Extend to >= ${(CUTS.minShotFrames / FPS).toFixed(3)}s or remove the shot.`,
      });
    }
  }
  const averageShotLength = visuals.length
    ? visuals.reduce((sum, visual) => sum + visual.duration, 0) / visuals.length
    : null;
  if (averageShotLength != null && averageShotLength < CUTS.advisoryAverageShotLengthSeconds) {
    findings.push({
      code: "fast_average_shot_length",
      severity: "advisory",
      message: "Average shot length is faster than the sourced feature-film reference; confirm the pace is intentional.",
      measured: `${averageShotLength.toFixed(2)}s average`,
      limit: `reference >= ${CUTS.advisoryAverageShotLengthSeconds}s (advisory, not a hard limit)`,
      source: CUTS.source,
      remedy: "Review pacing at full fidelity; retain the faster cut when it serves the brief.",
    });
  }

  // Optional measured sync metadata is populated by the alignment/rough-cut instruments.
  // Without it the timeline cannot infer lip sync, so absence is not certified as a pass.
  for (const voice of elements.filter(isVoice)) {
    const offsetMs = voice.props?.av_sync_offset_ms;
    if (typeof offsetMs !== "number" || !Number.isFinite(offsetMs)) continue;
    if (offsetMs < -AV_SYNC.maxAudioLeadMs || offsetMs > AV_SYNC.maxAudioLagMs) {
      findings.push({
        code: "av_sync_out_of_tolerance",
        severity: "blocker",
        elementId: voice.id,
        atSeconds: voice.timeline_start,
        message: "Measured narration sync is outside the EBU tolerance.",
        measured: `${offsetMs.toFixed(1)}ms (negative means audio leads)`,
        limit: `audio lead <= ${AV_SYNC.maxAudioLeadMs}ms; lag <= ${AV_SYNC.maxAudioLagMs}ms`,
        source: AV_SYNC.source,
        remedy: "Correct the edit map/alignment offset and regenerate dependent captions before rendering.",
      });
    }
  }

  // --- 4. Music burying the voiceover ---------------------------------------
  const voices = elements.filter(isVoice);
  const musics = elements.filter(isMusic);
  for (const music of musics) {
    for (const vo of voices) {
      const mS = music.timeline_start;
      const mE = mS + music.duration;
      const vS = vo.timeline_start;
      const vE = vS + vo.duration;
      if (!overlaps(mS, mE, vS, vE)) continue;

      // Flat-gain approximation. A volume_envelope may already duck the music; if one exists
      // we only advise, because the envelope's value under the VO is what actually matters
      // and that is a per-sample question this flat check cannot answer.
      const hasEnvelope = Array.isArray(music.props?.volume_envelope);
      const ratio = vo.volume > 0 ? music.volume / vo.volume : Infinity;
      if (ratio > AUDIO.maxMusicToVoiceGainRatio) {
        findings.push({
          code: "music_buries_voice",
          severity: hasEnvelope ? "advisory" : "warning",
          elementId: music.id,
          atSeconds: Math.max(mS, vS),
          message: hasEnvelope
            ? "Music has an envelope, but its flat gain sits high relative to the narration — confirm it ducks under the VO."
            : "Music is loud enough to bury the narration, and there is no ducking envelope.",
          measured: `music gain ${music.volume} vs voice gain ${vo.volume} (ratio ${ratio.toFixed(2)})`,
          limit: `music/voice gain ratio <= ${AUDIO.maxMusicToVoiceGainRatio} (~-15 dB, the low end of WHO's 15-18 dBA intelligibility band)`,
          source: AUDIO.source,
          remedy: `Duck the music under the narration: add a volume_envelope on the music dropping to <= ${(vo.volume * AUDIO.maxMusicToVoiceGainRatio).toFixed(2)} across ${vS.toFixed(2)}s-${vE.toFixed(2)}s.`,
        });
        break; // one finding per music element
      }
    }
  }

  // --- 4b. A reference-only track reaching the render ------------------------
  // Some music exists locally ONLY so the edit can be cut to its grid; the posted video gets
  // the sound applied in-app, where the platform's licence attaches. The failure mode of that
  // workflow is forgetting to pull the temp track, so the render ships the very audio it was
  // never meant to carry — silent, and unrecoverable once posted. Hence blocker, not warning.
  // Placement records the catalog's source_status on the element; absent it, this never fires.
  // The status is read from the media path first, and only then from a prop. Catalog audio is
  // filed by rights status (audio/reference/... serves as /api/music-catalog/media/reference/...),
  // so the path carries the fact wherever the file goes. A prop has to be stamped by whatever
  // placed the element, and anything that must be remembered eventually is not -- which is the
  // exact lapse this gate exists to catch. Both are honoured; neither is required.
  const isReferenceOnly = (el: QcElement) =>
    /(^|\/)reference\//.test(decodeURIComponent(el.source_url ?? "")) ||
    str(el.props?.source_status, "") === "reference_only";

  for (const music of musics) {
    if (!isReferenceOnly(music)) continue;
    const trackId = str(music.props?.catalog_track_id, "");
    findings.push({
      code: "reference_only_music_in_render",
      severity: "blocker",
      elementId: music.id,
      atSeconds: music.timeline_start,
      message:
        "A reference-only music track is on the timeline. It exists to cut against, not to ship — the render must not carry it.",
      measured: `filed under audio/reference/${trackId ? ` (catalog track "${trackId}")` : ""}`,
      limit: "Renders carry only owned, licensed, or cleared audio.",
      source: "music-catalog-ingest — a reference-only track is a timing reference, not deliverable audio",
      remedy:
        "Mute or remove the music lane before rendering, then apply the sound in-app at post time. The cuts still land, because they were made against this track's grid.",
    });
  }

  // --- 5. Clicks / pops at hard audio edits ---------------------------------
  for (const el of elements) {
    const isAudio = isVoice(el) || isMusic(el) || el.type === "sound_effect";
    if (!isAudio) continue;
    if (el.fade_in < AUDIO.minEdgeFadeSeconds || el.fade_out < AUDIO.minEdgeFadeSeconds) {
      findings.push({
        code: "hard_audio_edit",
        severity: "advisory",
        elementId: el.id,
        atSeconds: el.timeline_start,
        message: "Audio starts or ends on a hard edge — risks an audible click.",
        measured: `fade_in ${el.fade_in}s, fade_out ${el.fade_out}s`,
        limit: `>= ${AUDIO.minEdgeFadeSeconds}s on each edge`,
        source: AUDIO.source,
        remedy: `Set fade_in/fade_out to at least ${AUDIO.minEdgeFadeSeconds}s.`,
      });
    }
  }

  const counts: Record<Severity, number> = { blocker: 0, warning: 0, advisory: 0 };
  for (const f of findings) counts[f.severity]++;

  const shotCount = visuals.length;
  // Geometry counts as measured only if EVERY caption was measured. A partial measurement
  // would let an unmeasured caption hide behind a "measured" badge.
  const captionGeometryMeasured =
    captions.length === 0 || captions.every((cap) => input.measured?.[cap.id] != null);
  return {
    ok: counts.blocker === 0,
    captionGeometryMeasured,
    target,
    canvas,
    counts,
    findings: findings.sort((a, b) => (a.atSeconds ?? 0) - (b.atSeconds ?? 0)),
    summary: {
      durationSeconds: Number(durationSeconds.toFixed(3)),
      visualCutFrames: cutFrames,
      shotCount,
      captionCount: captions.length,
      averageShotLengthSeconds: averageShotLength == null ? null : Number(averageShotLength.toFixed(3)),
    },
  };
}

/** Render a report as compact text for an agent to read. Findings-as-text, per spek §14.4. */
export function formatReport(report: QcReport): string {
  const lines: string[] = [];
  lines.push(
    `QC — ${report.target} · ${report.canvas.width}x${report.canvas.height} · ${report.summary.durationSeconds}s · ${report.summary.shotCount} shots · ${report.summary.captionCount} captions`,
  );
  lines.push(
    `${report.ok ? "PASS" : "BLOCKED"} — ${report.counts.blocker} blocker, ${report.counts.warning} warning, ${report.counts.advisory} advisory`,
  );
  // Say out loud what the gate actually knows. A PASS on estimated geometry is a weaker claim
  // than a PASS on measured geometry, and the reader must never have to guess which they got.
  lines.push(
    report.captionGeometryMeasured
      ? "caption geometry: MEASURED with the real loaded font — violations block."
      : "caption geometry: ESTIMATED only — violations can only warn. This PASS does not clear caption layout.",
  );
  if (report.findings.length === 0) {
    lines.push("No findings.");
    return lines.join("\n");
  }
  lines.push("");
  for (const f of report.findings) {
    const at = f.atSeconds != null ? ` @${f.atSeconds.toFixed(2)}s` : "";
    const el = f.elementId ? ` [${f.elementId.slice(0, 8)}]` : "";
    lines.push(`${f.severity.toUpperCase()} ${f.code}${at}${el}`);
    lines.push(`  ${f.message}`);
    lines.push(`  measured: ${f.measured}`);
    lines.push(`  limit:    ${f.limit}  (${f.source})`);
    lines.push(`  fix:      ${f.remedy}`);
    lines.push("");
  }
  return lines.join("\n");
}
