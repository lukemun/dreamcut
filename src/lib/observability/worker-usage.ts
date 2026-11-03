import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {profileDir} from '../local-store/editing-memory';

/** Owned-worker receipts survive collector outages. Only numeric usage and runtime
 * identity are persisted; prompts, outputs and reasoning never enter this file. */
export function createWorkerUsageAudit(runtime:'codex'|'claude',directory=path.join(profileDir(),'worker-usage')){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const id=randomUUID(),file=path.join(directory,`${id}.json`);
 const record:{id:string;runtime:string;started_at:string;status:string;thread_id?:string;completed_at?:string;exit_code?:number|null;usage:Array<Record<string,number>>;coverage:string}={id,runtime,started_at:new Date().toISOString(),status:'running',usage:[],coverage:'Awaiting runtime usage'};
 let pending='';
 const save=()=>{const temp=file+'.tmp',fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(record,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);};
 const consume=(line:string)=>{
  let event:Record<string,any>;try{event=JSON.parse(line);}catch{return;}
  if(runtime==='codex'&&event.type==='thread.started'&&typeof event.thread_id==='string'){record.thread_id=event.thread_id;save();}
  if(runtime==='codex'&&event.type!=='turn.completed'||runtime==='claude'&&event.type!=='result')return;
  if(!event.usage||typeof event.usage!=='object')return;
  const usage:Record<string,number>={};
  for(const key of ['input_tokens','output_tokens','cached_input_tokens','cache_read_input_tokens','cache_creation_input_tokens','reasoning_output_tokens']){
   const n=event.usage[key];if(Number.isSafeInteger(n)&&n>=0)usage[key]=n;
  }
  if(usage.input_tokens==null||usage.output_tokens==null)return;
  record.usage.push(usage);record.coverage=runtime==='codex'?'Native turn usage; cached input is a subset of input':'Native Claude usage; cache read/write are separate from input';save();
 };
 save();
 return {file,
  chunk(chunk:string){pending+=chunk;let end:number;while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}},
  finish(status:'completed'|'failed',code:number|null){if(pending.trim())consume(pending);pending='';record.status=status;record.completed_at=new Date().toISOString();record.exit_code=code;if(!record.usage.length)record.coverage='Usage unavailable; do not treat as zero';save();},
 };
}
