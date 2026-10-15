import assert from 'node:assert/strict';
import test from 'node:test';
import {editorAgentPropsSchema} from '../../../lib/agent/timeline-editor-agent-apply';
import {NON_RENDERING_ELEMENT_PROPS} from '../../../lib/timeline/non-rendering-props';
import {AGENT_COMPILED_PROPS,PARITY_SURFACE_TRACK,SCAN_NOT_ELEMENT_PROPS,canvasKitParityGaps,canvasKitParityIssues,standardDrawnInventory,standardSourceReads} from '../../../lib/gpu-preview/parity-inventory';
import {surfaceTrackSchema} from '../../../lib/timeline/surface-track';

/**
 * Browser GPU parity debt (docs/standards/renderer-contract.md#browser-gpu-parity-ratchet).
 * Every Standard-drawn prop or preset value CanvasKit rejects must be listed here with a
 * precise reason. Debt can only shrink: an entry CanvasKit now admits fails the test until
 * it is removed. Do not add entries to ship a new Standard-only feature; implement it on
 * CanvasKit first (docs/architecture/playback-rendering.md#gpu-first-feature-rule).
 */
const GPU_PARITY_DEBT: Record<string, string> = {};

const inventory = standardDrawnInventory();
const gaps = canvasKitParityGaps(inventory);

test('Standard-drawn inventory is derived from every owning registry plus the source backstop', () => {
  const families = new Set(inventory.map(item => item.family));
  for (const family of ['caption-prop', 'caption-value', 'caption-style', 'caption-animation', 'media-prop', 'media-value', 'media-keyframe', 'media-animation', 'media-effect', 'review-mode', 'motion-preset', 'transition', 'tracked-text', 'source-scan'])
    assert.ok(families.has(family as never), `${family} obligations are missing`);
  // The same inputs produce the same obligations, in order.
  assert.deepEqual(standardDrawnInventory().map(item => item.id), inventory.map(item => item.id));
  assert.ok(inventory.length > 500, `inventory unexpectedly small: ${inventory.length}`);
});

test('every Standard-drawn prop and preset value is admitted by CanvasKit or listed as parity debt', () => {
  const unlisted = [...gaps].filter(([id]) => !GPU_PARITY_DEBT[id]).map(([id, issues]) => `${id}: ${issues[0]}`);
  assert.deepEqual(unlisted, [], 'Standard draws these but Browser GPU (CanvasKit) rejects them. Implement them on CanvasKit with a parity proof; do not raise the debt allowance.');
});

test('parity debt only shrinks: every allowance is still a real CanvasKit rejection', () => {
  const stale = Object.keys(GPU_PARITY_DEBT).filter(id => !gaps.has(id));
  assert.deepEqual(stale, [], 'CanvasKit now admits these; remove them from GPU_PARITY_DEBT.');
  for (const [id, reason] of Object.entries(GPU_PARITY_DEBT)) assert.ok(reason.length > 40, `${id}: give a precise reason`);
});

test('every agent-writable prop is covered: stored and inventoried, non-rendering, or compiled away', () => {
  const stored = new Set<string>();
  for (const item of inventory) { stored.add(item.key); for (const key of Object.keys(item.props)) stored.add(key); }
  const agentKeys = Object.keys(editorAgentPropsSchema.shape);
  const uncovered = agentKeys.filter(key => !stored.has(key) && !NON_RENDERING_ELEMENT_PROPS.has(key) && !AGENT_COMPILED_PROPS[key]);
  assert.deepEqual(uncovered, [], 'New agent fields must be inventoried (registry or Standard read), declared non-rendering, or listed in AGENT_COMPILED_PROPS.');
  const stale = Object.keys(AGENT_COMPILED_PROPS).filter(key => !agentKeys.includes(key) || stored.has(key));
  assert.deepEqual(stale, [], 'AGENT_COMPILED_PROPS lists fields that are no longer agent-only or are now stored and drawn.');
});

test('source-scan exclusions only name identifiers the scan still finds', () => {
  const reads = standardSourceReads();
  assert.deepEqual(Object.keys(SCAN_NOT_ELEMENT_PROPS).filter(key => !reads.has(key)), []);
});

test('the inventory detects a missing CanvasKit capability (fixtures are not vacuous)', () => {
  const contour = inventory.find(item => item.id === 'media:effect:paper-contour')!;
  assert.deepEqual(canvasKitParityIssues(contour), []);
  const unknown = {...contour, id: 'synthetic', key: 'parity_probe_unknown', level: 'key' as const, props: {parity_probe_unknown: 1}};
  assert.equal(canvasKitParityIssues(unknown).length, 1);
  const badAura = inventory.find(item => item.id.startsWith('media:effect:edge_aura='))!;
  assert.ok(canvasKitParityIssues({...badAura, props: {edge_aura: {model: 'nope', keyframes: []}}}).length > 0, 'an unreadable aura must fail closed');
});

test('tracked-surface text covers every surface-track field and every caption obligation', () => {
  const shape = (surfaceTrackSchema as unknown as {shape: Record<string, unknown>}).shape;
  assert.deepEqual(Object.keys(PARITY_SURFACE_TRACK).sort(), Object.keys(shape).sort(), 'PARITY_SURFACE_TRACK must name every surfaceTrackSchema field.');
  const tracked = new Set(inventory.filter(item => item.family === 'tracked-text').map(item => item.id));
  const untwinned = inventory.filter(item => item.actor === 'caption' && item.family.startsWith('caption-') && !tracked.has(`tracked:${item.id}`)).map(item => item.id);
  assert.deepEqual(untwinned, []);
  for (const variant of ['interpolated', 'hidden', 'single']) assert.ok(tracked.has(`tracked:track:${variant}`));
  const unknown = {...inventory.find(item => item.id === 'tracked:track:interpolated')!, id: 'synthetic', props: {surface_track: PARITY_SURFACE_TRACK, parity_probe_unknown: 1}};
  assert.ok(canvasKitParityIssues(unknown).length > 0, 'tracked text must still fail closed on unknown props');
});
