import { ANIMATED_TRANSFORM_PRECISION } from "./media-transform";
import { SAFE_AREA_REELS } from "../qc/standards";
import { REELS_INTERFACE_BOTTOM } from "./reels-guide-layout";

export const SAFE_GRID_SLOTS = [
  "top_left", "top_center", "top_right",
  "upper_left", "upper_center", "upper_right",
  "center_left", "center", "center_right",
  "lower_left", "lower_center", "lower_right",
  "bottom_left", "bottom_center", "bottom_right",
] as const;

export type SafeGridSlot = (typeof SAFE_GRID_SLOTS)[number];

export const SEMANTIC_VISUAL_SIZES = ["hero", "peer", "supporting", "compact", "accent", "micro", "tiny", "full"] as const;
export type SemanticVisualSize = (typeof SEMANTIC_VISUAL_SIZES)[number];

export const SEMANTIC_VISUAL_PACKINGS = ["compact_upper", "reels_story", "reels_podium", "reels_caption_stack", "reels_interface_caption_stack", "logo_orbit", "spacious_story", "spacious_pair", "alpha_header_pair", "podium_seats", "wide_columns"] as const;
export type SemanticVisualPacking = (typeof SEMANTIC_VISUAL_PACKINGS)[number];

export type SemanticVisualLayout = {
  frame_model?: "canvas" | "bottom_weighted_subject";
  slot: SafeGridSlot;
  size: SemanticVisualSize;
  packing?: SemanticVisualPacking;
  motion?: {
    from_slot: SafeGridSlot;
    to_slot: SafeGridSlot;
    start_seconds: number;
    duration_seconds: number;
    ease: "linear" | "easeIn" | "easeOut" | "easeInOut";
  };
};

export type SemanticCrowdLayout = {
  region: "upper_left_fan" | "upper_center_cluster" | "reels_row";
  index: number;
  total: number;
};

const COLUMN_X = { left: 0.2, center: 0.5, right: 0.8 } as const;
const ROW_Y = { top: 0.12, upper: 0.3, center: 0.5, lower: 0.7, bottom: 0.86 } as const;
const COMPACT_UPPER_ROW_Y = { top: 0.1, upper: 0.22, center: 0.34, lower: 0.46, bottom: 0.58 } as const;
const SIZE_SCALE: Record<SemanticVisualSize, number> = {
  hero: 0.78,
  peer: 0.48,
  supporting: 0.38,
  compact: 0.30,
  accent: 0.25,
  micro: 0.18,
  tiny: 0.14,
  full: 1,
};

const precise = (value: number) => Number(value.toFixed(ANIMATED_TRANSFORM_PRECISION));

export function resolveSafeGridSlot(slot: SafeGridSlot) {
  const [row, column] = slot === "center" ? ["center", "center"] : slot.split("_");
  const x = COLUMN_X[column as keyof typeof COLUMN_X];
  const y = ROW_Y[row as keyof typeof ROW_Y];
  return {
    normalized_x: x,
    normalized_y: y,
    media_offset_x: precise((x - 0.5) * 2),
    media_offset_y: precise((y - 0.5) * 2),
  };
}

