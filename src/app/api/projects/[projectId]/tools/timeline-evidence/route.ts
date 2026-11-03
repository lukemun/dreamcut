import {assertProject} from "@/lib/local-store/store";
import {timelineEvidence} from "@/lib/agent/timeline-evidence";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await timelineEvidence(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
