import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGpuVideoSource,resolveGpuImageSource} from '../gpu-preview/source';
import {resolveVideoPlaybackSource,resolveStillPlaybackSource} from '../remotion/video-preview-source';
const clip = (url='/proxy.mp4') => ({type:'video_clip', props:{preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:640,height:360}}});
test('GPU still binding follows the same short-run preview policy as Standard',()=>{
 const source='/api/projects/fixture/media/frame.png';
 const short=resolveGpuImageSource({source_url:source,duration:.1},'one');
 assert.equal(short.url,resolveStillPlaybackSource(source,false,.1));
 assert.notEqual(short.url,source);
 const long=resolveGpuImageSource({source_url:source,duration:2},'one');
 assert.equal(long.url,source);assert.notEqual(short.key,long.key);
});
test('GPU source follows the selected measured proxy including runtime quality overrides',()=>{
 const element=clip();
 assert.equal(resolveGpuVideoSource(element,'one').url,resolveVideoPlaybackSource(element,'/original.mov',false));
 const runtime={...element,props:{...element.props,runtime_preview_source_url:'/hd.mp4',preview_proxy_validation:{...element.props.preview_proxy_validation,url:'/hd.mp4',width:1920,height:1080,quality:'hd'}}};
 assert.equal(resolveGpuVideoSource(runtime,'one').url,'/hd.mp4');
 assert.notEqual(resolveGpuVideoSource(element,'one').key,resolveGpuVideoSource(runtime,'one').key);
});
test('GPU rejects missing, stale and oversized proof rather than using originals',()=>{
 const element=clip();
 for(const props of [{}, {...element.props,runtime_preview_source_url:'/other.mp4'}, {...element.props,preview_proxy_validation:{...element.props.preview_proxy_validation,width:3000}}]) {
  assert.throws(()=>resolveGpuVideoSource({type:'video_clip',props},'one'),/verified video proxy/);
 }
 assert.throws(()=>resolveGpuVideoSource(element,''),/snapshot identity/);
});
test('media refresh and alpha interpretation invalidate decode identity; actor identity does not',()=>{
 const element=clip();
 assert.notEqual(resolveGpuVideoSource(element,'one').key,resolveGpuVideoSource(element,'two').key);
 assert.notEqual(resolveGpuVideoSource(element,'one').key,resolveGpuVideoSource({...element,props:{...element.props,has_alpha:true}},'one').key);
 assert.equal(resolveGpuVideoSource(element,'one').key,resolveGpuVideoSource({...element},'one').key);
});

test('same-URL replacement revision invalidates cached frames without invalidating unchanged edits',()=>{
 const element=clip();
 const withRevision=(revision:string)=>({...element,props:{...element.props,preview_proxy_validation:{...element.props.preview_proxy_validation,revision}}});
 assert.notEqual(resolveGpuVideoSource(withRevision('old'),'one').key,resolveGpuVideoSource(withRevision('new'),'one').key);
 assert.equal(resolveGpuVideoSource(withRevision('new'),'one').key,resolveGpuVideoSource(withRevision('new'),'one').key);
});

test('baked stabilization keeps the measured preview authority and invalidates replaced bytes',()=>{
 const original=clip('/stabilized-preview.mp4');
 const props={...original.props,render_authority_source_url:'/full-quality.mp4',preview_proxy_sha256:'a'.repeat(64),video_stabilization:{enabled:true,processed_source_url:'/full-quality.mp4',processed_preview_source_url:'/stabilized-preview.mp4'},video_stabilization_original_preview_source_url:'/old-preview.mp4'};
 const element={...original,props};
 const bound=resolveGpuVideoSource(element,'scope');
 assert.equal(bound.url,resolveVideoPlaybackSource(element,'/full-quality.mp4',false));
 assert.equal(bound.url,'/stabilized-preview.mp4');
 assert.notEqual(bound.key,resolveGpuVideoSource({...element,props:{...props,preview_proxy_sha256:'b'.repeat(64)}},'scope').key);
 assert.throws(()=>resolveGpuVideoSource({...element,props:{...props,preview_source_url:'/unverified.mp4'}},'scope'),/verified video proxy/);
 assert.equal(resolveVideoPlaybackSource(element,'/full-quality.mp4',true),'/full-quality.mp4');
});

test('GPU export uses the render authority even when a different validated proxy is available',()=>{
 const element={...clip(),source_url:'/original.mp4'};
 assert.equal(resolveGpuVideoSource(element,'one',true).url,'/original.mp4');
 assert.notEqual(resolveGpuVideoSource(element,'one',true).key,resolveGpuVideoSource(element,'one').key);
 assert.equal(resolveGpuVideoSource({...element,props:{}},'one',true).url,'/original.mp4');
 assert.throws(()=>resolveGpuVideoSource(clip(),'one',true),/render source/);
 const still={source_url:'/api/projects/fixture/media/frame.png',duration:.1};
 assert.equal(resolveGpuImageSource(still,'one',true).url,still.source_url);
});
