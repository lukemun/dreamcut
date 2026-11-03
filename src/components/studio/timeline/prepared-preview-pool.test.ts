import test from 'node:test';import assert from 'node:assert/strict';
import {PreparedPreviewPool} from './prepared-preview-pool';
import type {PreparedPreviewInput, PreparedPreviewStatus} from '@/lib/timeline/prepared-preview';
const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:60,inputProps:{elements:[]}};
const tick=()=>new Promise(r=>setImmediate(r));
test('A/B/A retains ready media immediately, with no new preparation or released lease',async()=>{
 let builds=0;const cancelled:string[]=[];
 const pool=new PreparedPreviewPool({start:async()=>({id:String(++builds),state:'ready',progress:1,url:'/cached'}),status:async()=>{throw new Error('Unexpected poll');},cancel:async(_p,id)=>{cancelled.push(id);}});
 try{pool.ensure('p',input);await tick();const a=pool.key('p',input),second={...input,width:320};pool.ensure('p',second);await tick();pool.ensure('p',input);assert.equal(pool.get(a)?.state,'ready');assert.equal(builds,2);assert.deepEqual(cancelled,[]);}finally{pool.dispose();}
 assert.equal(cancelled.length,2);
});
test('switching preserves in-flight work and bounded eviction releases only the oldest version',async()=>{
 const cancelled:string[]=[];let finish!:(value:any)=>void,builds=0;
 const pool=new PreparedPreviewPool({start:async()=>++builds===1?new Promise(r=>{finish=r;}):({id:String(builds),state:'ready',progress:1,url:'/cached'}),status:async()=>{throw new Error('Unexpected');},cancel:async(_p,id)=>{cancelled.push(id);}},2);
 try{
  pool.ensure('p',input);pool.ensure('p',{...input,width:320});await tick();assert.deepEqual(cancelled,[]);
  finish({id:'first',state:'ready',progress:1,url:'/first'});await tick();assert.equal(pool.get(pool.key('p',input))?.state,'ready');
  pool.ensure('p',{...input,width:640});await tick();assert.deepEqual(cancelled,['first']);assert.equal(pool.get(pool.key('p',input)),null);
 }finally{pool.dispose();}
});
test('many blocks queue locally instead of overflowing the worker queue',async()=>{
 let starts=0;const complete:Array<(value:any)=>void>=[];
 const pool=new PreparedPreviewPool({start:async()=>{starts++;return new Promise(resolve=>complete.push(resolve));},status:async()=>{throw new Error('Unexpected poll');},cancel:async()=>{}},16);
 try{
  for(let i=0;i<10;i++)pool.ensure('p',{...input,width:160+i});
  assert.equal(starts,2);
  complete[0]({id:'first',state:'ready',progress:1,url:'/cached'});await tick();assert.equal(starts,3);
  assert.equal(pool.get(pool.key('p',{...input,width:169}))?.state,'queued');
 }finally{pool.dispose();}
});
test('disabling preparation releases pending work, including late start replies, and can resume',async()=>{
 const cancelled:string[]=[];const replies:Array<(value:PreparedPreviewStatus)=>void>=[];
 const pool=new PreparedPreviewPool({start:async()=>new Promise(resolve=>replies.push(resolve)),status:async()=>{throw Error('Unexpected poll');},cancel:async(_p,id)=>{cancelled.push(id);}},16);
 pool.ensure('p',input);pool.ensure('p',{...input,width:320});pool.ensure('p',{...input,width:640});
 pool.dispose();
 replies[0]({id:'late-a',state:'preparing',progress:.1});replies[1]({id:'late-b',state:'ready',progress:1,url:'/cached'});await tick();
 assert.deepEqual(cancelled,['late-a','late-b']);assert.equal(replies.length,2);assert.equal(pool.get(pool.key('p',input)),null);
 pool.ensure('p',input);assert.equal(replies.length,3);replies[2]({id:'resumed',state:'ready',progress:1,url:'/cached'});await tick();assert.equal(pool.get(pool.key('p',input))?.state,'ready');pool.dispose();
});
test('seek reprioritizes queued work without restarting active sections',async()=>{
 const starts:number[]=[],complete:Array<(value:PreparedPreviewStatus)=>void>=[];
 const pool=new PreparedPreviewPool({start:async(_p,_o,value)=>{starts.push(value.width);return new Promise(resolve=>complete.push(resolve));},status:async()=>{throw Error('Unexpected poll');},cancel:async()=>{}},16);
 try{
  const inputs=[160,320,480,640].map(width=>({...input,width}));inputs.forEach(value=>pool.ensure('p',value));
  pool.prioritize([pool.key('p',inputs[3]),pool.key('p',inputs[2])]);
  assert.deepEqual(starts,[160,320]);
  complete[0]({id:'a',state:'ready',progress:1,url:'/a'});await tick();assert.deepEqual(starts,[160,320,640]);
  complete[1]({id:'b',state:'ready',progress:1,url:'/b'});await tick();assert.deepEqual(starts,[160,320,640,480]);
 }finally{pool.dispose();}
});
test('new picture cancels superseded pending jobs and late replies while retaining ready alternatives',async()=>{
 const cancelled:string[]=[],replies:Array<(value:PreparedPreviewStatus)=>void>=[];
 const pool=new PreparedPreviewPool({start:async()=>new Promise(resolve=>replies.push(resolve)),status:async()=>{throw Error('Unexpected poll');},cancel:async(_p,id)=>{cancelled.push(id);}},16);
 const a=input,b={...input,width:320},c={...input,width:480},d={...input,width:640};
 try{
  pool.ensure('p',a);replies[0]({id:'ready-a',state:'ready',progress:1,url:'/a'});await tick();
  pool.ensure('p',b);pool.ensure('p',c);pool.ensure('p',d);
  replies[1]({id:'running-b',state:'preparing',progress:.2});await tick();
  pool.retainPending([pool.key('p',d)]);await tick();
  assert.equal(pool.get(pool.key('p',a))?.url,'/a');
  assert.equal(pool.get(pool.key('p',b)),null);assert.equal(pool.get(pool.key('p',c)),null);
  assert.deepEqual(cancelled,['running-b']);assert.equal(replies.length,4,'newest job should get a capture slot');
  replies[2]({id:'late-c',state:'ready',progress:1,url:'/c'});await tick();
  assert.deepEqual(cancelled,['running-b','late-c']);assert.equal(pool.get(pool.key('p',c)),null);
  replies[3]({id:'ready-d',state:'ready',progress:1,url:'/d'});await tick();
  assert.equal(pool.get(pool.key('p',d))?.url,'/d');
 }finally{pool.dispose();}
});
