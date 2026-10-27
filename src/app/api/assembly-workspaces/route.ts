import { NextResponse } from "next/server";

import { createAssemblyWorkspace } from "@/lib/local-store/assembly-workspaces";
import { assemblyCreateRequestValidated } from "@/lib/timeline/assembly-workspaces";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = assemblyCreateRequestValidated.parse(await request.json());
    return NextResponse.json({ brief: createAssemblyWorkspace(body), review_url: `/p/${body.project_id}` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create assembly workspace";
    return NextResponse.json({ error: message }, { status: /already exists/.test(message) ? 409 : 400 });
  }
}
