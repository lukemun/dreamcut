import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import type {Activity} from './agent-activity';

const keys=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens'] as const;
type Totals=Record<typeof keys[number],number>;
const zero=():Totals=>Object.fromEntries(keys.map(k=>[k,0])) as Totals;
/** Native cumulative checkpoints reconcile each response. Repeated checkpoints are
 * not extra usage; discontinuities remain explicit, never invented as zero. */
export function createNativeUsageReader(){
 let previous:Record<string,number>|undefined,model='unknown';
 const seen=new Set<string>(),rows=new Map<string,{day:string;model:string;responses:number;tokens:Totals}>();
 const coverage={snapshots:0,duplicate_snapshots:0,invalid:0,counter_resets:0,unreconciled_intervals:0,prior_input_tokens:0,missing_cache:0,missing_reasoning:0};
 let latest:Record<string,number>|undefined,latestAt:string|undefined;
 return {
  consume(event:Activity){
   if(seen.has(event.id))return;seen.add(event.id);
   if(event.kind==='context'){model=event.model??'unknown';return;}
   if(event.kind==='coverage'&&event.error){coverage.invalid++;return;}
   if(event.kind!=='usage'||!event.usage)return;
   const {total,last}=event.usage;
   if([total,last].some(v=>keys.some(k=>v[k]!=null&&(!Number.isSafeInteger(v[k])||v[k]<0))||v.cached_input_tokens>v.input_tokens||v.reasoning_output_tokens>v.output_tokens)) {coverage.invalid++;return;}
   coverage.snapshots++;
   if(last.cached_input_tokens==null||total.cached_input_tokens==null)coverage.missing_cache++;
   if(last.reasoning_output_tokens==null||total.reasoning_output_tokens==null)coverage.missing_reasoning++;
   if(previous&&keys.every(k=>(total[k]??0)===(previous![k]??0))){coverage.duplicate_snapshots++;return;}
   let reconciled=true;
   if(previous){
    if(keys.some(k=>(total[k]??0)<(previous![k]??0))){coverage.counter_resets++;reconciled=false;}
    else if(keys.some(k=>(total[k]??0)-(previous![k]??0)!==(last[k]??0))){coverage.unreconciled_intervals++;reconciled=false;}
   }else coverage.prior_input_tokens=Math.max(0,total.input_tokens-last.input_tokens);
   previous=total;latest=total;latestAt=event.timestamp;
   // A discrepant cumulative interval has no trustworthy model/day attribution.
   // Its latest absolute counter remains available for reconciliation.
   if(!reconciled)return;
   const day=Number.isFinite(Date.parse(event.timestamp))?event.timestamp.slice(0,10):'unknown';
   const key=JSON.stringify([day,model]),row=rows.get(key)??{day,model,responses:0,tokens:zero()};
   row.responses++;for(const k of keys)row.tokens[k]+=last[k]??0;rows.set(key,row);
  },
  report(){const tokens=zero();for(const row of rows.values())for(const k of keys)tokens[k]+=row.tokens[k];return {rows:[...rows.values()],tokens,coverage,latest_cumulative:latest,latest_at:latestAt};},
 };
}
export async function readNativeModelUsage(directory:string,workspace:string,conversation?:string){
 const key=createHash('sha256').update(fs.realpathSync(workspace)).digest('hex').slice(0,24),root=path.join(directory,key);
 const index=path.join(root,'index.json');if(!fs.existsSync(index))return {sessions:[],limitations:['No native capture index. Start agent-activity before claiming coverage.']};
 const state=JSON.parse(fs.readFileSync(index,'utf8')) as {since:string;sessions:Array<{source:string;runtime:string;pending_bytes:number;gaps:number}>};
 const sessions=[];
 for(const source of state.sessions){
  if(source.runtime!=='codex'||conversation&&!path.basename(source.source).includes(conversation))continue;
  const id=createHash('sha256').update(source.source).digest('hex').slice(0,24),file=path.join(root,id,'events.jsonl');
  if(!fs.existsSync(file))continue;
  const reader=createNativeUsageReader();let malformed=0;
  for await(const line of readline.createInterface({input:fs.createReadStream(file,{encoding:'utf8'}),crlfDelay:Infinity})){
   try{reader.consume(JSON.parse(line));}catch{if(line.trim())malformed++;}
  }
  sessions.push({source:source.source,capture_since:state.since,pending_bytes:source.pending_bytes,capture_gaps:source.gaps,malformed,...reader.report()});
 }
 return {sessions,limitations:['Native Codex session checkpoints only; never add these totals to overlapping OTel usage.','Rows sum reconciled per-response usage. Latest cumulative includes earlier usage outside capture_since; it is not another charge.','No automatic editing/project phase attribution. Missing or truncated source history cannot be reconstructed. Claude token capture is not yet supported.']};
}
