/**
 * A floating visual: a card at 40% of the frame in the left third beside a centred speaker
 * (offsets are in half-frame units, so -0.52 centres it about a quarter of the frame left).
 * Pure so the storyboard preview cards and the compiled proposal share it.
 */
export const FLOAT_LAYOUT = { media_scale: 0.4, media_offset_x: -0.52, media_offset_y: -0.04 } as const;
