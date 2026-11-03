import { NextResponse } from "next/server";
import { isLocalEditorRequest } from "@/lib/local-request";
import { readEditorContext, recordOpenProject } from "@/lib/local-store/open-project";

/** Read-only for agents: the project the creator has open in the editor and the open tabs. */
export async function GET(request: Request) {
  try { return NextResponse.json(readEditorContext(new Date(), new URL(request.url).searchParams.get("project_id") ?? undefined)); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 500 }); }
}

/** Written by the editor's own pages (also as a text/plain beacon when a window closes). Agents trust
 * this record to pick a project, so another site must never be able to set it. */
export async function POST(request: Request) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "Only the local editor records its open project." }, { status: 403 });
  try {
    const text = await request.text();
    return NextResponse.json(recordOpenProject(text ? JSON.parse(text) : {}));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
