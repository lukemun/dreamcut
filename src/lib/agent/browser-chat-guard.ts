import { editorSiblingCorsHeaders } from "@/lib/loopback-transport";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Agent chat starts local processes, so only this editor may call it: the Host must
 * be loopback (blocks DNS rebinding) and the request must come from the same origin
 * (blocks other sites). Returns the loopback origin the editing MCP client should use.
 */
export function assertLocalEditorRequest(request: Request, { requireOrigin, siblingOrigin = false }: { requireOrigin: boolean;
  /** Read-only streams: also accept the editor's page on another loopback name of this port
   * (lib/loopback-transport opens event streams on [::1]). The Origin header names the page. */
  siblingOrigin?: boolean }) {
  const host = request.headers.get("host") ?? "";
  const url = new URL(`http://${host}`);
  if (!LOOPBACK.has(url.hostname)) throw new Error("The editing assistant only accepts local editor requests.");
  const origin = request.headers.get("origin");
  if (requireOrigin && !origin) throw new Error("The editing assistant only accepts requests from this editor.");
  if (siblingOrigin && origin && origin !== `http://${host}` && editorSiblingCorsHeaders(request)["Access-Control-Allow-Origin"] === origin) return `http://127.0.0.1${url.port ? `:${url.port}` : ""}`;
  if (origin && origin !== `http://${host}`) throw new Error("The editing assistant only accepts requests from this editor.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw new Error("The editing assistant only accepts requests from this editor.");
  return `http://127.0.0.1${url.port ? `:${url.port}` : ""}`;
}
