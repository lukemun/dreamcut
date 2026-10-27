import {assertProject} from "@/lib/local-store/store";
import {compileFraming} from "@/lib/agent/framing-compile";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(compileFraming(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
