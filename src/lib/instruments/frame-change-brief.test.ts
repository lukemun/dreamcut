import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { frameChangeBrief } from './frame-change-brief';

test('brief preserves changed/new samples and lost coverage, with a verifiable full-report link', () => {
  const report = { projectId: 'fixture', createdAt: 'now', readDelta: { previousReportAt: 'before' }, states: ['new','changed','unchanged'].map((status, i) => ({ atSeconds: i, frame: i * 30, layers: [{ id: 'actor' }, { id: 'actor' }], read: { status } })) };
  const bytes = JSON.stringify(report);
  const brief = frameChangeBrief(report, '/report.json', bytes, [0, 1, 2, 3]);
  assert.deepEqual(brief.inspect.map(state => state.at_seconds), [0, 1]);
  assert.deepEqual(brief.inspect[0].visible_element_ids, ['actor']);
  assert.deepEqual(brief.unchanged_at, [2]);
  assert.deepEqual(brief.no_longer_sampled_at, [3]);
  assert.equal(brief.evidence.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(brief.next_check, /new question.*unchanged/);
  assert.match(brief.limits, /unsampled intervals remain unverified/);
  const fractional = { ...report, states: [{ ...report.states[0], atSeconds: 1 / 30 }] };
  assert.deepEqual(frameChangeBrief(fractional, '/report.json', JSON.stringify(fractional), [1 / 30]).no_longer_sampled_at, []);
});

test('an unknown status is retained for inspection rather than silently treated as unchanged', () => {
  const report = { projectId: 'fixture', createdAt: 'now', readDelta: { previousReportAt: null }, states: [{ atSeconds: 1, frame: 30, layers: [], read: { status: 'unknown' } }] };
  assert.equal(frameChangeBrief(report, '/report.json', JSON.stringify(report), []).inspect.length, 1);
});

test('unchanged pixels do not hide a failed expectation or safe-area violation', () => {
  const report = { projectId: 'fixture', createdAt: 'now', readDelta: { previousReportAt: 'before' }, states: [{ atSeconds: 1, frame: 30, layers: [], read: { status: 'unchanged' }, caption: { safeAreaViolations: ['bottom'] }, spatialRelations: [{ expectation: { status: 'fail' } }] }] };
  const brief = frameChangeBrief(report, '/report.json', JSON.stringify(report), [1]);
  assert.equal(brief.inspect.length, 0);
  assert.deepEqual(brief.attention, [{ at_seconds: 1, safe_area_violations: ['bottom'], failed_expectations: 1 }]);
});
