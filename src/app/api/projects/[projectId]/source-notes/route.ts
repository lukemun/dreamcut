import { readSourceNotes, writeSourceNotes } from "@/lib/local-store/source-notes";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Context) {
  try { return Response.json(readSourceNotes((await params).projectId, new URL(request.url).searchParams.get("asset_id") ?? "")); }
  catch (error) { return Response.json({error: (error as Error).message}, {status: 400}); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const body = await request.json();
    return Response.json(writeSourceNotes((await params).projectId, body.asset_id, body.expected_revision, body.notes));
  } catch (error) { return Response.json({error: (error as Error).message}, {status: 409}); }
}
