import test from 'node:test';
import assert from 'node:assert/strict';
import CanvasKitInit from 'canvaskit-wasm';
import type {CompositionElement} from '../render/composition-adapters';
import {captionMotionLayerActive} from '../timeline/caption-plane-transform';
import {resolveTransitionViewportRect,transitionViewportBoxShadow} from '../timeline/transition-viewport';
import {evaluateGpuScene} from '../gpu-preview/scene';
import {gpuSceneDraws,gpuTextTextureKey} from '../gpu-preview/scene-draws';
import {canvasKitTransitionViewport} from '../gpu-preview/canvaskit-transition-viewport';

const base={source_url:null,timeline_start:0,duration:3,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,lane_index:0};
const caption=(props:Record<string,unknown>):CompositionElement=>({...base,id:'caption',type:'caption_text',lane_key:'captions_0',props:{text:'Pop',...props}} as CompositionElement);

test('the retained caption motion layer is active only while the pose is not the identity',()=>{
 for(const preset of ['pop','spring_pop','rotate_in']){
  assert.equal(captionMotionLayerActive(preset,'none',.96,0),true);
  assert.equal(captionMotionLayerActive('none',preset,1,4),true);
  assert.equal(captionMotionLayerActive(preset,preset,1,0),false,'settled frames paint in one pass');
 }
 assert.equal(captionMotionLayerActive('slide_up','fade',.9,0),false);
});

test('Standard and CanvasKit agree on the motion layer per frame, and the GPU keys a separate raster',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {CaptionSequence}=await import('../remotion/TimelineComposition');
 const {FrameContext,FrameSession}=await import('./index');
 const actor=caption({animationIn:'pop',animationOut:'rotate_in',animationInDuration:.4,animationOutDuration:.4});
 const standard=(frame:number)=>{const session=new FrameSession();try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame,fps:30,width:320,height:568,durationInFrames:90,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:actor,sourceAspectRatio:null,renderScale:1})));}finally{session.dispose();}};
 const gpu=(frame:number)=>{const layer=evaluateGpuScene([actor],[],frame,320,568,'fixture').layers[0];assert.ok(layer.kind==='caption');return layer;};
 for(const [frame,moving] of [[3,true],[11,true],[12,false],[45,false],[80,true]] as const){
  assert.equal(/will-change:transform/.test(standard(frame)),moving,`Standard frame ${frame}`);
  assert.equal(gpu(frame).motionLayer===true,moving,`GPU frame ${frame}`);
 }
 assert.notEqual(gpuTextTextureKey(gpu(3),'font'),gpuTextTextureKey(gpu(45),'font'));
 assert.equal(gpuTextTextureKey(gpu(3),'font'),gpuTextTextureKey(gpu(6),'font'),'one retained raster through the motion');
});

const still=(id:string,props:Record<string,unknown>,extra:Partial<CompositionElement>={}):CompositionElement=>({...base,id,type:'still',source_url:`/api/projects/fixture/media/${id}.png`,lane_key:'visual_0',props,...extra} as CompositionElement);
const clip={transition_clip_to_media_bounds:true,source_width:300,source_height:200};

test('the media-bounds viewport is the contained source rect under the media transform',()=>{
 assert.equal(resolveTransitionViewportRect({},0,540,960),null);
 assert.equal(resolveTransitionViewportRect({transition_clip_to_media_bounds:true},0,540,960),null,'unknown source size draws no viewport');
 assert.deepEqual(resolveTransitionViewportRect({...clip,media_scale:.5},0,540,960),{x:135,y:390,width:270,height:180});
 const keyed=resolveTransitionViewportRect({...clip,keyframes:{media_scale:[{t:0,v:1},{t:1,v:.5}]}},1,540,960)!;
 assert.ok(Math.abs(keyed.width-270)<1e-9);
 assert.deepEqual(transitionViewportBoxShadow({media_shadow:true,media_shadow_blur:30,media_shadow_opacity:.5,media_shadow_offset_x:4,media_shadow_offset_y:6}),{dx:4,dy:6,sigma:15,opacity:.5});
 assert.equal(transitionViewportBoxShadow({media_shadow:true,media_shadow_opacity:0}),undefined);
});

