import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";

test("cutout tools route preparation only and deliver image evidence as MCP content",{timeout:10000},async t=>{
  const catalog=JSON.parse(spawnSync(process.execPath,["mcp/server.mjs","--catalog"],{encoding:"utf8"}).stdout);
  for(const name of ["cutout_prepare","cutout_status","cutout_correct","source_evidence"]) assert.ok(catalog.tools.some(tool=>tool.name===name));
  const requests=[];
  const image={type:"image",mimeType:"image/jpeg",data:"fixture-base64"};
  const server=createServer(async(req,res)=>{
    let body="";for await(const chunk of req) body+=chunk;
    if (!/\/api\/agent\/(tool-events|product-signals)$/.test(req.url)) requests.push({path:req.url,body:JSON.parse(body)});
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify(req.url.endsWith("source-evidence")?{manifest:{source_sha256:"fixture"},image}:{id:"fixture-job",state:"queued"}));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>server.close());
  const child=spawn(process.execPath,["mcp/server.mjs"],{env:{...process.env,TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${server.address().port}`},stdio:["pipe","pipe","pipe"]});t.after(()=>child.kill());
  const pending=new Map();createInterface({input:child.stdout}).on("line",line=>{const value=JSON.parse(line);pending.get(value.id)?.(value.result);});
  async function call(id,name,args){const response=new Promise(resolve=>pending.set(id,resolve));child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method:"tools/call",params:{name,arguments:{project_id:"fixture",...args}}})+"\n");return response;}
  await call(1,"cutout_prepare",{source_relative_path:"subject.mp4"});
  await call(2,"cutout_status",{job_id:"fixture-job"});
  await call(3,"cutout_correct",{mode:"union"});
  const result=await call(4,"source_evidence",{source_relative_path:"subject.mp4",times_seconds:[1]});
  assert.deepEqual(result.content[1],image);assert.equal(JSON.parse(result.content[0].text).image,undefined);
  assert.ok(requests.every(r=>r.path.startsWith("/api/projects/fixture/analysis/")));
  assert.equal(requests[1].body.action,"status");
});
