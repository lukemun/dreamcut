import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
/**
 * What is on the screen at time T — as text.
 *
 * A VLM asked "is the caption on his chin?" has to do two jobs at once: find the caption, and
 * find the chin. It is reliable at the second and unreliable at the first — spatial localization
 * is the documented weak axis. So this module does the localization DETERMINISTICALLY (from the
 * timeline, the real loaded font, and the rendered pixels) and leaves the model only the
 * perceptual judgment it is actually good at.
 *
 * Three artifacts per sampled time:
 *   1. `state`      — the on-screen layer stack, the caption's exact box, and the fill colour
 *                     SAMPLED FROM THE RENDERED PIXELS. Text. No model needed to read it.
 *   2. the still    — rendered from the CURRENT timeline, not a stale export.
 *   3. the overlay  — the same still with the caption box and the safe area drawn ON it, so the
 *                     model is asked "does the red box cover his face?" (an overlap judgment on
 *                     geometry it can see) instead of "where is the caption?" (localization).
 *
 * The colour question is the clearest case: "is this white or grey?" is a NUMBER, and a number
 * must never be delegated to a model. `measuredFill` answers it from the pixels.
 */
import { execFileSync } from "node:child_process";

import { captionBox, type QcElement } from "@/lib/qc/check-timeline";
import { measureCaptions, type MeasuredCaption } from "@/lib/qc/measure-captions";
import { captionCompositingCSS, captionStyleCSS, resolveCaptionProps } from "@/lib/timeline/captions";
import { safeAreaFor, type DeliveryTarget, type SafeArea } from "@/lib/qc/standards";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";
import { resolveActiveWordIndex, validateWordTimings } from "@/lib/timeline/active-word-captions";
import type { SpatialRelationState } from "@/lib/instruments/spatial-relations";

