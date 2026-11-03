type TimelineWindow = {
  id: string;
  timeline_start: number;
  duration: number;
  removed_at: string | null;
  type?: string;
  source_url?: string | null;
  props?: Record<string, unknown> | null;
  lane_key?: string;
  lane_index?: number;
  trim_start?: number;
  trim_end?: number | null;
  volume?: number;
  fade_in?: number;
  fade_out?: number;
  playback_rate?: number;
};

export type AuditionPlaybackRange = {
  startSeconds: number;
  endSeconds: number;
};

type ProposalReviewLike = {
  preview_range?: { start_seconds: number; end_seconds: number };
  rows: Array<{
    element_id?: string;
    changes: Array<{ target: string; field: string; after_value?: unknown }>;
  }>;
};

/** Context helps judge cuts, but it obscures a music audition by playing the
 * existing cue first. New music therefore starts at its own proposed in-point. */
export function proposalPlaybackLeadInSeconds(review?: ProposalReviewLike): number {
  if (review?.preview_range) return 0;
  const createsMusic = review?.rows.some((row) => row.changes.some((change) =>
    change.target === "create_audio"
    && change.field === "type"
    && change.after_value === "music"));
  return createsMusic ? 0 : 3;
}

export function resolveAuditionPlaybackRange(
  timelineElementIds: string[],
  elements: TimelineWindow[],
): AuditionPlaybackRange | null {
  const requestedIds = new Set(timelineElementIds);
  const candidates = elements
    .filter((element) => requestedIds.has(element.id) && element.removed_at == null)
    .sort((a, b) => a.timeline_start - b.timeline_start);
  if (candidates.length === 0) return null;

  return {
    startSeconds: candidates[0]!.timeline_start,
    endSeconds: Math.max(...candidates.map((element) => element.timeline_start + element.duration)),
  };
}

/**
 * Find a useful review window for a lane-order-only proposal. Those proposals
 * do not touch element rows, so the normal touched-element resolver has no
 * clip IDs to follow. The visual difference exists only while elements on two
 * lanes whose relative order flipped are simultaneously visible.
 *
 * Return the longest continuous overlap cluster. The caller adds its normal
 * lead-in, so review starts with context instead of jumping onto the collision.
 */
export function resolveLaneOrderPlaybackRange(
  baseLaneOrder: readonly string[],
  draftLaneOrder: readonly string[],
  elements: readonly TimelineWindow[],
): AuditionPlaybackRange | null {
  const baseRank = new Map(baseLaneOrder.map((laneKey, index) => [laneKey, index]));
  const draftRank = new Map(draftLaneOrder.map((laneKey, index) => [laneKey, index]));
  const active = elements.filter((element) =>
    element.removed_at == null
    && typeof element.lane_key === "string"
    && baseRank.has(element.lane_key)
    && draftRank.has(element.lane_key)
    && element.duration > 0);
  const intervals: AuditionPlaybackRange[] = [];

  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    const left = active[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const right = active[rightIndex]!;
      if (left.lane_key === right.lane_key) continue;
      const baseDelta = baseRank.get(left.lane_key!)! - baseRank.get(right.lane_key!)!;
      const draftDelta = draftRank.get(left.lane_key!)! - draftRank.get(right.lane_key!)!;
      if (Math.sign(baseDelta) === Math.sign(draftDelta)) continue;

      const startSeconds = Math.max(left.timeline_start, right.timeline_start);
      const endSeconds = Math.min(
        left.timeline_start + left.duration,
        right.timeline_start + right.duration,
      );
      if (endSeconds > startSeconds + 1e-6) intervals.push({ startSeconds, endSeconds });
    }
  }

  if (intervals.length === 0) return null;
  intervals.sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  const clusters: AuditionPlaybackRange[] = [];
  for (const interval of intervals) {
    const previous = clusters.at(-1);
    if (previous && interval.startSeconds <= previous.endSeconds + 1e-6) {
      previous.endSeconds = Math.max(previous.endSeconds, interval.endSeconds);
    } else {
      clusters.push({ ...interval });
    }
  }
  return clusters.sort((left, right) =>
    (right.endSeconds - right.startSeconds) - (left.endSeconds - left.startSeconds)
    || left.startSeconds - right.startSeconds)[0] ?? null;
}

/**
 * Playback window for a PROPOSAL draft. A touched element that the option
 * removes (or replaces) is absent-or-tombstoned in the draft, so its window
 * comes from its position on the BASE timeline instead — a deletion-only
 * option then plays the surrounding context with the material gone, rather
 * than resolving to no range at all.
 */
