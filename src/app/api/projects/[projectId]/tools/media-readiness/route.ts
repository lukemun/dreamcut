import {assertProject} from "@/lib/local-store/store";
import {mediaReadiness} from "@/lib/agent/media-readiness";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await mediaReadiness(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
