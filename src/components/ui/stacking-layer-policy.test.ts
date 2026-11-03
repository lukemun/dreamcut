import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Everything that floats over the app stacks on one named scale (--layer-* in globals.css). Hand-picked
// numbers drifted: the shared tooltip sat at 1100 under every 1300 dropdown, so an info panel opened
// from a dropdown item showed up behind it, and the timeline's right-click menu (200) and delete
// confirmation (110) sat under the 1100 header.
const LAYERS = ['header', 'panel', 'dialog-backdrop', 'dialog', 'popover', 'tooltip'] as const;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
const files = sourceFiles('src').map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

test('the layer scale puts each overlay above the ones it opens from, tooltips on top', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  const value = (name: string) => Number(css.match(new RegExp(`--layer-${name}:\\s*(\\d+)`))?.[1]);
  for (const [lower, higher] of LAYERS.slice(1).map((name, i) => [LAYERS[i], name])) {
    assert.ok(value(higher) > value(lower), `--layer-${higher} must be above --layer-${lower}`);
  }
});

test('no raw stacking numbers above 99: overlays use a --layer-* token', () => {
  const raw = [/\bz-\[(\d{3,})\]/g, /\bz-(\d{3,})\b/g, /zIndex:\s*(\d{3,})/g, /z-index:\s*(\d{3,})/g];
  const offenders = files.flatMap(({ file, text }) => raw.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => `${file}: ${m[0]}`)));
  assert.deepEqual(offenders, [], 'Use z-(--layer-…) or "var(--layer-…)" from globals.css instead');
});

test('every floating positioner and dialog layer names its layer', () => {
  const opening = /<(\w+\.(?:Positioner|Backdrop|Viewport))\b[^>]*>/g;
  const offenders = files.flatMap(({ file, text }) => [...text.matchAll(opening)]
    .filter((m) => !/--layer-/.test(m[0]))
    .map((m) => `${file}: <${m[1]}>`));
  assert.deepEqual(offenders, [], 'Give each one a z-(--layer-…) class');
});

test('shared primitives sit on their own layers', () => {
  const read = (file: string) => fs.readFileSync(file, 'utf8');
  assert.match(read('src/components/ui/tooltip.tsx'), /z-\(--layer-tooltip\)/);
  assert.match(read('src/components/ui/menu.tsx'), /z-\(--layer-popover\)/);
  assert.match(read('src/components/ui/select.tsx'), /z-\(--layer-popover\)/);
});
