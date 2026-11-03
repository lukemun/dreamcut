import { resolveCaptionProps, resolveCaptionAnchorLayout, resolveCaptionContentRect, resolveCaptionCoordinateAspectRatio } from '../timeline/captions';
import type { CaptionMeasurements } from '../qc/measure-captions';
import type { TimelineElement } from '../../components/studio/timeline/types';
import type { AnonymousTrack } from './semantic-tracks';
import { resolveMediaScene, projectMediaScene, MEDIA_SCENE_VERSION } from '../timeline/resolved-media-scene';
import { projectVisibleNormalizedSourceBox, intersectProjectionRects } from '../timeline/source-projection';
import { assessVisualOverlap, type SpatialAssessmentScope, type VisualOverlap } from './visual-overlap';
import type { AlphaFootprintEvidence } from './alpha-footprint';

export type SpatialSourceEvidence = {
  revision: string; source_id: string; status: 'sampled' | 'unknown'; reason: string | null;
  width: number; height: number; observed_times: number[]; tracks: AnonymousTrack[];
};
export type SpatialAssessment = {
  schema_version: 1; scene_version: string; snapshot_id: string;
  status: 'sampled' | 'unknown' | 'not_applicable';
  caption_measurement: 'estimated' | 'loaded_font';
  observations: Array<{ caption_id: string; visual_id: string; track_id: string; evidence_revision: string; source_id: string;
    at_seconds: number; source_seconds: number; overlap_fraction: number; confidence: number; source_box: { x: number; y: number; width: number; height: number };
    composition_box: { x: number; y: number; width: number; height: number }; caption_box: { x: number; y: number; width: number; height: number }; statement: string }>;
  limitations: string[];
  examined_samples: number;
  visual_overlap: VisualOverlap;
};

/** L2 description only. No recommendation and no claim of continuous clearance.
 * Only real observations are projected; no interpolated faces are invented. */
