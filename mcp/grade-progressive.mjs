import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeRefreshProbe } from './client-refresh-probe.mjs';

export function gradeProgressive(probe, client, reportedMarker) {
  const transport=gradeRefreshProbe(probe), events=client.events ?? [];
  const initial=events.findIndex(e=>e.kind==='registered');
  const search=events.findIndex((e,i)=>i>initial && e.kind==='dispatch' && e.tool==='capability_catalog' && (e.arguments?.action ?? 'search')==='search');
  const load=events.findIndex((e,i)=>i>search && e.kind==='dispatch' && e.tool==='capability_catalog' && e.arguments?.action==='load' && e.arguments.id==='cutout-preparation');
  const refresh=events.findIndex((e,i)=>i>load && e.kind==='registered' && e.names?.includes('cutout_status'));
  const status=events.findIndex((e,i)=>i>refresh && e.kind==='dispatch' && e.tool==='cutout_status');
  const response=events.find((e,i)=>i>status && e.kind==='result' && e.tool==='cutout_status' && !e.result?.isError);
  let marker;
  for(const c of response?.result?.content ?? []) {if(c.type==='text')try{marker=JSON.parse(c.text).probe_nonce ?? marker;}catch{}}
  const checks={same_run:typeof probe.run_id==='string' && probe.run_id.length>0 && probe.run_id===client.run_id, transport:transport.pass, initial_hidden:initial>=0 && !events[initial].names?.includes('cutout_status'), searched:search>=0,
    loaded:load>search && load>=0, registered:refresh>load && refresh>=0, dispatched:status>refresh && status>=0,
    reported_marker:typeof marker==='string' && marker.length>0 && marker===reportedMarker,
    bounded:!events.some(e=>['rejected','timeout','runtime_error'].includes(e.kind))};
  return {case_id:'progressive-tool-discovery-v1',grader_version:2,pass:Object.values(checks).every(Boolean),checks,
    client:client.client,tool_calls:events.filter(e=>e.kind==='dispatch').length,
    elapsed_ms:response && events[initial] ? Date.parse(response.at)-Date.parse(events[initial].at) : null,
    token_usage:null, scope:'Model plus owned MCP adapter; not native Codex automatic refresh, editing quality or token-savings evidence.'};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [dir,marker]=process.argv.slice(2);
  if(!dir||!marker)throw Error('Usage: node mcp/grade-progressive.mjs <run-dir> <model-reported-marker>');
  const result=gradeProgressive(JSON.parse(fs.readFileSync(path.join(dir,'probe-receipt.json'))),JSON.parse(fs.readFileSync(path.join(dir,'client-receipt.json'))),marker);
  fs.writeFileSync(path.join(dir,'model-grade.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;
}
