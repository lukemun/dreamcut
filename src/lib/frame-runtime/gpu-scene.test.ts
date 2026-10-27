import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene,evaluateGpuScene,gpuTextQuad,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import type {SurfaceTrack,SurfaceQuad} from '../timeline/surface-track';
import {gpuGradeUniforms} from '../gpu-preview/color-grade';
import {buildColorGradeFilterDescriptor,resolveColorGradeAtTime} from '../timeline/color-grade';
import {resolveChromaKeyAtTime} from '../timeline/chroma-key';
import {DEFAULT_CAPTION_PROPS} from '../timeline/captions';
const video:CompositionElement={id:'ball',type:'video_clip',source_url:'/original.mp4',timeline_start:0,duration:2,lane_key:'visual_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,
 props:{source_duration_seconds:1,preview_source_url:'/preview.mp4',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/preview.mp4',ok:true,width:100,height:100},keyframes:{mask_inset:[{t:0,v:[0,0,0,0]},{t:1,v:[.2,0,.3,0]}]}}};
const track:SurfaceTrack={version:1,id:'note',parentId:'ball',sourceUrl:'/original.mp4',sourceSha256:'a'.repeat(64),width:100,height:100,referenceTime:0,visibleFrom:0,visibleTo:1,samples:Array.from({length:11},(_,i)=>({t:i/10,quad:[[.1+i*.01,.2],[.5+i*.01,.2],[.5+i*.01,.6],[.1+i*.01,.6]] as SurfaceQuad,visible:true,confidence:1}))};
const text:CompositionElement={...video,id:'text',type:'caption_text',lane_key:'captions_0',source_url:null,props:{text:'NOTE',surface_track:track}};
test('caption fades share glyph pixels across local-time opacity and arbitrary seeks',async()=>{
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...text,timeline_start:2,duration:2,props:{text:'Fade',animationIn:'fade',animationOut:'fade',animationInDuration:.4,animationOutDuration:.4}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];if(layer.kind!=='caption')throw Error('missing caption');return layer;};
 for(const [frame,opacity]of [[114,.5],[60,0],[108,1],[66,.5],[72,1]]){
  const layer=at(frame);assert.equal(layer.opacity,opacity);
  assert.equal(gpuTextTextureKey(layer,'font'),gpuTextTextureKey(at(72),'font'));
  const scene=evaluateGpuScene([element],[],frame,320,320,'media1');
  const draw=gpuSceneDraws(scene,new Map(),()=>({width:320,height:320}) as OffscreenCanvas)[0];
  assert.equal(draw.opacity,opacity);
 }
 const instant={...element,props:{...element.props,animationInDuration:0,animationOutDuration:0}};
 const layer=evaluateGpuScene([instant],[],60,320,320,'media1').layers[0];
 assert.ok(layer.kind==='caption');assert.equal(layer.opacity,1);
});
test('caption slides share their raster while translating on the caption clock',async()=>{
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 for(const [preset,x,y]of [['slide_up',0,8],['slide_down',0,-8],['slide_left',12.8,0],['slide_right',-12.8,0]] as const){
  const element={...text,timeline_start:2,duration:2,props:{text:'Slide',animationIn:preset,animationOut:preset,animationInDuration:.4,animationOutDuration:.4}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const scene=evaluateGpuScene([element],[],66,320,320,'media1'),layer=scene.layers[0];assert.ok(layer.kind==='caption');
  assert.deepEqual(layer.translation,{x,y});assert.equal(layer.opacity,.5);
  const settled=evaluateGpuScene([element],[],75,320,320,'media1').layers[0];assert.ok(settled.kind==='caption');
  assert.equal(gpuTextTextureKey(layer,'font'),gpuTextTextureKey(settled,'font'));
  const texture={width:320,height:320} as OffscreenCanvas;
  const draw=gpuSceneDraws(scene,new Map(),()=>texture)[0];
  assert.ok(Math.abs(draw.transform[12]-2*x/320)<1e-6);
  assert.ok(Math.abs(draw.transform[13]+2*y/320)<1e-6);
 }
});
test('handwriting follows caption-local time and shares completed pixels through the hold',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const element={...text,timeline_start:2,duration:2,props:{text:'Go!',fontPreset:'pacifico',animationIn:'handwriting',animationOut:'handwriting',animationInDuration:.4,animationOutDuration:.4}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];if(layer.kind!=='caption')throw Error('missing caption');return layer;};
 assert.equal(at(60).handwritingProgress,0);
 assert.equal(at(66).handwritingProgress,.5);
 assert.equal(at(72).handwritingProgress,1);
 assert.equal(at(108).handwritingProgress,1);
 assert.equal(at(114).handwritingProgress,.5);
 assert.equal(gpuTextTextureKey(at(72),'font'),gpuTextTextureKey(at(108),'font'));
 assert.equal(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(114),'font'));
 assert.notEqual(gpuTextTextureKey(at(60),'font'),gpuTextTextureKey(at(66),'font'));
 assert.equal(at(66).rasterFrame,6);
});
test('saved neutral caption controls do not force fallback; active unsupported effects still do',()=>{
 const props={...DEFAULT_CAPTION_PROPS,text:'Saved neutral controls'};
 const caption={...text,props};
 assert.deepEqual(gpuSceneCapabilityIssues([caption],'media1'),[]);
 assert.equal(admitGpuScene([{...caption,props:{...props,animationIn:'focus_settle'}}],'media1').supported,false);
 assert.equal(admitGpuScene([{...caption,props:{...props,surfaceMode:'wall'}}],'media1').supported,false);
 assert.equal(admitGpuScene([{...caption,props:{...props,future_effect:0}}],'media1').supported,false);
});
test('positioned captions are admitted and position edits invalidate only their raster identity',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const first={...text,props:{text:'Position',absX:.08,absY:.07,fontSizing:'fixed',positionNudgeY:'slightly_down',outlineWidthPx:1.5}};
 const second={...first,props:{...first.props,absX:.3}};
 assert.equal(admitGpuScene([first,second].map((e,i)=>({...e,id:String(i)})),'media1').supported,true);
 const a=evaluateGpuScene([first],[],0,320,320,'media1').layers[0];
 const b=evaluateGpuScene([second],[],0,320,320,'media1').layers[0];
 if(a.kind!=='caption'||b.kind!=='caption')throw Error('missing captions');
 assert.notEqual(gpuTextTextureKey(a,'same-font'),gpuTextTextureKey(b,'same-font'));
 assert.equal(admitGpuScene([{...first,props:{...first.props,textScaleX:1.05}}],'media1').supported,false);
});
test('GPU chroma amounts animate on the local timeline clock, independently of held source time',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const props={...video.props,chroma_key_model:'color-key-v1',chroma_key_color:'#42ac47',chroma_key_softness:.06,chroma_key_spill:.3,
  keyframes:{chroma_key_tolerance:[{t:0,v:.1},{t:2,v:.5}]}};
 const element={...video,timeline_start:2,props};assert.equal(admitGpuScene([element],'media1').supported,true);
 const scene=evaluateGpuScene([element],[],105,100,100,'media1'),layer=scene.layers[0];
 if(layer.kind!=='video')throw Error('missing picture');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:966667,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const key=gpuSceneDraws(scene,frames,()=>undefined)[0].chroma;
 assert.deepEqual(key,resolveChromaKeyAtTime(props,1.5));assert.equal(key!.tolerance,.4);
 assert.equal(admitGpuScene([{...element,props:{...props,chroma_key_model:'future'}}],'media1').supported,false);
 assert.equal(admitGpuScene([{...element,props:{chroma_key_spill:.3}}],'media1').supported,false);
 assert.ok(gpuSceneCapabilityIssues([{...element,type:'still',source_url:'/photo.png'}],'media1').some(i=>i.capability==='chroma-key'));
});
test('GPU grading uses the authored local clock through a source tail hold',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const props={...video.props,color_grade_model:'linear-srgb-v1',grade_shadows:.4,grade_gamma_rgb:[1.1,.9,1],
  keyframes:{grade_exposure_ev:[{t:0,v:0},{t:2,v:1}]}};
 const element={...video,timeline_start:2,props};
 const admission=admitGpuScene([element],'media1');assert.equal(admission.supported,true);
 const scene=evaluateGpuScene([element],[],105,100,100,'media1'),layer=scene.layers[0];
 if(layer.kind!=='video')throw Error('missing picture');
 assert.equal(layer.timeUs,983332);
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:966667,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const grade=gpuSceneDraws(scene,frames,()=>undefined)[0].grade;
 // A v1-saved grade is upgraded on read; the draw carries the grade at the authored local time.
 const comparable=(d:ReturnType<typeof buildColorGradeFilterDescriptor>)=>d&&{atlasKey:d.atlasKey,linearMatrix:d.linearMatrix,chromaMatrix:d.chromaMatrix,toneMap:d.toneMap};
 assert.deepEqual(comparable(grade??null),comparable(buildColorGradeFilterDescriptor(resolveColorGradeAtTime(props,1.5))));
 assert.notDeepEqual(comparable(grade??null),comparable(buildColorGradeFilterDescriptor(resolveColorGradeAtTime(props,layer.timeUs/1e6))));
 assert.equal(grade!.atlasBytes().length,1024*15*4);
 assert.equal(gpuGradeUniforms().length,116);assert.ok(gpuGradeUniforms().every(v=>v===0));
});
test('unknown grading models and unimplemented LUTs remain explicit admission failures',()=>{
 assert.match(gpuSceneCapabilityIssues([{...video,props:{...video.props,grade_exposure_ev:1}}],'media1').map(i=>i.reason).join(' '),/missing color_grade_model/);
 assert.equal(admitGpuScene([{...video,props:{...video.props,color_grade_model:'future',grade_exposure_ev:1}}],'media1').supported,false);
 assert.ok(gpuSceneCapabilityIssues([{...video,props:{...video.props,color_grade_model:'linear-srgb-v1',lut_source_url:'/look.cube'}}],'media1').some(i=>i.capability==='property:lut_source_url'));
});
test('capability inventory reports all actors and independent blockers without admitting them',()=>{
 const elements=[{...video,id:'image',type:'still'},
  {...text,props:{text:'Special caption',animationIn:'focus_settle'}},
  {...video,id:'future',timeline_start:100,fade_out:.2,props:{...video.props,zoom_blur:.5,media_blend_mode:'multiply',keyframes:{zoom_blur:[{t:0,v:0},{t:1,v:1}]}}}];
 const issues=gpuSceneCapabilityIssues(elements,'media1');
 assert.deepEqual(issues.map(i=>[i.elementId,i.capability]),[
  ['image','source'],['text','caption-animation'],
  ['future','property:zoom_blur'],['future','blend'],['future','animation:zoom_blur']]);
 assert.equal(admitGpuScene(elements,'media1').supported,false);
 assert.match(issues[0].reason,/PNG, JPEG or SVG/);
 assert.deepEqual(gpuSceneCapabilityIssues([video,text],'media1'),[]);
});
test('still image keeps one cached source frame while its authored transform animates',()=>{
 const still={...video,id:'photo',type:'still',source_url:'/photo.png',timeline_start:1,
  props:{keyframes:{media_scale:[{t:0,v:1},{t:1,v:2}]}}};
 const first=scene([still],30).layers[0],later=scene([still],60).layers[0];
 assert.equal(first.kind,'video');assert.equal(later.kind,'video');
 if(first.kind!=='video'||later.kind!=='video')throw Error('Missing still');
 assert.equal(first.source.kind,'image');assert.equal(first.source.url,'/photo.png');
 assert.equal(first.source.key,later.source.key);assert.equal(first.timeUs,0);assert.equal(later.timeUs,0);
 assert.equal(first.transform.scale,1);assert.equal(later.transform.scale,2);
 assert.equal(scene([still],29).layers.length,0);assert.equal(scene([still],90).layers.length,0);
});
function scene(elements=[video,text],frame=0){const admission=admitGpuScene(elements,'media1');assert.equal(admission.supported,true);if(!admission.supported)throw Error(admission.reason);return evaluateGpuScene(admission.elements,[],frame,100,100,'media1');}
test('scene retains masked video and tracked text in compositing order',()=>{
 const result=scene();assert.deepEqual(result.layers.map(l=>l.kind),['video','text']);
 const layer=result.layers[0];assert.equal(layer.kind,'video');if(layer.kind!=='video')return;
 assert.equal(layer.source.url,'/preview.mp4');assert.equal(layer.timeUs,16666);assert.equal(layer.mask.top,0);
});
test('ordinary caption uses a reusable full-canvas layout without a video parent',async()=>{
 const caption={...text,props:{text:'Two\nlines',styleVariant:'bold_outline',positionPreset:'top_left'}};
 const result=scene([caption],15),layer=result.layers[0];
 assert.equal(layer.kind,'caption');
 if(layer.kind!=='caption')throw Error('Missing ordinary caption');
 const {gpuSceneDraws,gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 assert.throws(()=>gpuSceneDraws(result,new Map(),()=>undefined),/caption layout/);
 assert.equal(gpuSceneDraws(result,new Map(),()=>({width:100,height:100}) as OffscreenCanvas).length,1);
 const later=scene([caption],30).layers[0];if(later.kind!=='caption')throw Error('Missing caption');
 assert.equal(gpuTextTextureKey(layer,'font'),gpuTextTextureKey(later,'font'));
});
test('window opening uses the clip clock and output coordinates independently of source transforms',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:1,props:{...video.props,window_open_duration:1,window_vertical_margin_percent:10,window_center_y_percent:40,window_corner_radius:50,media_offset_x:.5}};
 const result=scene([element],45),layer=result.layers[0];if(layer.kind!=='video')throw Error('missing media');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const draw=gpuSceneDraws(result,frames,()=>undefined)[0];
 assert.deepEqual(draw.window?.rect,{x:0,y:20,width:100,height:40});
 assert.equal(draw.window?.radius,50*100/1080);
});
test('recolor draw uses the shared matrix and leaves source alpha to the compositor',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {recolorMatrix,resolveRecolor}=await import('../timeline/recolor');
 for(const props of [{recolor_color:'#20dd80',recolor_amount:.65,recolor_preserve_shading:1},{paper_fill_color:'#cc8040'},{recolor_color:'#20dd80',recolor_amount:0}]){
  const element={...video,props:{...video.props,...props}},result=scene([element],0),layer=result.layers[0];
  if(layer.kind!=='video')throw Error('missing media');
  const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
  assert.deepEqual(gpuSceneDraws(result,frames,()=>undefined)[0].recolor,recolorMatrix(resolveRecolor(props)));
 }
});
test('mask clock continues through tail hold while picture stays on the last source frame',()=>{
 const result=scene([video,text],45),picture=result.layers[0],caption=result.layers[1];
 assert.equal(picture.kind,'video');assert.equal(caption.kind,'text');if(picture.kind!=='video'||caption.kind!=='text')return;
 assert.equal(picture.timeUs,983332);assert.equal(picture.mask.top,.2);assert.equal(picture.mask.bottom,.3);
 assert.equal(caption.parentSourceTime,29/30);
 assert.ok(Math.abs(gpuTextQuad(result,caption,29/30)![0][0]-19.6666667)<1e-6);
});
test('tracked text follows decoded parent time, never an independently advanced text clock',()=>{
 const result=scene([video,text],15),caption=result.layers[1];if(caption.kind!=='text')throw Error('missing tracked text');
 assert.equal(gpuTextQuad(result,caption,0)![0][0],10);
 assert.ok(Math.abs(gpuTextQuad(result,caption,.5)![0][0]-15)<1e-8);
 assert.equal(gpuTextQuad(result,caption,1.1),null);
});
test('a fingerprint-matched active cutout becomes the text parent',()=>{
 const cutout={...video,id:'foreground',source_url:'/alpha.webm',lane_key:'visual_1',props:{...video.props,has_alpha:true,custom_cutout_receipt:{source_sha256:track.sourceSha256,source_interval_seconds:[0,1]}}};
 const result=scene([video,cutout,text],15),caption=result.layers.find(l=>l.kind==='text');
 assert.equal(caption?.kind,'text');if(caption?.kind==='text')assert.equal(caption.parent.id,'foreground');
});
test('unsupported future effect rejects the whole scene before play reaches it',()=>{
 const future={...video,id:'later',timeline_start:100,props:{...video.props,zoom_blur:.5}};
 const admission=admitGpuScene([video,future],'media1');assert.equal(admission.supported,false);
 if(!admission.supported)assert.match(admission.reason,/zoom_blur/);
 assert.equal(admitGpuScene([{...video,fade_out:.2}],'media1').supported,true);
 const picture=(elements:CompositionElement[])=>scene(elements,5).layers.map(({element,...resolved})=>resolved);
 assert.deepEqual(picture([{...video,fade_in:.3,fade_out:.2}]),picture([video]),'Audio fades must not change picture');
 assert.equal(admitGpuScene([{...text,props:{text:'untracked',animationIn:'future_animation'}}],'media1').supported,false);
});
test('shared lane ordering permits text behind picture and half-open clip boundaries',()=>{
 const admitted=admitGpuScene([video,text],'media1');if(!admitted.supported)throw Error(admitted.reason);
 assert.deepEqual(evaluateGpuScene(admitted.elements,['visual_0','captions_0'],0,100,100,'media1').layers.map(l=>l.kind),['text','video']);
 assert.equal(scene([video,text],60).layers.length,0);
});

