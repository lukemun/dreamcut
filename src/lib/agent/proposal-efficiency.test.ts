import test from 'node:test';
import assert from 'node:assert/strict';
import { editorAgentOptionSchema, deriveProposalTimeline } from './timeline-editor-agent-apply';
import { applyProposalNumericOverrides } from './proposal-overrides';
import type { TimelineFile } from '../local-store/store';
import { assertPreservedFields } from './proposal-preservation';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject, writeTimeline } from '../local-store/store';
import { validateEditorAgentProposalAgainstProject, previewEditorAgentProposal, applyEditorAgentProposal, timelineRevision } from './timeline-editor-agent-apply';

const timeline = { elements: [{ id: '11111111-1111-4111-8111-111111111111', project_id: 'fixture', type: 'still', source_url: '/accepted.png', timeline_start: 0, duration: 2, lane_key: 'visual_0', lane_index: 0, props: { media_offset_x: .2, media_offset_y: .1, media_scale: 1 }, removed_at: null }], transitions: [] } as unknown as TimelineFile;
const preserve = [{ element_id: '11111111-1111-4111-8111-111111111111', fields: ['source_url', 'props.media_offset_x', 'props.media_offset_y'] }];
const base = { id: 'adjust', label: 'Adjust', summary: 'Adjust', recommended: true, requested_mutations: 1, operations: [{ element_id: '11111111-1111-4111-8111-111111111111', props: { media_scale: 1.2 } }], preserve_fields: preserve };

test('accepted source and placement survive a requested size change; accidental movement fails before review', () => {
  const option = editorAgentOptionSchema.parse(base);
  assert.equal(deriveProposalTimeline(timeline, option.operations, 'fixture', option.preserve_fields).timeline.elements[0].props?.media_scale, 1.2);
  assert.throws(() => deriveProposalTimeline(timeline, [{ element_id: '11111111-1111-4111-8111-111111111111', props: { media_offset_x: .4 } }], 'fixture', preserve), /protected field/);
  const wrongSource = structuredClone(timeline); wrongSource.elements[0].source_url = '/wrong-aircraft.png';
  assert.throws(() => assertPreservedFields(timeline, wrongSource, preserve), /protected field .*source_url/);
  wrongSource.elements = [];
  assert.throws(() => assertPreservedFields(timeline, wrongSource, preserve), /must remain active/);
});

test('numeric preview overrides retain protection and cannot move accepted placement', () => {
  const option = editorAgentOptionSchema.parse({ ...base, operations: [{ element_id: '11111111-1111-4111-8111-111111111111', props: { media_offset_x: .2 } }] });
  const overridden = applyProposalNumericOverrides(option, [{ operation_index: 0, target: 'props', field: 'media_offset_x', value: .4 }]);
  assert.throws(() => deriveProposalTimeline(timeline, overridden.operations, 'fixture', overridden.preserve_fields), /protected field/);
});

test('speed and reveal questions require usable first-draft controls; explicit unrelated controls do not satisfy them', () => {
  for (const [question, target, field] of [['speed','patch','playback_rate'], ['reveal','props','animationInDuration']] as const) {
    const raw = { ...base, review_questions: [question], operations: [{ element_id: '11111111-1111-4111-8111-111111111111', [target]: { [field]: 1 } }] };
    assert.throws(() => editorAgentOptionSchema.parse(raw), /first draft/);
    const complete = editorAgentOptionSchema.parse({ ...raw, review_controls: [{ operation_index: 0, target, field }] });
    assert.equal(complete.review_controls?.length, 1);
    assert.equal(complete.operations.length, 1);
  }
  assert.throws(() => editorAgentOptionSchema.parse({ ...base, review_questions: ['hold'], review_controls: [{ operation_index: 0, target: 'props', field: 'media_scale' }] }), /bound hold/);
  assert.doesNotThrow(() => editorAgentOptionSchema.parse(base)); // old proposals remain valid
});

test('first-draft hold dial adjusts its bound clock without another agent proposal', () => {
  const option = editorAgentOptionSchema.parse({ ...base, review_questions: ['hold'],
    operations: [{ element_id: '11111111-1111-4111-8111-111111111111', patch: { timeline_start: 2 } }],
    timing_controls: [{ id: 'hold', kind: 'hold', reference_seconds: .2, spacing_seconds: .2,
      min_spacing_seconds: 0, max_spacing_seconds: 1, bindings: [{ operation_index: 0, target: 'patch', field: 'timeline_start', offset_seconds: 2, spacing_multiplier: 1 }] }],
    review_controls: [{ operation_index: 0, target: 'timing_control', field: 'spacing_seconds' }],
  });
  const adjusted = applyProposalNumericOverrides(option, [{ operation_index: 0, target: 'timing_control', field: 'spacing_seconds', value: .6 }]);
  assert.equal(adjusted.operations[0].patch?.timeline_start, 2.4);
  assert.deepEqual(adjusted.preserve_fields, preserve);
});

test('project validation, preview and approval all reject the same accidental change', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proposal-preserve-'));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous; fs.rmSync(root, { recursive: true, force: true }); });
  createProject('fixture', 'web');
  writeTimeline('fixture', timeline, 'test');
  const revision = timelineRevision('fixture');
  const raw = { schema_version: 2, project_id: 'fixture', expected_revision: revision, mode: 'workshop', decision: 'propose', summary: 'Resize', assumptions: [], unresolved_gaps: [], caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 }, options: [base] };
  const validated = validateEditorAgentProposalAgainstProject(raw, 1, 'fixture');
  validated.options[0].operations = [{ element_id: timeline.elements[0].id, props: { media_offset_x: .4 } }];
  assert.throws(() => validateEditorAgentProposalAgainstProject(validated, 1, 'fixture'), /protected field/);
  assert.throws(() => previewEditorAgentProposal(validated), /protected field/);
  await assert.rejects(applyEditorAgentProposal(validated, 1), /protected field/);
  assert.equal(timelineRevision('fixture'), revision);
});
