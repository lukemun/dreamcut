import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Agents routinely name the project once, at the top level; the tool fills the body's copy.
test('proposal_create fills proposal.project_id from project_id and refuses a different project', {timeout:15000}, async t => {
  const calls=[];
  const server=http.createServer(async(req,res)=>{
    let body=''; for await (const part of req) body+=part;
    // Accounting (tool events, signals, the server's own proposal-work spans) is not the proposal call.
    if (!/\/api\/agent\/(tool-events|product-signals)$|\/timeline\/proposals\/work$/.test(req.url)) calls.push({url:req.url,body:body?JSON.parse(body):null});
    res.setHeader('content-type','application/json'); res.end(JSON.stringify({proposal_id:'draft'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const child=spawn(process.execPath,['mcp/server.mjs'],{env:{...process.env,TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${server.address().port}`},stdio:['pipe','pipe','pipe']});
  t.after(async()=>{child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const pending=new Map();let id=0;
  createInterface({input:child.stdout}).on('line',line=>{const msg=JSON.parse(line);pending.get(msg.id)?.(msg.result);});
  const request=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  await request('initialize',{clientInfo:{name:'proposal-project-id-fixture',version:'1'}});

  const tools=(await request('tools/list',{})).tools;
  const body=tools.find(tool=>tool.name==='proposal_create').inputSchema.properties.proposal;
  assert.equal(body.required.includes('project_id'),false,'the published body does not demand the id twice');

  const proposal={expected_revision:3,summary:'Tighten the intro'};
  const created=await request('tools/call',{name:'proposal_create',arguments:{project_id:'fixture',proposal}});
  assert.ok(!created.isError,JSON.stringify(created));
  assert.deepEqual(calls[0],{url:'/api/projects/fixture/timeline/proposals',body:{...proposal,project_id:'fixture'}});

  const matching=await request('tools/call',{name:'proposal_create',arguments:{project_id:'fixture',proposal:{...proposal,project_id:'fixture'}}});
  assert.ok(!matching.isError);
  assert.equal(calls[1].body.project_id,'fixture');

  const mismatched=await request('tools/call',{name:'proposal_create',arguments:{project_id:'fixture',proposal:{...proposal,project_id:'other'}}});
  assert.ok(mismatched.isError);
  assert.match(JSON.stringify(mismatched),/proposal\.project_id \\"other\\" does not match project_id \\"fixture\\"/);
  assert.equal(calls.length,2,'a mismatched call never reaches the editor');

  const preflight=await request('tools/call',{name:'proposal_spatial_preflight',arguments:{project_id:'fixture',proposal}});
  assert.ok(!preflight.isError,JSON.stringify(preflight));
  assert.deepEqual(calls[2].body,{proposal:{...proposal,project_id:'fixture'}});
});
