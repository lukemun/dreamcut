import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopServiceAuth } from './desktop-service-auth.mjs';

test('desktop service credentials are restricted to explicit local HTTP endpoints', () => {
  const token = 'a'.repeat(64);
  assert.deepEqual(desktopServiceAuth('http://127.0.0.1:1234', token), { Cookie: `dreamcut_desktop_session=${token}` });
  assert.deepEqual(desktopServiceAuth('http://localhost:3123'), {});
  for (const url of ['https://example.com', 'http://127.0.0.1.example.com', 'http://user@localhost']) {
    assert.throws(() => desktopServiceAuth(url, token), /Invalid/);
  }
  assert.throws(() => desktopServiceAuth('http://localhost', token + '\r\nInjected: value'), /Invalid/);
});