test('CanvasKit packets carry the viewport at the Standard clock: current pose, incoming head, page-turn tail',()=>{
 const frames=(scene:ReturnType<typeof evaluateGpuScene>)=>new Map(scene.layers.filter(layer=>layer.kind==='video').map(layer=>[layer.element.id,{sourceKey:layer.source.key,timestampUs:0,durationUs:1e9,value:{displayWidth:300,displayHeight:200}}])) as never;
 const zoom={keyframes:{media_scale:[{t:0,v:1},{t:3,v:.5}]}};
 const main=evaluateGpuScene([still('main',{...clip,...zoom})],[],45,540,960,'fixture');
 assert.deepEqual(gpuSceneDraws(main,frames(main),()=>undefined)[0].transitionViewport?.rect,resolveTransitionViewportRect({...clip,...zoom},1.5,540,960));
 for(const type of ['slide','page_turn']){
  const transition={id:'t',type,duration_seconds:.5,to_element_id:'b',params:{}};
  const a=still('a',{...clip,...zoom},{duration:2,transition_out:transition} as never),b=still('b',{...clip,...zoom},{timeline_start:2,duration:2,transition_in:transition} as never);
  const scene=evaluateGpuScene([a,b],['visual_0'],54,540,960,'fixture'),draws=gpuSceneDraws(scene,frames(scene),()=>undefined);
  const byId=new Map(scene.layers.map((layer,i)=>[layer.element.id,draws[i]]));
  assert.deepEqual(byId.get('@gpu-transition:t')?.transitionViewport?.rect,resolveTransitionViewportRect(b.props,0,540,960),`${type} incoming rests at its head`);
  if(type==='page_turn')assert.deepEqual(byId.get('@gpu-page-tail:t')?.transitionViewport?.rect,resolveTransitionViewportRect(a.props,2,540,960),'page tail rests at its end');
 }
});

test('CanvasKit viewport clips to the pixel-snapped box and paints its box shadow only outside it',async()=>{
 const k=await CanvasKitInit(),surface=k.MakeSurface(40,40)!,ink=new k.Paint();
 try{
  const c=surface.getCanvas();c.clear(k.WHITE);c.save();
  canvasKitTransitionViewport(k,c,{rect:{x:9.5,y:10.4,width:20,height:10},shadow:{dx:0,dy:6,sigma:1,opacity:.8}},k.BlendMode.SrcOver,true);
  ink.setColor(k.Color(255,0,0));c.drawRect(k.LTRBRect(0,0,40,40),ink);c.restore();surface.flush();
  const image=surface.makeImageSnapshot();
  try{
   const px=image.readPixels(0,0,{width:40,height:40,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   const at=(x:number,y:number)=>[...px.slice((y*40+x)*4,(y*40+x)*4+3)];
   // Box [10,10)-[30,20): x 9.5 rounds up to 10, y 10.4 down to 10, bottom 20.4 to 20.
   assert.deepEqual(at(10,10),[255,0,0]);assert.deepEqual(at(29,19),[255,0,0]);
   // Hard edges: the pixel beside the box is never red (only the soft shadow may reach it).
   assert.ok(at(9,12)[1]>200&&at(30,12)[1]>200&&at(20,9)[1]>200);assert.deepEqual(at(3,12),[255,255,255]);
   assert.ok(at(20,23)[0]<200,'shadow below the box');assert.deepEqual(at(20,4),[255,255,255]);
  }finally{image.delete();}
 }finally{ink.delete();surface.delete();}
});

test('tracked text rasterizes at Chrome\'s ideal contents scale for its projected plane',async()=>{
 const {gpuTrackedTextRasterScale}=await import('../gpu-preview/scene');
 // Affine: the larger 2D scale component (an axis-aligned 1.8x magnification, a 0.5x minification).
 assert.equal(gpuTrackedTextRasterScale([[108,372],[432,372],[432,588],[108,588]],180,120),1.8);
 assert.equal(gpuTrackedTextRasterScale([[0,0],[50,0],[50,25],[0,25]],100,50),.5);
 // A pure rotation keeps scale 1 (column length, not the rotated bounding box).
 const c=Math.cos(Math.PI/6)*100,s=Math.sin(Math.PI/6)*100;
 assert.equal(gpuTrackedTextRasterScale([[0,0],[c,s],[c-s,s+c],[-s,c]],100,100),1);
 // Perspective: never below the default scale.
 assert.equal(gpuTrackedTextRasterScale([[10,10],[60,15],[60,45],[10,50]],200,200),1);
});
