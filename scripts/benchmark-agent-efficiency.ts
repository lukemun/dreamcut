/** Read-only workload comparisons. Does not edit a project, render delivery or adopt learning. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStillDependencyHasher } from '../src/lib/instruments/still-cache';
import type { BrowserStillOptions } from '../src/lib/render/browser-renderer';

const output = path.resolve('testing/results/agent-efficiency');
fs.mkdirSync(output, { recursive: true });
for (const file of ['dependencies.json','measurements.json','brief.json']) fs.writeFileSync(path.join(output, file), JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const request: BrowserStillOptions = { baseUrl: 'http://127.0.0.1:3123', output: 'unused.png', width: 320, height: 180, durationInFrames: 60, frame: 0, inputProps: { elements: [] } };
const samples = { baseline: [] as number[], candidate: [] as number[] };
const evidence = [];
for (let round = 0; round < 7; round++) {
  for (const mode of (round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) as Array<keyof typeof samples>) {
    const hash = createStillDependencyHasher(process.cwd(), { reuseDirectoryListings: mode === 'candidate' });
    const expected = hash(request);
    assert.ok(expected, 'Cannot establish dependency hashes for this checkout');
    const started = performance.now();
    for (let frame = 0; frame < 20; frame++) assert.equal(hash({ ...request, frame }), expected);
    const elapsedMs = performance.now() - started;
    samples[mode].push(elapsedMs);
    evidence.push({ round, mode, elapsedMs, ...hash.stats });
  }
}
fs.mkdirSync(output, { recursive: true });
const baselineMs = median(samples.baseline), candidateMs = median(samples.candidate);
const result = { status: 'passed', candidate: 'directory-listing-snapshot', checkedAt: new Date().toISOString(), baselineMs, candidateMs,
  speedup: baselineMs / candidateMs, improved: candidateMs < baselineMs * .95, evidence,
  limits: 'Seven alternating warm trials of 20 dependency checks on the local checkout. Both arms re-stat every dependency and rehash changed bytes; no agent waiting-time claim.' };
fs.writeFileSync(path.join(output, 'dependencies.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

async function benchmarkMeasurementsAndBrief() {
  const { measureRenderedDifferenceBounds } = await import('../src/lib/instruments/rendered-ink');
  const { createMeasurementCache } = await import('../src/lib/instruments/measurement-cache');
  const { frameChangeBrief } = await import('../src/lib/instruments/frame-change-brief');
  const withCaption = path.resolve('testing/results/still-session/fresh-2-15-caption.png');
  const withoutCaption = path.resolve('testing/results/still-session/fresh-3-15-clean.png');
  assert.ok(fs.existsSync(withCaption), 'Run verify:still-session first to supply real renderer fixtures');
  const directory = fs.mkdtempSync(path.join(output, 'measurement-'));
  const canvas = { width: 320, height: 180 };
  const expected = measureRenderedDifferenceBounds(withCaption, withoutCaption, canvas);
  assert.ok(expected, 'Fixture must contain visible caption ink');
  const cache = createMeasurementCache(directory, 'benchmark-real-pixels-v1');
  const measure = () => cache.measure('ink', [withCaption, withoutCaption], canvas, () => measureRenderedDifferenceBounds(withCaption, withoutCaption, canvas));
  assert.deepEqual(measure(), expected);
  const times = { baseline: [] as number[], candidate: [] as number[] };
  for (let round = 0; round < 7; round++) for (const mode of (round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) as Array<keyof typeof times>) {
    const start = performance.now();
    for (let i = 0; i < 5; i++) assert.deepEqual(mode === 'baseline' ? measureRenderedDifferenceBounds(withCaption, withoutCaption, canvas) : measure(), expected);
    times[mode].push(performance.now() - start);
  }
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ status: 'passed', baselineMs: median(times.baseline), candidateMs: median(times.candidate), speedup: median(times.baseline) / median(times.candidate), equalBounds: expected, cache: cache.stats, times, limits: 'Seven alternating trials of five real FFmpeg ink measurements. Does not skip browser font measurement or measure whole-run latency.' }, null, 2));
  const fullReportPath = path.join(output, 'synthetic-frame-report.json');
  const exemplar = { atSeconds: 0, frame: 0, canvas, layers: [{ id: 'actor', type: 'video_clip', laneKey: 'visual_0', z: 0, localSeconds: 0 }], caption: { text: 'Same pixels', inkBox: expected, font: { preset: 'clean_sans', sizePx: 28 }, safeAreaViolations: [] }, spatialRelations: [], read: { status: 'unchanged', stillSha256: 'a'.repeat(64), overlaySha256: 'b'.repeat(64) } };
  const report = { projectId: 'synthetic-efficiency', createdAt: new Date().toISOString(), readDelta: { previousReportAt: 'previous' }, states: Array.from({ length: 100 }, (_, i) => ({ ...exemplar, atSeconds: i, frame: i * 30, read: { ...exemplar.read, status: i === 50 ? 'changed' : 'unchanged' } })) };
  const reportBytes = JSON.stringify(report);
  fs.writeFileSync(fullReportPath, reportBytes);
  const briefBytes = JSON.stringify(frameChangeBrief(report, fullReportPath, reportBytes, []));
  const parse = { baseline: [] as number[], candidate: [] as number[] };
  for (let round = 0; round < 7; round++) for (const mode of (round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) as Array<keyof typeof parse>) {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) assert.ok(JSON.parse(mode === 'baseline' ? reportBytes : briefBytes));
    parse[mode].push(performance.now() - start);
  }
  fs.writeFileSync(path.join(output, 'brief.json'), JSON.stringify({ status: 'passed', fullBytes: Buffer.byteLength(reportBytes), briefBytes: Buffer.byteLength(briefBytes), baselineParseMs: median(parse.baseline), briefParseMs: median(parse.candidate), speedup: median(parse.baseline) / median(parse.candidate), samples: parse, limits: 'Synthetic 100-sample report using measured caption bounds, one changed sample. Size and JSON parsing cost only; no model reasoning or user-wait measurement.' }, null, 2));
  console.log('Measurement and brief comparisons written to ' + output);
}
benchmarkMeasurementsAndBrief().catch(error => { console.error(error); process.exitCode = 1; });