export function resolveProposalPlaybackRange(
  touchedElementIds: string[],
  draftElements: TimelineWindow[],
  baseElements: TimelineWindow[],
  review?: ProposalReviewLike,
): AuditionPlaybackRange | null {
  if (review?.preview_range) {
    const { start_seconds: start, end_seconds: end } = review.preview_range;
    const duration = Math.max(0, ...draftElements.filter(element => element.removed_at == null).map(element => element.timeline_start + element.duration));
    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && start < duration) {
      return { startSeconds: start, endSeconds: Math.min(end, duration) };
    }
  }
  // A ripple cut touches the whole remainder of several lanes. Its new right
  // segment identifies the actual join in draft time; touched extents do not.
  const joinIds = review?.rows.flatMap(row => row.changes.flatMap(change =>
    change.target === "source_range_cut" && change.field === "inserted_element_id" && typeof change.after_value === "string"
      ? [change.after_value] : [])) ?? [];
  const joins = draftElements.filter(element => joinIds.includes(element.id) && element.removed_at == null);
  if (joins.length) {
    const end = Math.max(...draftElements.filter(e => e.removed_at == null).map(e => e.timeline_start + e.duration));
    return { startSeconds: Math.min(...joins.map(e => e.timeline_start)),
      endSeconds: Math.min(end, Math.max(...joins.map(e => e.timeline_start)) + 4) };
  }

  const requestedIds = new Set(touchedElementIds);
  const draftActive = draftElements.filter((element) => requestedIds.has(element.id) && element.removed_at == null);
  const baseActive = baseElements.filter((element) => requestedIds.has(element.id) && element.removed_at == null);
  const draftActiveIds = new Set(draftActive.map((element) => element.id));
  const baseById = new Map(baseActive.map((element) => [element.id, element]));
  const consumedBaseIds = new Set<string>();
  const shortenedTailIds = new Set<string>();
  const shortenedTailEnds = draftActive.flatMap((draft) => {
    const base = baseById.get(draft.id);
    if (!base || !tailTrimFocusWindow(base, draft) || draft.duration >= base.duration) return [];
    shortenedTailIds.add(draft.id);
    return [draft.timeline_start + draft.duration];
  });

  // A full caption-track replacement gives every cue a new id, even when most
  // cues are byte-for-byte the same editorially. Pair those unchanged cues by
  // their visible caption contract so Play focuses on the actual repair rather
  // than treating the whole speech rail as changed and starting at 0:00.
  const changedDraft = draftActive.flatMap((draft) => {
    const sameId = baseById.get(draft.id);
    if (sameId) {
      consumedBaseIds.add(sameId.id);
      if (sameWindow(sameId, draft)) return [];
      return [tailTrimFocusWindow(sameId, draft) ?? keyframedChangeWindow(sameId, draft) ?? draft];
    }
    if (draft.type !== "caption_text") return [draft];
    const equivalent = baseActive.find((base) =>
      !consumedBaseIds.has(base.id)
      && base.type === "caption_text"
      && sameCaptionCue(base, draft));
    if (!equivalent) return [draft];
    consumedBaseIds.add(equivalent.id);
    return [];
  });

  const changedBase = baseActive.filter((base) =>
    !consumedBaseIds.has(base.id) && !draftActiveIds.has(base.id));
  const windows = [...changedDraft, ...changedBase];
  if (windows.length === 0) return null;

  const naturalStart = Math.min(...windows.map((element) => element.timeline_start));
  const naturalEnd = Math.max(...windows.map((element) =>
    element.timeline_start + Math.max(0, element.duration)));
  const shortenedTailEnd = shortenedTailEnds.length > 0
    ? Math.min(...shortenedTailEnds)
    : null;
  // A shortened element often removes material after a new replacement begins
  // at the same boundary. Cap removal-only previews at the shortened tail so
  // deleted sign-offs do not keep playing, but never let that cap hide another
  // changed draft element that visibly continues beyond it.
  const hasPostTrimDraftChange = shortenedTailEnd != null && changedDraft.some((element) =>
    !shortenedTailIds.has(element.id)
    && element.timeline_start + Math.max(0, element.duration) > shortenedTailEnd + 1e-6);
  const playbackTailCap = hasPostTrimDraftChange ? null : shortenedTailEnd;

  return {
    startSeconds: playbackTailCap != null && naturalStart >= playbackTailCap
      ? Math.max(0, playbackTailCap - 1.5)
      : naturalStart,
    endSeconds: playbackTailCap == null ? naturalEnd : Math.min(naturalEnd, playbackTailCap),
  };
}

/**
 * Playback window for one card inside a composite (ticked-set) draft: the card's own rows pick the
 * elements, so its Replay starts at its change rather than at the earliest ticked card. Null when the
 * card names none of the draft's touched elements; the caller then plays the whole set.
 */
export function resolveFocusedProposalPlaybackRange(
  focus: ProposalReviewLike,
  touchedElementIds: string[],
  draftElements: TimelineWindow[],
  baseElements: TimelineWindow[],
): AuditionPlaybackRange | null {
  const focusIds = new Set(focus.rows.flatMap((row) => row.element_id ? [row.element_id] : []));
  const ids = touchedElementIds.filter((id) => focusIds.has(id));
  if (ids.length === 0 && !focus.preview_range) return null;
  return resolveProposalPlaybackRange(ids, draftElements, baseElements, focus);
}

const CAPTION_VISUAL_KEYS = [
  "text",
  "fontPreset",
  "fontSizePx",
  "styleVariant",
  "positionPreset",
  "maxWidth",
  "absX",
  "absY",
  "offsetX",
  "offsetY",
  "textAlign",
  "textColor",
  "timingMode",
  "activeWordColor",
] as const;

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 1e-6;
}

