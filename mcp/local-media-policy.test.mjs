import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {once} from 'node:events';
import {assertLocalMediaCall,localMediaResult,LOCAL_MEDIA_TOOLS} from './local-media-policy.mjs';
const secret='PRIVATE_MEDIA_SENTINEL';
test('projects and timeline use scalar projections, dropping nested media, transcripts and names',()=>{
 const result=localMediaResult('timeline_get',{revision:'a'.repeat(64),elements:[{id:'clip-1',duration:4,source_url:secret,props:{image:secret},_peaks:[1,2],transcript:secret}],editing_context:{style:secret}});
 assert.equal(result.elements[0].duration,4);assert.ok(!JSON.stringify(result).includes(secret));
 assert.deepEqual(localMediaResult('library_status',{projects:[{id:'project-1',title:secret,thumbnail:secret}]}),{projects:[{id:'project-1'}]});
});
test('media, arbitrary family loading and external operations fail closed',()=>{
 for(const name of ['source_evidence','timeline_evidence','asset_generation_submit','capability_catalog','media_import','proposal_preview'])assert.throws(()=>assertLocalMediaCall(name,{}));
 const args=patch=>({project_id:'test',proposal:{options:[{operations:[{element_id:'clip-1',patch}]}]}});
 assert.doesNotThrow(()=>assertLocalMediaCall('proposal_create',args({volume:0.5})));
 for(const patch of [{source_url:'https://example.com'},{volume:secret}])assert.throws(()=>assertLocalMediaCall('proposal_create',args(patch)));
 assert.throws(()=>assertLocalMediaCall('proposal_create',{project_id:'test',proposal:{options:[{operations:[{create_visual:{source_url:secret}}]}]}}));
 assert.throws(()=>localMediaResult('editor_open',{url:'https://example.com/'}));
 assert.throws(()=>localMediaResult('editor_open',{url:'http://127.0.0.1:3123/api/media/x'}));
});
test('real MCP dispatcher blocks hidden tools before HTTP, projects success and errors',async t=>{
 const paths=[];const server=http.createServer((req,res)=>{paths.push(req.url);res.setHeader('content-type','application/json');
 if(req.url.includes('/fail/')) {res.statusCode=500;res.end(JSON.stringify({error:secret}));}
 else if(req.url.endsWith('/timeline/proposals'))res.end(JSON.stringify({proposal_id:'proposal-1',image:secret,preview:secret}));
 else if(req.url.includes('timeline'))res.end(JSON.stringify({revision:'b'.repeat(64),elements:[{id:'clip-1',duration:2,source_url:secret}]}));
 else if(req.url==='/api/library')res.end(JSON.stringify({projects:[{id:'test',title:secret}]}));
 else if(req.url.includes('/memory?'))res.end(JSON.stringify({media:secret}));
 else res.end('{}');});server.listen(0,'127.0.0.1');await once(server,'listening');
 const child=spawn(process.execPath,['mcp/server.mjs','--profile=full','--local-media-only'],{env:{...process.env,TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${server.address().port}`,DREAMCUT_EDITOR_AUTOSTART:'0'}});
 let stderr='';child.stderr.on('data',d=>stderr+=d);const waiting=new Map();let id=0;
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{const r=JSON.parse(line);waiting.get(r.id)?.(r);});
 const call=(method,params)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(new Error(stderr||'MCP timeout')),10000);waiting.set(n,r=>{clearTimeout(timer);resolve(r);waiting.delete(n);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});
 t.after(()=>{child.kill();lines.close();server.close();});
 assert.ok((await call('initialize',{clientInfo:{name:'privacy-test'}})).result.instructions.includes('local-media'));
 const listed=(await call('tools/list')).result.tools.map(t=>t.name);assert.deepEqual(new Set(listed),LOCAL_MEDIA_TOOLS);
 for(const name of ['source_evidence','capability_catalog','asset_generation_submit'])assert.equal((await call('tools/call',{name,arguments:{}})).result.isError,true);
 assert.equal(paths.length,0);
 const read=await call('tools/call',{name:'timeline_get',arguments:{project_id:'test'}});assert.ok(!JSON.stringify(read).includes(secret));assert.equal(JSON.parse(read.result.content[0].text).elements[0].duration,2);
 const failure=await call('tools/call',{name:'timeline_get',arguments:{project_id:'fail'}});assert.equal(failure.result.isError,true);assert.ok(!JSON.stringify(failure).includes(secret));
 const proposal={project_id:'test',expected_revision:'b'.repeat(64),mode:'workshop',decision:'propose',summary:'Lower volume',assumptions:[],unresolved_gaps:[],schema_version:2,options:[{id:'quieter',label:'Quieter',recommended:true,summary:'Lower volume',operations:[{element_id:'11111111-1111-4111-8111-111111111111',patch:{volume:0.5},rationale:'Requested'}]}]};
 const staged=await call('tools/call',{name:'proposal_create',arguments:{project_id:'test',proposal}});assert.equal(staged.result.isError,undefined);assert.equal(JSON.parse(staged.result.content[0].text).staged,true);assert.ok(paths.includes('/api/projects/test/timeline/proposals'));assert.ok(!JSON.stringify(staged).includes(secret));
 const resources=await call('resources/read',{uri:'file:///private/video.mp4'});assert.equal(resources.error.code,-32601);
 const bad=await call('tools/call',{name:'proposal_create',arguments:{project_id:'test',proposal:{options:[{operations:[{create_visual:{source_url:secret}}]}]}}});assert.equal(bad.result.isError,true);assert.ok(!JSON.stringify(bad).includes(secret));
});
