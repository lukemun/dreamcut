/** A bounded, source-synchronized picture window. Times are clip-relative seconds. */
export const MASK_WINDOW_FIELDS = [
  "mask_window_close_start_seconds", "mask_window_close_duration_seconds",
  "mask_window_reopen_start_seconds", "mask_window_reopen_duration_seconds",
  "mask_window_top_percent", "mask_window_bottom_percent",
] as const;

export type MaskWindowValues = Record<(typeof MASK_WINDOW_FIELDS)[number], number> & {
  mask_window_foreground_id: string;
};

export function maskWindowValues(props: Record<string, unknown> | undefined): MaskWindowValues | undefined {
  if (!props || !MASK_WINDOW_FIELDS.some(field => props[field] !== undefined) && props.mask_window_foreground_id === undefined) return undefined;
  if (MASK_WINDOW_FIELDS.some(field => typeof props[field] !== "number") || typeof props.mask_window_foreground_id !== "string") {
    throw new Error("Picture window requires all six controls and its synchronized foreground layer");
  }
  return props as MaskWindowValues;
}

export function maskWindowPoints(values: MaskWindowValues, duration: number) {
  const close = values.mask_window_close_start_seconds;
  const closed = close + values.mask_window_close_duration_seconds;
  const reopen = values.mask_window_reopen_start_seconds;
  const open = reopen + values.mask_window_reopen_duration_seconds;
  const top = values.mask_window_top_percent;
  const bottom = values.mask_window_bottom_percent;
  if (close <= 0 || closed >= reopen || open >= duration || top + bottom >= 1 || top > .5 || bottom > .5) {
    throw new Error("Picture window timing or opening exceeds the clip bounds");
  }
  const wide: [number, number, number, number] = [0, 0, 0, 0];
  const strip: [number, number, number, number] = [top, 0, bottom, 0];
  return [
    {t: 0, v: wide, ease: "hold" as const},
    {t: close, v: wide, ease: "easeOut" as const},
    {t: closed, v: strip, ease: "hold" as const},
    {t: reopen, v: strip, ease: "easeInOut" as const},
    {t: open, v: wide},
  ];
}

export function synchronizeMaskWindowForeground<T extends {operations: Array<{element_id: string; props?: Record<string, unknown>; create_visual?: Record<string, unknown>}>}>(option: T): T {
  for (const operation of option.operations) {
    const values = maskWindowValues(operation.props);
    if (!values) continue;
    const foreground = option.operations.find(candidate => candidate.element_id === values.mask_window_foreground_id)?.create_visual;
    if (!foreground || foreground.type !== "video_clip" || foreground.has_alpha !== true || foreground.playback_rate !== 1) {
      throw new Error("Picture window needs a synchronized transparent foreground video");
    }
    const start = values.mask_window_close_start_seconds;
    const end = values.mask_window_reopen_start_seconds + values.mask_window_reopen_duration_seconds;
    foreground.timeline_start = start;
    foreground.source_start_seconds = start;
    foreground.source_end_seconds = end;
  }
  return option;
}
