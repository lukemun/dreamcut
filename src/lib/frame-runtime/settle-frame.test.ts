import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameSession,settleFrame,settleFrameResources} from './session';

test('a source replaced while decode settles cannot inherit the old image readiness', async () => {
 const session=new FrameSession();let calls=0;
 const image={src:'/old.png',currentSrc:'/old.png',srcset:'',sizes:'',complete:true,naturalWidth:100,
  decode:async()=>{calls++;if(calls===1)Object.assign(image,{src:'/new.png',currentSrc:'/new.png'});}} as HTMLImageElement;
 await session.decodeImage(image);
 assert.equal(calls,2,'the replacement must finish its own decode');
 await session.decodeImage(image);assert.equal(calls,2,'only the replacement readiness is retained');
});

test('mounted images retain readiness only for the same successfully decoded resource', async () => {
 const session=new FrameSession();let calls=0;
 const image={src:'/first.png',currentSrc:'/first.png',srcset:'',sizes:'',complete:true,naturalWidth:100,
  decode:async()=>{calls++;}} as HTMLImageElement;
 await session.decodeImage(image);await session.decodeImage(image);
 assert.equal(calls,1,'stable mounted images should not schedule another decode per frame');
 Object.assign(image,{src:'/second.png',currentSrc:'/second.png'});
 await session.decodeImage(image);assert.equal(calls,2,'source changes must be decoded');
 Object.assign(image,{currentSrc:'/second@2x.png',srcset:'/second@2x.png 2x'});
 await session.decodeImage(image);assert.equal(calls,3,'responsive candidates must be decoded');
 Object.assign(image,{complete:false,naturalWidth:0,decode:async()=>{calls++;throw Error('broken');}});
 await assert.rejects(session.decodeImage(image),/Image failed/);
 Object.assign(image,{complete:true,naturalWidth:100,decode:async()=>{calls++;}});
 await session.decodeImage(image);assert.equal(calls,5,'a failed reload invalidates previous readiness');
 session.dispose();await session.decodeImage(image);assert.equal(calls,6,'disposed sessions cannot reuse readiness');
 const other=new FrameSession();await other.decodeImage(image);assert.equal(calls,7,'readiness belongs to a session');
});

test('hidden-stage readiness completes sources before effects; captures also await presentation',async()=>{
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const oldRaf=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
 const order:string[]=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts:{ready:Promise.resolve()}}});
 Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(callback:FrameRequestCallback)=>{queueMicrotask(()=>{order.push('paint');callback(0);});return 1;}});
 try {
  const root={querySelectorAll:()=>[{decode:async()=>{order.push('image');}}]} as unknown as HTMLElement;
  const session=new FrameSession();
  session.sourceDraws.set('video',async()=>{await Promise.resolve();order.push('source');});
  session.draws.set('grade',async()=>{assert.equal(order.at(-1),'source');order.push('effect');});
  await settleFrameResources(session,root);
  assert.deepEqual(order,['image','paint','source','effect']);
  order.length=0;
  await settleFrame(session,root);
  assert.deepEqual(order,['image','paint','source','effect','paint']);
  order.length=0;
  session.sourceDraws.set('video',()=>{throw Error('decode failed');});
  await assert.rejects(settleFrameResources(session,root),/decode failed/);
  assert.deepEqual(order,['image','paint']);
 }finally{
  if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document');
  if(oldRaf)Object.defineProperty(globalThis,'requestAnimationFrame',oldRaf);else Reflect.deleteProperty(globalThis,'requestAnimationFrame');
 }
});
