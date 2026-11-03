import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Every yes/no box uses the shared Checkbox and every colour picker the shared colour owner
// (editor-controls.md families 4 and 8). A browser checkbox or colour input ignores the theme
// tokens, so it always looked wrong in one theme or the other.
const RAW_INPUT = /(?<!\[)type\s*=\s*\{?\s*["'`](checkbox|color)["'`]/;
const OWNERS: Record<string, string> = {
  color: path.join('src', 'components', 'studio', 'timeline', 'InspectorColorControl.tsx'),
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function rawBooleanOrColourInputs(root = 'src'): string[] {
  return sourceFiles(root).flatMap((file) => {
    const kinds = [...fs.readFileSync(file, 'utf8').matchAll(new RegExp(RAW_INPUT, 'g'))]
      .map((hit) => hit[1]!)
      .filter((kind) => OWNERS[kind] !== file);
    return kinds.length ? [`${file} (${[...new Set(kinds)].join(', ')})`] : [];
  });
}

test('the scanner catches raw inputs and ignores CSS attribute selectors', () => {
  assert.match('<input type="checkbox" />', RAW_INPUT);
  assert.match("<input type={'color'} />", RAW_INPUT);
  assert.doesNotMatch('closest(\'input:not([type="checkbox"])\')', RAW_INPUT);
});

test('no browser checkboxes or colour inputs: use Checkbox and the shared colour owner', () => {
  const offenders = rawBooleanOrColourInputs();
  assert.deepEqual(offenders, [], `Use Checkbox from src/components/ui/checkbox.tsx, or ColorSwatchInput / InspectorColorField / InspectorColorControl from ${OWNERS.color}, in: ${offenders.join(', ')}`);
});
