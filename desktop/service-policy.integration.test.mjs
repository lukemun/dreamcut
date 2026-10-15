import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { authorizeRequest, SESSION_COOKIE } from './service-policy.mjs';

test('HTTP boundary protects pages and media, including ranged requests', async () => {
  const token = 'integration-session';
  let origin;
  const server = http.createServer((req, res) => {
    if (!authorizeRequest(req, origin, token)) { res.writeHead(403); res.end(); return; }
    res.writeHead(req.headers.range ? 206 : 200); res.end('fixture');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/', '/api/projects', '/api/media/fixture.wav']) {
      assert.equal((await fetch(origin + route)).status, 403);
      assert.equal((await fetch(origin + route, {headers: {Cookie: `${SESSION_COOKIE}=${token}`}})).status, 200);
      assert.equal((await fetch(origin + route, {headers: {Cookie: `${SESSION_COOKIE}=${token}`, Origin: 'https://other.test'}})).status, 403);
    }
    assert.equal((await fetch(origin + '/api/media/fixture.wav', {headers: {Cookie: `${SESSION_COOKIE}=${token}`, Range: 'bytes=0-3'}})).status, 206);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
