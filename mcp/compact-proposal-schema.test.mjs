import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { compactProposalInputSchema } from './compact-proposal-schema.mjs';
import { proposalArguments } from './feature-contract.mjs';

const full = { type: 'object', properties: { project_id: { type: 'string' }, proposal: JSON.parse(fs.readFileSync(new URL('./proposal-schema.json', import.meta.url), 'utf8')) }, required: ['project_id', 'proposal'] };

test('the compact proposal names every field of each summarised section and stays a fraction of the size', () => {
  const compact = compactProposalInputSchema(full);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 2);
  const operation = compact.properties.proposal.properties.options.items.properties.operations.items.properties;
  const fullOperation = full.properties.proposal.properties.options.items.properties.operations.items.properties;
  assert.equal(operation.props.properties, undefined);
  for (const field of Object.keys(fullOperation.props.properties)) assert.match(operation.props.description, new RegExp(`\\b${field}\\b`));
  assert.match(operation.props.description, /get feature:props\.<field>/);
  assert.deepEqual(operation.patch, fullOperation.patch, 'small sections stay complete');
});

test('a wrong field passes the compact view but the server validates with the full schema', () => {
  const validator = new AjvJsonSchemaValidator();
  const wrong = proposalArguments({ element_id: '11111111-1111-4111-8111-111111111111', props: { reverse: true } });
  assert.equal(validator.getValidator(compactProposalInputSchema(full))(wrong).valid, true);
  assert.equal(validator.getValidator(full)(wrong).valid, false);
  const run = spawnSync(process.execPath, ['mcp/server.mjs', '--catalog', '--all-tools', '--profile=full'], { encoding: 'utf8', env: { ...process.env, DREAMCUT_TOOL_FAMILIES: '', DREAMCUT_COMPACT_PROPOSAL_SCHEMA: '1' } });
  const catalog = JSON.parse(run.stdout);
  const published = catalog.tools.find(tool => tool.name === 'proposal_create');
  assert.equal(published.inputSchema.properties.proposal.properties.options.items.properties.operations.items.properties.props.properties, undefined);
  assert.ok(catalog.validation_schemas.proposal_create.properties.proposal.properties.options.items.properties.operations.items.properties.props.properties.playback_reverse);
  assert.deepEqual(catalog.validation_schemas.proposal_spatial_preflight, catalog.validation_schemas.proposal_create, 'preflight validates with the same full schema');
});
