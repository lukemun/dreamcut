import { registerCodexOutput } from "@/lib/local-store/asset-generation";
import { assertGenerationOrigin } from "@/lib/local-store/asset-generation";
type Params = { params: Promise<{ projectId: string; jobId: string }> };
export async function POST(request: Request, { params }: Params) {
  try {
    assertGenerationOrigin(request); const { projectId, jobId } = await params;
    if (Number(request.headers.get("content-length")) > 41 * 1024 * 1024) throw new Error("Upload limit is 40 MB.");
    const data = await request.formData(), file = data.get("file");
    if (!(file instanceof File)) throw new Error("Attach an image file.");
    return Response.json({ job: await registerCodexOutput(projectId, jobId, file) });
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
