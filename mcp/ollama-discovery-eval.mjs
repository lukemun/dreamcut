import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gradeProgressive} from './grade-progressive.mjs';

export async function discoveryLoop({model,chat,bridge,onTurn=()=>{}}) {
  const messages=[{role:'system',content:'You are a bounded tool-using operator. Use the supplied tools only. Find the masking capability through catalog discovery and load it. Then inspect synthetic project refresh-probe, job probe-job using its job-status tool. Report the exact returned probe marker. Do not prepare media, mutate any project, or guess a marker. If blocked, report the blocker. Stop after reporting the marker.'}];
  messages.push({role:'user',content:'Find the masking tools and check the status of project refresh-probe, job probe-job. Report its returned marker.'});
  let totalCalls=0;
  const usage={input_tokens:0,output_tokens:0};
  for(let turn=0;turn<8;turn++) {
    const list=await bridge('list');
    const schemas=list.tools;
    const response=await chat({model,messages,tools:schemas.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}})),stream:false,think:false,options:{temperature:0,num_ctx:16384,num_predict:512},keep_alive:'5m'});
    if(response.model!==model)throw Error(`Unexpected model response: ${response.model}`);
    usage.input_tokens+=response.prompt_eval_count ?? 0;usage.output_tokens+=response.eval_count ?? 0;
    onTurn({turn,tools:schemas.map(t=>t.name),response});
    const message=response.message;if(!message)throw Error('Missing assistant message');messages.push(message);
    if(!message.tool_calls?.length)return {answer:message.content ?? '',usage,totalCalls,turns:turn+1};
    for(const call of message.tool_calls){
      if(++totalCalls>15)throw Error('Tool call budget exceeded');
      const fn=call.function;
      if(!schemas.some(t=>t.name===fn.name))throw Error('Model called a tool not supplied on this turn');
      const result=await bridge('call',fn.name,fn.arguments);
      messages.push({role:'tool',tool_name:fn.name,content:JSON.stringify(result.result)});
    }
  }
  throw Error('Model turn budget exceeded');
}

async function main(){
 const model=process.argv[2];if(!model)throw Error('Usage: node mcp/ollama-discovery-eval.mjs <installed-model-tag>');
 const root=fileURLToPath(new URL('../',import.meta.url));
 const api=async(endpoint,body,timeout=110000)=>{const r=await fetch(`http://127.0.0.1:11434/api/${endpoint}`,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});const j=await r.json();if(!r.ok||j.error)throw Error(j.error??`Ollama HTTP ${r.status}`);return j;};
 const tags=await api('tags');const installed=tags.models.find(m=>m.name===model);if(!installed)throw Error('Choose an installed exact model tag; no download or fallback is permitted');
 const parent=path.join(root,'private/eval-tool-refresh');fs.mkdirSync(parent,{recursive:true});
 const dir=fs.mkdtempSync(path.join(parent,'ollama-'));
 const manifest={case_id:'progressive-tool-discovery-v1',adapter:'Ollama native tool-calling + owned MCP adapter v2',model,digest:installed.digest,started_at:new Date().toISOString(),settings:{temperature:0,think:false,num_ctx:16384,num_predict:512},status:'warming',code_hash:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex')};
 const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));save();console.log(JSON.stringify({run_dir:dir,model,status:manifest.status}));
 const bridgeFile=path.join(root,'mcp/progressive-eval-client.mjs');
 const bridge=async(action,tool,args)=>JSON.parse(execFileSync(process.execPath,[bridgeFile,action,dir,...(tool?[tool,JSON.stringify(args??{})]:[])],{encoding:'utf8',maxBuffer:2e6}));
 let started;
 try{
   const warm=Date.now();await api('generate',{model,prompt:'',keep_alive:'5m',options:{num_ctx:16384}},180000);manifest.warmup_ms=Date.now()-warm;
   await bridge('start');started=Date.now();manifest.status='running';save();
   const result=await discoveryLoop({model,bridge,chat:body=>api('chat',body),onTurn:event=>{fs.appendFileSync(path.join(dir,'model-turns.jsonl'),JSON.stringify(event)+'\n');console.log(JSON.stringify({turn:event.turn,tool_calls:event.response.message?.tool_calls?.map(c=>c.function.name),input_tokens:event.response.prompt_eval_count,output_tokens:event.response.eval_count}));}});
   fs.writeFileSync(path.join(dir,'answer.txt'),result.answer);
   const markers=result.answer.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi)??[];
   const grade=gradeProgressive(JSON.parse(fs.readFileSync(path.join(dir,'probe-receipt.json'))),JSON.parse(fs.readFileSync(path.join(dir,'client-receipt.json'))),markers.length===1?markers[0]:undefined);
   manifest.result={...result,grade};manifest.status=grade.pass?'passed':'failed';
 }catch(error){manifest.status='failed';manifest.error=error.message;}
 finally{manifest.elapsed_ms=started?Date.now()-started:null;try{await bridge('stop');}catch{}save();}
 console.log(JSON.stringify(manifest));if(manifest.status!=='passed')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
