/** Pixel conformance check for the production media wrapper and source projector. */
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from 'sharp';
import { resolveMediaScene, projectMediaScene } from '../src/lib/timeline/resolved-media-scene';
import { projectVisibleNormalizedSourceBox } from '../src/lib/timeline/source-projection';

async function main() {
  const output = path.join(os.tmpdir(), `spatial-scene-${process.pid}.png`);
  const serveUrl = await bundle({ entryPoint: path.resolve('src/lib/remotion/SpatialSceneFixture.tsx'), webpackOverride: config => ({ ...config, resolve: { ...config.resolve, alias: { ...config.resolve?.alias, '@': path.resolve('src') } } }) });
  try {
    const composition = await selectComposition({ serveUrl, id: 'SpatialSceneFixture', inputProps: {} });
    await renderStill({ serveUrl, composition, output, imageFormat: 'png' });
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const points: Array<[number, number]> = [];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i]! > 200 && data[i + 1]! < 30) points.push([x, y]);
    }
    assert.ok(points.length > 0, 'fixture must render red pixels');
    const measured = { x: Math.min(...points.map(p => p[0])), y: Math.min(...points.map(p => p[1])),
      width: Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) + 1,
      height: Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) + 1 };
    const scene = resolveMediaScene({ media_scale: 2, media_offset_x: 0.5, mask_inset: [0, 0.3, 0, 0] }, 0, { width: 100, height: 100 });
    const projected = projectMediaScene(scene, { source_width: 100, source_height: 100, composition_width: 100, composition_height: 100,
      timeline_time_seconds: 0, timeline_start_seconds: 0, fit: 'contain' });
    const expected = projectVisibleNormalizedSourceBox({ x: 0.4, y: 0.4, width: 0.1, height: 0.1 }, projected);
    assert.deepEqual(measured, expected);
    const iris = await selectComposition({serveUrl, id: 'IrisFixture', inputProps: {}});
    for (const [frame, center, corner] of [[0, false, false], [30, true, false], [60, true, true]] as const) {
      await renderStill({serveUrl, composition: iris, output, frame, imageFormat: 'png'});
      const pixels = await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      const alpha = (x: number, y: number) => pixels.data[(y * pixels.info.width + x) * 4 + 3];
      assert.equal(alpha(50, 80) > 250, center);
      assert.equal(alpha(0, 0) > 250, corner);
    }
    const edgeBlur = await selectComposition({serveUrl, id: 'EdgeBlurFixture', inputProps: {}});
    await renderStill({serveUrl, composition: edgeBlur, output, imageFormat: 'png'});
    const edgePixels = await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const red = (x: number, y: number) => edgePixels.data[(y * edgePixels.info.width + x) * 4];
    assert.ok(red(52, 80) < 10, 'zoom blur must preserve the focal center');
    assert.ok(red(12, 10) > 20 && red(12, 10) < 235, 'zoom blur must soften peripheral detail');
    console.log(JSON.stringify({ passed: true, measured, projected: expected, wrapper: 'production MediaTransformFrame' }));
  } finally { await rm(output, { force: true }); await rm(serveUrl, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
