import { isLocalEditorRequest } from "@/lib/local-request";
import { currentCloudTelemetry } from "@/lib/observability/cloud-sentry-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sentry settings for the page while signed in to DreamCut; `{ sentry: null }` signed out. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isLocalEditorRequest(request)) return Response.json({ error: "Open DreamCut from the local editor." }, { status: 403, headers });
  try { return Response.json(await currentCloudTelemetry(), { headers }); }
  catch { return Response.json({ sentry: null }, { headers }); }
}
