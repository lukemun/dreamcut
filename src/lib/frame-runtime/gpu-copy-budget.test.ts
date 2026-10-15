import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGpuCopyBudget,pruneGpuCopies,GPU_COPY_BUDGET_BYTES} from '../gpu-preview/copy-budget';
test('copied surfaces include both canvas and GPU storage; too many layers fail before allocation',()=>{
 assert.equal(validateGpuCopyBudget([{width:1920,height:1080},null]),1920*1080*8);
 assert.equal(validateGpuCopyBudget([{width:4096,height:4096}]),GPU_COPY_BUDGET_BYTES);
 assert.throws(()=>validateGpuCopyBudget([{width:4096,height:4096},{width:1,height:1}]),/budget/);
 assert.throws(()=>validateGpuCopyBudget(Array(65).fill(null)),/64/);
 assert.throws(()=>validateGpuCopyBudget([{width:Infinity,height:1}]),/dimensions/);
});
test('layer removal, resizing and switching to external video retire only obsolete copies',()=>{
 const same={width:10,height:10,id:'keep'},resize={width:20,height:20,id:'resize'},external={width:30,height:30,id:'external'},removed={width:40,height:40,id:'removed'};
 const slots:Array<typeof same|undefined>=[same,resize,external,removed],released:string[]=[];
 pruneGpuCopies(slots,[{width:10,height:10},{width:50,height:50},null],entry=>released.push(entry.id));
 assert.deepEqual(released,['resize','external','removed']);assert.equal(slots.length,3);assert.equal(slots[0],same);assert.equal(slots[1],undefined);assert.equal(slots[2],undefined);
 pruneGpuCopies(slots,[],entry=>released.push(entry.id));assert.deepEqual(released,['resize','external','removed','keep']);assert.equal(slots.length,0);
});