test('draw preparation is atomic and samples text from the acquired video frame',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const result=scene([video,text],15),layer=result.layers[0];if(layer.kind!=='video')throw Error('missing video');
 const frames=new Map([[video.id,{sourceKey:layer.source.key,timestampUs:500000,durationUs:33333,bytes:40000,
  value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 assert.throws(()=>gpuSceneDraws(result,new Map(),()=>undefined),/source frame/);
 assert.throws(()=>gpuSceneDraws(result,frames,()=>undefined),/text layout/);
 const draws=gpuSceneDraws(result,frames,()=>({width:40,height:40}) as OffscreenCanvas);
 assert.equal(draws.length,2);assert.equal(draws[0].frame,frames.get(video.id)!.value);
 assert.deepEqual(draws[0].clip,[0,10,100,85]);
 const m=draws[1].transform,x=-1,y=1,w=m[3]*x+m[7]*y+m[15];
 assert.ok(Math.abs((m[0]*x+m[4]*y+m[12])/w-(-.7))<1e-8);
});
test('text raster identity survives a seek but changes with content and font',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const first=scene().layers[1],later=scene([video,text],15).layers[1];
 if(first.kind!=='text'||later.kind!=='text')throw Error('missing text');
 assert.equal(gpuTextTextureKey(first,'font-v1'),gpuTextTextureKey(later,'font-v1'));
 assert.notEqual(gpuTextTextureKey(first,'font-v1'),gpuTextTextureKey(first,'font-v2'));
 assert.notEqual(gpuTextTextureKey(first,'font-v1'),gpuTextTextureKey({...first,text:{...first.text,text:'EDIT'}},'font-v1'));
});

test('subject flash admits the verified alpha/recolor/grade combinations and unknown subject controls remain blocked',()=>{
 for(const props of [{subject_flash:.7},{keyframes:{subject_flash:[{t:0,v:0},{t:1,v:.7}]}},{subject_flash:.7,recolor_color:'#20dd80',recolor_amount:.65},{subject_flash:.7,color_grade_model:'linear-srgb-v1',grade_exposure_ev:.2}]){
  assert.equal(admitGpuScene([{...video,props:{...video.props,...props}}],'media1').supported,true);
 }
 const issues=gpuSceneCapabilityIssues([{...video,props:{...video.props,subject_flash:.7,subject_glow_color:'#00ffff'}}],'media1');
 assert.ok(issues.some(issue=>issue.capability==='property:subject_glow_color'));
});

test('subject flash follows the clip clock during a source hold and honors shared disabled states',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:2,duration:3,props:{...video.props,leading_hold_duration_seconds:1,keyframes:{subject_flash:[{t:0,v:0},{t:1,v:.8}]}}};
 const result=evaluateGpuScene([element],[],75,320,180,'media1'),layer=result.layers[0];
 if(layer.kind!=='video')throw Error('missing video');
 assert.equal(layer.timeUs,16666);
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 assert.equal(gpuSceneDraws(result,frames,()=>undefined)[0].flash,.4);
 for(const props of [{subject_effect_state:'disabled'},{subject_effect_state:'removed'},{subject_flash_state:'disabled'}]){
  const disabled=evaluateGpuScene([{...element,props:{...element.props,...props}}],[],75,320,180,'media1');
  assert.equal(gpuSceneDraws(disabled,frames,()=>undefined)[0].flash,0);
 }
});

