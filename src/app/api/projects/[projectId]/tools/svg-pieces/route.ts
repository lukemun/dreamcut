import {assertProject} from "@/lib/local-store/store";
import {compileProjectSvgPieces} from "@/lib/agent/svg-pieces";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await compileProjectSvgPieces(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