export type Canvas = { width: number; height: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

export type LayerState = {
  id: string;
  type: string;
  laneKey: string;
  /** Back-to-front: 0 is the furthest back layer drawn at this time. */
  z: number;
  sourceUrl: string | null;
  /** Seconds into this element at the sampled time. */
  localSeconds: number;
};

export type MeasuredFill = {
  /** Median colour of the glyph body — the pixels the viewer reads as "the caption colour". */
  hex: string;
  rgb: [number, number, number];
  /** How many pixels in the caption box were bright enough to be glyph body rather than stroke. */
  sampleCount: number;
  /** Pure white is #ffffff. This is the max channel distance from it. */
  distanceFromWhite: number;
};

export type CaptionState = {
  id: string;
  /** Verbatim, with the authored line breaks still in it. */
  text: string;
  lines: string[];
  /** Line breaks the caption AUTHOR baked into props.text. */
  authoredLineBreaks: number;
  /** Lines the browser actually lays out with the real loaded font. The one that counts. */
  renderedLineCount: number;
  font: { preset: string; loadedFamily: string; sizePx: number };
  /** What the style variant DECLARES. Compare against measuredFill. */
  declaredStyle: Record<string, string | number>;
  box: Rect;
  /** Inclusive pixel bounds of the visible rendered caption contribution, measured by frame diff. */
  inkBox: Rect | null;
  inkBoxPctOfFrame: { left: number; top: number; right: number; bottom: number } | null;
  boxPctOfFrame: { left: number; top: number; right: number; bottom: number };
  /** Which numbered ruler bands the caption occupies — the same vocabulary the vision pass answers in. */
  boxBands: { top: number; bottom: number };
  safeAreaViolations: string[];
  measuredFill: MeasuredFill | null;
  timing: { mode: "phrase" | "active_word" | "single_word" | "paragraph_build"; activeWordIndex: number | null; activeWordText: string | null };
};

export type FrameState = {
  atSeconds: number;
  frame: number;
  canvas: Canvas;
  deliveryTarget: DeliveryTarget;
  safeArea: { margins: SafeArea; legalRect: Rect };
  layers: LayerState[];
  caption: CaptionState | null;
  spatialRelations: SpatialRelationState[];
  stillPath: string;
  overlayPath: string;
  read: FrameReadDelta;
};

export type FrameReadDelta = {
  /**
   * `unchanged` = still AND overlay are byte-identical to the previous report's — the frame holds
   * no new pixels, so a reader re-opens it only for a question not already answered from it.
   * `changed`/`new` frames are the ones a re-inspection pass must actually read.
   */
  status: "new" | "changed" | "unchanged";
  stillSha256: string;
  overlaySha256: string;
  prevStillSha256: string | null;
  prevOverlaySha256: string | null;
};

/**
 * The skip claim must be provable, never inferred: `unchanged` requires BOTH prior hashes to exist
 * and match. A pre-delta report (no hashes) cannot prove sameness, so its frames stay `new` — the
 * failure direction is always "read more", never "skip wrongly".
 */
export function computeReadDelta(
  prev: { stillSha256?: string | null; overlaySha256?: string | null } | undefined,
  stillSha256: string,
  overlaySha256: string,
): FrameReadDelta {
  const prevStillSha256 = prev?.stillSha256 ?? null;
  const prevOverlaySha256 = prev?.overlaySha256 ?? null;
  const status = prevStillSha256 === null || prevOverlaySha256 === null
    ? "new"
    : prevStillSha256 === stillSha256 && prevOverlaySha256 === overlaySha256
      ? "unchanged"
      : "changed";
  return { status, stillSha256, overlaySha256, prevStillSha256, prevOverlaySha256 };
}

const OVERLAY_LEGEND = {
  red: "the caption's exact bounding box, measured with the real loaded font",
  cyan: "the inclusive bounds of the visible rendered caption ink, measured by frame difference",
  green: "the measured platform safe boundary for the delivery target (organic and paid-ad resolve to the same template; the player chrome does not move between them)",
  ruler: "numbered horizontal bands down the left edge, one per 5% of frame height, labelled 0-19."
    + " Band N spans N*5% to (N+1)*5% of the height. Name a vertical position by its BAND NUMBER.",
} as const;

/** Bands are 5% of frame height each: 20 of them, 0 at the top. */
export const RULER_BANDS = 20;

export function bandOf(y: number, canvas: Canvas) {
  return Math.min(RULER_BANDS - 1, Math.max(0, Math.floor((y / canvas.height) * RULER_BANDS)));
}

export { OVERLAY_LEGEND };

function toHex(rgb: [number, number, number]) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The colour the viewer actually sees, read off the rendered frame.
 *
 * Sampling the WHOLE caption box would average the glyph body with its black stroke and whatever
 * is behind it, and report a grey that no pixel on screen is. So it keeps only the brightest
 * decile — the glyph body — and takes the median of that, which is the colour a reader's eye
 * integrates as "the text".
 */
export function sampleGlyphFill(stillPath: string, box: Rect, canvas: Canvas): MeasuredFill | null {
  const left = Math.max(0, Math.floor(box.left));
  const top = Math.max(0, Math.floor(box.top));
  const width = Math.min(canvas.width - left, Math.ceil(box.right - box.left));
  const height = Math.min(canvas.height - top, Math.ceil(box.bottom - box.top));
  if (width <= 0 || height <= 0) return null;

  const raw = execFileSync(
    "ffmpeg",
    [
      "-v", "error",
      "-i", stillPath,
      "-vf", `crop=${width}:${height}:${left}:${top}`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-",
    ],
    { maxBuffer: 1024 * 1024 * 256 },
  );

  const pixels: Array<{ luma: number; rgb: [number, number, number] }> = [];
  for (let offset = 0; offset + 2 < raw.length; offset += 3) {
    const rgb: [number, number, number] = [raw[offset]!, raw[offset + 1]!, raw[offset + 2]!];
    pixels.push({ luma: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], rgb });
  }
  if (!pixels.length) return null;

  pixels.sort((a, b) => b.luma - a.luma);
  const body = pixels.slice(0, Math.max(1, Math.floor(pixels.length * 0.1)));
  const rgb: [number, number, number] = [
    Math.round(median(body.map((pixel) => pixel.rgb[0]))),
    Math.round(median(body.map((pixel) => pixel.rgb[1]))),
    Math.round(median(body.map((pixel) => pixel.rgb[2]))),
  ];

  return {
    hex: toHex(rgb),
    rgb,
    sampleCount: body.length,
    distanceFromWhite: Math.max(...rgb.map((channel) => 255 - channel)),
  };
}

