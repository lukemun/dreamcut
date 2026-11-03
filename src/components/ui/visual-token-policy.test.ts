import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { rawColorLiterals } from './visual-token-policy';

// Migration debt, NOT a template. Counts may shrink, never grow; new files have zero
// allowance. Swatch defaults and media-content colours belong in named constants or
// tokens too, so they can be found when the palette changes. See editor-visual-system.md.
const legacy: Record<string, number> = {
  'src/components/ui/button.tsx': 12,
  'src/components/studio/generation/AssetGenerationDrawer.tsx': 4,
  'src/components/studio/generation/GenerationPrompt.tsx': 7,
  'src/components/studio/timeline/AssetShelf.tsx': 13,
  'src/components/studio/timeline/AuditionShelf.tsx': 3,
  'src/components/studio/timeline/CanvasTimeline.tsx': 19,
  'src/components/studio/timeline/CaptionMenu.tsx': 7,
  'src/components/studio/timeline/ColorWaveform.tsx': 3,
  'src/components/studio/timeline/CutoutEffectControls.tsx': 1,
  'src/components/studio/timeline/ElementMenu.tsx': 5,
  'src/components/studio/timeline/FramePointOverlay.tsx': 1,
  'src/components/studio/timeline/LayerBlendControl.tsx': 3,
  'src/components/studio/timeline/LibraryCatalog.tsx': 1,
  'src/components/studio/timeline/LibraryRhythmInspector.tsx': 7,
  'src/components/studio/timeline/OutlineLayerControls.tsx': 1,
  'src/components/studio/timeline/PlatformPreviewOverlay.tsx': 2,
  'src/components/studio/timeline/PreparedPlayback.tsx': 3,
  'src/components/studio/timeline/ProposalsPanel.tsx': 8,
  'src/components/studio/timeline/SurfaceTrackingControls.tsx': 4,
  'src/components/studio/timeline/TimelineCaptionCanvasOverlay.tsx': 2,
  'src/components/studio/timeline/TimelineHistoryButton.tsx': 1,
  'src/components/studio/timeline/TimelinePlaybackShell.tsx': 2,
  'src/components/studio/timeline/TimelineRhythmRows.tsx': 1,
  'src/components/studio/timeline/VisualFramingEditor.tsx': 1,
  'src/components/studio/timeline/VisualMaskEditor.tsx': 8,
  'src/components/studio/timeline/useBeatAnnotations.tsx': 7,
  'src/app/prepared-playback-proof/page.tsx': 2,
  'src/app/ui-lab/simple-editing/simple-editing-demo.tsx': 7,
};

test('raw colour scanner finds hex and Tailwind palette classes only', () => {
  assert.deepEqual(rawColorLiterals('className="bg-violet-500/15 text-[#16a34a] text-[var(--ink)]"'), ['#16a34a', 'bg-violet-500']);
  assert.deepEqual(rawColorLiterals('<a href="#section">&#123;</a> bg-[var(--surface-field)]'), []);
});

test('editor components consume semantic colour tokens instead of new raw colours', () => {
  for (const dir of ['src/components', 'src/app']) {
    for (const file of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))) {
      const key = path.join(dir, file);
      const found = rawColorLiterals(fs.readFileSync(key, 'utf8'));
      assert.ok(found.length <= (legacy[key] ?? 0), `${key}: ${found.length} raw colours (${[...new Set(found)].slice(0, 6).join(', ')}). Use semantic tokens from docs/standards/editor-visual-system.md; do not raise the legacy allowance.`);
    }
  }
});

test('the legacy allowance only lists files that still carry debt', () => {
  for (const [file, ceiling] of Object.entries(legacy)) {
    const actual = fs.existsSync(file) ? rawColorLiterals(fs.readFileSync(file, 'utf8')).length : 0;
    assert.ok(actual > 0 && actual <= ceiling, `${file}: allowance ${ceiling} but ${actual} remain; lower or remove the entry.`);
  }
});

// Controls explain themselves; there are no help icons (inspector-information-architecture.md).
// Use result-naming labels, units, or one short inline hint instead of a "?" help popover.
test('no editor UI imports a help-icon component', () => {
  for (const dir of ['src']) {
    for (const file of fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))) {
      const key = path.join(dir, file);
      const source = fs.readFileSync(key, 'utf8');
      assert.ok(!/\bHelpTooltip\b|help-tooltip/.test(source), `${key}: help icons are not allowed. Name the result in the label, add a unit, or use one short inline hint.`);
    }
  }
  assert.equal(fs.existsSync('src/components/ui/help-tooltip.tsx'), false, 'src/components/ui/help-tooltip.tsx must not return.');
});

test('editor UI text tokens keep small text at 13px or more and expose a Text size setting', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const base = (token: string) => Number(css.match(new RegExp(`--${token}: calc\\((\\d+(?:\\.\\d+)?)px \\+ var\\(--ui-text-step\\)\\)`))?.[1]);
  assert.ok(base('ui-text-small') >= 13, 'small UI text must be at least 13px');
  assert.ok(base('ui-text-body') >= 14, 'body and label text must be at least 14px');
  assert.ok(base('ui-text-heading') > base('ui-text-body'), 'section headings stay larger than their children');
  for (const tailwind of ['--text-xs: var(--ui-text-small)', '--text-sm: var(--ui-text-body)']) assert.ok(css.includes(tailwind), tailwind);
  assert.ok(/:root\[data-editor-text-size="large"\] \{ --ui-text-step: 2px; \}/.test(css));
  assert.ok(/:root\[data-editor-text-size="larger"\] \{ --ui-text-step: 4px; \}/.test(css));
  const appearance = fs.readFileSync(path.join(process.cwd(), 'src/app/EditorAppearance.tsx'), 'utf8');
  assert.ok(appearance.includes('>Text size<') && appearance.includes('<SegmentedControl'));
});
