import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedPlaybackPlan,preparedPlaybackRanges} from './prepared-playback-plan';
import {preparedPreviewIdentity,type PreparedPreviewInput} from './prepared-preview';
const row={id:'back',type:'video_clip',source_url:'/back.mp4',timeline_start:0,duration:10,lane_key:'visual_0',lane_index:0,volume:1,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{}};
const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:300,inputProps:{externalAudioPreview:true,laneOrderKeys:['captions_0','visual_1','visual_0','sound_effect_0'],elements:[row,{...row,id:'mask',duration:.5,timeline_start:4,lane_key:'visual_1',props:{has_alpha:true}},{...row,id:'caption',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'ONE',styleVariant:'bold_outline'}},{...row,id:'sound',type:'sound_effect',lane_key:'sound_effect_0'}]}};
test('sound and supported top text changes preserve the prepared picture identity',()=>{
 const first=preparedPlaybackPlan(input);assert.ok(first.overlayCaptions);assert.ok(first.liveAudio);
 const changed=structuredClone(input);changed.inputProps.elements[2].props={text:'TWO',styleVariant:'bold_outline',fontSizePx:72};changed.inputProps.elements[3].volume=.2;
 assert.equal(preparedPreviewIdentity(first.input),preparedPreviewIdentity(preparedPlaybackPlan(changed).input));
 assert.equal(first.input.inputProps.elements[0].volume,1,'Embedded sound stays in the prepared clip');
 assert.deepEqual(first.input.inputProps.elements.map(e=>e.id),['back','mask']);
});
test('caption occlusion, dependencies, media-filled text and unknown effects keep the full composition',()=>{
 for(const alter of [(v:PreparedPreviewInput)=>{v.inputProps.laneOrderKeys=['visual_1','captions_0','visual_0'];},(v:PreparedPreviewInput)=>{v.inputProps.elements[0].props={gravity_drop_after_text_id:'caption'};},(v:PreparedPreviewInput)=>{v.inputProps.elements[2].props={text:'Mask',unknown_effect:1};},(v:PreparedPreviewInput)=>{v.inputProps.elements[2].props={text:'Media',mediaFillVideoUrl:'/fill.mp4'};}]) {
  const value=structuredClone(input);alter(value);assert.equal(preparedPlaybackPlan(value).overlayCaptions,false);
 }
});
test('half-second compositing block prepares 19 frames rather than a ten-second edit',()=>{
 assert.deepEqual(preparedPlaybackRanges(input),[[118,136]]);
 const ordinary=structuredClone(input);ordinary.inputProps.elements=ordinary.inputProps.elements.filter(e=>e.id!=='mask');assert.deepEqual(preparedPlaybackRanges(ordinary),[]);
});
test('overlapping hard ranges merge, remain clamped, and transitions have explicit coverage',()=>{
 const value=structuredClone(input);value.inputProps.elements.push({...row,id:'other',timeline_start:4.3,duration:.5,lane_key:'visual_2'});
 assert.deepEqual(preparedPlaybackRanges(value),[[118,145]]);
 const beginning=structuredClone(input);beginning.inputProps.elements[1].timeline_start=0;assert.deepEqual(preparedPlaybackRanges(beginning),[[0,16]]);
});
