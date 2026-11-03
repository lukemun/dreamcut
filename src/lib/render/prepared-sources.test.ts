import test from 'node:test';import assert from 'node:assert/strict';
import {preparedPlaybackSources,preparedAudioSources} from './prepared-sources';
import type {PreparedPreviewInput} from '../timeline/prepared-preview';
const row={id:'v',type:'video_clip',source_url:'/original.mov',props:{preview_source_url:'/preview.mp4',source_width:2160,source_height:3840},volume:0,timeline_start:4,duration:2,lane_key:'visual_0',lane_index:0,trim_start:3,trim_end:5,playback_rate:1,fade_in:0,fade_out:0};
const input:PreparedPreviewInput={width:1080,height:1920,fps:30,durationInFrames:180,inputProps:{elements:[row]}};
const valid=()=>({contract:'preview-proxy-v1',url:'/preview.mp4',quality:undefined,ok:true,width:640,height:360});
test('prepared silent picture uses a measured proxy without changing source clocks, geometry or export inputs',()=>{
 const result=preparedPlaybackSources(input,valid);assert.equal(result.inputProps.elements[0].source_url,'/preview.mp4');
 assert.deepEqual({...result.inputProps.elements[0],source_url:row.source_url},row);assert.equal(input.inputProps.elements[0].source_url,'/original.mov');
});
test('unverified proxies fail closed instead of silently using the original',()=>{
 assert.throws(()=>preparedPlaybackSources(input,()=>({...valid(),ok:false})),/no validated picture proxy/);
});
test('audible picture uses the selected runtime proxy while preserving audio authority in the input',()=>{
 const element={...row,volume:1,props:{...row.props,runtime_preview_source_url:'/selected.mp4',preview_proxy_validation:{quality:'hd'},volume_envelope:[{time:0,value:1}]}};
 const request={...input,inputProps:{elements:[element]}};
 const result=preparedPlaybackSources(request,(url,alpha,quality)=>{
   assert.equal(url,'/selected.mp4');assert.equal(alpha,false);assert.equal(quality,'hd');
   return {...valid(),url,width:1920,height:1080,quality};
 });
 assert.equal(result.inputProps.elements[0].source_url,'/selected.mp4');
 assert.equal(result.inputProps.elements[0].volume,0);
 assert.equal(result.inputProps.elements[0].props.volume_envelope,undefined);
 assert.equal(request.inputProps.elements[0].source_url,'/original.mov');
 assert.equal(request.inputProps.elements[0].volume,1);
});

test('audio-only preparation skips silent pictures and preserves audible actors exactly',()=>{
 const audible={...row,id:'audible',volume:.6};
 const envelope={...row,id:'envelope',props:{...row.props,volume_envelope:[{time:0,value:1}]}};
 const result=preparedAudioSources({...input,inputProps:{elements:[row,audible,envelope]}});
 assert.deepEqual(result.inputProps.elements,[audible,envelope]);
});

test('empty audio windows skip preparation but retain audible overlaps and gain envelopes',async()=>{
 const {preparedRangeHasAudio}=await import('./prepared-sources');
 const silent={...row,volume:0,props:{}};
 const value={...input,inputProps:{...input.inputProps,elements:[silent]}};
 assert.equal(preparedRangeHasAudio(value,[0,29]),false);
 const sound={...silent,id:'sound',type:'sound_effect',lane_key:'sound_effect_0',timeline_start:2,duration:1,volume:1};
 value.inputProps.elements=[sound];
 assert.equal(preparedRangeHasAudio(value,[0,59]),false);
 assert.equal(preparedRangeHasAudio(value,[60,89]),true);
 assert.equal(preparedRangeHasAudio(value,[90,119]),false);
 value.inputProps.elements=[{...sound,volume:0,props:{volume_envelope:[{time_seconds:0,volume:1}]}}];
 assert.equal(preparedRangeHasAudio(value,[60,89]),true);
});
