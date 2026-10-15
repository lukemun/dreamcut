import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { matchesPanelShortcut } from '@/lib/panel-shortcuts';
import { effectAgentRequest } from './library-effect-catalog';
import { effectRecipeRequest } from '@/lib/effects/agent-request';
test('the copied request is one plain sentence; the full brief owns input guidance', () => {
  const recipe = { id: 'user-glow', skill: 'mask-glitch', title: 'Subject glow', prompt: 'Use mask-glitch.', inputs: [], inputDirections: [{ title: 'Shoot', directions: 'Lock the camera.' }], sourceUrl: 'https://example.com/tutorial' };
  const request = effectAgentRequest('example-project', recipe);
  assert.equal(request, 'Use the Subject glow template with my footage.');
  const community = effectAgentRequest('example-project', { ...recipe, source: 'community', author: 'Sam' });
  assert.ok(community.startsWith('Use the community template "Subject glow" by Sam with my footage,'));
  const odd = effectAgentRequest('example-project', { ...recipe, title: 'Glow with my footage' });
  assert.equal(odd, 'Use the Glow with my footage template with my footage.');
  const brief = effectRecipeRequest(recipe);
  for (const text of ['Use mask-glitch.', 'Lock the camera.', 'https://example.com/tutorial', 'propose changes for my review', 'do not apply or approve']) assert.ok(brief.includes(text), text);
});
test('Recipes is a peer workflow and does not expose Browse or Generate content', () => {
  const shelf = fs.readFileSync(new URL('./AssetShelf.tsx', import.meta.url), 'utf8');
  const tabs = fs.readFileSync(new URL('./MediaWorkspaceTabs.tsx', import.meta.url), 'utf8');
  assert.ok(shelf.includes('<MediaWorkspaceTabs'));
  assert.ok(tabs.includes('["browse", "generate", "recipes"]'));
  assert.ok(shelf.includes('display: visualPane === "catalog" ? "flex" : "none"'));
  // The standalone Generate page shows Browse beside generation; inside Library it stays a peer pane.
  assert.ok(shelf.includes('const browseVisible = standaloneGeneration || visualPane === "browse"'));
  assert.ok(shelf.includes('visualPane === "generate" || visualPane === "results"'));
  assert.ok(shelf.includes('id="media-visual-panel-recipes" role="tabpanel"'));
  assert.ok(shelf.includes('<LibraryEffectCatalog projectId={projectId}'));
});
test('Library shortcut protects editable targets, dialogs, modifiers and repeat', () => {
  const step = fs.readFileSync(new URL('../TimelineStep.tsx', import.meta.url), 'utf8');
  assert.ok(step.includes('matchesPanelShortcut(event, panelShortcuts.library)'));
  assert.ok(step.includes('toggleLibraryDrawerRef.current();'));
  const event = (overrides: Record<string, unknown> = {}) => ({ key: 'g', target: null, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, isComposing: false, ...overrides }) as unknown as KeyboardEvent;
  assert.equal(matchesPanelShortcut(event(), 'G'), true);
  assert.equal(matchesPanelShortcut(event(), 'L'), false);
  assert.equal(matchesPanelShortcut(event(), 'Off'), false);
  for (const flag of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey', 'repeat', 'defaultPrevented', 'isComposing']) {
    assert.equal(matchesPanelShortcut(event({ [flag]: true }), 'G'), false, flag);
  }
  const previousElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  class Target {
    constructor(readonly isContentEditable = false, readonly tag = 'button') {}
    closest(selector: string) { return selector.split(', ').includes(this.tag) ? this : null; }
  }
  Object.defineProperty(globalThis, 'HTMLElement', { value: Target, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: { querySelector: () => null }, configurable: true });
  try {
    assert.equal(matchesPanelShortcut(event({ target: new Target() }), 'G'), true);
    assert.equal(matchesPanelShortcut(event({ target: new Target(true) }), 'G'), false);
    for (const tag of ['input', 'textarea', 'select', '[role="textbox"]', '[role="dialog"][aria-modal="true"]']) {
      assert.equal(matchesPanelShortcut(event({ target: new Target(false, tag) }), 'G'), false, tag);
    }
    Object.defineProperty(globalThis, 'document', { value: { querySelector: () => ({}) }, configurable: true });
    assert.equal(matchesPanelShortcut(event(), 'G'), false, 'An open modal owns keyboard input');
  } finally {
    for (const [key, previous] of [['HTMLElement', previousElement], ['document', previousDocument]] as const) {
      if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
