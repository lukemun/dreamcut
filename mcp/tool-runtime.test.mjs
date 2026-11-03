import assert from "node:assert/strict";
import test from "node:test";
import {dispatchTool,toolFailure} from "./tool-runtime.mjs";
test("dispatch records one outcome and job failure separately from lookup failure",async()=>{
 const records=[];
 await dispatchTool("status",{project_id:"p"},async()=>({state:"failed",id:"j",reused:true}),async e=>records.push(e),"session",1);
 assert.equal(records.length,1);assert.equal(records[0].success,true);assert.equal(records[0].job_state,"failed");assert.equal(records[0].reused,true);
 await assert.rejects(()=>dispatchTool("prepare",{},async()=>{throw new Error("bad");},async e=>records.push(e),"s",2));
 assert.equal(records[1].success,false);assert.notEqual(records[0].call_id,records[1].call_id);
 assert.equal(await dispatchTool("edit",{},async()=>42,async()=>{throw new Error("telemetry offline");},"s",3),42);
});
test("expected errors preserve recovery and unknown failures do not authorize retries",()=>{
 const detail={code:"STALE",message:"Refresh",recovery:{action:"refresh"}};
 assert.deepEqual(toolFailure(Object.assign(new Error("bad"),{toolError:detail})).structuredContent,detail);
 assert.equal(toolFailure(new Error("bad")).structuredContent.retryable,false);
});
