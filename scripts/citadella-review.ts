/** Rebuild the bounded fixture through existing assembly/MCP tools; never restore a live cut. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import readline from 'node:readline';
import { applyProposalNumericOverrides } from '../src/lib/agent/proposal-overrides';
import { gradeLinkedSpacing } from './lib/grade-linked-spacing';

async function main() {
  const [caseFile, projectId, trialDir] = process.argv.slice(2);
  if (!caseFile || !projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Usage: pnpm exec tsx scripts/citadella-review.ts <case.json> <NEW-project-id> [trial-directory]');
  const config = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
  const snapshot = JSON.parse(fs.readFileSync(config.snapshot, 'utf8'));
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  if (![JSON.stringify(snapshot.timeline,null,2),JSON.stringify(snapshot.timeline,null,2)+'\n'].some(s=>hash(s)===config.expected_revision)) throw new Error('Frozen source revision mismatch');
  for (const [relative, expected] of Object.entries(config.media_sha256 ?? {})) {
    const mediaRoot = path.resolve(process.env.TIMELINE_PROJECTS_DIR ?? 'projects', config.project_id, 'media');
    const file = path.resolve(mediaRoot, relative);
    if (!file.startsWith(mediaRoot + path.sep) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw new Error('Frozen media mismatch');
  }
  const origin = Math.round((config.range[0] - .1)*30)/30;
  const selected = snapshot.timeline.elements.filter((e:any)=>config.element_ids.includes(e.id));
  if (selected.length!==19 || selected.some((e:any)=>!['still','sound_effect'].includes(e.type)||e.timeline_start<origin)) throw new Error('Unexpected fixture actors');
  const reportDir = path.resolve('private/evals/reviews',projectId);
  fs.mkdirSync(reportDir,{recursive:true});
  const child = spawn(process.execPath,['mcp/server.mjs'],{stdio:['pipe','pipe','pipe']});
  child.stderr.on('data',b=>fs.appendFileSync(path.join(reportDir,'mcp.log'),b));
  let seq=0;
  const pending = new Map<number,any>();
  readline.createInterface({input:child.stdout}).on('line',line=>{ const msg=JSON.parse(line); if(msg.id && pending.has(msg.id)){ const p=pending.get(msg.id);pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result); }});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP exited'));}pending.clear();});
  const request = (method:string,params:any) => new Promise<any>((resolve,reject)=>{const id=++seq; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`MCP timeout: ${method}`));},120000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  const call = async(name:string,args:any)=>{ const r=await request('tools/call',{name,arguments:args}); const text=r.content?.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n');if(r.isError)throw new Error(`${name}: ${text}`);const data=JSON.parse(text);fs.appendFileSync(path.join(reportDir,'tools.jsonl'),JSON.stringify({name,args,result:data})+'\n');return data; };
  try {
    await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'citadella-review',version:'1'}});
    await call('assembly_create',{project_id:projectId,title:trialDir?'Citadella · Sol spacing trial':'Citadella · reusable setup',objective:'Reproduce only the frozen Citadella three-image reveal and four clicks for repeatable linked-spacing evaluation. Neutral background; no surrounding footage or music. Preserve all source properties, shift the common origin to zero. Never overwrite an existing project.',sources:[],visual_directions:[],script_text:null,source_project_id:config.project_id,delivery_target:'reels',output_aspect_ratio:'9:16'});
    await call('timeline_get',{project_id:projectId});
    const fb=await call('editing_feedback_record',{project_id:projectId,session_id:projectId,turn_id:'setup',direction:'Create an isolated reusable Citadella-only setup and a previewable trial, preserving the source reveal and clicks.',provenance:'agent_paraphrase'});
    const feedbackId=fb.event_id??fb.event?.event_id;
    if(!feedbackId) throw new Error('Missing feedback ID');
    const common={project_id:projectId,responds_to_feedback_ids:[feedbackId]};
    const urls=[...new Set<string>(selected.map((e:any)=>e.source_url))];
    const sourceRoot=path.resolve(process.env.TIMELINE_PROJECTS_DIR??'projects',config.project_id,'media');
    const files=urls.map(url=>{const projectPrefix=`/api/projects/${config.project_id}/media/`;const sfxPrefix='/api/sfx-catalog/media/'; const root=url.startsWith(projectPrefix)?sourceRoot:path.resolve('sfx-library/audio');const suffix=url.startsWith(projectPrefix)?url.slice(projectPrefix.length):url.startsWith(sfxPrefix)?url.slice(sfxPrefix.length):null;if(!suffix)throw new Error('Unsupported source URL');const file=path.resolve(root,decodeURIComponent(suffix));if(!file.startsWith(root+path.sep))throw new Error('Unsafe source');return file;});
    const imported=await call('media_import',{project_id:projectId,source_paths:files,storage_mode:'managed_copy',create_if_missing:false});
    const sourceMap=Object.fromEntries(urls.map((url,i)=>[url,imported.assets.find((a:any)=>a.source_path===files[i])?.source_url]));
    if(Object.values(sourceMap).some(v=>!v))throw new Error('Incomplete media import');
    const lanes=new Set(selected.map((e:any)=>e.lane_key));
    await call('lane_order_set',{...common,lane_order_keys:snapshot.metadata.lane_order_keys.filter((l:string)=>lanes.has(l))});
    const ids:Record<string,string>={};
    for(const e of selected){const {id,project_id,created_at,updated_at,removed_at,removed_reason,position_locked,...input}=e; const element={...input,source_url:sourceMap[e.source_url],timeline_start:e.timeline_start-origin}; let result; if(e.type==='sound_effect'){const {duration,trim_start,trim_end,...playable}=element;result=await call('element_create_from_source_window',{...common,element:playable,source_start_seconds:trim_start,source_end_seconds:trim_start+duration*e.playback_rate,source_duration_seconds:e.props.source_duration_seconds});}else result=await call('element_create',{...common,element});ids[id]=result.element.id;}
    const baseline=await call('timeline_get',{project_id:projectId});
    fs.writeFileSync(path.join(reportDir,'baseline.json'),JSON.stringify(baseline,null,2));
    const mappedCase={...config,project_id:projectId,range:config.range.map((v:number)=>v-origin),element_ids:config.element_ids.map((id:string)=>ids[id]),groups:config.groups.map((g:any)=>Object.fromEntries(Object.entries(g).map(([k,id])=>[k,ids[id as string]]))),background_click:ids[config.background_click]};
    fs.writeFileSync(path.join(reportDir,'case.json'),JSON.stringify(mappedCase,null,2));
    let proposalId=null;
    if(trialDir){
      const source=JSON.parse(fs.readFileSync(path.join(trialDir,'proposal-result.json'),'utf8'));
      const p=structuredClone(source.proposal);p.project_id=projectId;p.expected_revision=hash(fs.readFileSync(path.resolve(process.env.TIMELINE_PROJECTS_DIR??'projects',projectId,'timeline.json'),'utf8'));p.responds_to_feedback_ids=[feedbackId];p.supersedes_proposal_ids=[];
      p.summary='Sol linked-spacing trial, isolated to Citadella: one Reveal spacing dial coordinates all reveals and clicks. First reveal 0.10 s; section end 4.20 s. Rebased from the recorded trial; no new model run.';
      for(const option of p.options){option.summary='One dial (0.35–0.50 s, proposed 0.45 s) coordinates the later flashes, holds, backgrounds and clicks; the first reveal and section end remain fixed.';for(const op of option.operations){if(!ids[op.element_id])throw new Error('Out-of-scope trial operation');op.element_id=ids[op.element_id];if(op.patch?.timeline_start!==undefined)op.patch.timeline_start-=origin;}for(const control of option.timing_controls??[])for(const b of control.bindings){if(b.field==='timeline_start'||b.subtract_offset_seconds!==undefined)b.offset_seconds=Math.round((b.offset_seconds-origin)*30)/30+1e-9;if(b.subtract_offset_seconds!==undefined)b.subtract_offset_seconds=Math.round((b.subtract_offset_seconds-origin)*30)/30+1e-9;} Object.assign(option,applyProposalNumericOverrides(option,[{operation_index:0,target:'timing_control',field:'spacing_seconds',value:option.timing_controls[0].spacing_seconds}]));}
      const timeline=JSON.parse(fs.readFileSync(path.resolve(process.env.TIMELINE_PROJECTS_DIR??'projects',projectId,'timeline.json'),'utf8'));
      const grade=gradeLinkedSpacing(timeline,p,mappedCase);fs.writeFileSync(path.join(reportDir,'grading.json'),JSON.stringify(grade,null,2));if(!grade.pass)throw new Error('Rebased proposal failed timing checks');
      await call('proposal_spatial_preflight',{project_id:projectId,proposal:p});
      const saved=await call('proposal_create',{project_id:projectId,proposal:p});proposalId=saved.proposal_id;
    }
    await call('editing_feedback_check',{project_id:projectId});
    const result={project_id:projectId,review_url:`http://127.0.0.1:3123/p/${projectId}`,proposal_id:proposalId,origin_seconds:origin,duration_seconds:config.range[1]-origin,source_revision:config.expected_revision,ids,source_case:path.resolve(caseFile),source_trial:trialDir?path.resolve(trialDir):null};
    fs.writeFileSync(path.join(reportDir,'receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{child.stdin.end();child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
