import test from 'node:test';
import assert from 'node:assert/strict';
import {planGpuResourceLookahead} from '../gpu-preview/resource-lookahead';
import type {GpuScene,GpuVideoLayer,GpuCaptionLayer} from '../gpu-preview/scene';

const image=(key:string)=>({kind:'video',source:{kind:'image',key}} as GpuVideoLayer);
const caption=(text:string,handwritingProgress?:number)=>({kind:'caption',planeWidth:100,planeHeight:50,text:{text},handwritingProgress} as GpuCaptionLayer);
const scene=(...layers:GpuScene['layers'])=>({layers} as GpuScene);

test('lookahead bounds work to the nearest missing still and two distinct layouts',()=>{
 const first=image('first'),second=image('second'),a=caption('a'),b=caption('b');
 let visited=0;
 function* scenes(){visited++;yield scene(first,a,a);visited++;yield scene(second,b);visited++;throw Error('unbounded scan');}
 const result=planGpuResourceLookahead(scenes(),'font',()=>false,()=>false);
 assert.equal(result.image,first);assert.deepEqual(result.text,[a,b]);assert.equal(visited,2);
});
test('ready resources are skipped and handwriting warms only its reusable completed layout',()=>{
 const ready=image('ready'),next=image('next'),done=caption('done',1),staticText=caption('static');
 const result=planGpuResourceLookahead([scene(ready,caption('partial',0.5),caption('cached')),scene(next,done,staticText)],'font',layer=>layer===ready,layer=>layer.text.text==='cached');
 assert.equal(result.image,next);assert.deepEqual(result.text,[caption('partial',1),done]);
});
test('empty future does not schedule work',()=>{
 assert.deepEqual(planGpuResourceLookahead([],'font',()=>false,()=>false),{image:undefined,text:[]});
});


test('startup lookahead skips uncached foreground dependencies and warms the next still',()=>{
 const current=image('current'),overlap=image('overlap'),next=image('next');
 const foregroundText=caption('current'),futureText=caption('future');
 const result=planGpuResourceLookahead([scene(current,foregroundText),scene(overlap,next,foregroundText,futureText)],'font',()=>false,()=>false,scene(current,overlap,foregroundText));
 assert.equal(result.image,next);assert.deepEqual(result.text,[futureText]);
});

test('image-only startup planning leaves text untouched and still bounds its queue',()=>{
 const next=image('next'),later=image('later');
 const result=planGpuResourceLookahead([scene(next,caption('a')),scene(later,caption('b'))],'font',()=>false,()=>true,scene(image('current')));
 assert.equal(result.image,next);assert.deepEqual(result.text,[]);
});


test('initial 3D warmup selects only the nearest future title within two seconds',async()=>{
 const {imminentGpuCamera}=await import('../gpu-preview/resource-lookahead');
 const actor=(id:string,start:number,style='camera_reveal')=>({id,type:'caption_text',timeline_start:start,duration:1,props:{styleVariant:style}} as import('../render/composition-adapters').CompositionElement);
 const elements=[actor('distant',5),actor('second',1.5),actor('first',.4),actor('plain',.1,'none')];
 assert.deepEqual(imminentGpuCamera(elements,0,30),{id:'first',frame:12});
 assert.deepEqual(imminentGpuCamera(elements,12,30),{id:'second',frame:45});
 assert.equal(imminentGpuCamera(elements,45,30),undefined);
 assert.deepEqual(imminentGpuCamera(elements,0,60),{id:'first',frame:24});
});

test('optional future warmup isolates failures and releases late leases',async()=>{
 const {warmGpuFutureResource}=await import('../gpu-preview/resource-lookahead');
 const signal=new AbortController().signal;
 await warmGpuFutureResource(async()=>{throw Error('Future asset missing');},signal);
 let complete!:(value:{release():void})=>void,released=0;
 await warmGpuFutureResource(()=>new Promise(resolve=>{complete=resolve;}),signal,5);
 complete({release(){released++;}});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(released,1);
 const abort=new AbortController();abort.abort();
 await warmGpuFutureResource(async()=>{assert.fail('Cancelled warmup started');},abort.signal);
});

test('handwriting phases share one bounded lookahead slot',()=>{
 const result=planGpuResourceLookahead([scene(caption('ink',0),caption('ink',.4)),scene(caption('ink',.8),caption('next'))],'font',()=>false,()=>false);
 assert.deepEqual(result.text,[caption('ink',1),caption('next')]);
 const ready=planGpuResourceLookahead([scene(caption('ink',.2))],'font',()=>false,layer=>layer.kind==='caption'&&layer.handwritingProgress===1);
 assert.deepEqual(ready.text,[]);
});
