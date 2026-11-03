import {sfxSearch} from "@/lib/agent/sfx-tools";
import {toolErrorResponse} from "@/lib/agent/tool-error";
export async function POST(request:Request){try{return Response.json(sfxSearch(await request.json()));}catch(error){return toolErrorResponse(error);}}
