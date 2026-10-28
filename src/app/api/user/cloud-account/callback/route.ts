import { completeCloudSignIn } from "@/lib/local-store/cloud-account";
import { requestStyleSync, startStyleSyncLoop } from "@/lib/local-store/cloud-style-sync";
import { claimInstall } from "@/lib/local-store/export-sharing";
import { refreshServerCloudSentry } from "@/lib/observability/cloud-sentry-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const page = (title: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DreamCut</title>
<style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#111;color:#eee}@media(prefers-color-scheme:light){body{background:#fafafa;color:#111}}</style></head>
<body><main><h1 style="font-size:20px;font-weight:600">${escape(title)}</h1></main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
);

/** dreamcut.io redirects here (loopback only) with a one-time code; the PKCE verifier and state
 * stay on this computer, so a forged callback cannot complete a sign-in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(`http://${request.headers.get("host") ?? url.host}`).hostname)) return page("Open DreamCut on this computer to sign in.", 403);
  const code = url.searchParams.get("code") ?? "", state = url.searchParams.get("state") ?? "";
  if (!code || !state) return page("This sign-in link isn't valid. Start again from Settings in DreamCut.", 400);
  try {
    const session = await completeCloudSignIn(code, state);
    // Link this install's earlier evidence, then bring the account style into this computer.
    void claimInstall().catch(error => console.error("[cloud-account] install claim failed", error));
    startStyleSyncLoop();
    void requestStyleSync();
    void refreshServerCloudSentry().catch(error => console.error("[cloud-telemetry] not started", error));
    return page(`DreamCut is signed in as ${session.email}. You can close this tab.`);
  } catch (error) {
    return page(error instanceof Error ? error.message : "Sign-in did not complete. Try again.", 400);
  }
}
