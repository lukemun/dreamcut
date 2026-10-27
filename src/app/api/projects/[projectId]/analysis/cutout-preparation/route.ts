import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { enqueueCutout, readCutoutJob, verifyCutout } from "@/lib/media-analysis/cutout-preparation";
type Params={params:Promise<{projectId:string}>};
export async function POST(request:Request,{params}:Params) {
  try {
    const {projectId}=await params;assertProject(projectId);
    const body=await request.json();
    if (!body || typeof body!=="object" || Array.isArray(body)) throw new Error("Expected cutout request");
    if(body.action==="status") {
      const result=readCutoutJob(projectId,body.job_id);
      if(result.receipt) await verifyCutout(projectId,result.receipt);
      return NextResponse.json(result);
    }
    return NextResponse.json(await enqueueCutout(projectId,body));
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:400});}
}
