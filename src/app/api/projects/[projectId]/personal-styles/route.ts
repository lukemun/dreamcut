import { NextResponse } from "next/server";
import { z } from "zod";
import { assertProject } from "@/lib/local-store/store";
import { listPersonalStyles, readPersonalStyle, savePersonalStyle, styleInputSchema } from "@/lib/local-store/personal-styles";
type Params = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params; assertProject(projectId);
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(id ? { style: readPersonalStyle(id) } : { styles: listPersonalStyles() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
}
const requestSchema = z.object({ style: styleInputSchema, existing: z.object({ id: z.string().uuid(), expected_revision: z.number().int().positive() }).strict().optional() }).strict();
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = requestSchema.parse(await request.json());
    return NextResponse.json({ style: savePersonalStyle(projectId, body.style, body.existing) });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: (e as {status?:number}).status ?? 400 }); }
}
