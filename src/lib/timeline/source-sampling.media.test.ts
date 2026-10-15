import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {PREVIEW_PROXY_FPS_FILTER, previewMatchedSourceSampleUs} from './source-sampling';

/**
 * Conformance against real ffmpeg: frame i of each source is a flat grey of level 4i, so a
 * decoded proxy pixel names the source frame preview shows. The export decoder is modelled
 * by the source container's own presentation timestamps (microseconds, as decoded samples
 * report them). Preview and export must name the same source frame in every slot.
 */
const FRAMES = 60, SIZE = 32;
const ffmpegAvailable = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-sampling-media-'));

function run(command: string, args: string[], input?: Buffer) {
  const result = spawnSync(command, args, {input, maxBuffer: 64 * 1024 * 1024});
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function indexedSource(name: string, rate: string, vfr = false) {
  const file = path.join(dir, `${name}.mov`);
  const raw = Buffer.concat(Array.from({length: FRAMES}, (_, i) => Buffer.alloc(SIZE * SIZE, 4 * i)));
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${SIZE}x${SIZE}`, '-r', rate, '-i', '-',
    // Variable frame rate: irregular gaps of 25–45 ms, kept by passthrough timing.
    ...(vfr ? ['-vf', 'setpts=(N*0.035+0.01*sin(N*1.7))/TB', '-fps_mode', 'passthrough'] : []),
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv444p', '-video_track_timescale', '90000', file], raw);
  return file;
}

function sourcePtsUs(file: string) {
  const out = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'json', file]).toString());
  return (out.frames as Array<{pts_time: string}>).map(frame => Math.round(Number(frame.pts_time) * 1e6));
}

function proxyFrames(file: string) {
  const proxy = path.join(dir, `${path.basename(file, '.mov')}-proxy.mp4`);
  run('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', PREVIEW_PROXY_FPS_FILTER, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-qp', '0', '-g', '30', proxy]);
  const raw = run('ffmpeg', ['-v', 'error', '-i', proxy, '-vf', 'format=gray', '-f', 'rawvideo', '-']);
  return Array.from({length: raw.length / (SIZE * SIZE)}, (_, slot) => Math.round(raw[slot * SIZE * SIZE + SIZE * SIZE / 2 + SIZE / 2] / 4));
}

const covering = (pts: number[], timeUs: number) => {
  let shown = 0;
  for (let i = 0; i < pts.length && pts[i] <= timeUs; i++) shown = i;
  return shown;
};

const CASES: Array<[string, string, boolean]> = [
  ['23.976', '24000/1001', false], ['24', '24', false], ['25', '25', false], ['29.97', '30000/1001', false],
  ['50', '50', false], ['59.94', '60000/1001', false], ['60', '60', false], ['vfr', '30', true],
];

test('export sampling selects the source frame the preview proxy shows', {skip: !ffmpegAvailable && 'ffmpeg is not installed'}, () => {
  const report: Record<string, {slots: number; before: number; after: number}> = {};
  for (const [name, rate, vfr] of CASES) {
    const source = indexedSource(name, rate, vfr);
    const pts = sourcePtsUs(source);
    const shown = proxyFrames(source);
    let before = 0, after = 0;
    shown.forEach((frame, slot) => {
      if (covering(pts, Math.round(slot * 1e6 / 30)) !== frame) before++;
      if (covering(pts, previewMatchedSourceSampleUs(slot / 30)) !== frame) after++;
    });
    report[name] = {slots: shown.length, before, after};
  }
  console.log(`preview/export source-frame mismatches per clip: ${JSON.stringify(report)}`);
  for (const [name, {after}] of Object.entries(report)) assert.equal(after, 0, `${name}: export still disagrees with preview`);
  assert.ok(report['29.97'].before > report['29.97'].slots / 2, 'the conformance clip must reproduce the original defect');
});