function resolvePackedGridSlot(slot: SafeGridSlot, packing?: SemanticVisualPacking) {
  if (packing === "wide_columns") {
    const result = resolveSafeGridSlot(slot);
    const x = result.normalized_x === .2 ? .26 : result.normalized_x === .8 ? .74 : .5;
    return {...result, normalized_x:x, media_offset_x:precise((x-.5)*2)};
  }
  if (packing === "logo_orbit" || packing === "spacious_story" || packing === "spacious_pair" || packing === "alpha_header_pair") {
    const [row, column] = slot === "center" ? ["center", "center"] : slot.split("_");
    const columns = packing === "alpha_header_pair" || packing === "spacious_pair" ? { left: 0.28, center: 0.5, right: 0.72 }
      : packing === "logo_orbit" ? { left: 0.23, center: 0.5, right: 0.77 } : COLUMN_X;
    const rows = packing === "logo_orbit"
      ? { top: 0.18, upper: 0.30, center: 0.43, lower: 0.55, bottom: 0.7 }
      : { top: 0.16, upper: 0.38, center: 0.44, lower: 0.55, bottom: 0.7 };
    const x = columns[column as keyof typeof columns];
    const y = rows[row as keyof typeof rows];
    return { normalized_x: x, normalized_y: y, media_offset_x: precise((x - 0.5) * 2), media_offset_y: precise((y - 0.5) * 2) };
  }
  if (packing === "reels_story" || packing === "reels_podium") {
    // An opt-in story grid, not a migration of saved manual placements. Reserve
    // the entire action-rail width so moving actors share one stable centre.
    const safe = SAFE_AREA_REELS;
    const [row, column] = slot === "center" ? ["center", "center"] : slot.split("_");
    const rowFraction = packing === "reels_podium"
      ? { top: 0.202, upper: 0.242, center: 0.262, lower: 0.65, bottom: 0.8 }
      : { top: 0.15, upper: 0.33, center: 0.49, lower: 0.65, bottom: 0.8 };
    const columns = packing === "reels_podium" ? { left: 0.3, center: 0.5, right: 0.7 } : COLUMN_X;
    const width = safe.reference.width - safe.left - Math.max(safe.right, safe.rail?.right ?? 0);
    const height = safe.reference.height - safe.top - safe.bottom;
    // The action rail constrains the side columns, but it must not establish a
    // second visual centre. Every semantic center column remains centered on
    // the full render canvas (x = 0.5), independent of platform chrome.
    const x = column === "center"
      ? 0.5
      : (safe.left + width * columns[column as keyof typeof COLUMN_X]) / safe.reference.width;
    const y = (safe.top + height * rowFraction[row as keyof typeof rowFraction]) / safe.reference.height;
    return { normalized_x: x, normalized_y: y,
      media_offset_x: precise((x - 0.5) * 2), media_offset_y: precise((y - 0.5) * 2) };
  }
  if (packing !== "compact_upper") return resolveSafeGridSlot(slot);
  const [row, column] = slot === "center" ? ["center", "center"] : slot.split("_");
  const x = COLUMN_X[column as keyof typeof COLUMN_X];
  const y = COMPACT_UPPER_ROW_Y[row as keyof typeof COMPACT_UPPER_ROW_Y];
  return {
    normalized_x: x,
    normalized_y: y,
    media_offset_x: precise((x - 0.5) * 2),
    media_offset_y: precise((y - 0.5) * 2),
  };
}

export type SemanticMediaFrameModel = "canvas" | "bottom_weighted_subject";

const BOTTOM_WEIGHTED_SLOT: Record<SafeGridSlot, SafeGridSlot> = {
  top_left: "top_left", top_center: "top_center", top_right: "top_right",
  upper_left: "top_left", upper_center: "top_center", upper_right: "top_right",
  center_left: "upper_left", center: "upper_center", center_right: "upper_right",
  lower_left: "center_left", lower_center: "center", lower_right: "center_right",
  bottom_left: "lower_left", bottom_center: "lower_center", bottom_right: "lower_right",
};

/**
 * Resolve named placement against either the whole media canvas or a subject
 * whose visible mass occupies the lower half of a transparent phone frame.
 * The latter keeps "lower center" semantic while moving the media canvas one
 * grid row up, so the visible person—not empty alpha—lands on that anchor.
 */
