import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuWorkerClient} from '../gpu-preview/worker-client';
import type {GpuWorkerReply,GpuWorkerRequest} from '../gpu-preview/worker-protocol';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const messages:GpuWorkerRequest[]=[],errors:Error[]=[];let terminated=0,textClosed=0;
 const fake={onmessage:null as ((event:{data:GpuWorkerReply})=>void)|null,onerror:null as ((event:{message:string})=>void)|null,onmessageerror:null as (()=>void)|null,postMessage(message:GpuWorkerRequest){messages.push(message);},terminate(){terminated++;}};
 const text={bytes:0,close(){textClosed++;},acquire:async()=>{throw Error('Unexpected text');}};
 const client=new GpuWorkerClient({elements:[],laneOrder:[],scope:'test',width:100,height:100,deliveryWidth:50,deliveryHeight:50,fps:30,duration:30},error=>errors.push(error),fake as unknown as Worker,text,'http://localhost:3123/');
 return {client,messages,errors,fake,send:(data:GpuWorkerReply)=>fake.onmessage!({data}),counts:()=>({terminated,textClosed})};
}
test('worker handshake precedes initialization; render requests retain frame and epoch',async()=>{
 const f=fixture();assert.deepEqual(f.messages,[]);f.send({type:'boot'});await tick();assert.equal(f.messages[0].type,'init');
 f.send({type:'ready',id:1});await f.client.ready;
 const rendered=f.client.render(18,3);await tick();assert.deepEqual(f.messages[1],{type:'render',id:2,frame:18,generation:3,allowReplay:false});
 let closed=0;const bitmap={close(){closed++;}} as ImageBitmap;
 f.send({type:'picture',id:2,bitmap,timing:{frame:18} as never,bytes:12,prefetch:undefined});assert.equal((await rendered).bitmap,bitmap);assert.equal(closed,0);
 f.send({type:'picture',id:999,bitmap,timing:{} as never,bytes:0,prefetch:undefined});assert.equal(closed,1);
 f.client.close();assert.deepEqual(f.counts(),{terminated:1,textClosed:1});
});
test('closing before boot rejects readiness and never sends initialization',async()=>{
 const f=fixture();const rejected=assert.rejects(f.client.ready,{name:'AbortError'});f.client.close();f.send({type:'boot'});await rejected;assert.equal(f.messages.length,0);
});
test('worker failure rejects pending work and releases ownership once',async()=>{
 const f=fixture();const rejected=assert.rejects(f.client.ready,/startup failed/);f.fake.onerror!({message:'startup failed'});await rejected;f.client.close();assert.equal(f.errors.length,1);assert.deepEqual(f.counts(),{terminated:1,textClosed:1});
});
test('the page rasterizes worker SVG stills and transfers the bitmap or the failure',async()=>{
 const messages:{message:GpuWorkerRequest;transfer?:Transferable[]}[]=[],calls:unknown[]=[];
 const fake={onmessage:null as ((event:{data:GpuWorkerReply})=>void)|null,onerror:null,onmessageerror:null,postMessage(message:GpuWorkerRequest,transfer?:Transferable[]){messages.push({message,transfer});},terminate(){}};
 const text={bytes:0,close(){},acquire:async()=>{throw Error('Unexpected text');}};
 const bitmap={width:1080,height:368,close(){}} as ImageBitmap;
 const client=new GpuWorkerClient({elements:[],laneOrder:[],scope:'test',width:1080,height:1920,deliveryWidth:540,deliveryHeight:960,fps:30,duration:30},()=>{},fake as unknown as Worker,text,'http://localhost:3123/',
  async(url,box)=>{calls.push([url,box]);if(url.endsWith('bad.svg'))throw Error('decode failed');return bitmap;});
 fake.onmessage!({data:{type:'svg',id:7,url:'/api/projects/p/media/a.svg',width:1080,height:1920}});await tick();await tick();
 assert.deepEqual(calls,[['/api/projects/p/media/a.svg',{width:1080,height:1920}]]);
 assert.deepEqual(messages[0],{message:{type:'svg-result',id:7,bitmap},transfer:[bitmap]});
 fake.onmessage!({data:{type:'svg',id:8,url:'/bad.svg',width:10,height:10}});await tick();await tick();
 assert.deepEqual(messages[1].message,{type:'svg-result',id:8,error:'Error: decode failed'});
 client.ready.catch(()=>{});client.close();
});