test('directional blur uses clip-local keyframes and composition width rather than decoder resolution',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:2,props:{...video.props,directional_blur_y:54,keyframes:{directional_blur_x:[{t:0,v:0},{t:1,v:108}]}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const result=evaluateGpuScene([element],[],75,320,180,'media1'),layer=result.layers[0];
 if(layer.kind!=='video')throw Error('missing video');
 for(const size of [100,1920]){
  const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:500000,durationUs:33333,bytes:size*size*4,value:{displayWidth:size,displayHeight:size} as VideoFrame,release(){}}]]);
  assert.deepEqual(gpuSceneDraws(result,frames,()=>undefined)[0].blur,{x:16,y:16});
 }
});

test('compound validation metadata cannot replace ordinary source authority or enable compound playback',()=>{
 const marker={contract:'preview-proxy-v1',url:'/unrelated-compound.webm',ok:true,width:360,height:640};
 const element={...video,props:{...video.props,compound_proxy_validation:marker}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const expected=scene([video],15).layers[0],actual=scene([element],15).layers[0];
 if(expected.kind!=='video'||actual.kind!=='video')throw Error('missing video');
 assert.deepEqual(actual.source,expected.source);
 assert.equal(actual.timeUs,expected.timeUs);
 assert.equal(admitGpuScene([{...element,props:{compound_proxy_validation:marker}}],'media1').supported,false,'Compound metadata cannot authorize a missing ordinary proxy');
 // A compound preview receipt is a Standard-only preview acceleration (resolved by
 // projectCompoundPreviews before drawing). GPU draws each member from its own proxy.
 const receipt={...element,props:{...element.props,compound_preview:{source_url:'/unrelated-compound.webm'},runtime_compound_preview:{source_url:'/unrelated-compound.webm'}}};
 assert.equal(admitGpuScene([receipt],'media1','canvaskit').supported,true);
 const member=scene([receipt],15).layers[0];if(member.kind!=='video')throw Error('missing video');
 assert.deepEqual(member.source,expected.source,'Compound receipt never replaces the member source');
});

test('all supported audio actor types stay with the shared mixer and audio envelopes do not alter GPU picture',()=>{
 const audio=['vo_full','vo_segment','music','sound_effect','audio'].map((type,i)=>({...video,id:`audio-${i}`,type,props:{audio_cleanup:{strength:.7},volume_envelope:[{time:0,volume:2}]}}));
 const admission=admitGpuScene([video,...audio],'media1');assert.equal(admission.supported,true);
 if(admission.supported)assert.deepEqual(admission.elements.map(e=>e.id),[video.id]);
 const element={...video,props:{...video.props,volume_envelope:[{time:0,volume:2},{time:1,volume:0}]}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const expected=scene([video],15).layers[0],actual=scene([element],15).layers[0];
 if(expected.kind!=='video'||actual.kind!=='video')throw Error('missing video');
 assert.deepEqual(actual.source,expected.source);assert.equal(actual.opacity,expected.opacity);assert.equal(actual.timeUs,expected.timeUs);
});

test('media animations follow the timeline through a held source frame, not decoder time',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:2,duration:3,props:{...video.props,leading_hold_duration_seconds:1,animationIn:'fade',animationInDuration:1,animationOut:'fade',animationOutDuration:.5,semantic_layout:{schema_version:1,slot:'upper_right',size:'peer'}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const result=evaluateGpuScene([element],[],75,320,180,'media1'),layer=result.layers[0];
 if(layer.kind!=='video')throw Error('missing video');
 assert.equal(layer.timeUs,16666);assert.equal(layer.animation.opacity,.5);
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const draw=gpuSceneDraws(result,frames,()=>undefined)[0];
 assert.equal(draw.opacity,1);assert.equal(draw.groupOpacity,.5);assert.equal(draw.group?.width,320);assert.equal(draw.group?.height,180);
 assert.equal(draw.group?.scale,1);
 const unsupported={...element,props:{...element.props,animationIn:'focus_settle'}};
 assert.equal(admitGpuScene([unsupported],'media1').supported,false);
});

test('saved semantic hints do not override rendered geometry and unverified movement presets remain closed',()=>{
 const neutral={...video,props:{...video.props,animationIn:'none',animationOut:'none',animationInDuration:0,animationOutDuration:0,semantic_layout:{schema_version:1,slot:'upper_right',size:'peer'}}};
 assert.equal(admitGpuScene([neutral],'media1').supported,true);
 const before=evaluateGpuScene([video],[],15,320,180,'media1').layers[0];
 const after=evaluateGpuScene([neutral],[],15,320,180,'media1').layers[0];
 if(before.kind!=='video'||after.kind!=='video')throw Error('missing media');
 assert.deepEqual(after.transform,before.transform);assert.deepEqual(after.mask,before.mask);
 for(const preset of ['pop','spring_pop','rotate_in','drop_in','slide_up','slide_down','slide_left','slide_right','focus_settle','future-animation']){
  const issues=gpuSceneCapabilityIssues([{...neutral,props:{...neutral.props,animationIn:preset}}],'media1');
  assert.ok(issues.some(issue=>issue.capability==='media-animation'),preset);
 }
});

test('subject outline and halo use the effect clock and composition scale, not decoder dimensions',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:2,props:{...video.props,media_scale:.5,sticker_outline:true,sticker_outline_width:12,sticker_outline_color:'#00aaff',subject_glow:2.33,subject_glow_radius:42,keyframes:{subject_glow:[{t:0,v:2},{t:1,v:0}]}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const result=evaluateGpuScene([element],[],75,1080,1920,'media1'),layer=result.layers[0];if(layer.kind!=='video')throw Error('missing media');
 for(const size of [100,1920]){
  const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:500000,durationUs:33333,bytes:40000,value:{displayWidth:size,displayHeight:size} as VideoFrame,release(){}}]]);
  const draw=gpuSceneDraws(result,frames,()=>undefined)[0];
  assert.deepEqual(draw.outline,{radius:6,softness:.3,color:[0,170/255,1]});
  assert.deepEqual(draw.glow,{strength:1,radius:21});
  const disabled=evaluateGpuScene([{...element,props:{...element.props,sticker_outline:false,subject_glow_state:'disabled'}}],[],75,1080,1920,'media1');
  const off=gpuSceneDraws(disabled,frames,()=>undefined)[0];assert.equal(off.outline,undefined);assert.equal(off.glow,undefined);
 }
 assert.equal(admitGpuScene([{...element,props:{...element.props,sticker_outline_color:'red'}}],'media1').supported,false);
});

