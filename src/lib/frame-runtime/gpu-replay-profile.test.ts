import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuReplayProfile} from '../gpu-preview/replay-profile';
const memory=()=>{let value:string|null=null;return {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}};};
test('project cost hints survive reload, isolate settings/edits and contain no source text',async()=>{
 const storage=memory(),inputs={source:'/private/movie.mp4',text:'private words',width:1080};
 const first=await gpuReplayProfile('project-a',inputs,storage);first.record(600,450);first.record(600,300);first.close();
 assert.deepEqual((await gpuReplayProfile('project-a',inputs,storage)).seeds(3),[[600,450]]);
 assert.deepEqual((await gpuReplayProfile('project-b',inputs,storage)).seeds(3),[]);
 assert.deepEqual((await gpuReplayProfile('project-a',{...inputs,width:540},storage)).seeds(3),[]);
 assert.deepEqual((await gpuReplayProfile('project-a',{...inputs,text:'changed'},storage)).seeds(3),[]);
 assert.ok(!storage.getItem()!.includes('private'));assert.ok(!storage.getItem()!.includes('project-a'));
});
test('cost journal bounds retention and tolerates unavailable/corrupt storage',async()=>{
 const storage=memory();for(let i=0;i<14;i++){const profile=await gpuReplayProfile(String(i),{},storage);for(let frame=0;frame<300;frame++)profile.record(frame,frame+1);profile.close();}
 const entries=JSON.parse(storage.getItem()!);assert.equal(entries.length,12);assert.equal(entries[0].samples.length,256);
 const bad=await gpuReplayProfile('x',{}, {getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});bad.record(1,50);assert.doesNotThrow(()=>bad.close());
});
