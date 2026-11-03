import { discoverCodex } from './codex-discovery.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { connectCodex } from './codex-connection.mjs';
import assert from 'node:assert/strict';

// Read-only readiness check; no model turn, auth-file read, login or config write.
const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin' });
const found = await discoverCodex({ env });
assert.equal(found.state, 'available');
const client = await connectCodex(found.executable, { env });
try {
  const account = await client.request('account/read', { refreshToken: false });
  const models = await client.request('model/list', {});
  assert.ok(account.account, 'Codex sign-in is required');
  assert.ok(Array.isArray(models.data) && models.data.length > 0);
  console.log(JSON.stringify({ version: found.version, signedIn: true, accountType: account.account.type,
    availableModels: models.data.length, protocolReady: true, inferenceStarted: false }));
} finally { await client.close(); }
