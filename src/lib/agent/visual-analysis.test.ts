import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import {prepareVisualAnalysis,executeVisualAnalysis,getVisualAnalysis,parseVisualAnswer,visualAnalysisInput} from './visual-analysis';
async function fixture(t:import('node:test').TestContext){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'oe-visual-analysis-'));
 const prior=process.env.TIMELINE_PROJECTS_DIR,config=process.env.DREAMCUT_VISION_BACKENDS;
 process.env.TIMELINE_PROJECTS_DIR=root;
 const project='synthetic';await fs.mkdir(path.join(root,project,'media'),{recursive:true});
 await fs.writeFile(path.join(root,project,'timeline.json'),'unchanged');
 await sharp({create:{width:48,height:32,channels:3,background:'red'}}).png().toFile(path.join(root,project,'media','source.png'));
 const state={requests:0,build:'fixture-v1',invalid:false};
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  res.setHeader('content-type','application/json');
  if(req.url==='/v1/logs')res.end('{}');
  else if(req.url==='/props')res.end(JSON.stringify({model_alias:'fixture-vlm',modalities:{vision:true},chat_template:'fixture',build_info:state.build,default_generation_settings:{n_ctx:16384}}));
  else if(req.url==='/apply-template')res.end(JSON.stringify({prompt:'fixture'}));
  else if(req.url==='/tokenize')res.end(JSON.stringify({tokens:[1,2,3]}));
  else if(req.url==='/v1/chat/completions'){
   state.requests++;assert.equal(body.response_format.json_schema.schema.properties.observations.minItems,1);assert.equal(body.response_format.json_schema.schema.properties.observations.maxItems,1);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/read-only visual analyst/);
   assert.match(body.messages[1].content[1].image_url.url,/^data:image\/jpeg;base64,/);
   const content=state.invalid?'not JSON':JSON.stringify({summary:'Fixture observation',observations:[{index:0,description:'A red image',uncertainties:['Synthetic fixture']}]});
   res.end(JSON.stringify({id:'fixture-'+state.requests,model:'fixture-vlm',usage:{prompt_tokens:40,completion_tokens:20},choices:[{message:{role:'assistant',content},finish_reason:'stop'}]}));
  }else{res.statusCode=404;res.end('{}');}
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
 const backend={endpoint,model:'fixture-vlm',revision:'fixture-weights-and-projector-v1'};
 process.env.DREAMCUT_VISION_BACKENDS=JSON.stringify({default:backend});
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));if(prior===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=prior;if(config===undefined)delete process.env.DREAMCUT_VISION_BACKENDS;else process.env.DREAMCUT_VISION_BACKENDS=config;await fs.rm(root,{recursive:true,force:true});});
 return {root,project,backend,state,input:{evidence:{kind:'image',source_relative_path:'source.png'},preset:'source-description'}};
}
test('saved observations deliver pixels, retain provenance and reuse verified work without editing',async t=>{
 const f=await fixture(t);const prepared=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});
 assert.equal((await prepareVisualAnalysis(f.project,f.input,{startWorker:false})).job_id,prepared.job_id);
 await executeVisualAnalysis(f.project,prepared.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});const done=await getVisualAnalysis(f.project,prepared.job_id);
 assert.equal(done.state,'completed');assert.equal(done.result.observations[0].evidence.index,0);assert.equal(done.result.origin,'model-observation-not-human-verified');
 assert.equal((await prepareVisualAnalysis(f.project,f.input,{startWorker:false})).reused,true);assert.equal(f.state.requests,1);
 assert.equal(await fs.readFile(path.join(f.root,f.project,'timeline.json'),'utf8'),'unchanged');
 await fs.appendFile(path.join(f.root,f.project,done.artifact!), 'corrupt');
 await assert.rejects(getVisualAnalysis(f.project,prepared.job_id),/changed/);
 const retry=await prepareVisualAnalysis(f.project,{...f.input,retry:true},{startWorker:false});assert.notEqual(retry.job_id,prepared.job_id);
});
test('stale source and changed runtime block before inference; failed output never auto-retries',async t=>{
 const f=await fixture(t);let job=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});
 await fs.appendFile(path.join(f.root,f.project,'media/source.png'),'changed');
 await executeVisualAnalysis(f.project,job.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});assert.equal((await getVisualAnalysis(f.project,job.job_id)).state,'failed');assert.equal(f.state.requests,0);
 job=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});f.state.build='changed';
 await executeVisualAnalysis(f.project,job.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});assert.equal((await getVisualAnalysis(f.project,job.job_id)).state,'failed');assert.equal(f.state.requests,0);
 f.state.invalid=true;job=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});await executeVisualAnalysis(f.project,job.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});
 assert.equal((await getVisualAnalysis(f.project,job.job_id)).state,'failed');assert.equal(f.state.requests,1);
 assert.equal((await prepareVisualAnalysis(f.project,f.input,{startWorker:false})).job_id,job.job_id);assert.equal(f.state.requests,1);
});
test('unversioned model does not reuse completed analysis and request changes invalidate identity',async t=>{
 const f=await fixture(t);process.env.DREAMCUT_VISION_BACKENDS=JSON.stringify({default:{endpoint:f.backend.endpoint,model:f.backend.model}});
 const first=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});await executeVisualAnalysis(f.project,first.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});
 const second=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});assert.notEqual(first.job_id,second.job_id);
 const third=await prepareVisualAnalysis(f.project,{...f.input,question:'Inspect visible text'},{startWorker:false});assert.notEqual(second.job_id,third.job_id);
});
test('arguments, model output coverage and host-only backend selection are bounded',async t=>{
 const f=await fixture(t);
 assert.equal(visualAnalysisInput.safeParse({evidence:{kind:'source',source_relative_path:'../outside',times_seconds:[1]}}).success,false);
 assert.equal(visualAnalysisInput.safeParse({evidence:{kind:'source',source_relative_path:'x',times_seconds:Array(13).fill(0)}}).success,false);
 assert.equal(visualAnalysisInput.safeParse({...f.input,endpoint:'http://remote.invalid'}).success,false);
 await assert.rejects(prepareVisualAnalysis(f.project,{...f.input,backend:'unknown'},{startWorker:false}),/not configured/);
 process.env.DREAMCUT_VISION_BACKENDS=JSON.stringify({default:{...f.backend,endpoint:'https://remote.invalid'}});
 await assert.rejects(prepareVisualAnalysis(f.project,f.input,{startWorker:false}),/loopback/);
 assert.throws(()=>parseVisualAnswer(JSON.stringify({summary:'x',observations:[{index:1,description:'x',uncertainties:[]}]}),[{index:0}]),/exactly one/);
 assert.throws(()=>parseVisualAnswer('```json\n{}\n```',[{index:0}]),/plain JSON/);
});

test('worker releases its lease after malformed job metadata',async t=>{
 const f=await fixture(t);const prepared=await prepareVisualAnalysis(f.project,f.input,{startWorker:false});
 const dir=path.join(f.root,f.project,'instruments/visual-analysis',prepared.job_id),file=path.join(dir,'job.json');
 const original=await fs.readFile(file,'utf8');await fs.writeFile(file,'broken');
 await assert.rejects(executeVisualAnalysis(f.project,prepared.job_id));
 await fs.writeFile(file,original);
 await executeVisualAnalysis(f.project,prepared.job_id,{usageEndpoint:f.backend.endpoint+'/v1/logs'});
 assert.equal((await getVisualAnalysis(f.project,prepared.job_id)).state,'completed');
});
