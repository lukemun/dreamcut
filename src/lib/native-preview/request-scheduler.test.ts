import test from 'node:test';import assert from 'node:assert/strict';import {NativeRequestScheduler} from './request-scheduler';
const gate=()=>{let release!:()=>void;return {promise:new Promise<void>(r=>{release=r;}),release:()=>release()};};
test('contended work stays bounded and drains in queue order',async()=>{
 const scheduler=new NativeRequestScheduler(2),a=gate(),b=gate(),order:string[]=[];let active=0,maximum=0;
 const run=(key:string,hold?:Promise<void>)=>scheduler.run(key,async()=>{order.push(key);active++;maximum=Math.max(maximum,active);await hold;active--;return key;});
 const jobs=[run('a',a.promise),run('b',b.promise),run('c'),run('d')];await Promise.resolve();assert.deepEqual(order,['a','b']);a.release();await jobs[0];b.release();assert.deepEqual(await Promise.all(jobs),['a','b','c','d']);assert.deepEqual(order,['a','b','c','d']);assert.equal(maximum,2);
});
test('failed active work frees its slot without poisoning queued work',async()=>{
 const scheduler=new NativeRequestScheduler(1),a=gate();const bad=scheduler.run('bad',async()=>{await a.promise;throw Error('decode failed');});const good=scheduler.run('good',async()=>42);a.release();await assert.rejects(bad,/decode failed/);assert.equal(await good,42);
});
test('duplicate ownership, bounded queue and queue timeouts fail explicitly',async()=>{
 const scheduler=new NativeRequestScheduler(1,1),a=gate();const active=scheduler.run('a',()=>a.promise);const queued=scheduler.run('b',async()=>1,10);
 await assert.rejects(scheduler.run('a',async()=>0),/outstanding/);await assert.rejects(scheduler.run('c',async()=>0),/queue is full/);await assert.rejects(queued,/waiting for capacity/);
 const replacement=scheduler.run('b',async()=>2);a.release();await active;assert.equal(await replacement,2);
});

test('awaited completion releases ownership before the next request',async()=>{const scheduler=new NativeRequestScheduler(1);assert.equal(await scheduler.run('same',async()=>1),1);assert.equal(await scheduler.run('same',async()=>2),2);});
