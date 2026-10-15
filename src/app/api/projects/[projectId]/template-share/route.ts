import { z } from "zod";
import { isLocalEditorRequest } from "@/lib/local-request";
import { assertProject } from "@/lib/local-store/store";
import { CloudSignedOutError, cloudAccountStatus } from "@/lib/local-store/cloud-account";
import { listProjectExports, shareTemplate, templateShareState } from "@/lib/local-store/cloud-template-share";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ projectId: string }> };
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const templateId = z.string().regex(/^(saved|user)-[a-z0-9-]{1,80}$/);

/** Share state for one of the creator's templates and this project's exports to use as its example. */
export async function GET(request: Request, { params }: Params) {
  if (!isLocalEditorRequest(request)) return response({ error: "Open Templates from the local editor." }, 403);
  try {
    const { projectId } = await params; assertProject(projectId);
    const template = templateId.parse(new URL(request.url).searchParams.get("template"));
    return response({ signed_in: cloudAccountStatus().signed_in, exports: listProjectExports(projectId), share: await templateShareState(template) });
  } catch (error) { return response({ error: error instanceof Error ? error.message : "Could not read sharing state." }, 400); }
}

const bodySchema = z.object({ template: templateId, export_file: z.string().min(1).max(255), credit_name: z.string().max(60) }).strict();
export async function POST(request: Request, { params }: Params) {
  if (!isLocalEditorRequest(request, true)) return response({ error: "Sharing requires the local editor." }, 403);
  try {
    const { projectId } = await params; assertProject(projectId);
    const body = bodySchema.parse(await request.json());
    const share = await shareTemplate({ projectId, templateId: body.template, exportFile: body.export_file, creditName: body.credit_name });
    return response({ share });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Could not share the template." }, error instanceof CloudSignedOutError ? 401 : 400);
  }
}
