import assert from 'node:assert/strict';import test from 'node:test';
import {collectNativeSourceBatches} from './source-batches';
test('more than eight sources retain order with bounded serial requests',async()=>{
 const inputs=Array.from({length:19},(_,i)=>i),batches:number[][]=[];let active=0,maximum=0;
 const result=await collectNativeSourceBatches(inputs,async batch=>{active++;maximum=Math.max(maximum,active);await Promise.resolve();batches.push([...batch]);active--;return batch.map(x=>x*2);});
 assert.deepEqual(result,inputs.map(x=>x*2));assert.deepEqual(batches.map(b=>b.length),[8,8,3]);assert.equal(maximum,1);
});
test('a late failure prevents publication of the whole frame',async()=>{
 let published:number[]|undefined,requests=0;
 await assert.rejects(async()=>{published=await collectNativeSourceBatches(Array.from({length:9},(_,i)=>i),async batch=>{if(++requests===2)throw Error('Decode failed');return batch;});},/Decode failed/);
 assert.equal(published,undefined);assert.equal(requests,2);
});
test('truncated replies fail and empty scenes issue no requests',async()=>{
 await assert.rejects(collectNativeSourceBatches([1,2],async()=>[1]),/Incomplete/);
 assert.deepEqual(await collectNativeSourceBatches([],async()=>{throw Error('Unexpected request');}),[]);
});
