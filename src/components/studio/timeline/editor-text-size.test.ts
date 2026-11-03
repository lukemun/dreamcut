import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  applyEditorTextSize, EDITOR_TEXT_SIZE_BOOT_SCRIPT, EDITOR_TEXT_SIZE_STORAGE_KEY, EDITOR_TEXT_SIZES,
  parseEditorTextSize, readEditorTextSize, writeEditorTextSize,
} from '../../../app/editor-text-size';

test('text size parser accepts the three choices and falls back to Standard', () => {
  for (const size of EDITOR_TEXT_SIZES) assert.equal(parseEditorTextSize(size), size);
  for (const bad of [null, undefined, '', 'Large', 'huge', 2, {}]) assert.equal(parseEditorTextSize(bad), 'standard');
});

test('reading and writing survive missing or throwing storage', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readEditorTextSize(storage), 'standard');
  assert.equal(writeEditorTextSize(storage, 'larger'), true);
  assert.equal(values.get(EDITOR_TEXT_SIZE_STORAGE_KEY), 'larger');
  assert.equal(readEditorTextSize(storage), 'larger');
  values.set(EDITOR_TEXT_SIZE_STORAGE_KEY, 'giant');
  assert.equal(readEditorTextSize(storage), 'standard');
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(readEditorTextSize(throwing), 'standard');
  assert.equal(writeEditorTextSize(throwing, 'large'), false);
  assert.equal(readEditorTextSize(null), 'standard');
  assert.equal(writeEditorTextSize(undefined, 'large'), false);
});

test('apply helper and first-paint bootstrap set the same root attribute', () => {
  for (const stored of [...EDITOR_TEXT_SIZES, null, 'bogus', 'throw']) {
    const runtime = { dataset: {} as Record<string, string> };
    const expected = parseEditorTextSize(stored);
    applyEditorTextSize(expected, runtime as unknown as HTMLElement);
    const boot = { dataset: {} as Record<string, string> };
    runInNewContext(EDITOR_TEXT_SIZE_BOOT_SCRIPT, {
      document: { documentElement: boot },
      localStorage: { getItem: () => { if (stored === 'throw') throw new Error('blocked'); return stored; } },
    });
    assert.equal(runtime.dataset.editorTextSize, expected);
    assert.equal(boot.dataset.editorTextSize, expected);
  }
  const layout = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.includes('__html: EDITOR_TEXT_SIZE_BOOT_SCRIPT'));
});
