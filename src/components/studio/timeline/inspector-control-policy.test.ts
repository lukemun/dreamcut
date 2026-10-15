import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { customNumericInputs } from './inspector-control-policy';

// Migration debt, NOT a template for new features. Counts may shrink, never grow.
// These existing specialized surfaces require separate gesture/Undo migration.
const legacy = {
  'CaptionMenu.tsx': 1, 'CoverLayoutEditor.tsx': 1, 'CustomCutoutDialog.tsx': 3,
  'ElementMenu.tsx': 1, 'KeyframeInspector.tsx': 0, 'LibraryRhythmInspector.tsx': 6,
  'OutlineLayerControls.tsx': 1, 'ProposalsPanel.tsx': 1, 'VisualMaskEditor.tsx': 0,
} as Record<string, number>;
const directory = new URL('./', import.meta.url);
const read = (file: string) => fs.readFileSync(new URL(file, directory), 'utf8');

test('editor numeric input gate rejects custom controls, including JSX literal expressions', () => {
  for (const code of ['<input type="number" />', '<Input type={"number"} />', '<input type="range" />']) {
    assert.equal(customNumericInputs(code).length, 1);
  }
  assert.equal(customNumericInputs('<InspectorEffectNumber /><SliderScrubControl /><ScrubNumberInput /><input type="checkbox" />').length, 0);
});
test('editor components cannot introduce new numeric-input implementations', () => {
  for (const file of fs.readdirSync(directory, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith('.tsx'))) {
    if (file === 'InspectorNumericControls.tsx') continue;
    const count = customNumericInputs(read(file), file).length;
    assert.ok(count <= (legacy[file] ?? 0), `${file}: ${count} custom numeric inputs. Use InspectorEffectNumber or SliderScrubControl from the inspector control standard; do not expand the legacy allowance.`);
  }
});
test('flash and blur controls use the shared effect numeric adapter and live preview', () => {
  for (const file of ['SubjectGlowControls.tsx', 'TransitionEffectControls.tsx']) {
    const source = read(file);
    assert.equal(customNumericInputs(source).length, 0);
    assert.ok(source.includes('<InspectorEffectNumber'));
    assert.ok(source.includes('onPreview={'));
    assert.ok(source.includes('onCommit={'));
  }
  const shared = read('InspectorNumericControls.tsx');
  assert.ok(shared.includes('<Slider'));
  assert.ok(shared.includes('<ScrubNumberInput'));
  assert.ok(shared.includes('onClick={() => nudge(1)}'));
  assert.ok(shared.includes('onClick={() => nudge(-1)}'));
  assert.ok(shared.includes('event.key === "Escape"'));
  assert.ok(shared.includes('onInteractionCancel={cancelLiveValue}'));
});

test('flash and glow use the same percentage units in keyframe detail', () => {
  const source = read('KeyframeInspector.tsx');
  assert.ok(source.includes('subject_flash: percentControl()'));
  assert.ok(source.includes('subject_glow: percentControl(300)'));
});
