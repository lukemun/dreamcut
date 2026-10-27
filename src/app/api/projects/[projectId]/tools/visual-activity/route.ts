import {assertProject} from "@/lib/local-store/store";
import {isTrustedLocalCodeRequest} from "@/lib/local-request";
import {visualActivityPrepare} from "@/lib/agent/visual-activity-tool";
import {toolErrorResponse} from "@/lib/agent/tool-error";
/** Read-only visual activity curves and sound alignment. Running composition activity_js needs a trusted local request. */
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);const body=await request.json() as Record<string,unknown>;if(body.composition_activity!==undefined&&!isTrustedLocalCodeRequest(request))return Response.json({error:"Running activity_js requires a local editor or JSON CLI request."},{status:403});return Response.json(await visualActivityPrepare(projectId,body));}catch(error){return toolErrorResponse(error);}}
