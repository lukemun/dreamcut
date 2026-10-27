import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

const unavailableReason =
  "Automated audition assembly is not included in this standalone distribution. Your saved winner selections remain available for manual or agent-assisted assembly.";

export async function GET(_request: Request, { params }: Params) {
  await params;
  return NextResponse.json({ enabled: false, contract: null, job: null, reason: unavailableReason });
}

export const POST = withEditRequestActor(async function POST(_request: Request, { params }: Params) {
  await params;
  return NextResponse.json({ error: unavailableReason }, { status: 501 });
});
