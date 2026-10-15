// Local-only: run one prepared private editing case (`pnpm eval:case`) with the app's signed-in
// Claude Code or Codex session, then grade the staged proposal. Nothing is approved.
//
//   pnpm dev
//   pnpm eval:case private/editing-evals/steady-height-v1 --provider codex [--model NAME] [--runs 3]
//
// Each run prepares a fresh attempt from the frozen package (scripts/prepare-editing-fixture.mjs),
// serves its project from the running editor under the package's project ID, sends input/task.txt,
// and grades the newest pending proposal with evaluator/grade.mjs when the package has one.
// The editor's own style profile is used, not the package's frozen one; results say so.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareFixture } from '../../scripts/prepare-editing-fixture.mjs';
import { turn } from './provider-smoke.mjs';
import { discoverClaude } from '../claude-discovery.mjs';
import { discoverCodex } from '../codex-discovery.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
const origin = option('origin') ?? 'http://127.0.0.1:3123';
const projectsDir = path.resolve(process.env.TIMELINE_PROJECTS_DIR || path.join(root, 'projects'));
const MARKER = '.eval-case-attempt';

async function runOnce({ pkg, manifest, config, provider, agent, model, run }) {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${provider}-${run}`;
  const attempt = path.join(root, 'private', 'eval-case-attempts', manifest.case_id, stamp);
  prepareFixture(pkg, attempt);
  const project = path.join(projectsDir, config.project_id);
  // The editor serves projects from one folder; the attempt's copy is placed there for the run only.
  if (await fs.stat(project).then(() => true, () => false)) {
    if (!(await fs.stat(path.join(project, MARKER)).then(() => true, () => false))) throw Error(`${project} exists and is not an eval attempt; not touching it.`);
    await fs.rm(project, { recursive: true, force: true });
  }
  await fs.cp(path.join(attempt, 'projects', config.project_id), project, { recursive: true });
  await fs.writeFile(path.join(project, MARKER), `${stamp}\n`);
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-eval-case-'));
  const started = Date.now();
  try {
    const before = new Set(await fs.readdir(path.join(project, 'proposals')).catch(() => []));
    const task = await fs.readFile(path.join(attempt, 'task.txt'), 'utf8');
    const { end, calls } = await turn({ provider, agent, project, userData, model, origin, text: task.trim() });
    const staged = [];
    for (const name of await fs.readdir(path.join(project, 'proposals')).catch(() => [])) {
      if (before.has(name) || !name.endsWith('.json')) continue;
      const record = JSON.parse(await fs.readFile(path.join(project, 'proposals', name), 'utf8'));
      if (record.status === 'approved') throw Error('A proposal was approved during an eval run.');
      staged.push(record);
    }
    staged.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = staged.at(-1);
    const graderPath = path.join(pkg, 'evaluator', 'grade.mjs');
    const grader = await fs.stat(graderPath).then(() => true, () => false) ? (await import(pathToFileURL(graderPath).href)).grade : null;
    const start = JSON.parse(await fs.readFile(path.join(attempt, 'projects', config.project_id, 'timeline.json'), 'utf8'));
    const graded = !latest ? { pass: false, failures: ['no proposal was staged'] } : grader ? grader(latest, start) : { pass: null, failures: [], note: 'no structural grader; human review only' };
    await fs.cp(path.join(project, 'proposals'), path.join(attempt, 'result-proposals'), { recursive: true }).catch(() => {});
    return { run, provider, model: model ?? 'default', ended: end.type, seconds: Math.round((Date.now() - started) / 1000),
      tool_calls: calls.length, rejected_calls: calls.filter(call => !call.ok).map(call => ({ tool: call.tool, reason: call.reason })),
      rejected_proposal_attempts: calls.filter(call => call.tool === 'proposal_create' && !call.ok).length,
      proposals_staged: staged.length, proposal_id: latest?.proposal_id ?? null, ...graded, attempt: path.relative(root, attempt) };
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
    await fs.rm(project, { recursive: true, force: true });
  }
}

async function main() {
  const pkg = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || process.argv[2].startsWith('--')) throw Error('Usage: pnpm eval:case <prepared-package> --provider claude|codex [--model NAME] [--runs N]');
  const manifest = JSON.parse(await fs.readFile(path.join(pkg, 'manifest.json'), 'utf8'));
  const config = JSON.parse(await fs.readFile(path.join(pkg, 'input', 'run-config.json'), 'utf8'));
  const provider = option('provider');
  if (!['claude', 'codex'].includes(provider)) throw Error('--provider is claude or codex');
  const agent = await (provider === 'claude' ? discoverClaude : discoverCodex)({ env: process.env });
  if (agent.state !== 'available') throw Error(`${provider} is not installed or not signed in`);
  if (!(await fetch(`${origin}/api/projects`).then(() => true, () => false))) throw Error(`The editor is not running at ${origin}. Start it with pnpm dev.`);
  const runs = Math.max(1, Number(option('runs') ?? 1));
  const results = [];
  for (let run = 1; run <= runs; run++) {
    process.stdout.write(`${manifest.case_id} ${provider} run ${run}/${runs} `);
    const result = await runOnce({ pkg, manifest, config, provider, agent, model: option('model'), run })
      .catch(error => ({ run, provider, pass: false, failures: [error.message] }));
    results.push(result);
    console.log(`${result.pass === true ? 'pass' : result.pass === null ? 'needs human review' : 'FAIL'} ${result.seconds ?? 0}s`
      + `${result.rejected_proposal_attempts ? `, ${result.rejected_proposal_attempts} rejected proposal attempt(s)` : ''}${result.failures?.length ? `  ${result.failures.join('; ')}` : ''}`);
  }
  const out = path.join(root, 'private', 'eval-case-results', manifest.case_id);
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}-${provider}.json`);
  const manifestSha = createHash('sha256').update(await fs.readFile(path.join(pkg, 'manifest.json'))).digest('hex');
  await fs.writeFile(file, JSON.stringify({ case_id: manifest.case_id, fixture_manifest_sha256: manifestSha, origin,
    limits: ['Uses the running editor\'s style profile, not the frozen one', 'Structural grade only; motion quality needs human review'], results }, null, 2));
  const passed = results.filter(result => result.pass === true).length;
  console.log(`\n${passed}/${results.length} passed structurally. ${path.relative(root, file)}`);
  process.exitCode = results.some(result => result.pass === false) ? 1 : 0;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
