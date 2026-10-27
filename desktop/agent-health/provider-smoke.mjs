// Local-only provider smoke (`pnpm agent:smoke`). Drives the app's real Claude Code and Codex
// sessions (the creator's subscription sign-in) through the shipped tool layer, journal and MCP
// server against a disposable fixture project on the running editor. Nothing is approved.
//
//   pnpm dev                                    # the editor this checks against
//   pnpm agent:smoke                            # every signed-in provider
//   pnpm agent:smoke --provider claude --model sonnet --case interrupted
//
// Every case must end with a completed reply, no disconnect and nothing pending or unknown in
// the journal. Results are written under private/agent-smoke/.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDesktopEditingSession } from '../editing-session.mjs';
import { connectEditingMcp } from '../../mcp/harness-mcp.mjs';
import { discoverClaude } from '../claude-discovery.mjs';
import { discoverCodex } from '../codex-discovery.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
const DEFAULT_ORIGIN = 'http://127.0.0.1:3123';
const origin = option('origin') ?? DEFAULT_ORIGIN;
const projectsDir = path.resolve(process.env.TIMELINE_PROJECTS_DIR || path.join(root, 'projects'));
const PROJECT = 'zz-agent-smoke';
const MARKER = '.agent-smoke-fixture';
const TURN_MS = 300_000;

/** A still and a tone: enough for frame checks and a volume proposal. Only ever replaces its own fixture. */
async function fixture() {
  const project = path.join(projectsDir, PROJECT);
  const exists = await fs.stat(project).then(() => true, () => false);
  if (exists && !(await fs.stat(path.join(project, MARKER)).then(() => true, () => false))) throw Error(`${project} exists and is not a smoke fixture; not touching it.`);
  await fs.rm(project, { recursive: true, force: true });
  await fs.mkdir(path.join(project, 'media'), { recursive: true });
  await fs.writeFile(path.join(project, MARKER), 'Disposable fixture for pnpm agent:smoke.\n');
  for (const args of [['-f', 'lavfi', '-i', 'color=c=0x3366aa:s=640x360', '-frames:v', '1', 'media/still.png'],
    ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', 'media/tone.wav']]) {
    const made = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { cwd: project });
    if (made.status !== 0) throw Error(`ffmpeg could not build the fixture: ${made.stderr}`);
  }
  const base = { project_id: PROJECT, props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, trim_start: 0, trim_end: null,
    volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' };
  await fs.writeFile(path.join(project, 'timeline.json'), JSON.stringify({ schema_version: 3, fps: 30, transitions: [], elements: [
    { ...base, id: '11111111-1111-4111-8111-111111111111', type: 'still', source_url: `/api/projects/${PROJECT}/media/still.png`, lane_key: 'visual_0', lane_index: 0 },
    { ...base, id: '22222222-2222-4222-8222-222222222222', type: 'music', source_url: `/api/projects/${PROJECT}/media/tone.wav`, lane_key: 'music_0', lane_index: 0 },
  ] }, null, 2));
  await fs.writeFile(path.join(project, 'metadata.json'), JSON.stringify({ lane_order_keys: [], lane_defaults: {}, muted_lane_keys: [], hidden_lane_keys: [], output_aspect_ratio: '16:9', delivery_target: 'web' }, null, 2));
  return project;
}

/** Drops the connection on the agent's first own tool call, as a crash or network loss would. */
const dropFirstCall = async options => {
  const mcp = await connectEditingMcp(options);
  let dropped = false;
  return { ...mcp, call: async (name, args, names) => {
    if (!dropped && !['capability_catalog', 'timeline_get'].includes(name)) { dropped = true; throw Error('simulated connection drop'); }
    return mcp.call(name, args, names);
  } };
};

const CASES = {
  frames: { request: 'Use frame-state to check the timeline at 0.5 and 1.5 seconds, then tell me in one sentence what is on screen.',
    expect: calls => calls.some(call => call.tool === 'run_instrument') || 'run_instrument was never called' },
  proposal: { request: 'Lower the music to half volume.',
    expect: calls => calls.some(call => call.tool === 'proposal_create' && call.ok) || 'no proposal was created' },
  interrupted: { request: 'Lower the music to half volume.', interrupt: true, followUp: 'Continue.',
    expect: (calls, journal) => journal.operations.some(operation => operation.status === 'unconfirmed') || 'the interrupted call was not settled as unconfirmed' },
  delegate: { request: 'Use agent_delegate with two helpers: one describes what is on screen at 0.5 seconds, the other at 1.5 seconds. Then give me one sentence from each report.',
    expect: calls => {
      const delegated = calls.find(call => call.tool === 'agent_delegate');
      if (!delegated?.ok) return 'agent_delegate did not succeed';
      const body = JSON.parse(delegated.text ?? '{}');
      return body.completed >= 2 || `only ${body.completed ?? 0} of ${body.of ?? '?'} helpers completed: ${JSON.stringify(body.results?.map(item => [item.status, item.error]))}`;
    } },
};

/** One creator message through the app's real session; returns how it ended and the tool calls. */
export async function turn({ provider, agent, project, userData, model, text, connectMcp, origin = DEFAULT_ORIGIN }) {
  const calls = [];
  let finish; const ended = new Promise(resolve => { finish = resolve; });
  const pending = new Map();
  const session = await openDesktopEditingSession({ provider, executable: agent.executable, projectDirectory: project, userData, origin, env: process.env,
    ...(connectMcp ? { connectMcp } : {}),
    onToolRecord: record => {
      if (record.phase === 'call') pending.set(record.id, record.tool);
      if (record.phase === 'result') {
        const ok = !record.error && record.result?.isError !== true;
        const reason = ok ? undefined : String(record.error ?? record.result?.content?.find(item => item.type === 'text')?.text ?? '').slice(0, 300);
        calls.push({ tool: record.tool, ok, ...(reason ? { reason } : {}),
          ...(record.tool === 'agent_delegate' ? { text: record.result?.content?.[0]?.text } : {}) });
      }
    },
    onEvent: event => { if (['completed', 'disconnected'].includes(event.type)) finish(event); } });
  try {
    const chosen = model ? (await session.models()).models.find(item => `${item.model} ${item.label}`.toLowerCase().includes(model.toLowerCase()))?.model : undefined;
    if (model && !chosen) throw Error(`No ${provider} model matches "${model}"`);
    await session.send(text, chosen);
    const end = await Promise.race([ended, new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), TURN_MS))]);
    return { end, calls, interrupted: session.interrupted };
  } finally { await session.close(); }
}

