import { z } from "zod";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { captureProjectHistorySnapshot, latestProjectHistorySnapshot, readMetadata, withProjectLock, writeMetadata } from "@/lib/local-store/store";

const schema = z.object({ title: z.string().trim().min(1).max(200), expected_title: z.string() }).strict();
type Params = { params: Promise<{ projectId: string }> };

export const PATCH = withEditRequestActor(async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Enter a title between 1 and 200 characters." }, { status: 400 });
    return await withProjectLock(projectId, async () => {
      const metadata = readMetadata(projectId);
      const current = metadata.title ?? projectId;
      if (current !== parsed.data.expected_title) return Response.json({ error: "The title changed elsewhere. Reload and try again." }, { status: 409 });
      if (current !== parsed.data.title) {
        const before = captureProjectHistorySnapshot(projectId, "project_title_before");
        writeMetadata(projectId, { ...metadata, title: parsed.data.title }, "project_title");
        const after = latestProjectHistorySnapshot(projectId);
        return Response.json({ title: parsed.data.title, history: after ? { before, after } : null });
      }
      return Response.json({ title: parsed.data.title });
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the title." }, { status: (error as { status?: number }).status ?? 500 });
  }
});
