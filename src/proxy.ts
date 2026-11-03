import { NextResponse, type NextRequest } from "next/server";
import { localRequestRefusal } from "@/lib/local-request";
import { editorSiblingPreflightHeaders } from "@/lib/loopback-transport";

/**
 * The front door of the local editor. It listens on 127.0.0.1 and holds the creator's DreamCut Cloud sign-in, so
 * anything that reaches its API can edit projects or spend credits. Every request must name a loopback host (a
 * rebinding domain pointed at 127.0.0.1 carries its own name), and every API write from a browser must come from
 * the editor's own pages. Agents and the CLI call it without browser headers and are unaffected.
 */
export function proxy(request: NextRequest) {
  // Media reads from the editor's sibling loopback name are cross-origin; answer their preflight here.
  const preflight = editorSiblingPreflightHeaders(request);
  if (preflight) return new NextResponse(null, { status: 204, headers: preflight });
  const refusal = localRequestRefusal(request);
  return refusal ? NextResponse.json({ error: "forbidden", message: refusal }, { status: 403 }) : NextResponse.next();
}

// Next buffers every body the proxy sees and silently cuts it at 10MB, so video uploads skip the proxy and run
// localRequestRefusal in their own handlers. Keep this list in step with proxy-matcher.test.ts.
export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico|api/template-drafts$|api/projects/[^/]+/uploaded-assets$).*)" };
