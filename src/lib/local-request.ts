/** Requests that read or change private local settings must come from the editor on this computer:
 * a loopback host, and for writes a same-origin browser request. */
export function isLocalEditorRequest(request: Request, write = false) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const authority = new URL(`${url.protocol}//${host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname)) return false;
    if (request.headers.get("sec-fetch-site") === "cross-site") return false;
    const origin = request.headers.get("origin");
    if (write && !origin) return false;
    return !origin || new URL(origin).origin === authority.origin;
  } catch { return false; }
}

/** The loopback origin this request reached, e.g. http://127.0.0.1:3123. */
export function localEditorOrigin(request: Request) {
  const url = new URL(request.url);
  return new URL(`${url.protocol}//${request.headers.get("host") ?? url.host}`).origin;
}