test('feather mask follows the shared effect clock and remains independent of decoder dimensions',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,props:{...video.props,mask_inset:[.2,.1,.2,.1],mask_feather:0,keyframes:{mask_feather:[{t:0,v:0},{t:1,v:.2}]}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const scene=evaluateGpuScene([element],[],15,320,180,'media1');
 const layer=scene.layers[0];if(layer.kind!=='video')throw Error('missing media');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const draw=gpuSceneDraws(scene,frames,()=>undefined)[0];
 assert.deepEqual(draw.featherMask,[36,144,18,3]);
 assert.equal(admitGpuScene([{...element,props:{...element.props,mask_line_rotation:45}}],'media1').supported,true,'Rotation is neutral for a rectangular mask');
});

test('crop roundness is admitted on CanvasKit, keyframed on the effect clock, and replaces the axis feather',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,props:{...video.props,mask_inset:[.5,.5,0,0],mask_feather:.1,mask_corner_radius:0,keyframes:{mask_corner_radius:[{t:0,v:0},{t:1,v:.5}]}}};
 assert.deepEqual(gpuSceneCapabilityIssues([element],'media1','canvaskit'),[]);
 assert.equal(admitGpuScene([element],'media1','canvaskit').supported,true);
 assert.ok(gpuSceneCapabilityIssues([element],'media1','webgpu').length>0,'WebGPU has no rounded crop');
 const scene=evaluateGpuScene([element],[],15,320,180,'media1');
 const layer=scene.layers[0];if(layer.kind!=='video')throw Error('missing media');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33333,bytes:40000,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]);
 const draw=gpuSceneDraws(scene,frames,()=>undefined)[0];
 // Half-way through the ramp: 0.25 of the 90 px shorter side; feather 0.1 of 180 px.
 assert.deepEqual(draw.roundedMask,[80,135,80,45,22.5,18]);
 assert.equal(draw.featherMask,undefined);
 assert.deepEqual(draw.clip,[0,90,160,180]);
 const square=evaluateGpuScene([{...element,props:{...element.props,keyframes:{}}}],[],15,320,180,'media1');
 assert.equal(gpuSceneDraws(square,frames,()=>undefined)[0].roundedMask,undefined,'zero roundness keeps the existing mask');
});

