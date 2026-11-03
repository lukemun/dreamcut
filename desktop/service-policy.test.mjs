import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeRequest, SESSION_COOKIE, isApplicationUrl, isExternalWebUrl } from './service-policy.mjs';
const origin = 'http://127.0.0.1:4567', token = 'test-session-secret';
const request = (extra = {}) => ({ headers: { host: '127.0.0.1:4567', cookie: `${SESSION_COOKIE}=${token}`, ...extra } });
test('service permits session requests and rejects unauthenticated and cross-origin traffic', () => {
  assert.equal(authorizeRequest(request(), origin, token), true);
  for (const headers of [{cookie: ''}, {cookie: `${SESSION_COOKIE}=wrong`}, {host: 'attacker.test:4567'}, {origin: 'http://127.0.0.1:9999'}, {'sec-fetch-site': 'cross-site'}]) {
    assert.equal(authorizeRequest(request(headers), origin, token), false);
  }
  assert.equal(authorizeRequest(request({origin}), origin, token), true);
});
test('window navigation and external links have distinct boundaries', () => {
  assert.equal(isApplicationUrl(`${origin}/p/example`, origin), true);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://example.org', `${origin}.attacker.test`]) assert.equal(isApplicationUrl(url, origin), false);
  assert.equal(isExternalWebUrl('https://example.org'), true);
  assert.equal(isExternalWebUrl('file:///tmp/test'), false);
  assert.equal(isExternalWebUrl('javascript:alert(1)'), false);
});
