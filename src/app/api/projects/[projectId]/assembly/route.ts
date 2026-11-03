import { NextResponse } from "next/server";

import { readAssemblyBrief, handoffAssemblyWorkspace } from "@/lib/local-store/assembly-workspaces";
import { assertProject } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const brief = readAssemblyBrief(projectId);
    if (!brief) return NextResponse.json({ error: "This project is not an assembly workspace" }, { status: 404 });
    return NextResponse.json({ brief });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read assembly brief" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    if (body?.action !== "handoff" || Object.keys(body).some(key => key !== "action")) {
      return NextResponse.json({ error: "Only action: handoff is supported" }, { status: 400 });
    }
    return NextResponse.json({ handoff: await handoffAssemblyWorkspace(projectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not hand off assembly" }, { status: 400 });
  }
}