test('baked stabilization provenance is not a live GPU effect and never bypasses proxy validation',()=>{
 const props={...video.props,render_authority_source_url:'/stabilized.mp4',render_authority_sha256:'a'.repeat(64),preview_proxy_sha256:'b'.repeat(64),source_sha256:'c'.repeat(64),preview_sha256:'b'.repeat(64),video_stabilization_original_source_url:'/original.mp4',video_stabilization_original_preview_source_url:'/old-proxy.mp4',video_stabilization_original_preview_audio_source_url:'/old-audio.m4a',video_stabilization_original_render_authority_source_url:'/original.mp4',video_stabilization:{schema_version:1,enabled:true,mode:'smooth',processed_source_url:'/stabilized.mp4'}};
 assert.equal(admitGpuScene([{...video,props}],'media1').supported,true);
 const bad=gpuSceneCapabilityIssues([{...video,props:{...props,preview_proxy_validation:null}}],'media1');
 assert.ok(bad.some(issue=>issue.capability==='source'));
});

test('word caption entrances key their reveal phase and reuse settled glyphs',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 for(const preset of ['word_fade','word_rise','word_pop']){
  const element={...text,timeline_start:2,duration:2,props:{text:'One two three',animationIn:preset,animationOut:preset,animationInDuration:.4,animationOutDuration:.4}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const at=(frame:number)=>{
   const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];
   assert.ok(layer.kind==='caption');return layer;
  };
  assert.equal(at(60).wordProgress,0);assert.equal(at(66).wordProgress,.5);
  assert.notEqual(gpuTextTextureKey(at(60),'font'),gpuTextTextureKey(at(66),'font'));
  assert.equal(gpuTextTextureKey(at(72),'font'),gpuTextTextureKey(at(114),'font'));
  assert.equal(at(114).opacity,.5,'Exit opacity is composed once on the GPU');
  assert.equal(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(66),'font'));
 }
});

test('caption reveal textures distinguish entrance and exit phases on their local clock',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 for(const preset of ['write_on','scan_reveal_down']){
  const element={...text,timeline_start:2,duration:2,props:{text:'Reveal',animationIn:preset,animationOut:'write_on',animationInDuration:.4,animationOutDuration:.4}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
  assert.deepEqual(at(66).revealProgress,[.5,0]);
  assert.deepEqual(at(114).revealProgress,[1,.5]);
  assert.equal(at(66).wordProgress,undefined);
  assert.notEqual(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(114),'font'));
  assert.equal(gpuTextTextureKey(at(72),'font'),gpuTextTextureKey(at(90),'font'));
  assert.equal(at(114).opacity,1,'Reveal clipping stays in the text raster');
 }
});

test('unknown caption animations fail closed instead of resolving silently to none',()=>{
 for(const field of ['animationIn','animationOut']){
  const element={...text,props:{text:'Unknown motion',[field]:'future_animation'}};
  const issues=gpuSceneCapabilityIssues([element],'media1');
  assert.ok(issues.some(issue=>issue.capability==='caption-animation'&&issue.reason.includes(`Unknown ${field}`)));
  assert.equal(admitGpuScene([element],'media1').supported,false);
 }
});

test('caption GPU transforms reuse glyph pixels and preserve the measured pivot',async()=>{
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {setGpuTextBounds,setGpuTextAnchor}=await import('../gpu-preview/text-bounds');
 const element={...text,props:{text:'Pivot',animationIn:'pop',animationInDuration:.4}};
 const early=evaluateGpuScene([element],[],6,320,320,'media1'),settled=evaluateGpuScene([element],[],15,320,320,'media1');
 const layer=early.layers[0],later=settled.layers[0];assert.ok(layer.kind==='caption'&&later.kind==='caption');
 assert.ok(Math.abs(layer.scale!-.96)<1e-12);assert.equal(layer.opacity,.5);
 // Moving frames share Standard's retained motion-layer raster; the settled frame paints in one pass.
 assert.equal(layer.motionLayer,true);assert.equal(later.motionLayer,undefined);
 assert.equal(gpuTextTextureKey(layer,'font'),gpuTextTextureKey(evaluateGpuScene([element],[],9,320,320,'media1').layers[0] as typeof layer,'font'));
 assert.notEqual(gpuTextTextureKey(layer,'font'),gpuTextTextureKey(later,'font'));
 const texture={width:40,height:40} as OffscreenCanvas;
 setGpuTextBounds(texture,{x:80,y:60,width:40,height:40});setGpuTextAnchor(texture,[100,80]);
 const draw=gpuSceneDraws(early,new Map(),()=>texture)[0];
 assert.ok(Math.abs(draw.transform[0]-.12)<1e-6);
 assert.ok(Math.abs(draw.transform[12]-(-.375))<1e-6);
 assert.ok(Math.abs(draw.transform[13]-.5)<1e-6);
 assert.equal(draw.opacity,.5);
 const noAnchor={width:40,height:40} as OffscreenCanvas;
 assert.throws(()=>gpuSceneDraws(early,new Map(),()=>noAnchor),/anchor/);
});

test('drop-in captions honor their distance control and reuse settled glyph pixels',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const {animationStyle}=await import('../timeline/element-animation');
 for(const distance of [.02,.25,.45]){
  const element={...text,props:{text:'Drop',animationIn:'drop_in',animationOut:'drop_in',animationInDuration:.4,animationOutDuration:.4,dropInDistanceRatio:distance}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
  assert.equal(at(6).translation?.y,animationStyle('drop_in',.5,'in',320,320,distance).translateY);
  assert.equal(gpuTextTextureKey(at(6),'font'),gpuTextTextureKey(at(30),'font'));
  assert.equal(at(6).opacity,1);
 }
 for(const preset of ['focus_settle']){
  assert.equal(admitGpuScene([{...text,props:{text:'Unverified',animationIn:preset}}],'media1').supported,false);
 }
});

test('focus caption GPU blur precedes anchored scale and opacity while reusing neutral glyphs',async()=>{
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {setGpuTextAnchor}=await import('../gpu-preview/text-bounds');
 const element={...text,timeline_start:2,duration:2,props:{text:'Focus',animationIn:'focus_settle',animationOut:'focus_settle',animationInDuration:.4,animationOutDuration:.4}};
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
 assert.equal(at(66).blurPx,12);
 assert.equal(at(114).blurPx,6);
 assert.equal(at(114).opacity,.5);
 assert.equal(at(72).blurPx,0);
 assert.equal(at(72).scale,1);
 assert.equal(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(90),'font'));
 const texture={width:320,height:320} as OffscreenCanvas;setGpuTextAnchor(texture,[100,120]);
 const draw=gpuSceneDraws(evaluateGpuScene([element],[],114,320,320,'media1'),new Map(),()=>texture)[0];
 assert.equal(draw.opacity,1);
 assert.equal(draw.groupOpacity,.5);
 assert.equal(draw.postBlur?.x,6);
 assert.equal(draw.group?.scale,at(114).scale);
 assert.ok(Math.abs(draw.group!.translateX-(-60)*(1-at(114).scale!))<1e-10);
 assert.ok(Math.abs(draw.group!.translateY-(-40)*(1-at(114).scale!))<1e-10);
 assert.equal(draw.postBlur?.y,draw.postBlur?.x);
 assert.equal(admitGpuScene([element],'media1').supported,false);
});

