import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { matchesShortcut } from '@/lib/keyboard-shortcuts';
import { effectRecipeQuickRequest, effectRecipeRequest, templateSelection } from '@/lib/effects/agent-request';
test('the template request is one plain sentence; the full brief owns input guidance', () => {
  const recipe = { id: 'user-glow', skill: 'mask-glitch', title: 'Subject glow', prompt: 'Use mask-glitch.', inputs: [], inputDirections: [{ title: 'Shoot', directions: 'Lock the camera.' }], sourceUrl: 'https://example.com/tutorial' };
  const request = effectRecipeQuickRequest(recipe);
  assert.equal(request, 'Use the Subject glow template with my footage.');
  const community = effectRecipeQuickRequest({ ...recipe, source: 'community', author: 'Sam' });
  assert.ok(community.startsWith('Use the community template "Subject glow" by Sam with my footage,'));
  const odd = effectRecipeQuickRequest({ ...recipe, title: 'Glow with my footage' });
  assert.equal(odd, 'Use the Glow with my footage template with my footage.');
  const brief = effectRecipeRequest(recipe);
  for (const text of ['Use mask-glitch.', 'Lock the camera.', 'https://example.com/tutorial', 'propose changes for my review', 'do not apply or approve']) assert.ok(brief.includes(text), text);
});
test('a selected template tells the agent its title, catalog id and where to read its brief', () => {
  const selection = templateSelection({ id: 'user-glow', skill: 'mask-glitch', title: 'Subject glow', prompt: '', inputs: [] });
  assert.deepEqual([selection.id, selection.kind, selection.label], ['template:user-glow', 'Template', 'Subject glow']);
  assert.ok(selection.agentText.includes('capability_catalog get template:user-glow'));
  assert.equal(templateSelection({ skill: 'x', title: 'Glow & Pop!', prompt: '', inputs: [] }).id, 'template:glow-pop');
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
  assert.ok(step.includes('matchesShortcut(event, shortcuts.library)'));
  assert.ok(step.includes('toggleLibraryDrawerRef.current();'));
  const event = (overrides: Record<string, unknown> = {}) => ({ key: 'g', target: null, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, isComposing: false, ...overrides }) as unknown as KeyboardEvent;
  assert.equal(matchesShortcut(event(), 'G'), true);
  assert.equal(matchesShortcut(event(), 'L'), false);
  assert.equal(matchesShortcut(event(), 'Off'), false);
  for (const flag of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey', 'repeat', 'defaultPrevented', 'isComposing']) {
    assert.equal(matchesShortcut(event({ [flag]: true }), 'G'), false, flag);
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
    assert.equal(matchesShortcut(event({ target: new Target() }), 'G'), true);
    assert.equal(matchesShortcut(event({ target: new Target(true) }), 'G'), false);
    for (const tag of ['input', 'textarea', 'select', '[role="textbox"]', '[role="dialog"][aria-modal="true"]']) {
      assert.equal(matchesShortcut(event({ target: new Target(false, tag) }), 'G'), false, tag);
    }
    Object.defineProperty(globalThis, 'document', { value: { querySelector: () => ({}) }, configurable: true });
    assert.equal(matchesShortcut(event(), 'G'), false, 'An open modal owns keyboard input');
  } finally {
    for (const [key, previous] of [['HTMLElement', previousElement], ['document', previousDocument]] as const) {
      if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
test('Expand and Dock are one saved choice: every panel\'s rail item opens its drawer or its docked panel', () => {
  const drawer = fs.readFileSync(new URL('./PanelDrawer.tsx', import.meta.url), 'utf8');
  const tabs = fs.readFileSync(new URL('./MediaWorkspaceTabs.tsx', import.meta.url), 'utf8');
  const step = fs.readFileSync(new URL('../TimelineStep.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../../app/editor-workspace.css', import.meta.url), 'utf8');
  // One per-viewer view preference in browser storage for every panel, shared across projects; the old per-panel
  // keys only carry a drawer choice over.
  assert.ok(drawer.includes('const DRAWERS_KEY = "dreamcut:panel-drawers";'));
  assert.ok(drawer.includes('export const DRAWER_PANES: readonly DrawerPane[] = ["properties", "recipes", "layouts", "captions", "text"];'));
  assert.ok(drawer.includes('return [drawers ? ALL_DRAWERS : NO_DRAWERS, setDrawers];'));
  assert.ok(drawer.includes('const label = `Dock ${PANEL_TITLES[pane].toLowerCase()}`;'));
  // Every panel's header carries one icon-only Expand in its top-right corner, Properties included; the drawer's
  // header carries Dock in the same corner.
  assert.ok(drawer.includes('<PanelDockButton pane={pane} side={side} onClick={onDock} />'));
  assert.equal(drawer.match(/size="icon-sm"/g)?.length, 2);
  assert.ok(css.includes('.tool-panel-header { flex-shrink:0; display:flex; align-items:center; justify-content:flex-end; gap:8px; min-height:28px; padding:6px 8px 0; }'));
  for (const pane of ['recipes', 'text', 'captions']) assert.ok(step.includes(`${pane}: expandButton("${pane}")`));
  assert.ok(step.includes('<ToolPanelHeader pane="layouts" showTitle action={expandButton("layouts")} />'));
  assert.ok(step.includes('landscapeRightPanelNode("inspector", expandButton("properties"))'));
  assert.ok(step.includes('<span className="editor-inspector-expand"><PanelExpandButton pane={tallExpandPane}'));
  // Properties follows the same choice: undocked, switching to Captions opens Captions as a drawer too.
  assert.ok(step.includes('const asDrawer = (tab: typeof inspectorTab) => drawerPanes.has(tab);'));
  assert.ok(step.includes('setPanelsAsDrawers(true);'));
  // Wide's rail and Tall's tab strip both open the drawer directly while it is the saved choice.
  assert.ok(tabs.includes('if (drawer) { if (openDrawer && openDrawer !== pane) closeOpenDrawer(); return drawer.onToggle(); }'));
  assert.ok(step.includes('if (asDrawer(tab)) return togglePanelDrawer(tab as DrawerPane);'));
  // Closing only closes; Dock is the one control that clears the preference.
  assert.ok(step.includes('onClose={() => setOpenPanelDrawer(null)}'));
  assert.equal(step.match(/setPanelsAsDrawers\(false\)/g)?.length, 1);
});
