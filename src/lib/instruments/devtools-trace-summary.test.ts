import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDevtoolsTraceSummary, summarizeDevtoolsTrace, type TraceEvent } from './devtools-trace-summary';

const RENDERER = 10, GPU = 20, MAIN = 1, COMPOSITOR = 2, GPU_MAIN = 3;
const meta = (pid: number, tid: number, thread: string, process: string): TraceEvent[] => [
  { name: 'thread_name', ph: 'M', ts: 0, pid, tid, args: { name: thread } },
  { name: 'process_name', ph: 'M', ts: 0, pid, tid, args: { name: process } },
];
const x = (pid: number, tid: number, name: string, ts: number, dur: number, args?: Record<string, unknown>): TraceEvent => ({ name, ph: 'X', ts, dur, pid, tid, cat: 'devtools.timeline', args });

const t0 = 1_000_000;
const trace: TraceEvent[] = [
  ...meta(RENDERER, MAIN, 'CrRendererMain', 'Renderer'),
  ...meta(RENDERER, COMPOSITOR, 'Compositor', 'Renderer'),
  ...meta(GPU, GPU_MAIN, 'CrGpuMain', 'GPU Process'),
  // A 120 ms task: a 100 ms script call containing 30 ms of GC, then 20 ms of layout.
  x(RENDERER, MAIN, 'RunTask', t0, 120_000),
  x(RENDERER, MAIN, 'FunctionCall', t0 + 1, 100_000, { data: { functionName: 'drawShapes', url: 'http://127.0.0.1:3123/_next/static/chunks/app.js', lineNumber: 9 } }),
  x(RENDERER, MAIN, 'MajorGC', t0 + 10_000, 30_000),
  x(RENDERER, MAIN, 'Layout', t0 + 100_002, 19_000),
  // A short task that is not long.
  x(RENDERER, MAIN, 'RunTask', t0 + 200_000, 10_000),
  // Begin/end pairs also count.
  { name: 'RunTask', ph: 'B', ts: t0 + 300_000, pid: RENDERER, tid: MAIN },
  { name: 'RunTask', ph: 'E', ts: t0 + 360_000, pid: RENDERER, tid: MAIN },
  // GPU work for the frames.
  x(GPU, GPU_MAIN, 'CommandBufferStub::OnAsyncFlush', t0 + 5_000, 4_000),
  x(GPU, GPU_MAIN, 'CommandBufferStub::OnAsyncFlush', t0 + 25_000, 8_000),
  // Five frames drawn at 16.7 ms, then one 100 ms gap.
  ...[0, 16_700, 33_400, 50_100, 66_800, 166_800].map((ts): TraceEvent => ({ name: 'DrawFrame', ph: 'I', ts: t0 + ts, pid: RENDERER, tid: COMPOSITOR, cat: 'disabled-by-default-devtools.timeline.frame' })),
  ...['STATE_PRESENTED_ALL', 'STATE_PRESENTED_ALL', 'STATE_DROPPED', 'STATE_PRESENTED_PARTIAL'].map((state, index): TraceEvent => ({ name: 'PipelineReporter', ph: 'b', ts: t0 + index * 16_700, pid: RENDERER, tid: COMPOSITOR, id: String(index), cat: 'benchmark,graphics.pipeline', args: { chrome_frame_reporter: { state } } })),
];

test('long tasks, what ran inside them, and main-thread self time', () => {
  const summary = summarizeDevtoolsTrace({ traceEvents: trace });
  assert.equal(summary.longTasks.count, 2);
  assert.equal(summary.longTasks.totalMs, 180);
  assert.equal(summary.longTasks.blockingMs, 80);
  const [longest] = summary.longTasks.longest;
  assert.equal(longest.durationMs, 120);
  assert.equal(longest.startMs, 0);
  assert.equal(longest.inside[0].name, 'FunctionCall drawShapes chunks/app.js:10');
  assert.equal(longest.inside[0].selfMs, 70);
  assert.equal(summary.mainThread!.busyMs, 190);
  const self = new Map(summary.mainThread!.topBySelf.map((item) => [item.name, item.selfMs]));
  assert.equal(self.get('MajorGC'), 30);
  assert.equal(self.get('Layout'), 19);
  assert.equal(summary.mainThread!.functions[0].name, 'FunctionCall drawShapes chunks/app.js:10');
  assert.equal(summary.mainThread!.functions[0].selfMs, 100);
});

test('frame states, intervals and long frames', () => {
  const { frames } = summarizeDevtoolsTrace(trace);
  assert.equal(frames.presented, 2);
  assert.equal(frames.dropped, 1);
  assert.equal(frames.partial, 1);
  assert.equal(frames.drawn, 6);
  assert.equal(frames.intervalP50Ms, 16.7);
  assert.equal(frames.intervalMaxMs, 100);
  assert.equal(frames.longFrames, 1);
  assert.deepEqual(frames.longFrameMs, [100]);
});

test('GPU process time per presented frame', () => {
  const { gpu } = summarizeDevtoolsTrace(trace);
  assert.equal(gpu.busyMs, 12);
  // Presented all + partial = 3 frames.
  assert.equal(gpu.perFrameMs, 4);
  assert.equal(gpu.threads[0].thread, 'CrGpuMain');
});

test('missing categories are reported, not guessed', () => {
  const summary = summarizeDevtoolsTrace(trace.filter((event) => event.pid === RENDERER && event.tid === MAIN));
  assert.equal(summary.frames.presented, null);
  assert.equal(summary.frames.drawn, 0);
  assert.equal(summary.gpu.perFrameMs, null);
  assert.equal(summary.coverage.length, 3);
  const text = formatDevtoolsTraceSummary(summary, { title: 'seek' });
  assert.match(text, /note: No PipelineReporter/);
  assert.match(text, /long task at 0 ms: 120 ms/);
});
