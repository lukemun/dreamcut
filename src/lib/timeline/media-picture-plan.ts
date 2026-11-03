import {currentFrameRate} from './frame-rate-scope';
import {resolveMediaTiming} from './media';
import {COMPOSITION_FPS, quantizeVisualFrameSpan, toVisualFrame} from './frame-quantization';
import {getSpeedSourceWindow, isPlaybackReversed, resolveSpeedStepSegments, speedStepFrame} from './speed-steps';

type Media = Parameters<typeof resolveMediaTiming>[0];

/** Source-frame boundaries shared by moving picture and its head/tail holds. */
export function mediaPictureTrimWindow(element: Media, fps: number = currentFrameRate()) {
  const timing = resolveMediaTiming(element);
  const visibleFrames = Math.max(1, toVisualFrame(timing.visibleSourceDuration, fps));
  // A reversed clip uses the end of its source window, so a shortened one keeps its first frames.
  const windowEnd = isPlaybackReversed(element) ? getSpeedSourceWindow(element).end : null;
  if (windowEnd != null) {
    const sourceEndFrame = Math.max(visibleFrames, toVisualFrame(windowEnd, fps));
    return {trimBefore: sourceEndFrame - visibleFrames, trimAfter: sourceEndFrame, sourceEndFrame};
  }
  const trimBefore = Math.max(0, toVisualFrame(timing.trimStart, fps));
  const sourceEndFrame = trimBefore + visibleFrames;
  return {trimBefore, trimAfter: sourceEndFrame, sourceEndFrame};
}

/** The sequence plan used by the standard composition and alternate frame providers.
 * Keep source duration, authored timeline duration and leading/trailing holds distinct.
 */
export function mediaPicturePlan(element: Media, video = true, fps: number = currentFrameRate()) {
  const timing = resolveMediaTiming(element);
  const span = quantizeVisualFrameSpan(element.timeline_start ?? 0, element.duration, {fps, minFrames: 1});
  const leadingHoldDurationSec = video ? timing.leadingHoldDuration : 0;
  const leadingHoldFrames = Math.max(0, toVisualFrame(leadingHoldDurationSec, fps));
  const remaining = Math.max(0, element.duration - leadingHoldDurationSec);
  const playableDurationSec = Math.min(remaining, timing.maxPlayableTimelineDuration);
  const playableDurationFrames = Math.max(1, toVisualFrame(playableDurationSec, fps));
  const speedSegments = resolveSpeedStepSegments(element)
    .filter(segment => segment.timelineStart < playableDurationSec - 0.0005)
    .map(segment => {
      const timelineEnd = Math.min(segment.timelineEnd, playableDurationSec);
      const used = (timelineEnd - segment.timelineStart) * segment.playbackRate;
      // A shortened reversed clip still begins at its source end.
      return segment.reverse ? {...segment, timelineEnd, sourceStart: Math.max(segment.sourceStart, segment.sourceEnd - used)}
        : {...segment, timelineEnd, sourceEnd: Math.min(segment.sourceEnd, segment.sourceStart + used)};
    });
  // Incomplete legacy source metadata still needs an identical picture/audio plan.
  const playbackSegments = speedSegments.length ? speedSegments : [{index: 0,
    timelineStart: 0, timelineEnd: playableDurationSec, sourceStart: timing.trimStart,
    sourceEnd: timing.trimStart + timing.visibleSourceDuration, playbackRate: element.playback_rate,
    ...(isPlaybackReversed(element) ? {reverse: true} : {})}];
  const overflowDurationFrames = Math.max(0, span.durationFrames - leadingHoldFrames - playableDurationFrames);
  return {span, leadingHoldFrames, playableDurationFrames, overflowDurationFrames, playbackSegments};
}

/** Absolute timeline frame to authored source clock, with the same quantized holds. */
export function mediaPictureAtFrame(element: Media, frame: number, fps: number = currentFrameRate()) {
  const plan = mediaPicturePlan(element, true, fps);
  if (frame < plan.span.startFrame || frame >= plan.span.endFrame) return null;
  const localFrame = frame - plan.span.startFrame;
  const trim = mediaPictureTrimWindow(element, fps);
  // Holds freeze whichever source frame the clip shows first or last.
  const reversed = isPlaybackReversed(element);
  const firstFrame = reversed ? Math.max(0, trim.sourceEndFrame - 1) : trim.trimBefore;
  const lastFrame = reversed ? trim.trimBefore : Math.max(0, trim.sourceEndFrame - 1);
  if (localFrame < plan.leadingHoldFrames) return {phase: 'head' as const, localFrame, sourceTimeSeconds: firstFrame / fps};
  if (localFrame >= plan.leadingHoldFrames + plan.playableDurationFrames) {
    return {phase: 'tail' as const, localFrame, sourceTimeSeconds: lastFrame / fps};
  }
  const mapped = speedStepFrame(plan.playbackSegments, localFrame - plan.leadingHoldFrames, fps);
  // Render media clamps decoded targets inside its rounded trim interval.
  const start = toVisualFrame(plan.playbackSegments[0]!.sourceStart, fps) / fps;
  const end = toVisualFrame(plan.playbackSegments.at(-1)!.sourceEnd, fps) / fps;
  return {phase: 'moving' as const, localFrame, ...mapped,
    sourceTimeSeconds: Math.max(start, Math.min(mapped.sourceTimeSeconds, end - .00001))};
}