test('media blend modes reach the finished actor without changing decoded source identity',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const at=(mode:string)=>evaluateGpuScene([{...video,props:{...video.props,media_blend_mode:mode}}],[],10,320,320,'media1');
 for(const mode of ['normal','difference','exclusion']){
  const scene=at(mode),layer=scene.layers[0];assert.ok(layer.kind==='video');
  assert.equal(admitGpuScene([layer.element],'media1').supported,true);
  const frame={displayWidth:100,displayHeight:100} as VideoFrame;
  const draw=gpuSceneDraws(scene,new Map([[video.id,{value:frame,sourceKey:layer.source.key,bytes:40000,release(){},timestampUs:layer.timeUs,durationUs:33334}]]),()=>undefined)[0];
  assert.equal(draw.blend,mode);
  assert.deepEqual(layer.source,(at('normal').layers[0] as typeof layer).source);
 }
 assert.equal(admitGpuScene([{...video,props:{...video.props,media_blend_mode:'future-mode'}}],'media1').supported,false);
});

test('inverse captions blend their glyphs with the backdrop and invalidate moving rasters by local phase',async()=>{
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...text,timeline_start:2,duration:2,props:{text:'Inverse',styleVariant:'inverse',inverseMaskMotion:'drift',inverseMaskDriftXPercent:12,inverseMaskSweepIntensity:.7,animationIn:'fade',animationInDuration:.4}};
 const at=(frame:number,actor=element)=>{const scene=evaluateGpuScene([actor],[],frame,320,320,'media1'),layer=scene.layers[0];assert.ok(layer.kind==='caption');return {scene,layer};};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const early=at(66),later=at(90);
 assert.equal(early.layer.inverseProgress,6/59);
 assert.notEqual(gpuTextTextureKey(early.layer,'font'),gpuTextTextureKey(later.layer,'font'));
 const texture={width:320,height:320} as OffscreenCanvas;
 const draw=gpuSceneDraws(early.scene,new Map(),()=>texture)[0];
 assert.equal(draw.blend,'difference');assert.equal(draw.opacity,.5);
 const staticActor={...element,props:{...element.props,inverseMaskMotion:'none',inverseMaskSweepIntensity:0}};
 assert.equal(gpuTextTextureKey(at(66,staticActor).layer,'font'),gpuTextTextureKey(at(90,staticActor).layer,'font'));
 assert.notEqual(gpuTextTextureKey(early.layer,'font'),gpuTextTextureKey(at(66,{...element,duration:3}).layer,'font'));
 const driftActor={...element,props:{...element.props,inverseMaskSweepIntensity:0}};
 assert.equal(gpuTextTextureKey(at(66,driftActor).layer,'font'),gpuTextTextureKey(at(90,driftActor).layer,'font'));
 assert.notEqual(at(66,driftActor).layer.translation?.x,at(90,driftActor).layer.translation?.x);
});

test('transition blur evaluates on the media clock and combines Gaussian variance before masks',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,timeline_start:1,props:{...video.props,directional_blur_x:12,keyframes:{transition_blur:[{t:0,v:0},{t:1,v:40}]}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 assert.equal(admitGpuScene([{...element,props:{transition_blur:24,...video.props}}],'media1').supported,true);
 const scene=evaluateGpuScene([element],[],45,320,320,'media1');
 const layer=scene.layers[0];assert.ok(layer.kind==='video');
 const frames=new Map([[element.id,{sourceKey:layer.source.key,timestampUs:layer.timeUs,durationUs:33334,value:{displayWidth:320,displayHeight:320} as VideoFrame,bytes:320*320*4}]]);
 const draw=gpuSceneDraws(scene,frames,()=>undefined)[0];
 assert.deepEqual(draw.blur,{x:Math.hypot(12*320/1080,20*320/1080),y:20*320/1080});
 assert.deepEqual(draw.clip,[0,0,320,320]);
});


test('spring captions admit both ends and retain glyph identity through authored local time',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const {animationStyle}=await import('../timeline/element-animation');
 const element={...text,timeline_start:2,duration:2,props:{text:'Spring',styleVariant:'bold_outline',animationIn:'spring_pop',animationOut:'spring_pop',animationInDuration:.4,animationOutDuration:.4}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
 assert.equal(at(66).scale,animationStyle('spring_pop',.5,'in',320,320).scale);
 assert.equal(at(90).scale,1);
 assert.notEqual(at(114).scale,1);
 // One retained raster through entrance and exit motion; the settled frame is a one-pass raster.
 assert.equal(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(114),'font'));
 assert.notEqual(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(90),'font'));
 assert.equal(gpuTextTextureKey(at(90),'font'),gpuTextTextureKey(at(95),'font'));
});


test('pop and rotation captions admit their entrance and exit with stable glyph cache keys',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const {animationStyle}=await import('../timeline/element-animation');
 for(const preset of ['pop','rotate_in'] as const){
  const element={...text,timeline_start:2,duration:2,props:{text:'Motion',styleVariant:'bold_outline',animationIn:preset,animationOut:preset,animationInDuration:.4,animationOutDuration:.4}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
  const expected=animationStyle(preset,.5,'in',320,320);
  assert.equal(at(66).scale,expected.scale);
  assert.equal(at(66).rotateZDeg,expected.rotateZDeg??0);
  assert.equal(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(114),'font'));
  assert.notEqual(gpuTextTextureKey(at(66),'font'),gpuTextTextureKey(at(90),'font'));
 }
});


test('empty caption keyframes are neutral but authored or malformed channels remain gated',()=>{
 const caption={...text,props:{text:'Caption',keyframes:{}}};
 assert.equal(admitGpuScene([caption],'media1').supported,true);
 assert.deepEqual(evaluateGpuScene([caption],[],15,320,320,'media1').layers.map(layer=>layer.kind==='caption'?layer.text:null),evaluateGpuScene([{...caption,props:{text:'Caption'}}],[],15,320,320,'media1').layers.map(layer=>layer.kind==='caption'?layer.text:null));
 for(const keyframes of [[],Object.create(null),{media_scale:[]},{media_offset_x:[{t:0,v:'bad'}]},'invalid']){
  assert.equal(admitGpuScene([{...caption,props:{...caption.props,keyframes}}],'media1').supported,false);
 }
 const issues=gpuSceneCapabilityIssues([{...caption,props:{...caption.props,keyframes:{media_scale:[{t:0,v:1}]}}}],'media1');
 assert.ok(issues.some(issue=>issue.capability==='property:keyframes'&&issue.reason.includes('media_scale')&&issue.reason.includes('verified caption channels')));
});


test('rotated line masks replace the unrotated clip while zero rotation retains its exact draw',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const element={...video,props:{...video.props,mask_inset:[.35,0,0,0],mask_line_rotation:35,mask_feather:.1,keyframes:{}}};
 assert.equal(admitGpuScene([element],'mask').supported,true);
 const draw=(actor:typeof element)=>{
  const scene=evaluateGpuScene([actor],[],0,320,568,'mask'),layer=scene.layers[0];
  assert.ok(layer.kind==='video');
  return gpuSceneDraws(scene,new Map([[actor.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:33334,bytes:4,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]]),()=>undefined)[0];
 };
 const rotated=draw(element);
 assert.ok(rotated.lineMask);assert.equal(rotated.featherMask,undefined);
 assert.equal(admitGpuScene([{...element,props:{...element.props,directional_blur_x:12}}],'mask').supported,false);
 assert.equal(admitGpuScene([{...element,props:{...element.props,keyframes:{directional_blur_y:[{t:0,v:0},{t:1,v:12}]}}}],'mask').supported,false);
 assert.deepEqual(rotated.clip,[0,0,320,568]);
 const zero=draw({...element,props:{...element.props,mask_line_rotation:0}});
 assert.equal(zero.lineMask,undefined);assert.ok(zero.featherMask);
 assert.deepEqual(zero.clip,[0,Math.floor(.35*568),320,568]);
 const animated={...element,props:{...element.props,keyframes:{mask_line_rotation:[{t:0,v:0},{t:1,v:35}]}}};
 assert.equal(admitGpuScene([animated],'mask').supported,false,'Standard does not animate this static control');
});

