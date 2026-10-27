import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePreviewHold} from './capture-preview-hold';

function dom(mode:'ready'|'wait'|'error'='ready'){
 let pauses=0,unloads=0,encodes=0,seeks=0;
 class Video extends EventTarget{
  src='';duration=2;videoWidth=320;videoHeight=180;crossOrigin='';preload='';muted=false;playsInline=false;time=0;
  get currentTime(){return this.time;}
  set currentTime(value:number){this.time=value;seeks++;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
  load(){if(!this.src){unloads++;return;}if(mode!=='wait')queueMicrotask(()=>this.dispatchEvent(new Event(mode==='error'?'error':'loadeddata')));}
  pause(){pauses++;}removeAttribute(){this.src='';}
 }
 const video=new Video(),canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(callback:(blob:Blob)=>void){encodes++;queueMicrotask(()=>callback(new Blob(['png'])));}};
 class Reader{result='data:image/png;base64,fixture';error=null;onload?:()=>void;onerror?:()=>void;onabort?:()=>void;readAsDataURL(){queueMicrotask(()=>this.onload?.());}abort(){this.onabort?.();}}
 const beforeDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),beforeReader=Object.getOwnPropertyDescriptor(globalThis,'FileReader');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>tag==='video'?video:canvas}});
 Object.defineProperty(globalThis,'FileReader',{configurable:true,value:Reader});
 return {video,canvas,stats:()=>({pauses,unloads,encodes,seeks}),restore(){for(const [key,value]of [['document',beforeDocument],['FileReader',beforeReader]] as const){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};
}
test('hold capture encodes asynchronously, clamps source end and releases the decoder',async()=>{
 const f=dom();try{
  assert.equal(await capturePreviewHold('/validated.mp4',3,new AbortController().signal),'data:image/png;base64,fixture');
  assert.equal(f.video.currentTime,1.999);assert.deepEqual(f.stats(),{pauses:1,unloads:1,encodes:1,seeks:1});assert.equal(f.canvas.width,1);
 }finally{f.restore();}
});
test('first-frame capture does not wait for a seek event that need not fire',async()=>{
 const f=dom();try{await capturePreviewHold('/validated.mp4',0,new AbortController().signal);assert.equal(f.stats().seeks,0);}finally{f.restore();}
});
test('cancellation and decode failure both unload temporary media without encoding',async()=>{
 for(const mode of ['wait','error'] as const){const f=dom(mode);try{
  const abort=new AbortController(),pending=capturePreviewHold('/validated.mp4',1,abort.signal);
  if(mode==='wait')abort.abort();await assert.rejects(pending);
  assert.deepEqual(f.stats(),{pauses:1,unloads:1,encodes:0,seeks:0});
 }finally{f.restore();}}
});
