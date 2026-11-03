import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quadMatrix,sampleSurface,surfaceTrackSchema,trackedQuadAtFrame,surfacePresentationParent,type SurfaceTrack,type SurfaceQuad} from './surface-track';
import type {CompositionElement} from '../render/composition-adapters';
const q:SurfaceQuad=[[.1,.2],[.5,.15],[.6,.6],[.15,.7]];
const track:SurfaceTrack={version:1,id:'test',parentId:'video',sourceUrl:'/video.mp4',sourceSha256:'a'.repeat(64),width:100,height:100,referenceTime:0,visibleFrom:0,visibleTo:2,samples:Array.from({length:21},(_,i)=>({t:i/10,quad:q,visible:true,confidence:1}))};
const parent:CompositionElement={id:'video',type:'video_clip',source_url:'/video.mp4',timeline_start:1,duration:1,lane_key:'visuals_0',lane_index:0,volume:0,trim_start:.5,trim_end:null,playback_rate:2,fade_in:0,fade_out:0};
test('homography maps all corners and rejects collapsed geometry',()=>{
 const m=quadMatrix(q)!.slice(9,-1).split(',').map(Number);
 for(const [i,[x,y]] of [[0,0],[1000,0],[1000,1000],[0,1000]].entries()){
  const w=m[3]*x+m[7]*y+m[15];assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/w-q[i][0])<1e-8);assert.ok(Math.abs((m[1]*x+m[5]*y+m[13])/w-q[i][1])<1e-8);
 }
 assert.equal(quadMatrix([[0,0],[0,0],[0,0],[0,0]]),null);
});
test('visibility never extrapolates across lost frames or outside tracked range',()=>{
 assert.equal(sampleSurface(track,-.1),null);assert.equal(sampleSurface(track,2.1),null);
 const lost={...track,samples:track.samples.map((s,i)=>({...s,visible:i!==1}))};
 assert.equal(sampleSurface(lost,.05),null);assert.equal(sampleSurface(lost,.1),null);assert.deepEqual(sampleSurface(lost,.2),q);
});
test('attachment uses the parent clock, geometry and source identity',()=>{
 assert.equal(trackedQuadAtFrame(track,parent,29,{width:100,height:200}),null);
 assert.deepEqual(trackedQuadAtFrame(track,parent,30,{width:100,height:200}),[[10,70],[50,65],[60,110],[15,120]]);
 assert.equal(trackedQuadAtFrame(track,{...parent,source_url:'/changed.mp4'},30,{width:100,height:100}),null);
 assert.deepEqual(trackedQuadAtFrame(track,{...parent,source_url:'http://127.0.0.1:3123/video.mp4'},30,{width:100,height:200}),[[10,70],[50,65],[60,110],[15,120]]);
 assert.equal(trackedQuadAtFrame(track,undefined,30,{width:100,height:100}),null);
 assert.equal(trackedQuadAtFrame(track,parent,60,{width:100,height:100}),null);
});
test('speed-step source timing is sampled, not text-local time',()=>{
 const moving={...track,samples:track.samples.map(s=>({...s,quad:q.map(([x,y])=>[x+s.t/10,y]) as SurfaceQuad}))};
 const video={...parent,trim_start:0,duration:2,props:{source_duration_seconds:2,keyframes:{playback_rate:[{source_t:1,t:.5,v:.5,ease:'hold'}]}}};
 const at=trackedQuadAtFrame(moving,video,60,{width:100,height:100})!;
 assert.ok(Math.abs(at[0][0]-22.5)<.001);
});
test('invalid ranges and unordered samples are rejected',()=>{
 assert.equal(surfaceTrackSchema.safeParse({...track,visibleTo:-1}).success,false);
 assert.equal(surfaceTrackSchema.safeParse({...track,samples:[track.samples[1],track.samples[0]]}).success,false);
});
test('displayed source frame controls geometry despite a lagging speed-ramp decoder',()=>{
 const moving={...track,samples:track.samples.map(s=>({...s,quad:q.map(([x,y])=>[x+s.t/10,y]) as SurfaceQuad}))};
 const authored=trackedQuadAtFrame(moving,parent,40,{width:100,height:100})!;
 const displayed=trackedQuadAtFrame(moving,parent,40,{width:100,height:100},30,.5)!;
 assert.ok(authored[0][0]>displayed[0][0]);assert.equal(displayed[0][0],15.000000000000002);
 assert.equal(trackedQuadAtFrame(moving,parent,40,{width:100,height:100},30,2.5),null);
});
test('attachment follows only a fingerprint-matched active foreground copy',()=>{
 const foreground={...parent,id:'cutout',source_url:'/alpha.webm',timeline_start:1.2,duration:.3,props:{has_alpha:true,custom_cutout_receipt:{source_sha256:track.sourceSha256,source_interval_seconds:[0,2]}}};
 assert.equal(surfacePresentationParent(track,[parent,foreground],39)?.id,'cutout');
 assert.equal(surfacePresentationParent(track,[parent,foreground],48)?.id,'video');
 assert.equal(surfacePresentationParent(track,[parent,{...foreground,props:{...foreground.props,custom_cutout_receipt:{source_sha256:'b'.repeat(64),source_interval_seconds:[0,2]}}}],39)?.id,'video');
});
