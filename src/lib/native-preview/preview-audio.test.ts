import test from 'node:test';import assert from 'node:assert/strict';import {nativePreviewAudioElements} from './preview-audio';import {resolvePreviewAudioPlaybackState,isEditorMixedAudioElement} from '../../components/studio/timeline/timeline-preview-audio-engine';import type {CompositionElement} from '../render/composition-adapters';
const video:CompositionElement={id:'speech',type:'video_clip',source_url:'/api/projects/test/media/original.mp4',timeline_start:2,duration:2,lane_key:'visual_0',lane_index:0,volume:1,playback_rate:2,trim_start:1,trim_end:0,fade_in:0,fade_out:0,props:{source_duration_seconds:5,preview_audio_source_url:'/api/projects/test/media/audio.m4a',preview_audio_baked_gain:2}};
test('native video audio keeps identity, source trims and rates while compensating sidecar gain',()=>{const [e]=nativePreviewAudioElements([video]);assert.equal(e.id,video.id);assert.ok(isEditorMixedAudioElement(e));assert.equal(e.source_url,video.props!.preview_audio_source_url);const s=resolvePreviewAudioPlaybackState(e,2.5);assert.equal(s.sourceTimeSeconds,2);assert.equal(s.playbackRate,2);assert.equal(s.gain,.5);assert.equal(s.active,true);assert.equal(video.lane_key,'visual_0');});
test('native audio ends at the real source boundary before an overflow hold',()=>{const [e]=nativePreviewAudioElements([{...video,duration:4}]);assert.equal(resolvePreviewAudioPlaybackState(e,3).active,true);assert.equal(resolvePreviewAudioPlaybackState(e,4.5).active,false);});
test('known silent sources do not become extra mixer channels',()=>{const e={...video,props:{...video.props,runtime_source_has_audio:false}};assert.equal(nativePreviewAudioElements([e])[0],e);assert.equal(isEditorMixedAudioElement(e),false);});
test('muting keeps the audio-only binding and gain compensation stable',()=>{
 const [muted]=nativePreviewAudioElements([{...video,volume:0}]);
 const [audible]=nativePreviewAudioElements([video]);
 assert.equal(muted.source_url,audible.source_url);
 assert.equal(muted.source_url,video.props!.preview_audio_source_url);
 assert.equal(muted.props!._native_preview_audio_baked_gain,2);
 assert.equal(resolvePreviewAudioPlaybackState(muted,2.5).gain,0);
 assert.equal(resolvePreviewAudioPlaybackState({...muted,volume:1},2.5).gain,.5);
 const [repaired]=nativePreviewAudioElements([{...video,volume:0,props:{...video.props,runtime_preview_audio_source_url:'/repaired.m4a'}}]);
 assert.equal(repaired.source_url,'/repaired.m4a');
});
