import { NextResponse } from "next/server";
import { isLocalEditorRequest } from "@/lib/local-request";
import { sessionEvidenceBundle, sessionEvidenceManifest } from "@/lib/observability/session-evidence";

type Params = { params: Promise<{ projectId: string }> };

/** The local evidence a bug report may attach for this project (`?manifest=1` lists it first). Read from
 * local files only, for the local editor only; nothing is sent anywhere by this route. */
export async function GET(request: Request, { params }: Params) {
  if (!isLocalEditorRequest(request)) return NextResponse.json({ error: "Session evidence is read by the local editor only." }, { status: 403 });
  try {
    const { projectId } = await params;
    const bundle = sessionEvidenceBundle(projectId);
    if (new URL(request.url).searchParams.get("manifest") === "1") return NextResponse.json(sessionEvidenceManifest(bundle));
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