test('tracked styles preserve the Standard plain-text authority and never introduce inverse blending',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {surfaceTextLayout}=await import('../timeline/surface-text-layout');
 let baseline:unknown;
 for(const styleVariant of ['none','inverse','image_fill']){
  const actor={...text,props:{...text.props,styleVariant,textColor:'#ffffff',mediaFillUrls:['/unused.png']}};
  assert.equal(admitGpuScene([video,actor],'media1').supported,true);
  const scene=evaluateGpuScene([video,actor],[],15,320,320,'media1');
  const parent=scene.layers.find(layer=>layer.kind==='video');assert.ok(parent?.kind==='video');
  const tracked=scene.layers.find(layer=>layer.kind==='text');assert.ok(tracked?.kind==='text');
  const layout=surfaceTextLayout(tracked.planeWidth,tracked.planeHeight,tracked.text);
  if(baseline)assert.deepEqual(layout,baseline);else baseline=layout;
  const frame={displayWidth:100,displayHeight:100} as VideoFrame;
  const draws=gpuSceneDraws(scene,new Map([[video.id,{value:frame,sourceKey:parent.source.key,bytes:40000,release(){},timestampUs:parent.timeUs,durationUs:33334}]]),()=>({width:Math.ceil(tracked.planeWidth),height:Math.ceil(tracked.planeHeight)}) as OffscreenCanvas);
  assert.equal(draws.at(-1)?.blend,'normal');
 }
});


test('verified decorative caption styles retain distinct static glyph-cache identities',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const identities=new Set<string>();
 for(const styleVariant of ['highlight_yellow','highlight_red','yellow_banner','black_card','thought_bubble','yellow_words']){
  const element={...text,props:{text:'Styled caption',styleVariant}};
  assert.equal(admitGpuScene([element],'media1').supported,true);
  const first=evaluateGpuScene([element],[],0,320,320,'media1').layers[0];
  const later=evaluateGpuScene([element],[],15,320,320,'media1').layers[0];
  assert.ok(first.kind==='caption'&&later.kind==='caption');
  const key=gpuTextTextureKey(first,'font');
  assert.equal(key,gpuTextTextureKey(later,'font'));
  identities.add(key);
 }
 assert.equal(identities.size,6);

});

test('scorecard cache keys follow bar progress and raw winner/source metadata, then settle',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const actor={...text,timeline_start:2,props:{text:'Scores\nFirst 91 | Second 87',styleVariant:'benchmark_card',animationInDuration:.8,benchmark_winner:'Second',source_note:'Fixture'}};
 const at=(frame:number,element:typeof actor=actor)=>{
  const layer=evaluateGpuScene([element],[],frame,320,320,'media1').layers[0];
  assert.ok(layer.kind==='caption');return layer;
 };
 assert.equal(admitGpuScene([actor],'media1').supported,true);
 assert.equal(at(60).benchmark?.progress,0);
 assert.equal(at(72).benchmark?.progress,.5);
 assert.equal(at(90).benchmark?.progress,1);
 assert.equal(at(72).benchmark?.data.entries[1].winner,true);
 assert.notEqual(gpuTextTextureKey(at(60),'font'),gpuTextTextureKey(at(72),'font'));
 assert.equal(gpuTextTextureKey(at(90),'font'),gpuTextTextureKey(at(100),'font'));
 assert.notEqual(gpuTextTextureKey(at(90),'font'),gpuTextTextureKey(at(90,{...actor,props:{...actor.props,benchmark_winner:'First'}}),'font'));
 assert.notEqual(gpuTextTextureKey(at(90),'font'),gpuTextTextureKey(at(90,{...actor,props:{...actor.props,source_note:'Changed'}}),'font'));
});

test('camera reveal uses its own local clock and does not inherit ordinary caption transforms',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const element={...text,id:'camera',timeline_start:2,duration:3,props:{text:'OPEN',styleVariant:'camera_reveal',animationIn:'pop',animationInDuration:1}};
 const at=(frame:number,fps=30)=>{
  const layer=evaluateGpuScene([element],[],frame,320,180,'fixture',fps).layers[0];
  assert.ok(layer.kind==='caption');return layer;
 };
 const first=at(60),middle=at(75);
 assert.equal(first.rasterFrame,0);assert.equal(middle.rasterFrame,15);
 assert.equal(middle.scale,undefined);assert.equal(middle.translation,undefined);
 assert.equal(middle.fill,undefined,'3D owns its image material, not the flat caption fill');
 assert.notEqual(gpuTextTextureKey(first,'font'),gpuTextTextureKey(middle,'font'));
 assert.notEqual(gpuTextTextureKey(middle,'font'),gpuTextTextureKey(at(135,60),'font'));
 assert.equal(gpuTextTextureKey(middle,'font'),gpuTextTextureKey(at(75),'font'));
 assert.equal(admitGpuScene([element],'fixture').supported,true);
 assert.equal(admitGpuScene([{...element,props:{...element.props,cameraRevealOrbitX:1,mediaFillTransition:'slide',textScaleX:1.1}}],'fixture').supported,true);
 assert.equal(admitGpuScene([{...element,props:{...element.props,mediaFillUrls:['/unsupported.gif']}}],'fixture').supported,false);
 assert.equal(admitGpuScene([{...element,props:{text:'Plain',styleVariant:'none',cameraRevealOrbitX:1}}],'fixture').supported,false,'Camera-specific admission must not bypass unverified controls for other styles');
});

 test('caption position channels follow local time and reuse glyph pixels on backward seeks',async()=>{
 const {gpuTextTextureKey}=await import('../gpu-preview/scene-draws');
 const element={...text,timeline_start:2,duration:2,props:{text:'Move',media_offset_y:.25,keyframes:{media_offset_x:[{t:0,v:0},{t:1,v:1}]}}};
 assert.equal(admitGpuScene([element],'media1').supported,true);
 const at=(frame:number)=>{const layer=evaluateGpuScene([element],[],frame,320,568,'media1').layers[0];assert.ok(layer.kind==='caption');return layer;};
 for(const [frame,x] of [[90,160],[60,0],[75,80],[105,160],[75,80]]){
  assert.deepEqual(at(frame).translation,{x,y:71});
  assert.equal(gpuTextTextureKey(at(frame),'font'),gpuTextTextureKey(at(60),'font'));
 }
});

