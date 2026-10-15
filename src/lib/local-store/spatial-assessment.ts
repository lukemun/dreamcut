import fs from 'node:fs';
import { reelsGuideLines } from '../timeline/reels-guide-layout';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readAssetBindings, readManifest } from './media-analysis';
import { readSourceMediaContext } from './media-context';
import { mediaAnalysisContentDir, projectMediaDir } from './paths';
import { readMetadata, type TimelineFile } from './store';
import { stableJson } from '../media-analysis/stage-cache';
import { assessSpatialComposition, type SpatialSourceEvidence } from '../media-analysis/spatial-assessment';
import { MEDIA_SCENE_VERSION } from '../timeline/resolved-media-scene';
import type { AnonymousTrack } from '../media-analysis/semantic-tracks';
import { VISUAL_OVERLAP_VERSION } from '../media-analysis/visual-overlap';
import type { SpatialAssessmentScope } from '../media-analysis/visual-overlap';
import { loadProjectAlphaFootprints, type AlphaFootprintEvidence } from '../media-analysis/alpha-footprint';
import { safeAreaFor, type DeliveryTarget } from '../qc/standards';
import { getCompositionDimensions } from '../render/composition-adapters';
import type { TimelineAspectRatioValue } from '../aspect-ratios';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function assessProjectSpatial(projectId: string, timeline: TimelineFile,
  laneOrder?: string[], output?: { aspect_ratio?: TimelineAspectRatioValue; delivery_target?: string },
  scope?: SpatialAssessmentScope) {
  const metadata = readMetadata(projectId);
  const bindings = readAssetBindings(projectId).assets;
  const sources: Record<string, SpatialSourceEvidence> = {};
  const alphaByPath=loadProjectAlphaFootprints(projectId);
  const alphaFootprints:Record<string,AlphaFootprintEvidence>={};
  for (const element of timeline.elements.filter(e => !e.removed_at && (e.type === 'video_clip' || e.type === 'still'))) {
    const missing = (reason: string): SpatialSourceEvidence => ({ revision: '', source_id: element.source_url ?? '', status: 'unknown', reason, width: 0, height: 0, observed_times: [], tracks: [] });
    try {
      // Never project an original's observations onto an unrelated derivative.
      const prefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
      if (!element.source_url?.startsWith(prefix)) { sources[element.id] = missing('Source is not a registered local media authority.'); continue; }
      const rel = decodeURIComponent(element.source_url.slice(prefix.length).split('?')[0]!);
      const alpha=alphaByPath.get(rel); if(alpha) alphaFootprints[element.id]=alpha;
      const binding = bindings.find(b => b.relative_path === rel);
      if (!binding?.fingerprint_sha256) { sources[element.id] = missing('Source has not been fingerprinted and analyzed.'); continue; }
      const full = path.resolve(projectMediaDir(projectId), rel);
      if (!full.startsWith(path.resolve(projectMediaDir(projectId)) + path.sep)) throw new Error('Source path escapes project');
      const stat = fs.statSync(full);
      if (stat.size !== binding.size_bytes || stat.mtimeMs !== binding.mtime_ms) throw new Error('Source changed since analysis');
      const manifest = readManifest(binding.fingerprint_sha256);
      const trackStage = manifest?.stage_records.semantic_tracks;
      if (!trackStage || trackStage.status !== 'completed') throw new Error('Track stage is missing, incomplete, or stale');
      const context = readSourceMediaContext(binding.fingerprint_sha256);
      const history = context?.datasets.find(d => d.revisions.some(r => r.dataset_id === 'semantic_tracks'));
      const revision = history?.revisions.find(r => r.revision_id === history.active_revision_id);
      if (!revision?.artifact || revision.coverage.observation_kind !== 'discrete_frames' || !revision.coverage.observed_times_seconds) {
        sources[element.id] = missing('No track evidence with examined-frame coverage. Legacy analysis must be refreshed.'); continue;
      }
      if (revision.revision_id !== trackStage.cache_key) throw new Error('Track evidence does not match the active analysis stage');
      if (revision.coordinate_space.system !== 'normalized_display_source') throw new Error('Unsupported evidence coordinate space');
      if (revision.coverage.status === 'stale' || revision.coverage.status === 'unavailable') throw new Error('Track evidence is stale or unavailable');
      const bytes = fs.readFileSync(path.join(mediaAnalysisContentDir(binding.fingerprint_sha256), revision.artifact.relative_path));
      if (hash(bytes) !== revision.artifact.sha256) throw new Error('Track artifact checksum mismatch');
      const parsed = JSON.parse(bytes.toString()) as { tracks: AnonymousTrack[] };
      if (!Array.isArray(parsed.tracks) || parsed.tracks.length > 10000 || parsed.tracks.some(t =>
        !t || !['face', 'person'].includes(t.label) || typeof t.track_id !== 'string' || !Array.isArray(t.samples)
        || t.samples.some(s => !s || !Number.isFinite(s.time_seconds) || !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1
          || !s.box || ![s.box.x, s.box.y, s.box.width, s.box.height].every(Number.isFinite)
          || s.box.x < 0 || s.box.y < 0 || s.box.width <= 0 || s.box.height <= 0 || s.box.x + s.box.width > 1.000001 || s.box.y + s.box.height > 1.000001))) throw new Error('Track artifact is invalid');
      // Source display rotation/SAR require an explicit mapping, not a guessed one.
      const probe = context?.probe;
      if (probe?.sample_aspect_ratio && !['1:1', '1/1'].includes(probe.sample_aspect_ratio)) throw new Error('Non-square pixels require validated coordinate mapping');
      if (probe?.display_rotation_degrees) throw new Error('Rotated authority requires validated coordinate mapping');
      sources[element.id] = { revision: revision.revision_id, source_id: context!.context_id, status: 'sampled', reason: null,
        width: revision.coordinate_space.width ?? 0, height: revision.coordinate_space.height ?? 0,
        observed_times: revision.coverage.observed_times_seconds, tracks: parsed.tracks };
    } catch (error) { sources[element.id] = missing(error instanceof Error ? error.message : 'Evidence unavailable'); }
  }
  const aspect = output?.aspect_ratio ?? metadata.output_aspect_ratio;
  const canvas = getCompositionDimensions(aspect);
  const safe = safeAreaFor((output?.delivery_target ?? metadata.delivery_target ?? 'web') as DeliveryTarget, canvas, metadata.caption_safe_area_mode);
  const safeArea = { x: safe.left, y: safe.top, width: canvas.width - safe.left - safe.right, height: canvas.height - safe.top - safe.bottom };
  const snapshot = hash(stableJson({ version: MEDIA_SCENE_VERSION, visual_overlap_version: VISUAL_OVERLAP_VERSION, timeline, metadata, output, laneOrder, scope, sources,
    alpha_footprints:Object.fromEntries(Object.entries(alphaFootprints).map(([id,evidence])=>[id,evidence.revision_id])) }));
  return { safe_zone_geometry: {
    editor_reels_guide: reelsGuideLines(canvas.width, canvas.height),
    delivery_qc: { target: output?.delivery_target ?? metadata.delivery_target ?? 'web', coordinate_space: 'canvas_pixels',
      lines: { top: safe.top, bottom: canvas.height - safe.bottom, left: safe.left, right: canvas.width - safe.right,
        ...(safe.rail ? { action_rail_top: safe.rail.belowFraction * canvas.height, action_rail_left: canvas.width - safe.rail.right } : {}) } },
  }, ...assessSpatialComposition({ elements: timeline.elements, canvas, lane_order: laneOrder ?? metadata.lane_order_keys,
    safe_area: safeArea,
    ...(safe.rail ? { safe_area_rail: { top: safe.rail.belowFraction * canvas.height, right_edge: canvas.width - safe.rail.right } } : {}),
    hidden_lanes: metadata.hidden_lane_keys, transition_count: timeline.transitions.filter(t => !t.removed_at).length, sources, alpha_footprints:alphaFootprints,snapshot_id: snapshot,
    ...(scope ? { scope } : {}) }) };
}
