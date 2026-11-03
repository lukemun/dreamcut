import {withEditRequestActor} from "@/lib/local-store/edit-attribution";
import {assertProject} from "@/lib/local-store/store";
import {placeCompiledCaptions} from "@/lib/agent/caption-place";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export const POST=withEditRequestActor(async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);return Response.json(await placeCompiledCaptions(projectId,await request.json()));}catch(error){return toolErrorResponse(error);}});
