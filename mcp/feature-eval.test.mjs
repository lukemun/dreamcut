import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { episodeRecorder, runCase, sessionTools, simulatedTools } from './feature-eval.mjs';
import os from 'node:os';
import path from 'node:path';
import { editingInstructions } from '../desktop/editing-session.mjs';

const catalog = JSON.parse(spawnSync(process.execPath, ['mcp/server.mjs', '--catalog', '--all-tools', '--profile=full'], { encoding: 'utf8', env: { ...process.env, DREAMCUT_TOOL_FAMILIES: '' } }).stdout).tools;
const feature = JSON.parse(fs.readFileSync('docs/tools/feature-cases.json', 'utf8')).cases.find(item => item.id === 'clip-reverse');
const operation = props => ({ element_id: '11111111-1111-4111-8111-111111111111', props });
const proposal = props => ({ project_id: 'feature-case', proposal: { project_id: 'feature-case', expected_revision: 'a'.repeat(64), mode: 'workshop', decision: 'propose', summary: 'Reverse', assumptions: [], unresolved_gaps: [],
  caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 }, schema_version: 2, options: [{ id: 'a', label: 'Reverse', recommended: true, summary: 'Reverse', requested_mutations: 1, operations: [operation(props)] }] } });

/** A scripted model: each reply is a list of tool calls; the requests it received are kept. */
async function scripted(replies) {
  const received = [];
  const server = http.createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      received.push(JSON.parse(body));
      const calls = replies[received.length - 1] ?? [];
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: calls.length ? '' : 'Done.', tool_calls: calls.map(([name, args], index) => ({ id: `c${received.length}-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${server.address().port}/v1`, received, close: () => new Promise(resolve => server.close(resolve)) };
}

test('a model that finds the feature and sets it passes; a wrong guess is corrected by a named-field error', async () => {
  const { offered, provider } = sessionTools(catalog);
  assert.ok(provider.some(tool => tool.function.name === 'proposal_create'));
  const model = await scripted([
    [['capability_catalog', { action: 'search', query: 'reverse this clip' }]],
    [['proposal_create', proposal({ keyframes: { reverse: true } })]],
    [['proposal_create', proposal({ playback_reverse: true })]],
  ]);
  const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-eval-journal-'));
  try {
    const newEpisode = await episodeRecorder(journalDir);
    const result = await runCase({ feature, request: 'Reverse this clip', endpoint: model.endpoint, model: 'scripted', instructions: editingInstructions('feature-case', 'local'), tools: provider, offered, episode: newEpisode(), run: 0 });
    assert.equal(result.pass, true);
    assert.equal(result.invalid_attempts.length, 1);
    // The run is an activity-journal episode: its calls in order, with the case and pass on it.
    const records = fs.readFileSync(path.join(journalDir, 'episodes', `${result.episode_id}.jsonl`), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.deepEqual(records.filter(record => record.type === 'tool_call').map(record => record.data.tool), ['capability_catalog', 'proposal_create', 'proposal_create']);
    assert.equal(records[0].data.eval.case, 'clip-reverse');
    assert.equal(records.at(-1).data.eval_pass, true);
    const toolReplies = model.received[2].messages.filter(message => message.role === 'tool').map(message => message.content).join('\n');
    assert.match(toolReplies, /proposal-authoring/);
    assert.match(toolReplies, /props\.keyframes is not an accepted field; closest accepted: .*/);
  } finally { await model.close(); fs.rmSync(journalDir, { recursive: true, force: true }); }
});

test('a model that never sets the field fails the case', async () => {
  const { offered, provider } = sessionTools(catalog);
  const model = await scripted([[['timeline_get', { project_id: 'feature-case' }]], []]);
  try {
    const result = await runCase({ feature, request: 'Reverse this clip', endpoint: model.endpoint, model: 'scripted', instructions: 'x', tools: provider, offered });
    assert.equal(result.pass, false);
  } finally { await model.close(); }
});

test('a feature delivered by its own tool is graded on that call', () => {
  const storyboard = JSON.parse(fs.readFileSync('docs/tools/feature-cases.json', 'utf8')).cases.find(item => item.id === 'storyboard-draft-beats');
  const { offered } = sessionTools(catalog);
  const sim = simulatedTools({ feature: storyboard, offered, projectId: 'feature-case' });
  const shot = (start, end) => ({ source: 'sources/talk.mp4', start, end, label: 'Shot' });
  sim.call('storyboard_draft', { project_id: 'feature-case', revision: 3, beats: [{ shots: [shot(0, 9)] }] });
  sim.call('storyboard_draft', { project_id: 'feature-case', revision: 3, beats: [{ name: 'Hook', shots: [shot(0, 4.2)] }, { shots: [shot(4.2, 9)] }] });
  assert.deepEqual(sim.attempts.map(attempt => [attempt.tool, attempt.hit]), [['storyboard_draft', false], ['storyboard_draft', true]]);
});

