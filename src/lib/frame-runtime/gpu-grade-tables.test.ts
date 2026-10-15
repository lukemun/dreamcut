import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {buildColorGradeFilterDescriptor,IDENTITY_COLOR_GRADE} from '../timeline/color-grade';
import {gpuGradeTransferTables,GPU_GRADE_TRANSFER_BYTES} from '../gpu-preview/color-grade';
import {GpuGradeTables} from '../gpu-preview/grade-tables';
const grade=buildColorGradeFilterDescriptor(IDENTITY_COLOR_GRADE,{includeIdentity:true})!;

test('SVG component-transfer tables truncate byte results rather than round them',()=>{
 const tables=gpuGradeTransferTables({...grade,exposureSlope:.99});
 assert.equal(tables.byteLength,GPU_GRADE_TRANSFER_BYTES);
 assert.equal(tables[1],0);
 assert.equal(tables[100],Math.fround(99/255));
 assert.ok(tables.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 const clamped=gpuGradeTransferTables({...grade,exposureSlope:2,contrastIntercept:-1});
 assert.equal(clamped[255],1);assert.equal(clamped[256],0);
});

function device(t:TestContext){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'GPUBufferUsage');
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'GPUBufferUsage',previous);else Reflect.deleteProperty(globalThis,'GPUBufferUsage');});
 const records:Array<{size:number;destroyed:number}>=[];let writes=0;
 (globalThis as any).GPUBufferUsage={STORAGE:1,COPY_DST:2};
 return {records,get writes(){return writes;},createBuffer({size}:{size:number}){const record={size,destroyed:0};records.push(record);return {destroy(){record.destroyed++;}} as GPUBuffer;},queue:{writeBuffer(){writes++;}}};
}
test('grade tables reuse unchanged uploads and retire replaced/deleted slots within a fixed layer bound',t=>{
 const gpu=device(t),cache=new GpuGradeTables(gpu as any);
 const first=cache.prepare([grade,null]);
 assert.equal(cache.bytes,16+GPU_GRADE_TRANSFER_BYTES);assert.equal(first[1],cache.identity);
 assert.strictEqual(cache.prepare([{...grade},null])[0],first[0]);assert.equal(gpu.writes,2);
 const changed=cache.prepare([{...grade,exposureSlope:2}]);
 assert.notStrictEqual(changed[0],first[0]);assert.equal(gpu.records[1].destroyed,1);
 cache.prepare([]);assert.equal(cache.bytes,16);assert.equal(gpu.records[2].destroyed,1);
 assert.throws(()=>cache.prepare(Array(65).fill(grade)),/Too many/);
 cache.close();cache.close();assert.equal(cache.bytes,0);assert.ok(gpu.records.every(r=>r.destroyed===1));
 assert.throws(()=>cache.prepare([]),/closed/);
});

test('a failed transfer-table upload releases its allocation and preserves the previous slot',t=>{
 const gpu=device(t),cache=new GpuGradeTables(gpu as any),first=cache.prepare([grade])[0];
 const write=gpu.queue.writeBuffer;gpu.queue.writeBuffer=()=>{throw Error('upload failed');};
 assert.throws(()=>cache.prepare([{...grade,exposureSlope:2}]),/upload failed/);
 assert.equal(gpu.records.at(-1)?.destroyed,1);assert.equal(gpu.records[1].destroyed,0);
 gpu.queue.writeBuffer=write;
 assert.strictEqual(cache.prepare([grade])[0],first);
 assert.equal(cache.bytes,16+GPU_GRADE_TRANSFER_BYTES);
 cache.close();assert.ok(gpu.records.every(r=>r.destroyed===1));
});

test('a failed identity upload closes the constructor allocation',t=>{
 const gpu=device(t);gpu.queue.writeBuffer=()=>{throw Error('identity upload failed');};
 assert.throws(()=>new GpuGradeTables(gpu as any),/identity upload failed/);
 assert.equal(gpu.records.length,1);assert.equal(gpu.records[0].destroyed,1);
});


test('halo amplification uses truncated float32 SVG slope tables even without a color grade',t=>{
 const tables=gpuGradeTransferTables(null,2.3);
 assert.equal(tables[13*256+10],Math.fround(22/255),'Float32 slope becomes slightly below 2.3 before double-precision byte truncation');
 assert.equal(tables[13*256+255],1);
 const gpu=device(t),cache=new GpuGradeTables(gpu as any);
 const active=cache.prepare([null],[2.3])[0];assert.notEqual(active,cache.identity);
 assert.equal(cache.bytes,16+GPU_GRADE_TRANSFER_BYTES);
 assert.strictEqual(cache.prepare([null],[2.3])[0],active);
 cache.prepare([null],[0]);assert.equal(cache.bytes,16);
 assert.throws(()=>cache.prepare([null],[4]),/Invalid/);
 assert.throws(()=>cache.prepare([null],[]),/Invalid/);
 cache.close();assert.ok(gpu.records.every(r=>r.destroyed===1));
});
