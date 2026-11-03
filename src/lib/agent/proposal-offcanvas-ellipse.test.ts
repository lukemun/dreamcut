import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveProposalTimeline, editorAgentOptionSchema} from './timeline-editor-agent-apply';
import type {TimelineFile} from '../local-store/store';
import {ellipseEdgeControlRange, proposalTunableField} from './proposal-controls';
import {applyProposalNumericOverrides} from './proposal-overrides';
const id = '00000000-0000-4000-8000-000000000061';
const empty = {elements: [], transitions: []} as unknown as TimelineFile;
const inset = [.43, .28, .24, -.7];
const points = [{t: 0, v: inset}, {t: 1, v: [.43, .28, .24, -.9]}];
const derive = (timeline: TimelineFile, operation: unknown) => deriveProposalTimeline(timeline,
  editorAgentOptionSchema.parse({id:'ellipse', label:'Ellipse', summary:'Ellipse', recommended:true, operations:[operation]}).operations, 'fixture').timeline;
const create = (extra: Record<string, unknown>) => ({element_id:id, create_visual:{type:'still', source_url:'/api/projects/fixture/media/synthetic.png', timeline_start:0, duration_seconds:2, lane_key:'visual_0', lane_index:0, ...extra}});

test('off-canvas ellipse survives creation and a shape-inheriting patch', () => {
  const timeline = derive(empty, create({mask_shape:'ellipse', mask_inset:inset}));
  assert.deepEqual(timeline.elements[0].props?.mask_inset, inset);
  const patched = derive(timeline, {element_id:id, props:{mask_inset:[.43,.28,.24,-.8]}});
  assert.equal((patched.elements[0].props?.mask_inset as number[])[3], -.8);
  const animated = derive(timeline, {element_id:id, props:{mask_inset_keyframes:points}});
  assert.deepEqual((animated.elements[0].props?.keyframes as Record<string,unknown>).mask_inset, points);
});

test('negative rectangle bounds fail explicitly for creation and patches', () => {
  assert.throws(() => derive(empty, create({mask_inset:inset})), /ellipse/);
  assert.throws(() => derive(empty, create({mask_inset_keyframes:points})), /ellipse/);
  const timeline = derive(empty, create({}));
  assert.throws(() => derive(timeline, {element_id:id, props:{mask_inset:inset}}), /ellipse/);
  assert.throws(() => derive(timeline, {element_id:id, props:{mask_inset_keyframes:points}}), /ellipse/);
});

test('resetting ellipse shape bounds saved static and animated edges without discarding animation', () => {
  const timeline = derive(empty, create({mask_shape:'ellipse', mask_inset:inset, mask_inset_keyframes:points}));
  const reset = derive(timeline, {element_id:id, props:{mask_shape:'rectangle'}});
  const props = reset.elements[0].props!;
  assert.deepEqual(props.mask_inset, [.43,.28,.24,0]);
  assert.deepEqual((props.keyframes as Record<string,unknown>).mask_inset, points.map(point => ({...point, v:[.43,.28,.24,0]})));
  assert.throws(() => derive(timeline, {element_id:id, props:{mask_shape:'rectangle', mask_inset:inset}}), /ellipse/);
});

test('ellipse sliders expose negative percentages and tuning survives shared derivation', () => {
  const timeline = derive(empty, create({mask_shape:'ellipse', mask_inset:inset}));
  const option = editorAgentOptionSchema.parse({id:'edge',label:'Edge',summary:'Edge',recommended:true,
    operations:[{element_id:id,props:{mask_inset:inset}}]});
  const range = ellipseEdgeControlRange(option.operations[0].props, timeline.elements[0].props, 'mask_inset_left');
  assert.deepEqual(range, {min:-1,max:.71});
  const control = proposalTunableField('props','mask_inset_left',range)!;
  assert.equal(control.min,-100);
  const tuned = applyProposalNumericOverrides(option,[{operation_index:0,target:'props',field:'mask_inset_left',value:-1}]);
  assert.equal((deriveProposalTimeline(timeline,tuned.operations,'fixture').timeline.elements[0].props?.mask_inset as number[])[3],-1);
  assert.equal(ellipseEdgeControlRange({mask_shape:'rectangle',mask_inset:inset},timeline.elements[0].props,'mask_inset_left'),undefined);
  assert.deepEqual(applyProposalNumericOverrides(option,[]),option);
});
