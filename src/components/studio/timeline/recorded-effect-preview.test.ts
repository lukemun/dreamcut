import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedPreviewEvents as events} from './RecordedEffectPreview';
function tile(delayed=false,disabled=false){
 let resolvePlay:()=>void=()=>{};
 const video={paused:true,controls:false,currentTime:0,getAttribute:()=>null,play(){this.paused=false;return delayed?new Promise<void>(resolve=>{resolvePlay=resolve;}):Promise.resolve();},pause(){this.paused=true;}};
 const event={currentTarget:{matches:()=>disabled,querySelector:()=>video}} as unknown as Parameters<typeof events.onPointerEnter>[0];
 return {video,event,finish:()=>resolvePlay()};
}
test('hover plays only one sample and leaving restores the first frame without selection',async()=>{
 const a=tile(),b=tile();events.onPointerEnter(a.event);await Promise.resolve();a.video.currentTime=.4;
 events.onPointerEnter(b.event);await Promise.resolve();
 assert.equal(a.video.paused,true);assert.equal(a.video.currentTime,0);assert.equal(b.video.paused,false);
 b.video.currentTime=.7;events.onPointerLeave(b.event);assert.equal(b.video.paused,true);assert.equal(b.video.currentTime,0);
});
test('leaving before video loading completes cannot restart playback; disabled choices stay idle',async()=>{
 const a=tile(true);events.onPointerEnter(a.event);events.onPointerLeave(a.event);a.finish();await Promise.resolve();assert.equal(a.video.paused,true);assert.equal(a.video.currentTime,0);
 const disabled=tile(false,true);events.onPointerEnter(disabled.event);assert.equal(disabled.video.paused,true);
});

test('a player with visible controls ignores hover and focus preview handlers',async()=>{
 const player=tile();player.video.controls=true;
 events.onPointerEnter(player.event);events.onFocus(player.event);
 assert.equal(player.video.paused,true,'hover does not start the detail player');
 await player.video.play();player.video.currentTime=4;
 events.onPointerLeave(player.event);events.onBlur(player.event);
 assert.equal(player.video.paused,false,'manual playback survives pointer exit and blur');
 assert.equal(player.video.currentTime,4,'manual playback is not rewound');
 player.video.pause();events.onPointerEnter(player.event);
 assert.equal(player.video.paused,true,'hover respects a manual pause');
});
