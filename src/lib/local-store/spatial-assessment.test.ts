import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createProject, readTimeline, writeTimeline } from './store';
import { writeAssetBindings, writeManifest } from './media-analysis';
import { publishMediaContextDataset } from './media-context';
import { mediaAnalysisContentDir, projectMediaDir } from './paths';
import { assessProjectSpatial } from './spatial-assessment';
import { discreteObservationCoverage } from '../media-analysis/observation-coverage';
import type { AnalysisManifest, StageRecord } from '../media-analysis/schema';
import type { TimelineElement } from '../../components/studio/timeline/types';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
test('assessment verifies evidence integrity and invalidates snapshots for source, draft, and stage changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spatial-evidence-test-'));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject('fixture', 'web');
    const source = path.join(projectMediaDir('fixture'), 'synthetic.mp4');
    fs.writeFileSync(source, 'synthetic fixture bytes, not detector evidence');
    const stat = fs.statSync(source), fingerprint = hash(fs.readFileSync(source, 'utf8'));
    writeAssetBindings('fixture', { schema_version: 1, assets: [{ asset_id: 'a', project_id: 'fixture', relative_path: 'synthetic.mp4', kind: 'video',
      size_bytes: stat.size, mtime_ms: stat.mtimeMs, fingerprint_sha256: fingerprint, current_job_id: null, updated_at: new Date().toISOString() }] });
    const track = { track_id: 'synthetic-face', label: 'face', samples: [{ time_seconds: 0, confidence: 1, box: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 } }] };
    const bytes = JSON.stringify({ tracks: [track] });
    const record = { cache_key: 'tracks-v2', status: 'completed', artifact_path: 'tracks.json', artifact_sha256: hash(bytes) } as StageRecord;
    const manifest = { schema_version: 2, fingerprint_sha256: fingerprint, source_size_bytes: stat.size,
      probe: { width: 1080, height: 1920, sample_aspect_ratio: '1:1', display_rotation_degrees: 0 },
      attempts: [], stage_records: { semantic_tracks: record }, stages: { semantic_tracks: 'completed' }, updated_at: new Date().toISOString() } as unknown as AnalysisManifest;
    writeManifest(manifest);
    fs.writeFileSync(path.join(mediaAnalysisContentDir(fingerprint), 'tracks.json'), bytes);
    const revision = { dataset_id: 'semantic_tracks', revision_id: 'tracks-v2', kind: 'anonymous_person_face_tracks', evidence_level: 'L2' as const,
      producer: { name: 'synthetic-fixture', version: '1', recipe_version: '1' }, input_revision_ids: [],
      coverage: discreteObservationCoverage([0], 1), coordinate_space: { system: 'normalized_display_source' as const, width: 1080, height: 1920 },
      summary: {}, artifact: { relative_path: 'tracks.json', sha256: hash(bytes), media_type: 'application/json' }, supersedes_revision_id: null, created_at: new Date().toISOString() };
    publishMediaContextDataset(fingerprint, revision);
    const visual = { id: 'v', project_id: 'fixture', type: 'video_clip', lane_key: 'visual_0', timeline_start: 0, duration: 1, playback_rate: 1,
      props: {}, source_url: '/api/projects/fixture/media/synthetic.mp4' } as TimelineElement;
    const caption = { ...visual, id: 'c', type: 'caption_text', lane_key: 'captions_0', source_url: null, props: { text: 'Synthetic', absX: 0.4, absY: 0.4 } } as TimelineElement;
    writeTimeline('fixture', { elements: [visual, caption], transitions: [] }, 'fixture');
    const timeline = readTimeline('fixture');
    const first = assessProjectSpatial('fixture', timeline);
    assert.equal(first.status, 'sampled');
    assert.equal(first.observations.length, 1);
    assert.equal(assessProjectSpatial('fixture', timeline).snapshot_id, first.snapshot_id);
    const moved = { ...timeline, elements: timeline.elements.map(e => e.id === 'v' ? { ...e, props: { media_offset_x: 1 } } : e) };
    assert.notEqual(assessProjectSpatial('fixture', moved).snapshot_id, first.snapshot_id);
    fs.writeFileSync(path.join(mediaAnalysisContentDir(fingerprint), 'tracks.json'), '{}');
    const corrupt = assessProjectSpatial('fixture', timeline);
    assert.equal(corrupt.status, 'unknown');
    assert.ok(corrupt.limitations.some(l => l.includes('checksum')));
    fs.writeFileSync(path.join(mediaAnalysisContentDir(fingerprint), 'tracks.json'), bytes);
    record.status = 'stale'; writeManifest(manifest);
    assert.equal(assessProjectSpatial('fixture', timeline).status, 'unknown');
    record.status = 'completed'; writeManifest(manifest);
    fs.appendFileSync(source, 'changed');
    assert.ok(assessProjectSpatial('fixture', timeline).limitations.some(l => l.includes('Source changed')));
    assert.throws(() => publishMediaContextDataset(fingerprint, { ...revision, revision_id: 'invalid', supersedes_revision_id: 'tracks-v2', coverage: { ...revision.coverage, status: 'complete' } }), /cannot certify/);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
