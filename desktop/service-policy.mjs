import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'dreamcut_desktop_session';
export function authorizeRequest(request, origin, token) {
  if (request.headers.host !== new URL(origin).host) return false;
  const suppliedOrigin = request.headers.origin;
  if (suppliedOrigin && suppliedOrigin !== origin) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const cookie = (request.headers.cookie ?? '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!cookie || !token) return false;
  const a = Buffer.from(cookie), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Browser sign-in for the local web app. A browser outside the desktop shell (the agent app's built-in
 * browser, or any browser) opens a single-use code URL minted by an already-authorized caller (the MCP);
 * the service exchanges it for the HttpOnly session cookie. A code is useless once spent or after its
 * short lifetime, so one that lands in an agent transcript grants nothing.
 */
export const SESSION_PATH = '/__dreamcut/session';
export const LAUNCH_CODE_PATH = '/__dreamcut/launch-code';
export const HEALTH_PATH = '/__dreamcut/health';
export function createLaunchCodes({ ttlMs = 120_000, now = () => Date.now(), random = () => randomBytes(24).toString('hex') } = {}) {
  const codes = new Map();
  return {
    mint() {
      for (const [code, expires] of codes) if (expires <= now()) codes.delete(code);
      const code = random();
      codes.set(code, now() + ttlMs);
      return { code, expires_in_seconds: Math.round(ttlMs / 1000) };
    },
    redeem(code) {
      if (typeof code !== 'string' || !codes.has(code)) return false;
      const expires = codes.get(code);
      codes.delete(code); // Single use, whether or not it was still valid.
      return expires > now();
    },
  };
}
/** Only same-origin relative paths; anything else lands on the editor home. */
export function safeNextPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}
/** Same Host and no cross-site navigation: the checks that defeat DNS rebinding and drive-by requests, without the cookie. */
export function sameSiteRequest(request, origin) {
  if (request.headers.host !== new URL(origin).host) return false;
  const suppliedOrigin = request.headers.origin;
  if (suppliedOrigin && suppliedOrigin !== origin) return false;
  return request.headers['sec-fetch-site'] !== 'cross-site';
}
export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

export function isApplicationUrl(value, origin) {
  try { return new URL(value).origin === origin; } catch { return false; }
}
export function isExternalWebUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
