import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Light and dark are one structure (docs/standards/editor-visual-system.md#themes): a theme-scoped rule
// may set tokens and colours, never add or drop an edge, shadow, outline, transform or typeface. A state
// that looks different per theme gets a token, defined in each theme block, read by one shared rule.
const SCANNED = ['src/components', 'src/app'];
const EXTRA = ['src/lib/frame-runtime/preview-controls.css'];
const STRUCTURAL = /^(box-shadow|border(-(top|right|bottom|left|width|style|radius|block|inline)(-\w+)?)?|border-color|outline(-\w+)?|transform|translate|scale|rotate|font-family|background-image)$/;
const THEME_SELECTOR = /data-editor-theme="(light|dark)"|(^|[\s,>+~(])\.dark(?![\w-])/;
// Deliberate exceptions, mirrored in editor-visual-system.md#themes with the reason for each.
const EXCEPTIONS: { selector: RegExp; reason: string }[] = [
  { selector: /data-editor-theme="dark"\]\[data-editor-palette="chrome"\]/, reason: 'Chrome look: brushed-metal sheen is a dark material; a white sheen on light surfaces cannot be seen.' },
];
// Tailwind dark: variants may change colour, not structure.
const STRUCTURAL_DARK_VARIANT = /(?<![\w-])dark:(?:[\w-]+:)*(shadow|ring-\d|ring(?=[\s"'`])|border-\d|border(?=[\s"'`])|outline(?!-ring)|translate|scale|rotate|hidden|block|flex|grid|font-(sans|serif|mono))/g;

function files() {
  const found = EXTRA.slice();
  for (const dir of SCANNED) {
    for (const name of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      if (/\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path.join(dir, name));
    }
  }
  return found;
}

/** Structural declarations inside theme-scoped CSS rules, as "selector → property". */
export function themeStructuralDeclarations(css: string) {
  const found: string[] = [];
  for (const [, rawSelector, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rawSelector!.trim().replace(/\s+/g, ' ');
    if (!THEME_SELECTOR.test(selector)) continue;
    if (EXCEPTIONS.some(exception => exception.selector.test(selector))) continue;
    for (const declaration of body!.split(';')) {
      const property = declaration.split(':')[0]!.trim();
      if (STRUCTURAL.test(property)) found.push(`${selector} → ${property}`);
    }
  }
  return found;
}

test('the scanner flags structure in theme-scoped rules and ignores tokens and shared rules', () => {
  const css = `html[data-editor-theme="light"] .a { --ring: red; color: red; box-shadow: 0 0 0 1px red; }
    .b { box-shadow: none; } .dark .c { border-color: red; } .dark-mode .d { outline: 0; }
    html[data-editor-theme="dark"][data-editor-palette="chrome"] .e { background-image: none; }`;
  assert.deepEqual(themeStructuralDeclarations(css), ['html[data-editor-theme="light"] .a → box-shadow', '.dark .c → border-color']);
  assert.deepEqual('dark:border-input dark:bg-input/30 dark:shadow-sm dark:aria-invalid:ring-destructive/40 dark:aria-invalid:ring-2'.match(STRUCTURAL_DARK_VARIANT), ['dark:shadow', 'dark:aria-invalid:ring-2']);
});

test('themes differ only in token values: no structure in theme-scoped rules', () => {
  for (const file of files()) {
    const source = fs.readFileSync(file, 'utf8');
    const found = file.endsWith('.css') ? themeStructuralDeclarations(source) : [...source.matchAll(STRUCTURAL_DARK_VARIANT)].map(match => match[0]);
    assert.deepEqual(found, [], `${file}: give the state a token defined per theme and one shared rule (editor-visual-system.md#themes), or list a deliberate exception there and here.`);
  }
});

test('every look in the picker ships a light and a dark palette', async () => {
  const { EDITOR_LOOKS } = await import('../../app/editor-look');
  const css = fs.readFileSync('src/app/editor-glass.css', 'utf8');
  for (const look of EDITOR_LOOKS) for (const theme of ['light', 'dark']) {
    assert.ok(css.includes(`html[data-editor-theme="${theme}"][data-editor-palette="${look}"] .editor-chrome`),
      `${look} has no ${theme} palette in editor-glass.css; a look needs both, or it falls back to another look's colours (editor-visual-system.md#themes).`);
  }
});
