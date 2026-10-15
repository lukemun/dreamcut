const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Agent chat starts local processes, so only this editor may call it: the Host must
 * be loopback (blocks DNS rebinding) and the request must come from the same origin
 * (blocks other sites). Returns the loopback origin the editing MCP client should use.
 */
export function assertLocalEditorRequest(request: Request, { requireOrigin }: { requireOrigin: boolean }) {
  const host = request.headers.get("host") ?? "";
  const url = new URL(`http://${host}`);
  if (!LOOPBACK.has(url.hostname)) throw new Error("The editing assistant only accepts local editor requests.");
  const origin = request.headers.get("origin");
  if (requireOrigin && !origin) throw new Error("The editing assistant only accepts requests from this editor.");
  if (origin && origin !== `http://${host}`) throw new Error("The editing assistant only accepts requests from this editor.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new Error("The editing assistant only accepts requests from this editor.");
  return `http://127.0.0.1${url.port ? `:${url.port}` : ""}`;
}
