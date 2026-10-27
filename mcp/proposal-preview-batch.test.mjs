import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('preview transport supports combined selections and preserves single-preview identity without approval', {timeout:15000}, async t => {
  const calls=[];
  const server=http.createServer(async(req,res)=>{
    let body=''; for await (const part of req) body+=part;
    if (!/\/api\/agent\/(tool-events|product-signals)$/.test(req.url)) calls.push({method:req.method,url:req.url,body:body?JSON.parse(body):null});
    res.setHeader('content-type','application/json'); res.end(JSON.stringify({proposal_id:req.url.includes('/batch/')?'batch':'draft'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const child=spawn(process.execPath,['mcp/server.mjs'],{env:{...process.env,TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${server.address().port}`},stdio:['pipe','pipe','pipe']});
  t.after(async()=>{child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const pending=new Map();let id=0;
  createInterface({input:child.stdout}).on('line',line=>{const msg=JSON.parse(line);pending.get(msg.id)?.(msg.result);});
  const request=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  await request('initialize',{clientInfo:{name:'preview-fixture',version:'1'}});
  const single=await request('tools/call',{name:'proposal_preview',arguments:{project_id:'fixture',proposal_id:'draft',option_id:'one'}});
  assert.ok(!single.isError);
  assert.deepEqual(calls[0],{method:'POST',url:'/api/projects/fixture/timeline/proposals/draft/preview',body:{option_id:'one'}});
  const selections=[{proposal_id:'a',option_id:'one'},{proposal_id:'b',option_id:'one',overrides:[]}];
  const batch=await request('tools/call',{name:'proposal_preview',arguments:{project_id:'fixture',selections}});
  assert.ok(!batch.isError);
  assert.deepEqual(calls[1],{method:'POST',url:'/api/projects/fixture/timeline/proposals/batch/preview',body:{selections}});
  const invalid=await request('tools/call',{name:'proposal_preview',arguments:{project_id:'fixture',proposal_id:'draft',option_id:'one',selections}});
  assert.ok(invalid.isError);assert.equal(calls.length,2);
  assert.ok(calls.every(call=>!call.url.includes('approve')));
});
