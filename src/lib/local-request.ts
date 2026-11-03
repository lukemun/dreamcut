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

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Why src/proxy.ts refuses a request, or null to let it through: the Host must be loopback, and an API write that a
 * browser sends (`write`: any method but GET/HEAD/OPTIONS under /api/) must come from this same origin.
 * Non-browser clients (MCP, CLI) send neither Origin nor Fetch Metadata and pass on a loopback Host. */
export function localRequestRefusal(request: Request, write = !SAFE_METHODS.has(request.method) && new URL(request.url).pathname.startsWith("/api/")): string | null {
  let authority: URL;
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    authority = new URL(`${url.protocol}//${host}`);
    if (authority.host !== host.toLowerCase()) return "Unrecognized host.";
  } catch { return "Unrecognized host."; }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname)) return "DreamCut only answers on this computer.";
  if (!write) return null;
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (origin !== null && origin !== authority.origin) return "Requests must come from the DreamCut editor.";
  if (site !== null && site !== "same-origin" && site !== "none") return "Requests must come from the DreamCut editor.";
  return null;
}

/** The loopback origin this request reached, e.g. http://127.0.0.1:3123. */
export function localEditorOrigin(request: Request) {
  const url = new URL(request.url);
  return new URL(`${url.protocol}//${request.headers.get("host") ?? url.host}`).origin;
}

/** Code preparation executes trusted local code, not sandboxed hostile code. Accept
 * the same-origin editor and non-browser JSON clients (CLI/MCP). This is a browser
 * request boundary, not authentication against other processes on this computer.
 * Require JSON even for clients without Fetch Metadata: HTML forms and no-cors
 * requests must not reach code execution in browsers that omit those headers. */
export function isTrustedLocalCodeRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    if (!host || !["http:", "https:"].includes(url.protocol)) return false;
    const authority = new URL(`${url.protocol}//${host}`);
    if (authority.host !== host || !["localhost", "127.0.0.1", "[::1]"].includes(authority.hostname)) return false;
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return false;
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== authority.origin) return false;
    // Browsers always send Sec-Fetch-Site and pages cannot set it. Node's fetch (the MCP server, CLIs) sends
    // Sec-Fetch-Mode but never Sec-Fetch-Site, so only Site marks a browser request.
    const browserMetadata = request.headers.has("sec-fetch-site");
    if (browserMetadata && (origin !== authority.origin || request.headers.get("sec-fetch-site") !== "same-origin")) return false;
    return true;
  } catch { return false; }
}
