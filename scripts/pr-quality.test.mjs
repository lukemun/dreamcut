import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pr-quality-comment.yml', import.meta.url), 'utf8');
const script = workflow.split('          script: |\n')[1].split('\n').map(line => line.replace(/^            /, '')).join('\n');
const execute = new Function('github', 'context', `return (async () => {${script}})()`);
async function report({conclusion = 'success', tests = 'success', head = 'abc', existing = false} = {}) {
  const calls = [];
  const context = {repo: {owner: 'owner', repo: 'repo'}, payload: {workflow_run: {
    id: 1, repository: {full_name: 'owner/repo'}, head_sha: 'abc', conclusion, pull_requests: [{number: 2}]
  }}};
  const jobs = [{name: 'PR quality gate', conclusion, steps: [{name: 'Typecheck', conclusion: 'success'}, {name: 'Regression tests', conclusion: tests}]}];
  const github = {rest: {
    actions: {listJobsForWorkflowRun: 'jobs'},
    pulls: {get: async () => ({data: {number: 2, state: 'open', head: {sha: head}}})},
    issues: {listComments: 'comments', createComment: async p => calls.push(['create', p]), updateComment: async p => calls.push(['update', p])}
  }, paginate: async endpoint => endpoint === 'jobs' ? jobs : existing ? [{id: 9, user: {login: 'github-actions[bot]'}, body: '<!-- openedit-pr-quality -->'}] : []};
  await execute(github, context);
  return calls;
}
test('successful required steps produce a readiness comment, not merge approval', async () => {
  const calls = await report();
  assert.equal(calls.length, 1);
  assert.match(calls[0][1].body, /READY FOR CODE REVIEW/);
  assert.match(calls[0][1].body, /no automatic approval or merge/);
});
test('failed or skipped tests never receive a ready grade', async () => {
  for (const tests of ['failure', 'skipped', null]) {
    const calls = await report({tests});
    assert.match(calls[0][1].body, /NOT READY/);
  }
});
test('stale runs do not overwrite a newer PR head', async () => assert.deepEqual(await report({head: 'new-head'}), []));
test('reruns update the existing bot comment', async () => assert.equal((await report({existing: true}))[0][0], 'update'));
test('privileged reporter never checks out or executes PR code or artifacts', () => {
  assert.doesNotMatch(workflow.replace(/^\s*#.*$/gm, ""), /actions\/checkout|download-artifact|pull_request_target|secrets\./);
  const ci = readFileSync(new URL('../.github/workflows/pr-quality.yml', import.meta.url), 'utf8');
  assert.match(ci, /contents: read/);
  assert.match(ci, /persist-credentials: false/);
  for (const source of [workflow, ci]) {
    for (const match of source.matchAll(/uses: (\S+)/g)) assert.match(match[1], /@[a-f0-9]{40}$/);
  }
});
