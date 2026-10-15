import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { authorizeRequest, createLaunchCodes, safeNextPath, sameSiteRequest, sessionCookie, SESSION_COOKIE, SESSION_PATH } from './service-policy.mjs';

test('launch codes are single use and expire', () => {
  let clock = 1000;
  const codes = createLaunchCodes({ ttlMs: 120_000, now: () => clock });
  const { code, expires_in_seconds } = codes.mint();
  assert.equal(expires_in_seconds, 120);
  assert.equal(codes.redeem(code), true);
  assert.equal(codes.redeem(code), false, 'a spent code never works again');
  const late = codes.mint().code;
  clock += 120_001;
  assert.equal(codes.redeem(late), false, 'an expired code is refused');
  assert.equal(codes.redeem(undefined), false);
  assert.equal(codes.redeem('guess'), false);
});

test('sign-in only redirects within the editor', () => {
  assert.equal(safeNextPath('/p/trip/storyboard'), '/p/trip/storyboard');
  for (const unsafe of ['https://evil.test', '//evil.test/x', '/\\evil.test', 'javascript:alert(1)', undefined]) assert.equal(safeNextPath(unsafe), '/');
});

// The same request handling the service uses for its sign-in route, on a real loopback server.
async function withService(run) {
  const token = 'a'.repeat(64);
  const codes = createLaunchCodes();
  let origin;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://service.invalid');
    if (url.pathname === SESSION_PATH) {
      if (request.method !== 'GET' || !sameSiteRequest(request, origin) || !codes.redeem(url.searchParams.get('code'))) { response.writeHead(403); response.end(); return; }
      response.writeHead(303, { 'Set-Cookie': sessionCookie(token), Location: safeNextPath(url.searchParams.get('next')) }); response.end(); return;
    }
    if (!authorizeRequest(request, origin, token)) { response.writeHead(403); response.end(); return; }
    response.writeHead(200); response.end('editor');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  try { await run({ origin, codes, token }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('a browser signs in once with a code, then uses the HttpOnly cookie', () => withService(async ({ origin, codes, token }) => {
  assert.equal((await fetch(`${origin}/`)).status, 403, 'nothing works without signing in');
  const { code } = codes.mint();
  const signIn = await fetch(`${origin}${SESSION_PATH}?code=${code}&next=/p/trip`, { redirect: 'manual' });
  assert.equal(signIn.status, 303);
  assert.equal(signIn.headers.get('location'), '/p/trip');
  const cookie = signIn.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`));
  assert.equal((await fetch(`${origin}/p/trip`, { headers: { Cookie: cookie.split(';')[0] } })).status, 200);
  assert.equal((await fetch(`${origin}${SESSION_PATH}?code=${code}`, { redirect: 'manual' })).status, 403, 'the same link cannot be reused');
}));

/** fetch() drops a custom Host header, so rebinding is simulated with a raw request that really sends it. */
function rawStatus(origin, pathName, headers, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(`${origin}${pathName}`, { method, headers }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
}

test('DNS rebinding and cross-site requests cannot sign in or use the editor', () => withService(async ({ origin, codes, token }) => {
  const port = new URL(origin).port;
  const rebound = { Host: `evil.test:${port}` };
  assert.equal(await rawStatus(origin, `${SESSION_PATH}?code=${codes.mint().code}`, rebound), 403);
  assert.equal((await fetch(`${origin}${SESSION_PATH}?code=${codes.mint().code}`, { headers: { 'Sec-Fetch-Site': 'cross-site' }, redirect: 'manual' })).status, 403);
  assert.equal((await fetch(`${origin}${SESSION_PATH}?code=${codes.mint().code}`, { headers: { Origin: 'https://evil.test' }, redirect: 'manual' })).status, 403);
  const cookie = { Cookie: `${SESSION_COOKIE}=${token}` };
  assert.equal(await rawStatus(origin, '/', { ...cookie, ...rebound }), 403, 'a rebound host is refused even with the cookie');
  assert.equal(await rawStatus(origin, '/', cookie), 200, 'the same raw request with the real host works');
  assert.equal((await fetch(`${origin}/`, { headers: { ...cookie, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${origin}/`, { method: 'POST', headers: { ...cookie, Origin: 'https://evil.test' } })).status, 403);
}));
