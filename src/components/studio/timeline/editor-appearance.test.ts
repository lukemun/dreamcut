import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyEditorAppearance } from '../../../app/EditorAppearance';

function rootFixture() {
  const classes = new Set(['font-variable', 'dark']);
  return {
    classes,
    root: {
      dataset: {} as Record<string, string>,
      classList: { toggle(name: string, enabled: boolean) { enabled ? classes.add(name) : classes.delete(name); } },
    } as unknown as Pick<HTMLElement, 'dataset' | 'classList'>,
  };
}

test('appearance transitions keep the CSS class and canvas theme signal aligned', () => {
  const { root, classes } = rootFixture();
  for (const [choice, systemDark, expected] of [
    ['light', true, false], ['dark', false, true], ['light', false, false],
    ['system', true, true], ['system', false, false],
  ] as const) {
    applyEditorAppearance(choice, systemDark, root);
    assert.equal(root.dataset.editorTheme, expected ? 'dark' : 'light');
    assert.equal(classes.has('dark'), expected);
    assert.ok(classes.has('font-variable'));
  }
});

test('first-paint bootstrap matches runtime appearance, including legacy preferences', () => {
  const layout = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');
  const script = layout.match(/__html: `([^`]+)`/)![1];
  for (const preference of ['light', 'dark', 'system', null]) {
    for (const systemDark of [false, true]) {
      for (const source of ['dreamcut.appearance', 'openedit.appearance', 'opensequence.appearance']) {
        const { root, classes } = rootFixture();
        const values = new Map<string, string>();
        if (preference) values.set(source, preference);
        runInNewContext(script, {
          document: { documentElement: root },
          localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
          matchMedia: () => ({ matches: systemDark }),
        });
        const expected = preference === null || preference === 'dark' || (preference === 'system' && systemDark);
        assert.equal(root.dataset.editorTheme, expected ? 'dark' : 'light');
        assert.equal(classes.has('dark'), expected);
        if (preference) assert.equal(values.get('dreamcut.appearance'), preference);
      }
    }
  }
});

test('first paint applies the saved look, takes ?look= from the address, and knows every look', async () => {
  const { KNOWN_EDITOR_LOOKS, DEFAULT_EDITOR_LOOK } = await import('../../../app/editor-look');
  const layout = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');
  const script = layout.match(/__html: `([^`]+)`/)![1];
  assert.deepEqual(JSON.parse(script.match(/var looks=(\[[^\]]+\])/)![1]).sort(), [...KNOWN_EDITOR_LOOKS].sort());
  assert.match(layout, /data-editor-palette=\{DEFAULT_EDITOR_LOOK\}/);
  assert.equal(DEFAULT_EDITOR_LOOK, 'studio');
  for (const [search, saved, expected] of [['?look=chrome', null, 'chrome'], ['', 'ember', 'ember'], ['?look=nope', null, undefined], ['', 'slate', undefined]] as const) {
    const { root } = rootFixture();
    const values = new Map<string, string>(saved ? [['dreamcut.palette', saved]] : []);
    runInNewContext(script, {
      document: { documentElement: root }, location: { search }, URLSearchParams,
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
      matchMedia: () => ({ matches: true }),
    });
    assert.equal(root.dataset.editorPalette, expected);
  }
});
