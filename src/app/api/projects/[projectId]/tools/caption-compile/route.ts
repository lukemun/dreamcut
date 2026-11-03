import {assertProject} from "@/lib/local-store/store";
import {compileCaptionProposal} from "@/lib/agent/caption-proposal-compile";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await compileCaptionProposal(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}}
