import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FROM_MCP, shellFiles } from './shell-files.mjs';

const desktop = path.dirname(fileURLToPath(import.meta.url));

test('the packaged shell includes every module the app reaches by relative import', async () => {
  const files = await shellFiles(desktop);
  // Modules a hand-written list missed when the app grew (review finding, 2026-10-10).
  for (const expected of ['main.mjs', 'preload.cjs', 'service.mjs', 'worker-crash-watchdog.mjs', 'chat-controller.mjs', 'chat-transcript.mjs', 'activity-journal.mjs', 'local-session.mjs', 'agent-login.mjs', 'codex-session-store.mjs']) {
    assert.ok(files.includes(expected), `${expected} is packaged`);
  }
  for (const file of files) {
    const source = FROM_MCP.has(file) ? path.join(desktop, '..', 'mcp', file) : path.join(desktop, file);
    assert.ok(fs.existsSync(source), `${file} exists at its packaged source`);
    assert.ok(!file.endsWith('.test.mjs'), `${file} is not a test`);
  }
});
