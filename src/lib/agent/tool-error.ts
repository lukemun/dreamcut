export function toolError(code:string,message:string,recovery:Record<string,unknown>,status=400) {
  return Object.assign(new Error(message),{status,toolError:{schema_version:1,code,message,retryable:false,state_changed:false,recovery}});
}
export function toolErrorResponse(error:unknown) {
  const e=error as Error & {status?:number;toolError?:unknown};
  return Response.json({error:e.message??"Tool failed",tool_error:e.toolError},{status:e.status??400});
}
