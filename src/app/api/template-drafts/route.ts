import { isLocalEditorRequest } from "@/lib/local-request";
import { NextResponse } from "next/server";
import { createTemplateDraft, listTemplateDrafts } from "@/lib/local-store/template-drafts";

export const dynamic = "force-dynamic";

const failure = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong" }, { status: (error as { status?: number }).status ?? 500 });

export async function GET() {
  try { return NextResponse.json({ drafts: listTemplateDrafts() }); }
  catch (error) { return failure(error); }
}

/** A video dropped on the home page becomes a template draft (an unchanged copy in the profile). */
export async function POST(request: Request) {
  if (!isLocalEditorRequest(request, true)) return NextResponse.json({ error: "Template changes require the local editor." }, { status: 403 });
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Drop a video." }, { status: 400 });
    const draft = createTemplateDraft({ buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) { return failure(error); }
}
