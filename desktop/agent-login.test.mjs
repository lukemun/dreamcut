import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAgentLogin, signInPage } from './agent-login.mjs';

const PAGE = 'https://claude.com/cai/oauth/authorize?code=true&state=abc123';

function fakeCli() {
  const calls = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.written = '';
    child.stdin = { write: text => { child.written += text; } };
    child.kill = () => child.emit('exit', null);
    calls.push({ file, args, options, child });
    return child;
  };
  return { spawn, calls };
}

test('sign-in page ignores loopback callbacks and partial lines', () => {
  assert.equal(signInPage(`Opening browser…\nIf the browser didn't open, visit: ${PAGE}\nPaste code here > `), PAGE);
  assert.equal(signInPage('visit: http://localhost:5555/callback\n'), null);
  assert.equal(signInPage(`visit: ${PAGE}`), null);
});

test('start reports the page; a browser approval finishes without a code', async () => {
  const { spawn, calls } = fakeCli();
  const login = createAgentLogin({ spawn, env: { PATH: '/bin', ANTHROPIC_API_KEY: 'secret' } });
  const started = login.call({ step: 'start' }, '/usr/local/bin/claude');
  calls[0].child.stdout.emit('data', Buffer.from(`visit: ${PAGE}\n`));
  assert.deepEqual(await started, { status: 'waiting', url: PAGE });
  assert.deepEqual(calls[0].args, ['auth', 'login', '--claudeai']);
  assert.equal(calls[0].options.env.ANTHROPIC_API_KEY, undefined);
  const waiting = login.call({ step: 'wait' });
  calls[0].child.emit('exit', 0);
  assert.deepEqual(await waiting, { status: 'signed-in' });
  // The outcome stays readable for a page that polls after the CLI exits.
  assert.deepEqual(await login.call({ step: 'wait' }), { status: 'signed-in' });
});

test('a pasted code must match this sign-in before reaching the CLI', async () => {
  const { spawn, calls } = fakeCli();
  const login = createAgentLogin({ spawn });
  const started = login.call({ step: 'start' }, '/claude');
  calls[0].child.stdout.emit('data', Buffer.from(`${PAGE}\n`));
  await started;
  assert.equal((await login.call({ step: 'code', code: 'token-only' })).retry, true);
  assert.equal((await login.call({ step: 'code', code: 'token#other' })).retry, true);
  assert.equal(calls[0].child.written, '');
  const sent = login.call({ step: 'code', code: ' token#abc123 ' });
  assert.equal(calls[0].child.written, 'token#abc123\n');
  calls[0].child.stderr.emit('data', Buffer.from('OAuth error: invalid authorization code\n'));
  calls[0].child.emit('exit', 1);
  assert.match((await sent).message, /did not work/);
});

test('without an installed CLI, sign-in explains what is needed', async () => {
  const { spawn, calls } = fakeCli();
  const result = await createAgentLogin({ spawn }).call({ step: 'start' });
  assert.equal(result.status, 'failed');
  assert.equal(calls.length, 0);
});
