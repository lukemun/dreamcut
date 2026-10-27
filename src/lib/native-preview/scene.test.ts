import test from 'node:test';import assert from 'node:assert/strict';
import {nativeScene} from './scene';import type {CompositionElement} from '../render/composition-adapters';
const clip=(patch:Partial<CompositionElement>={}):CompositionElement=>{const e:CompositionElement=({id:'a',type:'video_clip',source_url:'/api/projects/test/media/a.mp4',timeline_start:0,duration:3,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:2,trim_start:1,trim_end:null,fade_in:0,fade_out:0,props:{source_duration_seconds:10},...patch});e.props={...e.props,preview_source_url:e.source_url,preview_proxy_validation:{contract:'preview-proxy-v1',url:e.source_url,ok:true,width:270,height:480}};return e;};
test('source trim/rate and mask use shared source and clip clocks',()=>{
 const scene=nativeScene([clip({props:{source_duration_seconds:10,keyframes:{mask_inset:[{t:0,v:[0,0,0,0]},{t:1,v:[.2,0,.3,0]}]}}})],[],30,270,480);
 assert.equal(scene.layers[0].frame,90);assert.deepEqual(scene.layers[0].mask,[.2,0,.3,0]);
});
test('preserves layer order and fails closed for unsupported effects',()=>{
 const a=clip(),b=clip({id:'b',lane_key:'visual_1',source_url:'/api/projects/test/media/b.webm'});
 assert.equal(nativeScene([a,b],['visual_0','visual_1'],0,270,480).layers[0].path,b.source_url);
 assert.throws(()=>nativeScene([clip({props:{chroma_key_color:'#00ff00'}})],[],0,270,480),/chroma_key_color/);
 assert.throws(()=>nativeScene([clip({transition_in:{type:'fade'} as never})],[],0,270,480),/Transitions/);
 assert.throws(()=>nativeScene([clip({props:{keyframes:{media_blur:[{t:0,v:5}]}}})],[],0,270,480),/animated/);
});
test('half-open timeline boundaries exclude finished layers',()=>{assert.equal(nativeScene([clip()],[],90,270,480).layers.length,0);});

test('unverified media returns an explicit fallback',()=>{const e=clip();delete e.props!.preview_proxy_validation;assert.throws(()=>nativeScene([e],[],0,270,480),/verified media proxy/);});

test('comparison render uses original authority without a preview proxy',()=>{
 const e=clip();e.props!.preview_source_url='/api/projects/test/media/proxy.mp4';delete e.props!.preview_proxy_validation;
 assert.equal(nativeScene([e],[],0,270,480,true).layers[0].path,e.source_url);
 assert.throws(()=>nativeScene([e],[],0,270,480),/verified/);
});

test('audio lanes remain owned by the existing mixer without blocking picture',()=>{
 const music=clip({id:'music',type:'music',lane_key:'music_0',props:{unsupported_audio_effect:true}});
 assert.equal(nativeScene([clip(),music],[],1,270,480).layers.length,1);
 assert.throws(()=>nativeScene([clip({type:'unimplemented_actor'})],[],1,270,480),/unsupported actor/);
});
test('matches the renderer source clock without a second 30fps source rounding',()=>{
 const e=clip({playback_rate:1.17,trim_start:0.017});
 assert.ok(Math.abs(nativeScene([e],[],1,270,480).layers[0].time!-(1/30+1.17/30))<1e-9);
});
