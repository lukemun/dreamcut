import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { randomUUID, createHash } from 'node:crypto';

export function gradeRefreshProbe(receipt) {
  const events = receipt.events ?? [];
  const profile = receipt.profile ?? 'editing';
  const initial = events.findIndex(e => e.kind === 'listed');
  const loaded = events.findIndex((e,i) => i > initial && e.kind === 'call' && e.tool === 'capability_catalog' && e.action === 'load' && e.family === 'cutout-preparation');
  const notification = events.findIndex((e,i) => i > loaded && e.kind === 'list_changed');
  const refreshed = events.findIndex((e,i) => i > notification && e.kind === 'listed' && e.has_cutout_status);
  const callAfter = profile === 'full' ? initial : refreshed;
  const called = events.findIndex((e,i) => i > callAfter && e.kind === 'call' && e.tool === 'cutout_status');
  const invoked = events.findIndex((e,i) => i > called && e.kind === 'probe_result');
  const editingChecks = {initial_hidden:initial >= 0 && events[initial].has_cutout_status === false, loaded:loaded > initial && loaded >= 0, notification:notification > loaded && notification >= 0,
    refreshed:refreshed > notification && refreshed >= 0, newly_exposed_call:called > refreshed && called >= 0 && invoked > called && invoked >= 0};
  const checks = {...(profile === 'full' ? {initial_exposed:initial >= 0 && events[initial].has_cutout_status === true, status_call:called > initial && called >= 0 && invoked > called && invoked >= 0} : editingChecks),
    valid_profile:['full','editing'].includes(profile), bounded:!events.some(e=>e.kind==='blocked_call'), healthy:!events.some(e=>['timeout','runtime_error'].includes(e.kind))};
  return {case_id:'client-tool-refresh-v1',version:2,profile,pass:Object.values(checks).every(Boolean),checks,client:receipt.client ?? null,
    scope:'Observed MCP refresh and invocation only; automated fixture clients do not establish Codex/Claude support or editing quality.'};
}

export async function serveRefreshProbe(receiptPath, profile = 'editing', timeoutMs = 120000) {
  if(!Number.isInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>600000)throw Error('Probe deadline must be 1–600 seconds');
  if(!['editing','full'].includes(profile))throw new Error('Probe profile must be editing or full');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const receipt={case_id:'client-tool-refresh-v1',version:2,profile,timeout_ms:timeoutMs,run_id:randomUUID(),started_at:new Date().toISOString(),client:null,
    server_sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'mcp/server.mjs'))).update(fs.readFileSync(path.join(root,'mcp/capability-catalog.mjs'))).digest('hex'),events:[]};
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
  const record = event => {receipt.events.push({...event,at:new Date().toISOString()});fs.writeFileSync(receiptPath,JSON.stringify({...receipt,grade:gradeRefreshProbe(receipt)},null,2));};
  const nonce=randomUUID();
  const http=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000){res.writeHead(413).end();return;}}
    res.setHeader('content-type','application/json');
    if(req.url==='/api/agent/tool-events'){res.end('{}');return;}
    let body;try{body=JSON.parse(raw);}catch{res.writeHead(400).end('{}');return;}
    if(req.url==='/api/projects/refresh-probe/analysis/cutout-preparation' && body.action==='status' && body.job_id==='probe-job') {
      res.end(JSON.stringify({state:'complete',job_id:'probe-job',probe_nonce:nonce,synthetic:true}));
    } else {record({kind:'blocked_call',reason:'Unexpected HTTP route'});res.writeHead(403).end('{}');}
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const child=spawn(process.execPath,[path.join(root,'mcp/server.mjs'),`--profile=${profile}`],{cwd:root,env:{...process.env,DREAMCUT_TOOL_FAMILIES:'',TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${http.address().port}`},stdio:['pipe','pipe','inherit']});
  const pending=new Map();let calls=0;
  const send=msg=>process.stdout.write(JSON.stringify(msg)+'\n');
  let closed=false;
  const finish=()=>{if(closed)return;closed=true;child.kill();http.closeAllConnections();http.close();input.close();process.stdin.pause();clearTimeout(timer);};
  process.once('SIGTERM',finish);
  process.once('SIGINT',finish);
  const timer=setTimeout(()=>{record({kind:'timeout'});finish();},timeoutMs);
  const input=createInterface({input:process.stdin});
  input.on('close',finish);
  child.on('error',error=>{record({kind:'runtime_error',message:error.message});finish();});
  child.on('exit',(code,signal)=>{if(!closed){record({kind:'runtime_error',message:`Server exited unexpectedly (${code ?? signal})`});finish();}});
  child.stdin.on('error',error=>{if(!closed){record({kind:'runtime_error',message:error.message});finish();}});
  createInterface({input:child.stdout}).on('line',line=>{
    let msg;try{msg=JSON.parse(line);}catch{record({kind:'runtime_error',message:'Invalid server JSON response'});finish();return;}
    const request=pending.get(msg.id);
    if(msg.method==='notifications/tools/list_changed')record({kind:'list_changed'});
    if(request?.method==='tools/list' && msg.result?.tools) record({kind:'listed',has_cutout_status:msg.result.tools.some(t=>t.name==='cutout_status'),count:msg.result.tools.length});
    if(request?.params?.name==='cutout_status' && !msg.result?.isError && msg.result?.content?.some(c=>c.text?.includes(nonce)))record({kind:'probe_result'});
    if(msg.id!==undefined)pending.delete(msg.id);
    send(msg);
  });
  input.on('line',line=>{
    let msg;try{msg=JSON.parse(line);}catch{return;}
    if(++calls>100){record({kind:'blocked_call',reason:'Request budget exceeded'});finish();return;}
    if(msg.method==='initialize'){receipt.client=msg.params?.clientInfo ?? null;record({kind:'initialized'});}
    if(msg.method==='tools/call'){
      const {name,arguments:args={}}=msg.params ?? {};
      const allowed=(name==='capability_catalog' && (['search','get'].includes(args.action ?? 'search') || (args.action==='load' && args.id==='cutout-preparation'))) ||
        (name==='cutout_status' && args.project_id==='refresh-probe' && args.job_id==='probe-job');
      if(!allowed){record({kind:'blocked_call',tool:name});send({jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Probe allows catalog discovery/load of cutout-preparation and status of refresh-probe/probe-job only.'}]}});return;}
      record({kind:'call',tool:name,action:args.action,...(name==='capability_catalog' && args.action==='load' ? {family:args.id} : {})});
    } else if(!['initialize','ping','tools/list','notifications/initialized','notifications/cancelled'].includes(msg.method)){
      send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Unsupported probe method'}});return;
    }
    if(msg.id!==undefined)pending.set(msg.id,msg);
    child.stdin.write(JSON.stringify(msg)+'\n');
  });
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [command,file,profile,timeout]=process.argv.slice(2);
  if(command==='serve' && file) await serveRefreshProbe(path.resolve(file),profile,timeout?Number(timeout):120000);
  else if(command==='grade' && file){const grade=gradeRefreshProbe(JSON.parse(fs.readFileSync(file,'utf8')));console.log(JSON.stringify(grade,null,2));if(!grade.pass)process.exitCode=1;}
  else {console.error('Usage: node mcp/client-refresh-probe.mjs serve <new-private-receipt.json> [editing|full] | grade <receipt.json>');process.exitCode=1;}
}