const RULER_FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

/**
 * Draws the measured geometry ONTO the still, so the model never has to localize it.
 *
 * The numbered ruler is the point. Asked "how far down is his chin?", a vision model has to
 * invent a coordinate, and it invents badly. Asked "which numbered band is his chin in?", it
 * reads a label that is already printed next to the chin — and reading a label is the thing it
 * is reliable at. The caption box is drawn for the same reason: the overlap question becomes
 * "does the red box touch his face", not "where is the caption".
 */
export function writeOverlay(
  stillPath: string,
  overlayPath: string,
  legal: Rect,
  box: Rect | null,
  canvas: Canvas,
  inkBox: Rect | null = null,
) {
  const thickness = 5;
  const bandHeight = canvas.height / RULER_BANDS;
  const filters: string[] = [];

  for (let band = 0; band < RULER_BANDS; band += 1) {
    const y = Math.round(band * bandHeight);
    filters.push(`drawbox=x=0:y=${y}:w=${Math.round(canvas.width * 0.055)}:h=2:color=yellow@0.85:t=fill`);
    filters.push(
      `drawtext=fontfile=${RULER_FONT}:text='${band}':x=8:y=${y + 6}`
        + `:fontsize=${Math.round(canvas.height * 0.017)}:fontcolor=yellow:box=1:boxcolor=black@0.65:boxborderw=4`,
    );
  }

  filters.push(
    `drawbox=x=${Math.round(legal.left)}:y=${Math.round(legal.top)}`
      + `:w=${Math.round(legal.right - legal.left)}:h=${Math.round(legal.bottom - legal.top)}`
      + `:color=lime@0.9:t=${thickness}`,
  );
  if (box) {
    filters.push(
      `drawbox=x=${Math.round(box.left)}:y=${Math.round(box.top)}`
        + `:w=${Math.round(box.right - box.left)}:h=${Math.round(box.bottom - box.top)}`
        + `:color=red@0.95:t=${thickness}`,
    );
  }
  if (inkBox) {
    filters.push(
      `drawbox=x=${Math.round(inkBox.left)}:y=${Math.round(inkBox.top)}`
        + `:w=${Math.max(1, Math.round(inkBox.right - inkBox.left + 1))}`
        + `:h=${Math.max(1, Math.round(inkBox.bottom - inkBox.top + 1))}`
        + `:color=cyan@0.95:t=${thickness}`,
    );
  }
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", stillPath, "-vf", filters.join(","), overlayPath]);
}

/** Elements alive at `atSeconds`, back-to-front in the order the composition stacks them. */
export function layersAt(
  elements: Array<QcElement & { lane_key: string; source_url?: string | null; duration: number }>,
  laneOrderKeys: string[],
  atSeconds: number,
): LayerState[] {
  const live = elements.filter(
    (element) =>
      atSeconds >= element.timeline_start && atSeconds < element.timeline_start + element.duration,
  );
  const laneRank = (laneKey: string) => {
    const index = laneOrderKeys.indexOf(laneKey);
    return index === -1 ? laneOrderKeys.length : index;
  };
  return live
    .slice()
    .sort((a, b) => laneRank(a.lane_key) - laneRank(b.lane_key) || a.timeline_start - b.timeline_start)
    .map((element, z) => ({
      id: element.id,
      type: element.type,
      laneKey: element.lane_key,
      z,
      sourceUrl: element.source_url ?? null,
      localSeconds: Number((atSeconds - element.timeline_start).toFixed(3)),
    }));
}

