import { isLocalEditorRequest } from "@/lib/local-request";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { deleteTemplateDraft, readTemplateDraft, updateTemplateDraft } from "@/lib/local-store/template-drafts";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ draftId: string }> };

const failure = (error: unknown) => error instanceof ZodError
  ? NextResponse.json({ error: error.issues[0]?.message ?? "Invalid change" }, { status: 400 })
  : NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: (error as { status?: number }).status ?? 500 });

export async function GET(_request: Request, { params }: Params) {
  try { return NextResponse.json({ draft: readTemplateDraft((await params).draftId) }); }
  catch (error) { return failure(error); }
}

/** Title, what to copy, the marked part, or `request: true` to hand the draft to an agent. */
export async function PATCH(request: Request, { params }: Params) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "Template changes require the local editor." }, { status: 403 });
  try { return NextResponse.json({ draft: updateTemplateDraft((await params).draftId, await request.json()) }); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "Template changes require the local editor." }, { status: 403 });
  try { deleteTemplateDraft((await params).draftId); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error); }
}
