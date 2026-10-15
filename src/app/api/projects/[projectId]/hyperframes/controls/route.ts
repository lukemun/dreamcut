import { NextResponse } from "next/server";

import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { withMotionControls } from "@/lib/local-store/motion-proposal-review";
import { projectExists } from "@/lib/local-store/paths";

type Params = { params: Promise<{ projectId: string }> };

/**
 * The declared controls and current values of a motion graphic placed on the timeline,
 * read from its render receipt, so Properties can tune it like the proposal card does.
 * Read-only; a render without controls (or whose source changed) returns no controls.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params;
  if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const sourceUrl = new URL(request.url).searchParams.get("source_url") ?? "";
  const subject = motionSubjectFromSourceUrl(sourceUrl);
  if (subject?.kind !== "composition") return NextResponse.json({ error: "Not a motion graphic" }, { status: 400 });
  const [item] = withMotionControls(projectId, [{ kind: "composition", id: subject.id, operation_index: 0, source_url: sourceUrl }]) ?? [];
  return NextResponse.json(item);
}