function sameCaptionCue(left: TimelineWindow, right: TimelineWindow) {
  if (!sameNumber(left.timeline_start, right.timeline_start) || !sameNumber(left.duration, right.duration)) {
    return false;
  }
  return CAPTION_VISUAL_KEYS.every((key) => left.props?.[key] === right.props?.[key]);
}

function sameWindow(left: TimelineWindow, right: TimelineWindow) {
  if (
    !sameNumber(left.timeline_start, right.timeline_start)
    || !sameNumber(left.duration, right.duration)
    || left.type !== right.type
    || left.source_url !== right.source_url
    || left.lane_key !== right.lane_key
    || left.lane_index !== right.lane_index
    || left.trim_start !== right.trim_start
    || left.trim_end !== right.trim_end
    || left.volume !== right.volume
    || left.fade_in !== right.fade_in
    || left.fade_out !== right.fade_out
    || left.playback_rate !== right.playback_rate
  ) {
    return false;
  }
  // Existing elements must include every prop change, including fill media and
  // animation controls. Cue matching is only for replacement caption rails.
  return JSON.stringify(left.props ?? null) === JSON.stringify(right.props ?? null);
}

function tailTrimFocusWindow(
  base: TimelineWindow,
  draft: TimelineWindow,
): TimelineWindow | null {
  if (
    !sameNumber(base.timeline_start, draft.timeline_start)
    || sameNumber(base.duration, draft.duration)
    || base.type !== draft.type
    || base.source_url !== draft.source_url
    || base.lane_key !== draft.lane_key
    || base.lane_index !== draft.lane_index
    || base.trim_start !== draft.trim_start
    || base.volume !== draft.volume
    || base.fade_in !== draft.fade_in
    || base.fade_out !== draft.fade_out
    || base.playback_rate !== draft.playback_rate
    || JSON.stringify(base.props ?? null) !== JSON.stringify(draft.props ?? null)
  ) {
    return null;
  }

  const baseEnd = base.timeline_start + Math.max(0, base.duration);
  const draftEnd = draft.timeline_start + Math.max(0, draft.duration);
  const focusStart = Math.max(base.timeline_start, Math.min(baseEnd, draftEnd) - 1.5);
  return {
    ...draft,
    timeline_start: focusStart,
    duration: Math.max(baseEnd, draftEnd) - focusStart,
  };
}

/** Below this share of a track's range, keyframe values count as still (eased tails, rounding). */
const KEYFRAME_STILL_SHARE = 0.01;

/**
 * A prop-only change whose keyframes move part-way through a long clip (a zoom on one moment of a
 * screen recording) starts where that motion starts: static prop changes beside it show anywhere in
 * the clip, so the moving part decides where the window begins.
 */
function keyframedChangeWindow(
  base: TimelineWindow,
  draft: TimelineWindow,
): TimelineWindow | null {
  if (!sameWindow({ ...base, props: null }, { ...draft, props: null })) return null;
  const baseTracks = keyframeTracks(base.props);
  const draftTracks = keyframeTracks(draft.props);
  let motionStart = Number.POSITIVE_INFINITY;
  for (const [field, frames] of Object.entries(draftTracks)) {
    if (JSON.stringify(frames) === JSON.stringify(baseTracks[field] ?? null)) continue;
    motionStart = Math.min(motionStart, keyframeMotionStart(frames));
  }
  if (!Number.isFinite(motionStart) || motionStart <= 0 || motionStart >= draft.duration) return null;
  return { ...draft, timeline_start: draft.timeline_start + motionStart, duration: draft.duration - motionStart };
}

function keyframeTracks(props: Record<string, unknown> | null | undefined): Record<string, Array<{ t: number; v: unknown }>> {
  const keyframes = props?.keyframes;
  if (!keyframes || typeof keyframes !== "object") return {};
  return Object.fromEntries(Object.entries(keyframes as Record<string, unknown>).flatMap(([field, frames]) =>
    Array.isArray(frames) ? [[field, frames.filter((frame): frame is { t: number; v: unknown } =>
      Boolean(frame) && typeof frame === "object" && Number.isFinite((frame as { t?: unknown }).t))
      .sort((left, right) => left.t - right.t)]] : []));
}

/** Clip-local time of the last keyframe before the track first leaves its opening value (0 when it moves at once). */
function keyframeMotionStart(frames: Array<{ t: number; v: unknown }>): number {
  if (frames.length < 2) return 0;
  const first = frames[0]!;
  const numbers = frames.every((frame) => typeof frame.v === "number");
  const values = numbers ? frames.map((frame) => frame.v as number) : [];
  const tolerance = numbers ? (Math.max(...values) - Math.min(...values)) * KEYFRAME_STILL_SHARE : 0;
  for (let index = 1; index < frames.length; index += 1) {
    const moved = numbers
      ? Math.abs((frames[index]!.v as number) - (first.v as number)) > tolerance
      : JSON.stringify(frames[index]!.v) !== JSON.stringify(first.v);
    if (moved) return Math.max(0, frames[index - 1]!.t);
  }
  return Number.POSITIVE_INFINITY;
}