export function assessSpatialComposition(input: {
  elements: TimelineElement[]; lane_order: string[]; canvas: { width: number; height: number };
  safe_area?: { x: number; y: number; width: number; height: number };
  safe_area_rail?: { top: number; right_edge: number };
  sources: Record<string, SpatialSourceEvidence>; snapshot_id: string;
  transition_count?: number; measurements?: CaptionMeasurements; hidden_lanes?: string[];
  alpha_footprints?: Record<string,AlphaFootprintEvidence>;
  scope?: SpatialAssessmentScope;
}): SpatialAssessment {
  const captions = input.elements.filter(e => !e.removed_at && !input.hidden_lanes?.includes(e.lane_key) && e.type === 'caption_text');
  const visuals = input.elements.filter(e => !e.removed_at && !input.hidden_lanes?.includes(e.lane_key) && (e.type === 'video_clip' || e.type === 'still'));
  const limits = new Set<string>();
  const observations: SpatialAssessment['observations'] = [];
  let examined = 0;
  const sourceAspect = (e: TimelineElement | undefined) => typeof e?.props?.source_width === 'number' && typeof e.props.source_height === 'number'
    && e.props.source_width > 0 && e.props.source_height > 0 ? e.props.source_width / e.props.source_height : null;
  const captionVisuals = visuals.filter(v => v.source_url).slice().sort((a, b) => a.timeline_start - b.timeline_start);
  const inScope = (at: number) => !input.scope || input.scope.time_ranges.some((range) => at >= range.start_seconds && at <= range.end_seconds);
  const focused = new Set(input.scope?.focus_element_ids ?? []);
  if (captions.length && !input.measurements) limits.add('Caption footprints are estimates; use measured text or frame-state before judging appearance.');
  if (input.transition_count) limits.add('Transitions have not been spatially resolved in this version.');
  for (const visual of visuals) {
    const relevant = captions.filter(c => c.timeline_start < visual.timeline_start + visual.duration
      && c.timeline_start + c.duration > visual.timeline_start
      && (!focused.size || focused.has(visual.id) || focused.has(c.id)));
    if (!relevant.length) continue;
    const evidence = input.sources[visual.id];
    if (!evidence || evidence.status === 'unknown') { limits.add(`${visual.id}: ${evidence?.reason ?? 'No source observations are available.'}`); continue; }
    if (!(evidence.width > 0 && evidence.height > 0)) { limits.add(`${visual.id}: Source dimensions are unavailable.`); continue; }
    limits.add('Source observations are discrete samples. Between-sample clearance and detector accuracy are not certified.');
    const rate = visual.playback_rate > 0 ? visual.playback_rate : 1;
    for (const sourceTime of evidence.observed_times) {
      const at = visual.timeline_start + (sourceTime - (visual.trim_start ?? 0)) / rate;
      if (at < visual.timeline_start || at >= visual.timeline_start + visual.duration) continue;
      if (!inScope(at)) continue;
      const active = relevant.filter(c => at >= c.timeline_start && at < c.timeline_start + c.duration);
      if (!active.length) continue;
      const scene = resolveMediaScene(visual.props, at - visual.timeline_start, input.canvas);
      if (scene.opacity <= 0) continue;
      if (scene.geometry_support === 'unknown' || input.transition_count) {
        limits.add(`${visual.id}: Unsupported spatial treatment: ${scene.unsupported.join(', ') || 'transition'}.`); continue;
      }
      let resolvedSample = false;
      const projected = projectMediaScene(scene, { source_width: evidence.width, source_height: evidence.height,
        composition_width: input.canvas.width, composition_height: input.canvas.height, fit: 'contain',
        timeline_time_seconds: at, timeline_start_seconds: visual.timeline_start, source_trim_start_seconds: visual.trim_start ?? 0, playback_rate: rate });
      for (const caption of active) {
        const raw = caption.props ?? {};
        const p = resolveCaptionProps(raw);
        if (raw.surface_track || raw.keyframes || p.surfaceMode === 'wall' || p.animationIn !== 'none' || p.animationOut !== 'none'
          || p.textScaleX !== 1 || p.textScaleY !== 1 || raw.ticker_motion || raw.scan_reveal_line || raw.text_mask_url
          || ['camera_reveal', 'inverse', 'image_fill'].includes(p.styleVariant) || p.timingMode === 'single_word') {
          limits.add(`${caption.id}: Animated or transformed caption footprint is unsupported.`); continue;
        }
        if (!resolvedSample) { examined++; resolvedSample = true; }
        const anchorVisual = captionVisuals.find(v => caption.timeline_start >= v.timeline_start && caption.timeline_start < v.timeline_start + v.duration) ?? captionVisuals[0];
        const content = resolveCaptionContentRect(resolveCaptionCoordinateAspectRatio(sourceAspect(caption), sourceAspect(anchorVisual)), input.canvas.width / input.canvas.height);
        const width = p.maxWidth * content.width * input.canvas.width;
        const measured = input.measurements?.[caption.id];
        const chars = Math.max(1, Math.floor(width / (p.fontSizePx * 0.5)));
        const lines = p.text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / chars)), 0);
        const height = measured?.height ?? lines * p.fontSizePx * 1.2;
        const anchors = resolveCaptionAnchorLayout(p, content);
        const x = anchors.x * input.canvas.width - anchors.anchorX * width
          + (p.absX == null ? p.offsetX * content.width * input.canvas.width : 0);
        const y = anchors.y * input.canvas.height - anchors.anchorY * height
          + (p.absY == null ? p.offsetY * content.height * input.canvas.height : 0);
        const rect = { x, y, width, height };
        for (const track of evidence.tracks) {
          for (const sample of track.samples.filter(s => Math.abs(s.time_seconds-sourceTime) < 1e-6)) {
            const region = projectVisibleNormalizedSourceBox(sample.box, projected);
            if (!region) continue;
            const intersection = intersectProjectionRects(rect, region);
            const fraction = intersection ? intersection.width * intersection.height / (region.width * region.height) : 0;
            const captionLane = input.lane_order.indexOf(caption.lane_key);
            const visualLane = input.lane_order.indexOf(visual.lane_key);
            const layerStatement = captionLane >= 0 && visualLane >= 0
              ? captionLane < visualLane ? 'Caption lane is above the visual lane.' : 'Caption lane is not above the visual lane.'
              : 'Layer ordering is unresolved.';
            const measured = Boolean(input.measurements?.[caption.id]);
            if (observations.length >= 500) { limits.add('Response is limited to 500 relationships; it is not a full interval report.'); continue; }
            observations.push({ caption_id: caption.id, visual_id: visual.id, track_id: track.track_id,
              evidence_revision: evidence.revision, source_id: evidence.source_id, at_seconds: Number(at.toFixed(6)), source_seconds: sourceTime,
              overlap_fraction: Number(fraction.toFixed(6)), confidence: sample.confidence, source_box: sample.box, composition_box: region, caption_box: rect,
              statement: `At ${at.toFixed(2)}s, ${measured ? 'loaded-font' : 'estimated'} caption ${caption.id} ${fraction > 0 ? `intersects ${(fraction*100).toFixed(1)}% of` : 'does not intersect'} the detected ${track.label} box ${track.track_id}. ${layerStatement} Pixel occlusion is unmeasured.` });
          }
        }
      }
    }
  }
  if (examined === 0 && captions.length) limits.add('No relevant examined source samples support this composition. Missing detections are not evidence of clear space.');
  if (observations.length > 500) limits.add('Response is limited to 500 relationships; it is not a full interval report.');
  return { schema_version: 1, scene_version: MEDIA_SCENE_VERSION, snapshot_id: input.snapshot_id,
    status: !captions.length ? 'not_applicable' : examined ? 'sampled' : 'unknown',
    caption_measurement: captions.length > 0 && captions.every(c => input.measurements?.[c.id]) ? 'loaded_font' : 'estimated',
    observations: observations.slice(0,500), limitations: [...limits], examined_samples: examined,
    visual_overlap: assessVisualOverlap(input) };
}
