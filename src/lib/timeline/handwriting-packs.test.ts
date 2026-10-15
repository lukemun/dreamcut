import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKER_SAVED_ASSET_KEY, captionHandwritingAssetKey, getHandwritingPack, getMarkerSavedData,
  handwritingAssetKey, handwritingAssetsLoaded, loadHandwritingAssets,
} from './handwriting-packs';

// This file must not import handwriting-packs-sync: it checks the on-demand cache from empty.
const SRC = path.resolve('src');
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function resolveImport(from: string, specifier: string) {
  const base = specifier.startsWith('@/') ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}
/** Static (non-`import()`) module graph reachable from an entry file. */
function staticGraph(entries: string[]) {
  const seen = new Set<string>(), queue = entries.map(entry => path.resolve(entry));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const resolved = resolveImport(file, specifier);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen].map(file => path.relative(SRC, file));
}

test('editor and renderer graphs never statically import handwriting stroke data', () => {
  const source = fs.readFileSync('src/lib/timeline/handwriting-packs.ts', 'utf8');
  assert.doesNotMatch(source, /^\s*import\s[^;]*from\s+['"][^'"]*handwriting\/fonts\/[^'"]+\.json['"]/m);
  const graph = staticGraph(['src/app/p/[projectId]/page.tsx', 'src/app/p/[projectId]/EditorClient.tsx', 'src/app/render-frame/page.tsx',
    'src/lib/remotion/TimelineComposition.tsx', 'src/lib/gpu-preview/text-raster.ts']);
  assert.ok(graph.includes(path.join('lib', 'remotion', 'HandwritingText.tsx')), 'graph walk reaches the handwriting renderer');
  const offenders = graph.filter(file => /handwriting[\\/]fonts[\\/].*\.json$/.test(file) || /handwriting-packs-sync/.test(file));
  assert.deepEqual(offenders, []);
});

test('loads one font on demand, caches it and keeps saved/line packs exact', async () => {
  assert.equal(handwritingAssetsLoaded('caveat'), false);
  assert.equal(getHandwritingPack('caveat', 'line_mask'), undefined);
  const first = loadHandwritingAssets('caveat'), second = loadHandwritingAssets('caveat');
  await Promise.all([first, second]);
  assert.equal(handwritingAssetsLoaded('caveat'), true);
  assert.equal(handwritingAssetsLoaded('pacifico'), false, 'other fonts stay unloaded');
  const saved = getHandwritingPack('caveat', 'saved_strokes')!, line = getHandwritingPack('caveat', 'line_mask')!;
  const read = (file: string) => JSON.parse(fs.readFileSync(`src/lib/timeline/handwriting/fonts/caveat/${file}.json`, 'utf8'));
  assert.deepEqual(saved.outlines, read('outlines'));
  assert.deepEqual(saved.sweeps, read('sweeps'));
  assert.deepEqual(line.lineStrokes, read('line-strokes'));
  assert.equal(line.outlines, saved.outlines, 'line pack extends the saved pack');
  assert.equal(saved.fontId, 'caveat');
  const cached = getHandwritingPack('caveat', 'line_mask');
  await loadHandwritingAssets('caveat');
  assert.equal(getHandwritingPack('caveat', 'line_mask'), cached, 'second load reuses the cache');
});

test('unknown packs reject cleanly and leave the cache untouched', async () => {
  await assert.rejects(loadHandwritingAssets('not_a_font'), /Unknown handwriting pack: not_a_font/);
  await assert.rejects(loadHandwritingAssets('__proto__'), /Unknown handwriting pack/);
  assert.equal(handwritingAssetsLoaded('not_a_font'), false);
  assert.throws(() => getMarkerSavedData(), /not loaded/);
  await loadHandwritingAssets(MARKER_SAVED_ASSET_KEY);
  assert.ok(getMarkerSavedData().regions);
});

test('asset keys follow the renderer route selection', () => {
  assert.equal(handwritingAssetKey('caveat'), 'caveat');
  assert.equal(handwritingAssetKey('caveat', 'saved_strokes'), 'caveat');
  assert.equal(handwritingAssetKey('permanent_marker'), 'permanent_marker');
  assert.equal(handwritingAssetKey('permanent_marker', 'saved_strokes'), MARKER_SAVED_ASSET_KEY);
  assert.equal(handwritingAssetKey('clean_sans'), null);
  assert.equal(handwritingAssetKey(undefined), null);
  assert.equal(captionHandwritingAssetKey({ fontPreset: 'caveat', animationIn: 'fade' }), null);
  assert.equal(captionHandwritingAssetKey({ fontPreset: 'caveat', animationOut: 'handwriting' }), 'caveat');
  assert.equal(captionHandwritingAssetKey({ fontPreset: 'lobster', styleVariant: 'image_fill', animationIn: 'write_on' }), 'lobster');
});
