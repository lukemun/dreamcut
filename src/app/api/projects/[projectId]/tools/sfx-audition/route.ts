import {assertProject} from "@/lib/local-store/store";
import {sfxAuditionPrepare} from "@/lib/agent/sfx-tools";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await sfxAuditionPrepare(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
