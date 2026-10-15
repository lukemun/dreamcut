import {assertProject} from "@/lib/local-store/store";
import {enqueuePreparation,getPreparationJob} from "@/lib/agent/preparation-jobs";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;assertProject(projectId);const body=await request.json();return Response.json(body.action==="status"?await getPreparationJob(projectId,body.job_id):await enqueuePreparation(projectId,body));}catch(error){return toolErrorResponse(error);}}
