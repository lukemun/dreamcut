import { NextResponse } from "next/server";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { readTimeline } from "@/lib/local-store/store";
import { editSpeechTranscript, transcriptRevision } from "@/lib/local-store/speech-transcript";
import { speechTranscript } from "@/lib/timeline/speech-transcript";
export const runtime = "nodejs";
export async function GET(_request: Request,{params}:{params:Promise<{projectId:string}>}) {
  try { const {projectId}=await params;const timeline=readTimeline(projectId);return NextResponse.json({revision:transcriptRevision(timeline),groups:speechTranscript(timeline.elements)}); }
  catch(cause) { return NextResponse.json({error:(cause as Error).message},{status:400}); }
}
export const POST = withEditRequestActor(async (request:Request,{params}:{params:Promise<{projectId:string}>})=>{
  try {
    const {projectId}=await params;const body=await request.json();
    if (!body || typeof body.laneKey!=="string" || typeof body.revision!=="string" || !["correct","regroup","cleanup","cut","fillers"].includes(body.action)
      || (body.action==="regroup" && body.wordLimit==null)
      || (body.action==="correct" && (typeof body.text!=="string" || typeof body.elementId!=="string"))
      || (body.wordLimit!=null && (!Number.isInteger(body.wordLimit) || body.wordLimit<1 || body.wordLimit>12))
      || (body.starts!=null && (!Array.isArray(body.starts) || body.starts.some((s:unknown)=>typeof s!=="number" || !Number.isFinite(s)))))
      return NextResponse.json({error:"Invalid transcript request."},{status:400});
    return NextResponse.json(await editSpeechTranscript(projectId,body));
  } catch(cause) { const error=cause as Error & {status?:number};return NextResponse.json({error:error.message},{status:error.status??400}); }
});
