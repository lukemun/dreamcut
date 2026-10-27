import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertProject } from "@/lib/local-store/store";
import { desktopRenderSessionCookie, renderBrowserStill } from "@/lib/render/browser-renderer";
import { assertEditorOrigin } from "@/lib/render/capture-origin";
import { frameCaptureSchema } from "@/lib/render/frame-capture-contract";

export const runtime = "nodejs";
let capturing = false;
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let temporary: string | undefined;
  let ownsCapture = false;
  try {
    const baseUrl = assertEditorOrigin(request);
    const { projectId } = await params;
    assertProject(projectId);
    const raw = await request.text();
    if (raw.length > 16_000_000) return Response.json({error:"Frame configuration is too large."},{status:413});
    const { frame, input } = frameCaptureSchema.parse(JSON.parse(raw));
    if (input.backend && input.backend !== "standard") return Response.json({error:"This capture path requires Standard."},{status:400});
    if (capturing) return Response.json({error:"Another frame is being captured. Try again in a moment."},{status:409});
    capturing = ownsCapture = true;
    temporary = await mkdtemp(path.join(os.tmpdir(), "dreamcut-frame-"));
    const output = path.join(temporary, "frame.png");
    await renderBrowserStill({ ...input, baseUrl, frame, output,
      sessionCookie: desktopRenderSessionCookie(),
    });
    return new Response(await readFile(output), { headers: {
      "Content-Type":"image/png", "Cache-Control":"no-store",
      "Content-Disposition":`attachment; filename="dreamcut-frame-${frame}.png"`,
    }});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "Frame capture failed."},{status:400});
  } finally {
    try { if (temporary) await rm(temporary,{recursive:true,force:true}); }
    finally { if (ownsCapture) capturing = false; }
  }
}
