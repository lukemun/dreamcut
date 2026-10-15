import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";
export const toolEventSchema=z.object({schema_version:z.literal(1),event:z.enum(["dreamcut.tool_dispatch","openedit.tool_dispatch"]),call_id:z.string().uuid(),request_id:z.string().max(128),session_id:z.string().uuid(),tool:z.string().regex(/^[a-z][a-z0-9_]{0,100}$/),contract_version:z.literal(1),project_id:z.string().max(128).optional(),started_at:z.string().datetime(),finished_at:z.string().datetime(),duration_ms:z.number().nonnegative(),success:z.boolean(),job_state:z.string().max(40).optional(),job_id:z.string().max(128).optional(),reused:z.boolean().optional(),error_code:z.string().max(100).optional()}).strict();
export function recordToolEvent(raw:unknown) {
  const event=toolEventSchema.parse(raw),dir=path.join(profileDir(),"tool-events");
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.appendFileSync(path.join(dir,`${new Date().toISOString().slice(0,10)}.jsonl`),JSON.stringify(event)+"\n",{mode:0o600});
  return {recorded:true};
}
export function toolUsage() {
  const dir=path.join(profileDir(),"tool-events"),seen=new Set<string>(),rows=new Map<string,{tool:string;calls:number;failures:number;duration_ms:number;reused:number;failed_jobs:number}>();
  let invalid=0;
  for(const name of fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)):[]) for(const line of fs.readFileSync(path.join(dir,name),"utf8").split("\n").filter(Boolean)) {
    let e;try{e=toolEventSchema.parse(JSON.parse(line));}catch{invalid++;continue;}
    if(seen.has(e.call_id))continue;seen.add(e.call_id);
    const row=rows.get(e.tool)??{tool:e.tool,calls:0,failures:0,duration_ms:0,reused:0,failed_jobs:0};
    row.calls++;row.failures+=Number(!e.success);row.duration_ms+=e.duration_ms;row.reused+=Number(e.reused===true);row.failed_jobs+=Number(e.job_state==="failed");rows.set(e.tool,row);
  }
  return {rows:[...rows.values()],observed_calls:seen.size,invalid_records:invalid,limits:["DreamCut MCP dispatches since activation only; exclude provider OTEL and session capture from these totals.","Interrupted processes or unavailable event endpoint can lose events. Job failures are separate from successful status lookups.","Local logs contain no arguments, media, response bodies or token counts."]};
}
