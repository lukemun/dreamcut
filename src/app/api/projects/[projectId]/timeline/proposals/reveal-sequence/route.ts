import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/api-helpers";
import { assertProject } from "@/lib/local-store/store";
import { compileRevealSequence } from "@/lib/agent/proposal-reveal-sequence";

/** Read-only compilation. Normal preflight and proposal_create still own admission. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const started = performance.now();
    const result = compileRevealSequence(await safeParseJson(request));
    return NextResponse.json({ ...result, compile_ms: performance.now() - started });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid reveal sequence" }, { status: 400 });
  }
}
