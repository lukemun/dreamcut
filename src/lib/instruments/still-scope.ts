import type { BrowserStillOptions } from '../render/browser-renderer';

// Deliberately closed: unrecognised effects may depend on another row or extend
// its visible lifetime. Such compositions retain the full dependency key.
const independentFields = new Set(['id','type','source_url','props','timeline_start','duration','lane_key','lane_index','volume','playback_rate','trim_start','trim_end','fade_in','fade_out','transition_in','transition_out']);
const independentProps = new Set(['text','fontFamily','fontSizePx','fontWeight','color','activeWordColor','timingMode','bottomPercent','maxWidthPercent','lineHeight','styleVariant','textAlign','absX','absY','anchorX','anchorY','positionPreset','media_scale','media_offset_x','media_offset_y','media_opacity','objectFit','has_alpha','source_aspect_ratio','source_width','source_height']);

/** Key projection only. Always render the original, complete composition. */
export function scopeStillRequest(request: BrowserStillOptions): BrowserStillOptions {
  const elements = request.inputProps.elements;
  const fps = request.fps ?? 30;
  if (request.fixtureId || !Array.isArray(elements) || !(fps > 0)) return request;
  const lanes = request.inputProps.laneOrderKeys;
  if (!Array.isArray(lanes) || elements.some(el => !lanes.includes(el.lane_key))) return request;
  if (elements.some(el => !['video_clip','still','caption_text'].includes(el.type)
    || Object.keys(el).some(key => !independentFields.has(key))
    || el.transition_in || el.transition_out
    || !Number.isFinite(el.timeline_start) || !Number.isFinite(el.duration)
    || Object.keys(el.props ?? {}).some(key => !independentProps.has(key)))) return request;
  // Caption safe-area resolution can consult a visual outside its own window.
  const hasCaptions = elements.some(el => el.type === 'caption_text');
  const retained = elements.filter(el => {
    if (hasCaptions && el.type !== 'caption_text') return true;
    // Extra boundary frames cover both rounded-end and rounded-duration clocks.
    const start = Math.floor(el.timeline_start * fps) - 1;
    const end = Math.ceil((el.timeline_start + el.duration) * fps) + 1;
    return request.frame >= start && request.frame <= end;
  });
  return { ...request, inputProps: { ...request.inputProps, elements: retained } };
}
