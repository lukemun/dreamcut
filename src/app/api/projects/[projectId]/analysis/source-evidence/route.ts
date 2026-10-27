import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { sourceEvidence } from "@/lib/media-analysis/source-evidence";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
  try { const {projectId}=await params;assertProject(projectId);return NextResponse.json(await sourceEvidence(projectId,await request.json())); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:400}); }
}
