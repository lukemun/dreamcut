import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { recordEditingFeedback, recordFeedbackDisposition } from "@/lib/local-store/editing-feedback";
import { memoryEvents } from "@/lib/local-store/editing-memory";
import { listProposals } from "@/lib/local-store/proposals";
import { feedbackCoverage } from "@/lib/timeline/editing-feedback";
import { requestEditAttribution } from "@/lib/local-store/edit-attribution";

type Params = { params: Promise<{ projectId: string }> };

/** Read-only feedback coverage. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    return NextResponse.json(feedbackCoverage(memoryEvents(projectId), listProposals(projectId)));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const { action = "record", ...body } = await request.json();
    // The URL owns the project; never accept a different destination in the body.
    if (body.project_id !== undefined && body.project_id !== projectId) throw new Error("Project mismatch");
    const input = { ...body, project_id: projectId };
    const recordedBy = requestEditAttribution(request).actor === "human" ? "human" : "agent";
    if (action === "record") return NextResponse.json(recordEditingFeedback(input, recordedBy), { status: 201 });
    if (action === "disposition") return NextResponse.json(recordFeedbackDisposition(input), { status: 201 });
    throw new Error("Unknown feedback action");
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
