import { isLocalEditorRequest } from "@/lib/local-request";
import { NextResponse } from "next/server";
import { saveTemplateDraft } from "@/lib/local-store/template-drafts";

export const dynamic = "force-dynamic";

/** The creator's Save click: the draft becomes one of their templates (Templates → Yours). */
export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "Template changes require the local editor." }, { status: 403 });
  try { return NextResponse.json(await saveTemplateDraft((await params).draftId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save" }, { status: (error as { status?: number }).status ?? 500 }); }
}
