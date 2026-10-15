import { NextResponse } from "next/server";
import { z } from "zod";

import { safeParseJson } from "@/lib/api-helpers";
import { findProjectOpenSpace } from "@/lib/local-store/open-space";

const requestSchema = z.object({
  at_seconds: z.number().finite().min(0),
  proposal_id: z.string().min(1).max(128).optional(),
  option_id: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1).max(500).optional(),
  font_preset: z.string().min(1).max(64).optional(),
  style_variant: z.string().min(1).max(64).optional(),
  text_align: z.enum(["left", "center", "right"]).optional(),
  element_id: z.string().min(1).max(128).optional(),
  fill_level: z.enum(["medium", "large", "full"]).optional(),
}).strict().refine(value => !value.option_id || value.proposal_id, { message: "option_id requires proposal_id" });

/** POST — open space at a moment and the text size that fills it. Read-only. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const parsed = requestSchema.safeParse(await safeParseJson(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ") }, { status: 400 });
    return NextResponse.json(await findProjectOpenSpace(projectId, parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Open space unavailable";
    const status = (error as { status?: number }).status ?? (message.startsWith("Face detection is not verified") ? 409 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
