import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";
import { appendDayRecord, dayFilesIn } from "./day-files";
// One row per MCP dispatch (mcp/tool-runtime.mjs): tool, project, duration, outcome and error code; never
// arguments, results or messages. Day files follow the diagnostic-log bound in day-files.ts (90 days / 50 MB).
export function toolEventsDir() { return path.join(profileDir(), "tool-events"); }
export const toolEventSchema=z.object({schema_version:z.literal(1),event:z.enum(["dreamcut.tool_dispatch","openedit.tool_dispatch"]),call_id:z.string().uuid(),request_id:z.string().max(128),session_id:z.string().uuid(),tool:z.string().regex(/^[a-z][a-z0-9_]{0,100}$/),contract_version:z.literal(1),project_id:z.string().max(128).optional(),started_at:z.string().datetime(),finished_at:z.string().datetime(),duration_ms:z.number().nonnegative(),success:z.boolean(),job_state:z.string().max(40).optional(),job_id:z.string().max(128).optional(),reused:z.boolean().optional(),error_code:z.string().max(100).optional()}).strict();
export function recordToolEvent(raw:unknown) {
  const event=toolEventSchema.parse(raw);
  appendDayRecord(toolEventsDir(),new Date().toISOString().slice(0,10),event);
  return {recorded:true};
}
export type ToolEvent=z.infer<typeof toolEventSchema>;
/** The rows of one day, oldest first; rows that fail the schema are counted, not returned. */
export function readToolEventsDay(day:string,dir=toolEventsDir()):{events:ToolEvent[];invalid:number} {
  const file=path.join(dir,`${day}.jsonl`),events:ToolEvent[]=[];
  let invalid=0;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!fs.existsSync(file))return {events,invalid};
  for(const line of fs.readFileSync(file,"utf8").split("\n").filter(Boolean)){try{events.push(toolEventSchema.parse(JSON.parse(line)));}catch{invalid++;}}
  return {events,invalid};
}
export function toolUsage() {
  const dir=toolEventsDir(),seen=new Set<string>(),rows=new Map<string,{tool:string;calls:number;failures:number;duration_ms:number;reused:number;failed_jobs:number}>();
  let invalid=0;
  for(const name of dayFilesIn(dir)) for(const line of fs.readFileSync(path.join(dir,name),"utf8").split("\n").filter(Boolean)) {
    let e;try{e=toolEventSchema.parse(JSON.parse(line));}catch{invalid++;continue;}
    if(seen.has(e.call_id))continue;seen.add(e.call_id);
    const row=rows.get(e.tool)??{tool:e.tool,calls:0,failures:0,duration_ms:0,reused:0,failed_jobs:0};
    row.calls++;row.failures+=Number(!e.success);row.duration_ms+=e.duration_ms;row.reused+=Number(e.reused===true);row.failed_jobs+=Number(e.job_state==="failed");rows.set(e.tool,row);
  }
  return {rows:[...rows.values()],observed_calls:seen.size,invalid_records:invalid,limits:["DreamCut MCP dispatches since activation only; exclude provider OTEL and session capture from these totals.","Interrupted processes or unavailable event endpoint can lose events. Job failures are separate from successful status lookups.","Local logs contain no arguments, media, response bodies or token counts."]};
}
