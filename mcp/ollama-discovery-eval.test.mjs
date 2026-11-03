import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryLoop} from './ollama-discovery-eval.mjs';
const schema=name=>({name,description:name,inputSchema:{type:'object'}});
test('local native requests register newly loaded tools on the next model turn',async()=>{
 let loaded=false,turn=0;const dispatches=[];
 const bridge=async(action,name,args)=>{
  if(action==='list')return {tools:[schema('capability_catalog'),...(loaded?[schema('cutout_status')]:[])]};
  dispatches.push(name);if(args.action==='load')loaded=true;return {result:{content:[{type:'text',text:'fixture'}]}};
 };
 const chat=async request=>{
  assert.equal(request.tools.some(t=>t.function.name==='cutout_status'),turn>=1);
  return {model:'fixture',prompt_eval_count:10,eval_count:2,message:++turn===1?{role:'assistant',content:'',tool_calls:[{function:{name:'capability_catalog',arguments:{action:'load'}}}]}:turn===2?{role:'assistant',content:'',tool_calls:[{function:{name:'cutout_status',arguments:{}}}]}:{role:'assistant',content:'done'}};
 };
 const result=await discoveryLoop({model:'fixture',chat,bridge});assert.equal(result.answer,'done');assert.deepEqual(dispatches,['capability_catalog','cutout_status']);assert.deepEqual(result.usage,{input_tokens:30,output_tokens:6});
});
test('model fallback and unsupplied tools fail without dispatch',async()=>{
 const bridge=async action=>{assert.equal(action,'list');return {tools:[schema('capability_catalog')]};};
 await assert.rejects(discoveryLoop({model:'fixture',bridge,chat:async()=>({model:'other'})}),/Unexpected model/);
 await assert.rejects(discoveryLoop({model:'fixture',bridge,chat:async()=>({model:'fixture',message:{tool_calls:[{function:{name:'cutout_status',arguments:{}}}]}})}),/not supplied/);
});
