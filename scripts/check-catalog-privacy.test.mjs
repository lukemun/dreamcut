import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogFindings, CATALOG_FILE, parseTerms, TEXT_FILE, textFindings } from './check-catalog-privacy.mjs';

const reasons = (document, terms = []) => catalogFindings('catalogs/visual/catalog.json', document, terms).map(({ id, reason }) => `${id}: ${reason}`);

test('generic stock passes', () => {
  assert.deepEqual(reasons({ schema_version: 1, assets: [{ id: 'bills', title: 'Falling dollar bills', source: { provider: 'Pixabay' } }] }, ['Ava']), []);
});

test('personal markers, project extraction and local paths fail', () => {
  assert.deepEqual(reasons({ assets: [
    { id: 'a', personal: true },
    { id: 'b', source: { provider: 'DreamCut Project Extraction' } },
    { id: 'c', source: { acquisition_notes: 'Promoted from project demo; original filename x.png.' } },
    { id: 'd', source_url: 'file:///Users/someone/Downloads/x.mp3' },
    { id: 'e', source: { asset_url: 'http://127.0.0.1:3123/p/demo' } },
  ] }), [
    'a: personal marker',
    'b: project-extraction provenance',
    'c: project-extraction provenance',
    'd: local file provenance',
    'e: local editor provenance',
  ]);
});

test('private terms match whole words, case-insensitively', () => {
  const terms = parseTerms('# names\nAva\n\nava.makes\nGolden Lantern Cafe\n');
  assert.deepEqual(terms, ['Ava', 'ava.makes', 'Golden Lantern Cafe']);
  assert.deepEqual(reasons({ tracks: [
    { id: 'x', title: 'ava figurine' },
    { id: 'y', title: 'Avalanche footage' },
    { id: 'z', notes: 'imports/AVA.MAKES-drive' },
    { id: 'w', notes: 'Recorded at golden lantern  cafe' },
  ] }, terms), ['x: private term "Ava"', 'z: private term "Ava"', 'z: private term "ava.makes"', 'w: private term "Golden Lantern Cafe"']);
});

test('only tracked catalog JSON is in scope', () => {
  assert.ok(CATALOG_FILE.test('catalogs/music/catalog.json'));
  assert.ok(CATALOG_FILE.test('catalogs/images/sources.json'));
  assert.ok(!CATALOG_FILE.test('docs/effects/catalog.json'));
});

test('published docs, skill records and Guide manifests are scanned for private terms', () => {
  for (const file of ['docs/effects/catalog.json', 'docs/effects/recipes.md', 'docs/effects/index.html', '.agents/skills/video-compositing/evolution.md',
    'public/guide/effects/catalog/proxies.json', 'public/recipe-previews/word-search/manifest.json', 'site/src/components/motion/clips.ts', 'src/lib/local-store/open-project.test.ts', 'README.md', 'LICENSE-SWAP-CODEX.md']) assert.ok(TEXT_FILE.test(file), file);
  assert.ok(!TEXT_FILE.test('public/guide/effects/catalog/fx-blackout.mp4'));
  assert.deepEqual(textFindings('docs/x.md', 'Generic line\nCredit: Ava / DreamCut\n', ['Ava']), [{ file: 'docs/x.md', id: 'line 2', reason: 'private term "Ava"' }]);
});
