export const PLAYABLE_MEDIA_TYPES = new Set([
  "video_clip",
  "vo_segment",
  "vo_full",
  "music",
  "sound_effect",
]);

function finitePositive(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return value;
}

function finiteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function roundSeconds(value) {
  return Number(value.toFixed(6));
}

function sourceDurationOf(element) {
  return finitePositive(element?.props?.source_duration_seconds, "props.source_duration_seconds");
}

function playbackRateOf(element) {
  return finitePositive(element?.playback_rate ?? 1, "playback_rate");
}

function assertPlayableMedia(element) {
  if (!PLAYABLE_MEDIA_TYPES.has(element?.type)) {
    throw new Error(`Source-window editing is not supported for ${element?.type ?? "unknown"} elements`);
  }
}

/**
 * Turn one explicit source interval into a complete timeline row.
 * The source file remains intact: trim_start and trim_end record the handles
 * outside the visible interval, while duration is derived from that interval.
 */
export function createElementFromSourceWindow(
  element,
  { source_start_seconds, source_end_seconds, source_duration_seconds },
) {
  assertPlayableMedia(element);
  for (const forbidden of ["duration", "trim_start", "trim_end"]) {
    if (Object.hasOwn(element, forbidden)) {
      throw new Error(
        `element.${forbidden} is derived from the source window; remove it and use source_start_seconds/source_end_seconds`,
      );
    }
  }
  const sourceDuration = finitePositive(source_duration_seconds, "source_duration_seconds");
  const sourceStart = finiteNonNegative(source_start_seconds, "source_start_seconds");
  const sourceEnd = finitePositive(source_end_seconds, "source_end_seconds");
  if (sourceEnd <= sourceStart) throw new Error("source_end_seconds must be after source_start_seconds");
  if (sourceEnd > sourceDuration) throw new Error("source_end_seconds cannot exceed source_duration_seconds");
  const playbackRate = playbackRateOf(element);
  return {
    ...element,
    duration: roundSeconds((sourceEnd - sourceStart) / playbackRate),
    trim_start: roundSeconds(sourceStart),
    trim_end: roundSeconds(sourceDuration - sourceEnd),
    props: {
      ...(element.props ?? {}),
      source_duration_seconds: sourceDuration,
    },
  };
}

/**
 * Build a complete, non-slip trim patch. Both source boundaries are always
 * explicit, and the timeline span moves with the selected edge.
 */
export function buildSourceTrimPatch(element, edge, sourceSeconds) {
  assertPlayableMedia(element);
  const sourceDuration = sourceDurationOf(element);
  const playbackRate = playbackRateOf(element);
  const currentTrimStart = finiteNonNegative(element.trim_start ?? 0, "trim_start");
  const currentTimelineStart = finiteNonNegative(element.timeline_start, "timeline_start");
  const currentDuration = finitePositive(element.duration, "duration");
  const inferredVisibleOut = currentTrimStart + currentDuration * playbackRate;
  const currentSourceOut = element.trim_end == null
    ? Math.min(sourceDuration, inferredVisibleOut)
    : sourceDuration - finiteNonNegative(element.trim_end, "trim_end");
  const requestedBoundary = finiteNonNegative(sourceSeconds, "source_seconds");

  let sourceIn = currentTrimStart;
  let sourceOut = currentSourceOut;
  let timelineStart = currentTimelineStart;
  if (edge === "head") {
    sourceIn = requestedBoundary;
    if (sourceIn >= sourceOut) throw new Error("Head trim must remain before the source-out boundary");
    timelineStart += (sourceIn - currentTrimStart) / playbackRate;
    if (timelineStart < 0) throw new Error("Head trim would move the clip before timeline zero");
  } else if (edge === "tail") {
    sourceOut = requestedBoundary;
    if (sourceOut <= sourceIn) throw new Error("Tail trim must remain after the source-in boundary");
    if (sourceOut > sourceDuration) throw new Error("Tail trim cannot extend past the source duration");
  } else {
    throw new Error("edge must be head or tail");
  }

  return {
    timeline_start: roundSeconds(timelineStart),
    duration: roundSeconds((sourceOut - sourceIn) / playbackRate),
    trim_start: roundSeconds(sourceIn),
    trim_end: roundSeconds(sourceDuration - sourceOut),
  };
}

/**
 * Raw agent patches may move clips or adjust non-source properties, but any
 * source-window change must arrive as one complete semantic trim. This blocks
 * an accidental slip (moving source under fixed timeline boundaries).
 */
export function assertSemanticTrimOperations(operations, { inProposal = false } = {}) {
  for (const operation of operations ?? []) {
    const patch = operation?.patch;
    if (!patch || (!Object.hasOwn(patch, "trim_start") && !Object.hasOwn(patch, "trim_end"))) continue;
    const required = ["timeline_start", "duration", "trim_start", "trim_end"];
    const missing = required.filter((field) => !Object.hasOwn(patch, field));
    if (missing.length) {
      // element_trim writes the timeline directly, so a proposal can only fix the patch itself.
      const remedy = inProposal
        ? `Add ${missing.join(", ")} to the patch for ${operation.element_id ?? "that element"}, repeating the current value where it does not change.`
        : "Use element_trim.";
      throw new Error(
        `Implicit slip/source truncation is not supported. A trim patch must include ${required.join(", ")}; missing ${missing.join(", ")}. ${remedy}`,
      );
    }
  }
}
