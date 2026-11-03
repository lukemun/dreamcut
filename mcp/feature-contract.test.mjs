import test from 'node:test';
import assert from 'node:assert/strict';
import { expectationMet, featureCaseViolations, fieldContractViolations, proposalArguments, valuesAt } from './feature-contract.mjs';

const props = { type: 'object', additionalProperties: false, properties: {
  legacy_flag: { type: 'boolean' },
  playback_reverse: { type: 'boolean', description: 'Play the clip backward.' },
  new_flag: { type: 'boolean' },
} };
const tool = { name: 'proposal_create', inputSchema: { type: 'object', additionalProperties: false, properties: {
  project_id: { type: 'string', description: 'Project id' },
  proposal: { type: 'object', properties: { options: { type: 'array', items: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { element_id: { type: 'string', description: 'Clip id' }, props } } } } } } } },
} } };
const reverseCase = { id: 'clip-reverse', requests: ['reverse this clip', 'play it backward'], capability: 'proposal-authoring', tool: 'proposal_create',
  field: 'proposal.options[].operations[].props.playback_reverse', example: { arguments: { project_id: 'p', proposal: { options: [{ operations: [{ element_id: 'c', props: { playback_reverse: true } }] }] } } },
  expect: { path: 'proposal.options[].operations[].props.playback_reverse', equals: true } };
const finds = () => [{ id: 'proposal-authoring' }];

test('an undescribed new field fails; the frozen allowance only shrinks', () => {
  const allowance = ['proposal_create:proposal', 'proposal_create:proposal.options', 'proposal_create:proposal.options[].operations', 'proposal_create:proposal.options[].operations[].props', 'proposal_create:proposal.options[].operations[].props.legacy_flag'];
  const base = { tools: [tool], propsBaseline: ['legacy_flag', 'new_flag'], cases: [reverseCase] };
  assert.deepEqual(fieldContractViolations({ ...base, allowance }), ['proposal_create:proposal.options[].operations[].props.new_flag: new agent-facing field needs a description']);
  const stale = fieldContractViolations({ ...base, allowance: [...allowance, 'proposal_create:proposal.options[].operations[].props.new_flag', 'proposal_create:gone', 'proposal_create:project_id'] });
  assert.ok(stale.some(item => item.startsWith('proposal_create:gone: listed as undescribed but no longer exists')));
  assert.ok(stale.some(item => item.startsWith('proposal_create:project_id: now described')));
});

test('a new creator-facing prop needs a feature case even when described', () => {
  const allowance = ['proposal_create:proposal', 'proposal_create:proposal.options', 'proposal_create:proposal.options[].operations', 'proposal_create:proposal.options[].operations[].props', 'proposal_create:proposal.options[].operations[].props.legacy_flag', 'proposal_create:proposal.options[].operations[].props.new_flag'];
  const violations = fieldContractViolations({ tools: [tool], allowance, propsBaseline: ['legacy_flag', 'new_flag'], cases: [] });
  assert.deepEqual(violations, ['proposal_create:proposal.options[].operations[].props.playback_reverse: new creator-facing prop needs a feature case in docs/tools/feature-cases.json']);
});

test('feature cases must be findable, described and expressible', () => {
  assert.deepEqual(featureCaseViolations({ tools: [tool], cases: [reverseCase], search: finds }), []);
  assert.match(featureCaseViolations({ tools: [tool], cases: [reverseCase], search: () => [] })[0], /catalog search "reverse this clip" does not reach proposal-authoring/);
  const featureOnly = () => [{ kind: 'feature', id: 'feature:props.playback_reverse', capability: 'proposal-authoring' }];
  assert.deepEqual(featureCaseViolations({ tools: [tool], cases: [reverseCase], search: featureOnly }), [], 'a feature entry reaches its owning capability');
  const otherFamily = () => [{ kind: 'feature', id: 'feature:x', capability: 'workspace-editing' }];
  assert.match(featureCaseViolations({ tools: [tool], cases: [reverseCase], search: otherFamily })[0], /does not reach proposal-authoring/);
  const undescribed = { ...reverseCase, field: 'proposal.options[].operations[].props.new_flag' };
  assert.match(featureCaseViolations({ tools: [tool], cases: [undescribed], search: finds }).join('\n'), /needs a description/);
  const wrong = { ...reverseCase, example: { arguments: { project_id: 'p', proposal: { options: [{ operations: [{ element_id: 'c', props: { keyframes: { reverse: true } } }] }] } } } };
  const messages = featureCaseViolations({ tools: [tool], cases: [wrong], search: finds }).join('\n');
  assert.match(messages, /example call is rejected/);
  assert.match(messages, /does not set .*playback_reverse to true/);
});

test('proposal operations are wrapped in a complete proposal and paths read through arrays', () => {
  const args = proposalArguments({ element_id: 'c', props: { playback_reverse: true } });
  assert.deepEqual(valuesAt(args, 'proposal.options[].operations[].props.playback_reverse'), [true]);
  assert.equal(args.proposal.schema_version, 2);
});

test('an expectation accepts any path that expresses the same outcome', () => {
  const expect = { path: 'a.scale', also: ['a.keyframes.scale'] };
  assert.equal(expectationMet({ a: { keyframes: { scale: [{ t: 0, v: 1.1 }] } } }, expect), true);
  assert.equal(expectationMet({ a: { inset: [0, 0, 0, 0] } }, expect), false);
});
