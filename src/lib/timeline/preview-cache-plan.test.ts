import test from 'node:test';import assert from 'node:assert/strict';
import {activePreviewRun,previewCacheRanges,prioritizePreviewRanges} from './preview-cache-plan';
import type {PreparedPreviewInput} from './prepared-preview';
const row={id:'clip',type:'video_clip',source_url:'/video',props:{},timeline_start:0,duration:6,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:null,fade_in:0,fade_out:0};
const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:181,inputProps:{elements:[row]}};
test('smart startup waits for the remaining contiguous effect, not distant or passed sections',()=>{
 const ranges:[number,number][]=[[0,59],[60,119],[120,179],[300,359]];
 assert.deepEqual(activePreviewRun(ranges,0),[0,1,2]);
 assert.deepEqual(activePreviewRun(ranges,80),[1,2]);
 assert.deepEqual(activePreviewRun(ranges,200),[]);
 assert.deepEqual(activePreviewRun(ranges,300),[3]);
});
test('rolling ranges cover every frame once, including a partial tail',()=>{
 assert.deepEqual(previewCacheRanges(input,'rolling'),[[0,59],[60,119],[120,179],[180,180]]);
 assert.deepEqual(previewCacheRanges(input,'selective'),[]);
});
test('smart groups adjacent effect windows into one job, retaining gaps as live footage',()=>{
 const effects=[{...row,props:{future_effect:true},duration:2.5},{...row,id:'later',timeline_start:5,duration:.5,props:{future_effect:true}}];
 assert.deepEqual(previewCacheRanges({...input,inputProps:{elements:effects}},'selective'),[[0,179]]);
 const separated={...input,durationInFrames:300,inputProps:{elements:[effects[0],{...effects[1],timeline_start:8}]}};
 assert.deepEqual(previewCacheRanges(separated,'selective'),[[0,119],[180,299]]);
});
test('selective caching catches animated stills and unknown effects, not just overlapping videos',()=>{
 for(const props of [{keyframes:{media_scale:[{time:0,value:1}]}},{future_effect:true}]){
 const value={...input,inputProps:{elements:[row,{...row,id:'animation',type:'still',timeline_start:2.5,duration:.5,props}]}};
 assert.deepEqual(previewCacheRanges(value,'selective'),[[60,119]]);
 }
});
test('future ranges precede passed ranges after seeking; active always wins',()=>{
 assert.deepEqual(prioritizePreviewRanges([[0,59],[60,119],[120,179],[180,239]],120),[2,3,1,0]);
 assert.deepEqual(prioritizePreviewRanges([[60,119],[180,239]],150),[1,0]);
});
test('ordinary text stays live while surface-attached text is conservatively cached',()=>{
 const text={...row,id:'text',type:'caption_text',source_url:null,timeline_start:2.5,duration:.5,lane_key:'captions_0',props:{text:'Label',styleVariant:'clean'}};
 assert.deepEqual(previewCacheRanges({...input,inputProps:{elements:[row,text]}},'selective'),[]);
 assert.deepEqual(previewCacheRanges({...input,inputProps:{elements:[row,{...text,props:{...text.props,styleVariant:'none'}}]}},'selective'),[]);
 assert.deepEqual(previewCacheRanges({...input,inputProps:{elements:[row,{...text,props:{...text.props,unknown_surface_track:true}}]}},'selective'),[[60,119]]);
 assert.deepEqual(previewCacheRanges({...input,inputProps:{elements:[row,{...text,props:{...text.props,styleVariant:'unknown-animation'}}]}},'selective'),[[60,119]]);
});
