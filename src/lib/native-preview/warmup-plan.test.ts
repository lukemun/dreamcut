import test from 'node:test';import assert from 'node:assert/strict';
import {nativeWarmupSources} from './warmup-plan';
import type {CompositionElement} from '../render/composition-adapters';
const clip=(start:number,url:string,ready=true)=>({type:'video_clip',timeline_start:start,source_url:'/original.mp4',props:{preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:ready,width:160,height:90}}} as CompositionElement);
test('warmup is bounded, nearest-first, deduplicated and verified-proxy-only',()=>{
 const elements=[clip(3,'/far'),clip(1.8,'/second'),clip(.5,'/first'),clip(.8,'/first'),clip(.6,'/invalid',false),clip(-1,'/past'),clip(1.9,'/third')];
 assert.deepEqual(nativeWarmupSources(elements,0,new Set()),['/first','/second']);
 assert.deepEqual(nativeWarmupSources(elements,0,new Set(['/first'])),['/second','/third']);
 assert.deepEqual(nativeWarmupSources(elements,4,new Set()),[]);
});
