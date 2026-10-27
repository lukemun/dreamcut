import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Every dropdown uses the shared OptionSelect/Select (form-controls.md). A browser <select> skips
// the compact row sizing, theme tokens and popup styling, so it always looked wrong somewhere.
const NATIVE_DROPDOWN = /<select[\s>]|NativeSelect\b/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test('no browser dropdowns: every choice list uses the shared OptionSelect or Select', () => {
  const offenders = sourceFiles('src').filter((file) => NATIVE_DROPDOWN.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, [], `Use OptionSelect or Select from src/components/ui/select.tsx in: ${offenders.join(', ')}`);
});
