import test from 'node:test';
import assert from 'node:assert/strict';
import {heavyGpuPictureFrames} from '../gpu-preview/heavy-picture-plan';
import type {CompositionElement} from '../render/composition-adapters';
const clip=(start:number,duration:number)=>({type:'video_clip',timeline_start:start,duration,props:{has_alpha:true}} as CompositionElement);
test('dense alpha overlap is bounded by exact frame span and ignores sparse/still media',()=>{
 const layers=[clip(20,.8),clip(20,.8),clip(20,.8),clip(20,.8),{...clip(0,99),type:'still'} as CompositionElement];
 assert.deepEqual(heavyGpuPictureFrames(layers,30,700),Array.from({length:24},(_,i)=>600+i));
 assert.deepEqual(heavyGpuPictureFrames(layers.slice(0,2),30,700),[]);
 assert.deepEqual(heavyGpuPictureFrames(layers,30,604),[600,601,602,603]);
});