export function resolveSemanticVisualLayout(
  layout: SemanticVisualLayout,
  frameModel: SemanticMediaFrameModel = "canvas",
) {
  frameModel = layout.frame_model ?? frameModel;
  const slotForFrame = (slot: SafeGridSlot) => frameModel === "bottom_weighted_subject"
    ? BOTTOM_WEIGHTED_SLOT[slot]
    : slot;
  const destination = resolvePackedGridSlot(slotForFrame(layout.slot), layout.packing);
  if (layout.packing === "alpha_header_pair") {
    // Header artwork's visible center is 9.6% of its canvas above center.
    destination.media_offset_y = precise(destination.media_offset_y + SIZE_SCALE[layout.size] * 0.096 * 2);
  }
  if (layout.packing === "podium_seats") {
    // Seats measured on the 2:1 podium artwork: left=2, center=1, right=3.
    // The podium is hero-sized in spacious_story's upper-center region.
    const column = layout.slot.endsWith("left") ? "left" : layout.slot.endsWith("right") ? "right" : "center";
    const seatX = { left: 0.2, center: 0.5, right: 0.8 }[column];
    const seatY = { left: 0.4, center: 0.267, right: 0.49 }[column];
    const podiumWidth = SIZE_SCALE.hero;
    const podiumHeight = podiumWidth * 1080 / 2 / 1920;
    const iconHalfHeight = SIZE_SCALE[layout.size] * 1080 / 1920 / 2;
    destination.media_offset_x = precise((seatX - 0.5) * podiumWidth * 2);
    destination.media_offset_y = precise((0.38 + (seatY - 0.5) * podiumHeight - iconHalfHeight - 0.006 - 0.5) * 2);
  }
  if (layout.packing === "reels_caption_stack" || layout.packing === "reels_interface_caption_stack") {
    // Reserve a 76px phrase rail plus a 16px breathing gap. Anchor the media
    // canvas bottom above it; no change to source timing or opacity animation.
    const height = SAFE_AREA_REELS.reference.height;
    const bottom = (layout.packing === "reels_interface_caption_stack" ? height * REELS_INTERFACE_BOTTOM : height - SAFE_AREA_REELS.bottom) - 76 - 16;
    destination.media_offset_x = 0;
    destination.media_offset_y = precise((bottom / height - SIZE_SCALE[layout.size] / 2 - 0.5) * 2);
  }
  const props: Record<string, unknown> = {
    media_scale: SIZE_SCALE[layout.size],
    media_offset_x: destination.media_offset_x,
    media_offset_y: destination.media_offset_y,
    semantic_layout: { schema_version: 1, ...layout, frame_model: frameModel },
    crowd_layout: null,
  };
  if (!layout.motion) return props;

  const from = resolvePackedGridSlot(slotForFrame(layout.motion.from_slot), layout.packing);
  const to = resolvePackedGridSlot(slotForFrame(layout.motion.to_slot), layout.packing);
  const start = precise(layout.motion.start_seconds);
  const end = precise(layout.motion.start_seconds + layout.motion.duration_seconds);
  const makeTrack = (fromValue: number, toValue: number) => [
    {
      t: 0,
      v: fromValue,
      ease: start > 0 ? ("hold" as const) : layout.motion!.ease,
    },
    ...(start > 0 ? [{ t: start, v: fromValue, ease: layout.motion!.ease }] : []),
    { t: end, v: toValue, ease: "hold" as const },
  ];
  return {
    ...props,
    media_offset_x: from.media_offset_x,
    media_offset_y: from.media_offset_y,
    keyframes: {
      media_offset_x: makeTrack(from.media_offset_x, to.media_offset_x),
      media_offset_y: makeTrack(from.media_offset_y, to.media_offset_y),
    },
  };
}

/**
 * Arrange repeated person cutouts as a two-row fan with unique centers and
 * depth-scaled silhouettes. The right edge stays open for a paired prop while
 * the lower caption band remains clear.
 */
export function resolveSemanticCrowdLayout(layout: SemanticCrowdLayout) {
  const total = Math.max(2, Math.min(32, Math.round(layout.total)));
  const index = Math.max(0, Math.min(total - 1, Math.round(layout.index)));
  if (layout.region === "reels_row") {
    const safe = SAFE_AREA_REELS;
    const safeWidth = safe.reference.width - safe.left - Math.max(safe.right, safe.rail?.right ?? 0);
    const x = (safe.left + safeWidth * (index + 0.5) / total) / safe.reference.width;
    return { media_scale: precise(Math.min(0.25, 0.84 / total)),
      media_offset_x: precise((x - 0.5) * 2), media_offset_y: precise((0.36 - 0.5) * 2),
      semantic_layout: null, crowd_layout: { schema_version: 1, ...layout, index, total } };
  }
  const columns = Math.ceil(total / 2);
  const row = index < columns ? 0 : 1;
  const indexInRow = row === 0 ? index : index - columns;
  const countInRow = row === 0 ? columns : total - columns;
  const progress = countInRow <= 1 ? 0.5 : indexInRow / (countInRow - 1);
  const clustered = layout.region === "upper_center_cluster";
  const normalizedX = clustered ? 0.28 + progress * 0.44 : 0.12 + progress * 0.5;
  const arch = Math.abs(progress - 0.5) * 2;
  const normalizedY = clustered
    ? row === 0 ? 0.33 + arch * 0.02 : 0.43 + arch * 0.025
    : row === 0 ? 0.17 + arch * 0.035 : 0.31 + arch * 0.045;
  const scale = clustered
    ? row === 0 ? 0.16 : 0.2
    : row === 0 ? 0.17 : 0.21;
  return {
    media_scale: precise(scale),
    media_offset_x: precise((normalizedX - 0.5) * 2),
    media_offset_y: precise((normalizedY - 0.5) * 2),
    semantic_layout: null,
    crowd_layout: { schema_version: 1, ...layout, index, total },
  };
}
