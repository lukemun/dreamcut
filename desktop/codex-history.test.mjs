import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleCodexHistory } from './codex-history.mjs';

test('restored history includes only visible text in conversation order', () => {
  const history = visibleCodexHistory({ privateMetadata: 'secret', turns: [{ items: [
    { type: 'userMessage', content: [{ type: 'text', text: 'hello' }, { type: 'image', url: 'private-path' }] },
    { type: 'reasoning', text: 'internal' },
    { type: 'commandExecution', text: 'private-output' },
    { type: 'agentMessage', text: 'reply', privateMetadata: 'secret' },
  ] }, { items: [{ type: 'userMessage', content: [{ type: 'text', text: 'next' }] }] }] });
  assert.deepEqual(history, { messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'reply' }, { role: 'user', text: 'next' }], truncated: false });
});

test('history limits keep the most recent messages and report omission', () => {
  const items = Array.from({ length: 205 }, (_, i) => ({ type: 'agentMessage', text: String(i) }));
  const history = visibleCodexHistory({ turns: [{ items }] });
  assert.equal(history.messages.length, 200);
  assert.equal(history.messages[0].text, '5');
  assert.equal(history.messages.at(-1).text, '204');
  assert.equal(history.truncated, true);
  assert.equal(visibleCodexHistory({ turns: [{ items: [{ type: 'agentMessage', text: 'x'.repeat(1024 * 1024 + 1) }] }] }).truncated, true);
});
