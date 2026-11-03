import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Edges have one home (docs/standards/editor-visual-system.md#shape): editor UI rounds corners with the
// shape tokens and outlines items with --edge-outline, so a look changes every edge at once. Pills
// (999px), circles (50%) and hairline details (0–3px) are shapes, not edges, and stay as they are.
const SCANNED = ['src/components', 'src/app'];
const EXTRA = ['src/lib/frame-runtime/preview-controls.css'];

function files() {
  const found = EXTRA.slice();
  for (const dir of SCANNED) {
    for (const name of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      if (/\.(css|tsx)$/.test(name) && !name.endsWith('.test.tsx')) found.push(path.join(dir, name));
    }
  }
  return found;
}

export function rawEdgeRadii(source: string) {
  const values = [
    ...[...source.matchAll(/border-radius:\s*([^;}`]+)/g)].map(match => match[1]!),
    ...[...source.matchAll(/borderRadius:\s*("[^"]+"|'[^']+'|\d+(?:\.\d+)?)/g)].map(match => match[1]!),
    ...[...source.matchAll(/rounded-\[(\d[^\]]*)\]/g)].map(match => match[1]!),
  ];
  return values.filter(value => !value.includes('var(') && /(?<![\d.])(?:[4-9]|1\d|2[0-4])(?:\.\d+)?(?:px|rem)?\b/.test(value.replace(/['"]/g, '')));
}

test('the scanner finds pixel edges and ignores tokens, pills and hairlines', () => {
  assert.deepEqual(rawEdgeRadii('a{border-radius:8px} b{border-radius:var(--edge-control)} c{border-radius:999px} d{border-radius:2px}'), ['8px']);
  assert.deepEqual(rawEdgeRadii('style={{ borderRadius: 6, x: 1 }} className="rounded-[10px] rounded-[2px]"'), ['6', '10px']);
});

test('editor UI rounds corners with the shape tokens, not pixel radii', () => {
  for (const file of files()) {
    const found = rawEdgeRadii(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(found, [], `${file}: use var(--edge-control), var(--edge-control-inner) or var(--edge-surface) (editor-visual-system.md#shape)`);
  }
});

test('item outlines use --edge-outline rather than the raw strong line', () => {
  for (const file of files()) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!/border(?:-(?:top|bottom|left|right))?\s*:\s*1(?:\.5)?px\s+solid\s+var\(--chrome-line-strong/.test(source) && !source.includes('border-[var(--chrome-line-strong)]'),
      `${file}: outline items with var(--edge-outline)`);
  }
});
