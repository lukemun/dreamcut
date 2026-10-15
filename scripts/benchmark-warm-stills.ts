import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { createProject } from '../src/lib/local-store/store';
import { projectDir, projectMediaDir } from '../src/lib/local-store/paths';

async function main() {
  assert.ok(process.env.TIMELINE_PROJECTS_DIR, 'Set TIMELINE_PROJECTS_DIR to the same isolated test storage as the server');
  const projectId = `warm-benchmark-${randomUUID()}`;
  createProject(projectId, 'web');
  try {
  fs.mkdirSync(projectMediaDir(projectId), { recursive: true });
  const media = path.join(projectMediaDir(projectId), 'clock.mp4');
  execFileSync('ffmpeg', ['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=2','-c:v','libx264','-pix_fmt','yuv420p',media]);
  const root = path.resolve('testing/results/agent-efficiency/warm'); fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }));
  const requestPath = path.join(root, 'request.json');
  const request = { baseUrl: process.env.TIMELINE_EDITOR_BASE_URL ?? 'http://127.0.0.1:3137', width: 320, height: 180, durationInFrames: 61,
    inputProps: { elements: [{ id: 'video', type: 'video_clip', source_url: `/api/projects/${projectId}/media/clock.mp4`, props: { source_width: 320, source_height: 180 }, timeline_start: 0, duration: 2, lane_key: 'visual_0', lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0 }], laneOrderKeys: ['visual_0'] } };
  fs.writeFileSync(requestPath, JSON.stringify(request));
  const samples: Array<{ mode: string; elapsedMs: number; stats: { browserLaunches: number; captures: number }; output: string }> = [];
  const trial = (mode: string, name: string) => {
    const output = path.join(root, name);
    const started = performance.now();
    const value = JSON.parse(execFileSync(process.execPath, ['--import','tsx','scripts/warm-still-trial.ts',mode,requestPath,output], { encoding: 'utf8', timeout: 120_000 }));
    return { ...value, output, processWallMs: performance.now() - started };
  };
  const cold = trial('batch', 'oracle');
  const warmup = trial('warm', 'warmup');
  for (let round = 0; round < 5; round++) for (const mode of round % 2 ? ['warm','batch'] : ['batch','warm']) samples.push(trial(mode, `${round}-${mode}`));
  const pixels = (file: string) => sharp(file).ensureAlpha().raw().toBuffer();
  for (const sample of samples) for (const frame of [0, 15]) {
    assert.ok((await pixels(`${sample.output}-${frame}.png`)).equals(await pixels(`${cold.output}-${frame}.png`)), 'Warm/fresh pixel mismatch');
    assert.equal(sample.stats.captures, 2);
    if (sample.mode === 'warm') assert.equal(sample.stats.browserLaunches, 0, 'Warm trial did not reuse the worker');
  }
  assert.ok(!(await pixels(`${cold.output}-0.png`)).equals(await pixels(`${cold.output}-15.png`)), 'Motion fixture must advance');
  // Same source URL, new bytes: the worker must discard its old decoders.
  execFileSync('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=c=blue:size=320x180:rate=30:duration=2','-c:v','libx264','-pix_fmt','yuv420p',media]);
  const changed = trial('warm', 'changed-media');
  const changedOracle = trial('batch', 'changed-oracle');
  assert.equal(changed.stats.browserLaunches, 1, 'Changed media must reset the browser');
  for (const frame of [0, 15]) assert.ok((await pixels(`${changed.output}-${frame}.png`)).equals(await pixels(`${changedOracle.output}-${frame}.png`)), 'Changed-media warm capture differs from fresh');
  assert.ok(!(await pixels(`${changed.output}-0.png`)).equals(await pixels(`${cold.output}-0.png`)), 'Changed media was not visible');
  const median = (mode: string) => samples.filter(s => s.mode === mode).map(s => s.elapsedMs).sort((a,b) => a-b)[2];
  const receipt = { status: 'passed', baselineMs: median('batch'), warmMs: median('warm'), speedup: median('batch') / median('warm'), improved: median('warm') < median('batch') * .95, freshProcessTrials: samples.length, pixelComparisons: samples.length * 2 + 2, changedMediaReset: changed.stats, warmup, samples,
    limits: 'Five alternating trials per arm, two real video frames in a separate CLI process each. Cold worker startup is reported separately. No full-project or model-latency claim.' };
  fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt, null, 2));
  } finally { fs.rmSync(projectDir(projectId), { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
