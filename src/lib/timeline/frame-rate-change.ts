import {isVisualElementType, quantizeVisualFrameSpan, quantizeVisualTrimValue} from './frame-quantization';

type Timed = {type: string; timeline_start: number; duration: number; trim_start: number; trim_end: number | null};

/**
 * Re-snap visual clips to a new project frame rate. Picture spans persist on frame
 * boundaries; after a rate change they must sit on the new grid, or the editor and the
 * renderers round the same seconds to different frames. Clips that touched before still
 * touch, because each boundary is converted from the same seconds value. Captions and
 * audio keep their exact times, as they always have.
 */
export function requantizeTimelineForFrameRate<T extends Timed>(elements: readonly T[], fps: number): T[] {
  return elements.map(element => {
    if (!isVisualElementType(element.type)) return element;
    const span = quantizeVisualFrameSpan(element.timeline_start, element.duration, {fps});
    const next = {...element, timeline_start: span.timeline_start, duration: span.duration};
    if (element.type === 'video_clip') {
      next.trim_start = quantizeVisualTrimValue(element.trim_start, fps);
      if (element.trim_end != null) next.trim_end = quantizeVisualTrimValue(element.trim_end, fps);
    }
    return next;
  });
}