export function buildCaptionState(
  caption: QcElement,
  measured: MeasuredCaption,
  canvas: Canvas,
  safe: SafeArea,
  stillPath: string,
  atSeconds = caption.timeline_start + caption.duration / 2,
  renderedInkBox: Rect | null = null,
): CaptionState {
  const props = resolveCaptionProps(caption.props);
  const box = captionBox(caption, canvas, measured);
  const railTop = safe.rail ? safe.rail.belowFraction * canvas.height : Infinity;
  const rightMargin = safe.rail && box.bottom > railTop ? safe.rail.right : safe.right;
  const violations = [
    box.left < safe.left && "left",
    box.top < safe.top && "top",
    box.right > canvas.width - rightMargin && "right",
    box.bottom > canvas.height - safe.bottom && "bottom",
  ].filter((violation): violation is string => typeof violation === "string");

  const rect: Rect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  const timingValidation = props.timingMode !== "phrase"
    ? validateWordTimings(props.text, caption.duration, props.wordTimings, currentFrameRate())
    : null;
  const activeWordIndex = timingValidation && timingValidation.findings.length === 0
    ? resolveActiveWordIndex(timingValidation.timings, atSeconds - caption.timeline_start)
    : -1;

  return {
    id: caption.id,
    text: props.text,
    lines: props.text.split("\n"),
    authoredLineBreaks: (props.text.match(/\n/g) ?? []).length,
    renderedLineCount: measured.lines,
    font: { preset: props.fontPreset, loadedFamily: measured.loadedFamily, sizePx: props.fontSizePx },
    declaredStyle: {
      ...captionStyleCSS(props.styleVariant, props.textColor, props.outlineWidthPx),
      ...captionCompositingCSS(props.styleVariant),
    },
    box: rect,
    inkBox: renderedInkBox,
    inkBoxPctOfFrame: renderedInkBox ? {
      left: Number(((renderedInkBox.left / canvas.width) * 100).toFixed(1)),
      top: Number(((renderedInkBox.top / canvas.height) * 100).toFixed(1)),
      right: Number(((renderedInkBox.right / canvas.width) * 100).toFixed(1)),
      bottom: Number(((renderedInkBox.bottom / canvas.height) * 100).toFixed(1)),
    } : null,
    boxPctOfFrame: {
      left: Number(((rect.left / canvas.width) * 100).toFixed(1)),
      top: Number(((rect.top / canvas.height) * 100).toFixed(1)),
      right: Number(((rect.right / canvas.width) * 100).toFixed(1)),
      bottom: Number(((rect.bottom / canvas.height) * 100).toFixed(1)),
    },
    boxBands: { top: bandOf(rect.top, canvas), bottom: bandOf(rect.bottom, canvas) },
    safeAreaViolations: violations,
    measuredFill: sampleGlyphFill(stillPath, inkRect(rect, measured, props.textAlign), canvas),
    timing: {
      mode: props.timingMode,
      activeWordIndex: activeWordIndex >= 0 ? activeWordIndex : null,
      activeWordText: activeWordIndex >= 0 ? timingValidation?.timings[activeWordIndex]?.text ?? null : null,
    },
  };
}

/**
 * The rectangle the GLYPHS occupy, not the one the layout reserves for them.
 *
 * Sampling colour from the layout box reads whatever is behind the empty remainder of the line —
 * for a one-word caption in a 972px box that is almost entirely background, and the "caption
 * colour" comes back as the speaker's t-shirt.
 */
export function inkRect(
  box: Rect,
  measured: MeasuredCaption,
  textAlign: "left" | "center" | "right",
): Rect {
  const slack = Math.max(0, box.right - box.left - measured.inkWidth);
  const offset = textAlign === "left" ? 0 : textAlign === "right" ? slack : slack / 2;
  return {
    left: box.left + offset,
    top: box.top,
    right: box.left + offset + measured.inkWidth,
    bottom: box.bottom,
  };
}

export function legalRectFor(safe: SafeArea, canvas: Canvas): Rect {
  return {
    left: safe.left,
    top: safe.top,
    right: canvas.width - safe.right,
    bottom: canvas.height - safe.bottom,
  };
}

export function frameFor(atSeconds: number, fps: number = currentFrameRate()) {
  return Math.round(atSeconds * fps);
}

export { measureCaptions, safeAreaFor };
