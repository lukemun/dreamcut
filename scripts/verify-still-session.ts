import { scopeStillRequest } from "../src/lib/instruments/still-scope";
import { execFileSync } from "node:child_process";
/** Real pixels + timing for frame-state browser reuse. No project writes or delivery. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createBrowserStillSession, renderBrowserStill, type BrowserStillOptions } from "../src/lib/render/browser-renderer";
import { runMediaProcess } from "../src/lib/render/audio-export";
import { resolveCaptionProps } from "../src/lib/timeline/captions";
import { createStillDependencyHasher, stillCacheKey, readStillCache, writeStillCache } from "../src/lib/instruments/still-cache";
import { measureRenderedDifferenceBounds } from "../src/lib/instruments/rendered-ink";

const baseUrl = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
const output = path.resolve(process.env.STILL_VERIFICATION_OUTPUT ?? "testing/results/still-session");
const pixels = async (file: string) => sharp(file).ensureAlpha().raw().toBuffer();

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const receipt = path.join(output, "latest.json");
  fs.writeFileSync(receipt, JSON.stringify({ status: "running", startedAt: new Date().toISOString() }));
  const media = path.join(output, "clock.mp4");
  await runMediaProcess("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", media]);
  const source = `data:video/mp4;base64,${fs.readFileSync(media).toString("base64")}`;
  const video = { id: "video", type: "video_clip", source_url: source, props: { source_width: 320, source_height: 180 },
    timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0 };
  const caption = { ...video, id: "caption", type: "caption_text", source_url: null, duration: 1,
    timeline_start: 0.5, lane_key: "captions_0", props: resolveCaptionProps({ text: "Same pixels", fontSize: 28 }) };
  const common = { baseUrl, width: 320, height: 180, durationInFrames: 61, fps: 30 };
  const requests: Array<{ name: string; request: Omit<BrowserStillOptions, "output"> }> = [];
  // Boundaries, repeated and backward video seeks; alternate caption-removal pages.
  for (const frame of [0, 15, 44, 45, 30, 15]) {
    for (const withCaption of [true, false]) requests.push({ name: `${requests.length}-${frame}-${withCaption ? "caption" : "clean"}`,
      request: { ...common, frame, inputProps: { elements: withCaption ? [video, caption] : [video], laneOrderKeys: ["captions_0", "visual_0"] } } });
  }
  const alpha = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><circle cx="160" cy="90" r="40" fill="#ff8040" fill-opacity="0.5"/></svg>')}`;
  for (const transparent of [true, false, true]) requests.push({ name: `alpha-${requests.length}`, request: { ...common, frame: 15, transparent,
    fixtureId: "StillAlphaFixture", inputProps: { source: alpha } } });

  // Warm compilation outside the comparison; include browser setup in both measured arms.
  await renderBrowserStill({ ...requests[0].request, output: path.join(output, "warmup.png") });
  const timings: Record<string, number> = {};
  let stats: unknown, cachedStats: unknown;
  const cacheDirectory = fs.mkdtempSync(path.join(output, "cache-"));
  const hashDependencies = createStillDependencyHasher(process.cwd());
  let cacheHits = 0;
  for (const mode of ["fresh", "batch", "cached"] as const) {
    const started = performance.now();
    const session = mode !== "fresh" ? await createBrowserStillSession() : null;
    try {
      for (const { name, request } of requests) {
        const options = { ...request, output: path.join(output, `${mode}-${name}.png`) };
        if (session) {
          // Alpha uses inline SVG, deliberately outside the conservative persistent cache.
          const dependencies = hashDependencies(options);
          const renderer = dependencies ? await session.fingerprint(options) : null;
          const key = stillCacheKey(options, renderer, dependencies);
          if (mode === "cached" && readStillCache(cacheDirectory, key, options.output)) cacheHits++;
          else {
            await session.render(options);
            if (mode === "batch" && key && dependencies === hashDependencies(options) && renderer === await session.fingerprint(options)) writeStillCache(cacheDirectory, key, options.output);
          }
        } else await renderBrowserStill(options);
      }
      if (mode === "batch") stats = session?.stats;
      if (mode === "cached") { cachedStats = session?.stats; assert.equal(session?.stats.captures, 3); }
    } finally { await session?.close(); }
    timings[mode] = performance.now() - started;
  }
  assert.equal(cacheHits, 12, "Every eligible frame must reuse byte-verified evidence across sessions");
  const comparisons = [];
  for (const { name } of requests) {
    const a = await pixels(path.join(output, `fresh-${name}.png`));
    const b = await pixels(path.join(output, `batch-${name}.png`));
    assert.ok(a.equals(b), `Fresh/batch pixel mismatch: ${name}`);
    assert.ok(a.equals(await pixels(path.join(output, `cached-${name}.png`))), `Fresh/cache pixel mismatch: ${name}`);
    comparisons.push({ name, sha256: createHash("sha256").update(a).digest("hex"), identical: true });
  }
  // Reject a vacuous proof (frozen video, absent caption, or lost transparency).
  assert.notEqual(comparisons[1].sha256, comparisons[3].sha256, "Video did not advance");
  assert.notEqual(comparisons[2].sha256, comparisons[3].sha256, "Caption was not visible");
  assert.equal(comparisons[6].sha256, comparisons[7].sha256, "Caption survived its end boundary");
  assert.equal(comparisons[2].sha256, comparisons[10].sha256, "Backward seek changed frame");
  const transparent = await pixels(path.join(output, `batch-${requests[12].name}.png`));
  assert.equal(transparent[3], 0, "Transparent background became opaque");
  assert.equal(comparisons[12].sha256, comparisons[14].sha256, "Alpha state leaked between pages");
  const bounds = (mode: string) => measureRenderedDifferenceBounds(path.join(output, `${mode}-${requests[2].name}.png`), path.join(output, `${mode}-${requests[3].name}.png`), { width: 320, height: 180 });
  assert.ok(bounds("fresh"), "Caption ink measurement was empty");
  assert.deepEqual(bounds("fresh"), bounds("batch"), "Caption measurement changed");
  // A local edit must reuse distant frames while matching a completely fresh render.
  const scopedSession = await createBrowserStillSession();
  let scopedHits = 0;
  const scopedFrames = [0, 15, 45];
  try {
    for (const edited of [false, true]) for (const frame of scopedFrames) {
      const options: BrowserStillOptions = { ...common, frame, output: path.join(output, `scope-${edited}-${frame}.png`), inputProps: {
        elements: [{ ...video, duration: 1 }, { ...video, id: "later", timeline_start: 1, duration: 1, props: { ...video.props, media_opacity: edited ? .5 : 1 } }], laneOrderKeys: ["visual_0"] } };
      const scoped = scopeStillRequest(options);
      const key = stillCacheKey(scoped, await scopedSession.fingerprint(options), hashDependencies(scoped));
      if (readStillCache(cacheDirectory, key, options.output)) scopedHits++;
      else { await scopedSession.render(options); writeStillCache(cacheDirectory, key, options.output); }
      if (edited) {
        const fresh = path.join(output, `scope-oracle-${frame}.png`);
        await renderBrowserStill({ ...options, output: fresh });
        assert.ok((await pixels(fresh)).equals(await pixels(options.output)), `Scoped cache pixel mismatch at ${frame}`);
      }
    }
    assert.equal(scopedHits, 2, "Local edit should preserve both earlier sampled frames");
    assert.equal(scopedSession.stats.captures, 4, "Three baseline captures plus one changed frame");
    assert.ok(!(await pixels(path.join(output, 'scope-false-45.png'))).equals(await pixels(path.join(output, 'scope-true-45.png'))), "Edited frame must actually change");
  } finally { await scopedSession.close(); }
  const warmRequest = path.join(output, 'warm-request.json');
  fs.writeFileSync(warmRequest, JSON.stringify(requests[1].request));
  const warmRuns = [];
  for (let run = 0; run < 2; run++) {
    const prefix = path.join(output, `warm-worker-${run}`);
    const result = JSON.parse(execFileSync(process.execPath, ['--import','tsx','scripts/warm-still-trial.ts','warm',warmRequest,prefix], { encoding: 'utf8', timeout: 120_000 }));
    if (run === 1) assert.equal(result.stats.browserLaunches, 0, 'Second process must reuse the warm worker');
    for (const [frame, index] of [[0, 1], [15, 3]]) {
      assert.ok((await pixels(`${prefix}-${frame}.png`)).equals(await pixels(path.join(output, `fresh-${requests[index].name}.png`))), 'Warm worker changed pixels');
    }
    warmRuns.push(result);
  }
  fs.writeFileSync(receipt, JSON.stringify({ status: "passed", completedAt: new Date().toISOString(), comparisons, warmRuns,
    scopedReuse: { comparedFrames: 3, hitsAfterEdit: scopedHits, capturesAfterEdit: 1, fullInvalidationCaptures: 3 },
    cacheHits, captionInkBounds: bounds("batch"), timingsMs: timings, speedup: timings.fresh / timings.batch, session: stats, cachedSession: cachedStats,
    limits: "Synthetic 320x180 fixtures; one warmed fresh-then-batch-then-cache comparison, not a Budapest-wide speed claim. Cache bypasses inline SVG." }, null, 2));
  console.log(JSON.stringify({ comparisons: comparisons.length, cacheHits, timingsMs: timings, speedup: timings.fresh / timings.batch, session: stats, cachedSession: cachedStats, receipt }, null, 2));
}
main().catch(error => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "latest.json"), JSON.stringify({ status: "failed", error: String(error) }, null, 2));
  console.error(error); process.exitCode = 1;
});