test('outline layer draws its prepared mask frame on the subject clock as a flooded dilation',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {resolveOutlineLayers}=await import('../timeline/outline-layer');
 const subject={...video,id:'subject',timeline_start:1,duration:2,trim_start:.5,props:{...video.props,source_duration_seconds:4,has_alpha:true,media_scale:.5,chroma_key_model:'color-key-v1',chroma_key_color:'#00ff00',chroma_key_tolerance:.2}};
 const mask={source_url:'/api/projects/p/media/outline-masks/abc',frame_count:120,fps:30,width:100,height:100,source_sha256:'a'.repeat(64)};
 const [,outline]=resolveOutlineLayers([subject,{...subject,id:'outline',lane_key:'visual_1',lane_index:1,props:{outline_parent_id:'subject',outline_mask:mask,outline_width:12,outline_color:'#ff8000'}}] as never) as unknown as CompositionElement[];
 assert.deepEqual(gpuSceneCapabilityIssues([subject,outline],'media1','canvaskit'),[]);
 assert.equal(admitGpuScene([outline],'media1').supported,false,'The custom WebGPU backend has no outline-layer pass');
 // Frame 45 = 0.5 s into the clip + 0.5 s trim = source 1 s = mask frame 31.
 const result=evaluateGpuScene([subject,outline],['visual_1','visual_0'],45,1080,1920,'media1');
 const layer=result.layers.find(item=>item.element.id==='outline');if(layer?.kind!=='video')throw Error('missing outline');
 assert.equal(layer.source.kind,'image');assert.equal(layer.source.url,'/api/projects/p/media/outline-masks/abc/00031.png');assert.equal(layer.timeUs,0);
 const frames=new Map(result.layers.map(item=>[item.element.id,{sourceKey:item.kind==='video'?item.source.key:'',timestampUs:item.kind==='video'?item.timeUs:0,durationUs:33333,bytes:1,value:{displayWidth:100,displayHeight:100} as VideoFrame,release(){}}]));
 const draws=gpuSceneDraws(result,frames,()=>undefined),index=result.layers.indexOf(layer);
 assert.deepEqual(draws[index].outline,{radius:6,softness:0,only:true,color:[1,128/255,0]});
 assert.equal(draws[index].chroma,undefined,'Standard draws the mask image without the subject keyer');
 assert.ok(draws[1-index].chroma,'The subject itself keeps its keyer');
 const fallback=gpuSceneDraws(evaluateGpuScene([{...outline,props:{...outline.props,outline_width:99,outline_color:'red'}}],[],45,1080,1920,'media1'),frames,()=>undefined)[0];
 assert.deepEqual(fallback.outline,{radius:32,softness:0,only:true,color:[1,1,1]},'Width clamps to 64 CSS px and invalid colors fall back to white, as in Standard');
 assert.ok(gpuSceneCapabilityIssues([{...outline,props:{...outline.props,outline_mask:{source_url:'',frame_count:0}}}],'media1','canvaskit').some(issue=>issue.capability==='source'));
});

test('SVG stills rasterize at their contained layout size for the largest authored scale',async()=>{
 const {gpuSvgRasterSize,GPU_SVG_RASTER_MAX_EDGE}=await import('../gpu-preview/source');
 const still:CompositionElement={...video,id:'art',type:'still',source_url:'/api/projects/p/media/sources/year-1.svg',props:{}};
 assert.deepEqual(gpuSceneCapabilityIssues([still],'media1','canvaskit'),[]);
 const layer=evaluateGpuScene([still],[],10,1080,1920,'media1').layers[0];if(layer.kind!=='video')throw Error('missing still');
 assert.equal(layer.source.kind,'image');assert.deepEqual(layer.source.raster,{width:1080,height:1920});assert.equal(layer.timeUs,0);
 const scaled={...still,props:{media_scale:1.5,keyframes:{media_scale:[{t:0,v:1},{t:1,v:2.5}]}}};
 const big=evaluateGpuScene([scaled],[],10,1080,1920,'media1').layers[0];if(big.kind!=='video')throw Error('missing still');
 assert.deepEqual(big.source.raster,{width:Math.round(1080*GPU_SVG_RASTER_MAX_EDGE/1920),height:GPU_SVG_RASTER_MAX_EDGE});
 assert.notEqual(big.source.key,layer.source.key);
 assert.deepEqual(gpuSvgRasterSize(270,92,{width:1080,height:1920}),{width:1080,height:368});
 assert.deepEqual(gpuSvgRasterSize(1080,1920,{width:1080,height:1920}),{width:1080,height:1920});
 assert.deepEqual(gpuSvgRasterSize(0,0,{width:1080,height:1920}),{width:1080,height:1920});
 for(const url of ['/a.gif','/a.webp','/a.tiff'])assert.ok(gpuSceneCapabilityIssues([{...still,source_url:url}],'media1','canvaskit').some(issue=>issue.capability==='source'),url);
});

test('SVG decode uses the installed rasterizer and keeps one cached frame',async()=>{
 const {decodeGpuImage,setGpuSvgRasterizer,rasterizeSvgInDocument}=await import('../gpu-preview/image-frame');
 const calls:unknown[]=[];let closed=0;
 const original=(globalThis as {VideoFrame?:unknown}).VideoFrame;
 (globalThis as {VideoFrame?:unknown}).VideoFrame=class{constructor(readonly bitmap:{width:number;height:number}){}close(){}};
 setGpuSvgRasterizer(async(url,box)=>{calls.push([url,box]);return {width:540,height:184,close(){closed++;}} as unknown as ImageBitmap;});
 try{
  const decoded=await decodeGpuImage({kind:'image',key:'k',url:'/a.svg',validationUrl:'/a.svg',raster:{width:1080,height:1920}},new AbortController().signal);
  assert.deepEqual(calls,[['/a.svg',{width:1080,height:1920}]]);assert.equal(decoded.bytes,540*184*4);assert.equal(decoded.timestampUs,0);assert.equal(closed,1);
 }finally{setGpuSvgRasterizer(rasterizeSvgInDocument);(globalThis as {VideoFrame?:unknown}).VideoFrame=original;}
});

test('caption reveals on media are the shared identity pose, and caption surface props on media draw nothing',()=>{
 for(const preset of ['write_on','scan_reveal_down']){
  const element={...video,props:{...video.props,animationIn:preset,animationInDuration:.5,animationOut:preset,animationOutDuration:.5}};
  assert.deepEqual(gpuSceneCapabilityIssues([element],'media1','canvaskit'),[],preset);
  for(const frame of [0,7,30,52]){
   const layer=evaluateGpuScene([element],[],frame,320,180,'media1').layers[0];if(layer.kind!=='video')throw Error('missing media');
   assert.deepEqual([layer.animation.opacity,layer.animation.scale,layer.animation.translateX,layer.animation.translateY,layer.animation.rotateZDeg,layer.animation.blurPx],[1,1,0,0,0,0],`${preset}@${frame}`);
  }
 }
 const surface={...video,props:{...video.props,surfaceMode:'wall',surfacePerspectivePx:1200,surfaceRotateZDeg:-8}};
 assert.deepEqual(gpuSceneCapabilityIssues([surface],'media1','canvaskit'),[]);
 const plain=evaluateGpuScene([video],[],15,320,180,'media1').layers[0],withSurface=evaluateGpuScene([surface],[],15,320,180,'media1').layers[0];
 if(plain.kind!=='video'||withSurface.kind!=='video')throw Error('missing media');
 assert.deepEqual([withSurface.source,withSurface.transform,withSurface.animation,withSurface.opacity],[plain.source,plain.transform,plain.animation,plain.opacity]);
});
test('a reversed clip is admitted on both GPU engines and asks the decoder for source frames in reverse',()=>{
 const element={...video,timeline_start:0,props:{...video.props,playback_reverse:true}};
 assert.deepEqual(gpuSceneCapabilityIssues([element],'media1'),[]);
 assert.deepEqual(gpuSceneCapabilityIssues([element],'media1','canvaskit'),[]);
 const times=[0,1,2,10].map(frame=>{const layer=evaluateGpuScene([element],[],frame,100,100,'media1').layers[0];if(layer?.kind!=='video')throw Error('missing picture');return layer.timeUs;});
 assert.ok(times.every((time,index)=>index===0||time<times[index-1]!),`expected decreasing source times, got ${times}`);
});
