/** Paused-seek latency of the GPU preview on a production-shaped proxy (30 fps, GOP 30).
 * A fixed seek pattern mixes single steps, backward steps, far jumps and revisits, so runs
 * are comparable before and after a scheduling change. Reports the harness wall clock and
 * the editor's own GpuSeekMetrics. Requires a running editor (pnpm dev).
 * Receipt: testing/results/gpu-seeks/<timestamp>.json */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createServer} from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {chromium} from "playwright-core";

const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const output = path.resolve("testing/results/gpu-seeks");
const SECONDS = 20, FRAMES = SECONDS * 30;
/** BENCHMARK_SIZE=1920x1080 measures a full-HD preview; the default keeps runs quick. */
const [WIDTH, HEIGHT] = (process.env.BENCHMARK_SIZE ?? "320x320").split("x").map(Number);
fs.mkdirSync(output, {recursive: true});

function proxy() {
  const file = path.join(output, "proxy.mp4");
  const result = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${WIDTH}x${HEIGHT}:rate=30:duration=${SECONDS}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "26", "-g", "30", "-movflags", "+faststart", file]);
  assert.equal(result.status, 0, String(result.stderr));
  return fs.readFileSync(file);
}

/** Serve the proxy with byte ranges, as the editor's media route does. */
async function serve(bytes: Buffer) {
  const server = createServer((request, response) => {
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    response.writeHead(range ? 206 : 200, {"Content-Type": "video/mp4", "Content-Length": end - start + 1, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*",
      ...(range ? {"Content-Range": `bytes ${start}-${end}/${bytes.length}`} : {})});
    response.end(bytes.subarray(start, end + 1));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return {server, url: `http://127.0.0.1:${(server.address() as {port: number}).port}/proxy.mp4`};
}

/** Deterministic: steps forward and back, GOP-crossing jumps, far jumps, and revisits. */
function seekPattern() {
  const frames: number[] = [];
  let frame = 0, seed = 7;
  const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    const r = next();
    frame = r < .3 ? frame + 1 : r < .45 ? frame - 1 : r < .7 ? frame + 37 : r < .9 ? Math.floor(next() * FRAMES) : frames[Math.floor(next() * frames.length)] ?? 0;
    frames.push(Math.max(0, Math.min(FRAMES - 1, frame)));
  }
  return frames;
}

async function main() {
  const media = process.env.BENCHMARK_DATA_URL === "1" ? null : await serve(proxy());
  // BENCHMARK_DATA_URL=1 inlines the proxy instead, to compare source transports.
  const url = media?.url ?? `data:video/mp4;base64,${proxy().toString("base64")}`;
  // BENCHMARK_LAYERS=n stacks n independent sources (distinct URLs, so distinct decoders),
  // each smaller and offset so every layer is visible, with staggered source positions.
  const layers = Math.max(1, Number(process.env.BENCHMARK_LAYERS ?? 1));
  const elements = Array.from({length: layers}, (_, index) => {
    const layerUrl = index === 0 ? url : `${url}${url.startsWith("data:") ? "" : `?layer=${index}`}`;
    return {id: `seek-subject-${index}`, type: "video_clip", source_url: layerUrl, timeline_start: 0, duration: SECONDS - index, lane_key: `visual_${index}`, lane_index: index,
      volume: 0, playback_rate: 1, trim_start: index, trim_end: 0, fade_in: 0, fade_out: 0,
      props: {source_duration_seconds: SECONDS, preview_source_url: layerUrl, ...(index ? {media_scale: .5, media_offset_x: .2 * index, media_offset_y: .1 * index} : {}),
        preview_proxy_validation: {contract: "preview-proxy-v1", url: layerUrl, ok: true, width: WIDTH, height: HEIGHT, ...(Math.max(WIDTH, HEIGHT) > 1280 ? {quality: "hd"} : {})}}};
  });
  const browser = await chromium.launch({channel: "chrome", headless: true, args: ["--force-color-profile=srgb"]});
  try {
    const page = await browser.newPage({viewport: {width: WIDTH, height: HEIGHT}});
    await page.goto(`${base}/playback-proof`, {waitUntil: "networkidle"});
    await page.waitForFunction(() => Boolean(window.__dreamcutPlayback));
    await page.evaluate(config => window.__dreamcutPlayback!.load(config as never), {elements, laneOrderKeys: elements.map(element => element.lane_key).reverse(), durationInFrames: FRAMES, gpu: true, width: WIDTH, height: HEIGHT});
    await page.waitForFunction(() => window.__dreamcutPlayback!.snapshot().gpuFrame === 0, undefined, {timeout: 60_000});
    const latencies: number[] = [], trace: Array<[number, number]> = [];
    for (const frame of seekPattern()) {
      const started = Date.now();
      await page.evaluate(n => window.__dreamcutPlayback!.seek(n), frame);
      await page.waitForFunction(n => window.__dreamcutPlayback!.snapshot().gpuFrame === n, frame, {timeout: 30_000, polling: 5});
      latencies.push(Date.now() - started);
      trace.push([frame, latencies.at(-1)!]);
      // BENCHMARK_SEEK_DETAIL=1 prints the editor's own breakdown of each presentation.
      if (process.env.BENCHMARK_SEEK_DETAIL === "1") console.log(JSON.stringify({frame, ms: latencies.at(-1), presentation: await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-gpu-presentation]");
        return {presentation: JSON.parse(canvas?.dataset.gpuPresentation ?? "null"), prefetch: JSON.parse(canvas?.dataset.gpuPrefetch ?? "null")};
      })}));
    }
    const editor = await page.evaluate(() => JSON.parse(document.querySelector<HTMLCanvasElement>("canvas[data-gpu-seek-metrics]")?.dataset.gpuSeekMetrics ?? "null"));
    // Playback: from a cold seek, play three seconds and read the editor's playback evidence.
    await page.evaluate(() => window.__dreamcutPlayback!.seek(300));
    await page.waitForFunction(() => window.__dreamcutPlayback!.snapshot().gpuFrame === 300, undefined, {timeout: 30_000});
    await page.evaluate(() => window.__dreamcutPlayback!.play());
    await page.waitForTimeout(3000);
    const during = await page.evaluate(() => { const state = window.__dreamcutPlayback!.snapshot(); return {frame: state.frame, gpuFrame: state.gpuFrame, playing: state.playing, waits: state.waits}; });
    await page.evaluate(() => window.__dreamcutPlayback!.pause());
    const playback = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-gpu-playback-metrics]");
      const metrics = JSON.parse(canvas?.dataset.gpuPlaybackMetrics ?? "null");
      return metrics && {presentations: metrics.presentations, frames: metrics.lastFrame - metrics.firstFrame + 1, maxGapMs: metrics.maxGapMs,
        latePresentations: metrics.latePresentations, skippedFrames: metrics.skippedFrames, stalls: metrics.stalls.length,
        replaySegments: JSON.parse(canvas?.dataset.gpuReplaySegments ?? "null")};
    });
    if (process.env.BENCHMARK_SEEK_DETAIL === "1") console.log(JSON.stringify({during}));
    assert.ok(editor, "The editor did not publish seek metrics");
    const sorted = [...latencies].sort((a, b) => a - b);
    const receipt = {date: new Date().toISOString(), size: `${WIDTH}x${HEIGHT}`, layers, transport: media ? "http-range" : "data-url", machine: os.cpus()[0]?.model, browser: browser.version(), seeks: latencies.length,
      harness: {p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1)}, editor, playback,
      slowest: [...trace].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([frame, ms]) => ({frame, ms, index: trace.findIndex(t => t[0] === frame && t[1] === ms)}))};
    fs.writeFileSync(path.join(output, `${Date.now()}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    // BENCHMARK_MAX_SEEK_MS turns the run into a regression check (the first-scrub stall was ~5 s).
    const limit = Number(process.env.BENCHMARK_MAX_SEEK_MS ?? NaN);
    if (Number.isFinite(limit)) assert.ok(sorted.at(-1)! <= limit, `Slowest seek ${sorted.at(-1)} ms exceeds ${limit} ms`);
    assert.ok(playback && playback.presentations > 0, "Playback presented no pictures");
  } finally { await browser.close(); media?.server.close(); }
}

main().catch(error => { console.error(error); process.exit(1); });
