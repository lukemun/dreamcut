import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { z } from "zod";
import { prepareProjectWaveforms } from "@/lib/local-store/project-waveforms";

const schema = z.object({ sources: z.array(z.string().min(1)).min(1).max(20) });
export const POST = withEditRequestActor(async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid sources" }, { status: 400 });
  return Response.json(await prepareProjectWaveforms(projectId, body.data.sources));
});
