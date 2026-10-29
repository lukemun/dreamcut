import {assertProject} from "@/lib/local-store/store";
import {prepareVoiceEnhancement} from "@/lib/agent/voice-enhancement-prepare";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(prepareVoiceEnhancement(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
