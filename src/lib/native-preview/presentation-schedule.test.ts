import test from 'node:test';import assert from 'node:assert/strict';import {nativePreparationFrame,nativePresentationAction} from './presentation-schedule';
test('lookahead respects paused exact seeks, transport rate and ending bounds',()=>{
 const base={frame:10,durationInFrames:100,fps:30,playbackRate:1,latencyMs:40,playing:true,hasCurrentScene:true};
 assert.equal(nativePreparationFrame(base),12);assert.equal(nativePreparationFrame({...base,playbackRate:2}),13);assert.equal(nativePreparationFrame({...base,playing:false}),10);assert.equal(nativePreparationFrame({...base,frame:99}),99);
});
test('future/stale frames do not publish and missed deadlines buffer',()=>{
 const base={frame:10,preparedFrame:12,ready:true,transportPlaying:true,current:true};
 assert.equal(nativePresentationAction(base),'wait');assert.equal(nativePresentationAction({...base,frame:12}),'present');assert.equal(nativePresentationAction({...base,frame:12,ready:false}),'buffer');assert.equal(nativePresentationAction({...base,current:false}),'discard');assert.equal(nativePresentationAction({...base,transportPlaying:false}),'discard');
});


test('staging scenes suppress descendants that explicitly restore visibility',async()=>{
 const {readFileSync}=await import('node:fs');
 const composition=readFileSync(new URL('../../components/studio/timeline/NativePlaybackComposition.tsx',import.meta.url),'utf8');
 // TrackedSurfaceText restores visibility when its matrix is valid. Ancestor
 // visibility alone cannot hide it; group opacity must hide the entire buffer.
 assert.match(composition,/visibility:index===front\?'visible':'hidden',opacity:index===front\?1:0/);
});