const journalFor = async (userData, provider, project) => JSON.parse(await fs.readFile(path.join(userData, `${provider}-editing-journals`,
  createHash('sha256').update(await fs.realpath(project)).digest('hex'), 'checkpoint.json'), 'utf8'));

async function runCase(provider, agent, id, model) {
  const spec = CASES[id];
  const project = await fixture();
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-agent-smoke-'));
  const started = Date.now();
  const problems = [];
  try {
    const first = await turn({ provider, agent, project, userData, model, origin, text: spec.request, ...(spec.interrupt ? { connectMcp: dropFirstCall } : {}) });
    let last = first;
    if (spec.interrupt) {
      if (first.end.type !== 'disconnected') problems.push(`the dropped call ended the turn as ${first.end.type}, not a disconnect`);
      // What the creator does: press Send again.
      last = await turn({ provider, agent, project, userData, model, origin, text: spec.followUp });
      if (!last.interrupted?.length) problems.push('reopening did not report the interrupted call');
    }
    if (last.end.type !== 'completed') problems.push(`turn ended as ${last.end.type}${last.end.message ? `: ${last.end.message}` : ''}`);
    const journal = await journalFor(userData, provider, project);
    const unsettled = journal.operations.filter(operation => ['pending', 'unknown'].includes(operation.status));
    if (unsettled.length) problems.push(`unresolved calls left behind: ${unsettled.map(operation => operation.tool).join(', ')}`);
    // Helpers keep their own journals under the conversation's delegates/ folder.
    const delegates = path.join(userData, `${provider}-editing-journals`, createHash('sha256').update(await fs.realpath(project)).digest('hex'), 'delegates');
    for (const checkpoint of await fs.readdir(delegates, { recursive: true }).catch(() => [])) {
      if (!checkpoint.endsWith('checkpoint.json')) continue;
      const helper = JSON.parse(await fs.readFile(path.join(delegates, checkpoint), 'utf8'));
      if (helper.operations.some(operation => ['pending', 'unknown'].includes(operation.status))) problems.push(`a helper left unresolved calls: ${checkpoint}`);
    }
    const calls = [...(spec.interrupt ? first.calls : []), ...last.calls];
    const verdict = spec.expect(calls, journal);
    if (verdict !== true) problems.push(verdict);
    return { provider, case: id, pass: !problems.length, problems, seconds: Math.round((Date.now() - started) / 1000), calls };
  } catch (error) {
    return { provider, case: id, pass: false, problems: [error.message], seconds: Math.round((Date.now() - started) / 1000) };
  } finally { await fs.rm(userData, { recursive: true, force: true }); }
}

async function main() {
  const reachable = await fetch(`${origin}/api/projects/${PROJECT}/timeline`).then(() => true, () => false);
  if (!reachable) throw Error(`The editor is not running at ${origin}. Start it with pnpm dev.`);
  const wanted = option('provider') ? [option('provider')] : ['claude', 'codex'];
  const cases = option('case') ? [option('case')] : Object.keys(CASES);
  for (const id of cases) if (!CASES[id]) throw Error(`Unknown case ${id}; cases: ${Object.keys(CASES).join(', ')}`);
  const results = [];
  for (const provider of wanted) {
    const agent = await (provider === 'claude' ? discoverClaude : discoverCodex)({ env: process.env });
    if (agent.state !== 'available') { results.push({ provider, case: '-', pass: false, problems: [`${provider} is not installed or not signed in`] }); continue; }
    for (const id of cases) {
      process.stdout.write(`${provider.padEnd(7)} ${id.padEnd(12)} `);
      const result = await runCase(provider, agent, id, option('model'));
      results.push(result);
      console.log(`${result.pass ? 'pass' : 'FAIL'} ${result.seconds ?? 0}s${result.problems.length ? `  ${result.problems.join('; ')}` : ''}`);
    }
  }
  const out = path.join(root, 'private', 'agent-smoke');
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify({ origin, results }, null, 2));
  const failed = results.filter(result => !result.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed. ${path.relative(root, file)}`);
  if (!process.argv.includes('--keep')) await fs.rm(path.join(projectsDir, PROJECT), { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
