// Host-only service credentials. Never include these in tool schemas or results.
export function desktopServiceAuth(baseUrl, token) {
  if (!token) return {};
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) {
    throw Error('Invalid desktop service authentication configuration');
  }
  return { Cookie: `dreamcut_desktop_session=${token}` };
}
