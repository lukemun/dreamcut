import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuCaptionSpecialMotion} from '../gpu-preview/caption-special-motion';
import {resolveCaptionProps} from '../timeline/captions';
test('scan special branch keys the shared entrance phase and reuses its hold',()=>{
 const props=resolveCaptionProps({animationInDuration:.4});
 const at=(frame:number)=>gpuCaptionSpecialMotion({scan_reveal_line:true},props,frame,2,30);
 assert.deepEqual(at(0),{kind:'scan',y:0,height:3,width:1});assert.deepEqual(at(6),{kind:'scan',y:.5,height:3,width:1});
 assert.deepEqual(at(12),at(50));assert.deepEqual(at(6),{kind:'scan',y:.5,height:3,width:1});
});
test('special branch precedence matches Standard camera and scan behavior',()=>{
 const text=resolveCaptionProps({styleVariant:'camera_reveal'});
 assert.equal(gpuCaptionSpecialMotion({ticker_motion:'crawl_left'},text,15,2,30),undefined);
 assert.equal(gpuCaptionSpecialMotion({ticker_motion:'crawl_left',scan_reveal_line:true},text,15,2,30)?.kind,'scan');
 assert.equal(gpuCaptionSpecialMotion({ticker_motion:'unknown'},resolveCaptionProps({}),15,2,30),undefined);
});

test('ticker shared geometry travels exactly one text width plus canvas without a changing glyph phase',async()=>{
 const {captionTickerTranslation,captionTickerProgress,captionTickerCss}=await import('../timeline/caption-special-motion');
 assert.equal(captionTickerTranslation(0,320,450),320);
 assert.equal(captionTickerTranslation(.5,320,450),-65);
 assert.equal(captionTickerTranslation(1,320,450),-450);
 // Whole composition pixels in both renderers; ties toward +infinity like CSS round().
 assert.equal(captionTickerTranslation(.3,320,451.5),Math.round(320-.3*771.5));
 assert.equal(captionTickerTranslation(.5,321,450),-64);
 assert.ok(Number.isInteger(captionTickerTranslation(1/89,540,812.37)));
 assert.equal(captionTickerProgress(29.5,60),.5);
 assert.equal(captionTickerCss(.5,320),'translateX(round(calc(-50% - 160px), 1px))');
});
test('scan shared geometry preserves clamp order and declared line size',async()=>{
 const {captionScanLine}=await import('../timeline/caption-special-motion');
 assert.deepEqual(captionScanLine({scan_reveal_start_y:.8,scan_reveal_end_y:.2,scan_reveal_line_width:3,scan_reveal_line_height_px:0},.5),{y:.8,width:1,height:1});
 assert.deepEqual(captionScanLine({scan_reveal_start_y:.2,scan_reveal_end_y:.8,scan_reveal_line_width:.7,scan_reveal_line_height_px:4},.5),{y:.5,width:.7,height:4});
});

test('ticker and scan share static glyphs across movement and produce translated packets',async()=>{
 const {evaluateGpuScene,admitGpuScene}=await import('../gpu-preview/scene');
 const {gpuTextTextureKey,gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const {setGpuTickerWidth,setGpuTextBounds}=await import('../gpu-preview/text-bounds');
 const element:import('../render/composition-adapters').CompositionElement={id:'caption',type:'caption_text',source_url:null,timeline_start:2,duration:2,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'An ordinary ticker',ticker_motion:'crawl_left',animationIn:'none',animationOut:'none'}};
 const at=(frame:number,props=element.props)=>evaluateGpuScene([{...element,props}],[],60+frame,320,568,'fixture');
 const first=at(0),last=at(59);assert.ok(first.layers[0].kind==='caption'&&last.layers[0].kind==='caption');
 assert.equal(admitGpuScene([element],'fixture','canvaskit').supported,true);
 assert.equal(admitGpuScene([element],'fixture','webgpu').supported,false);
 assert.equal(gpuTextTextureKey(first.layers[0],'font'),gpuTextTextureKey(last.layers[0],'font'));
 const raster={} as OffscreenCanvas;setGpuTickerWidth(raster,450);setGpuTextBounds(raster,{x:0,y:100,width:450,height:40});
 const a=gpuSceneDraws(first,new Map(),()=>raster)[0],b=gpuSceneDraws(last,new Map(),()=>raster)[0];
 assert.notDeepEqual(a.transform,b.transform);assert.equal(a.opacity,1);
 const scanProps={...element.props,scan_reveal_line:true,animationIn:'fade',animationInDuration:.4,scan_reveal_start_y:.2,scan_reveal_end_y:.8};
 const scanStart=at(0,scanProps),scanEnd=at(12,scanProps);assert.ok(scanStart.layers[0].kind==='caption'&&scanEnd.layers[0].kind==='caption');
 assert.equal(gpuTextTextureKey(scanStart.layers[0],'font'),gpuTextTextureKey(scanEnd.layers[0],'font'));
 assert.notDeepEqual(gpuSceneDraws(scanStart,new Map(),()=>raster)[0].transform,gpuSceneDraws(scanEnd,new Map(),()=>raster)[0].transform);
 assert.equal(gpuSceneDraws(scanStart,new Map(),()=>raster)[0].opacity,1,'Scan ignores caption fade opacity');
 assert.deepEqual(gpuSceneDraws(scanStart,new Map(),()=>raster),gpuSceneDraws(at(0,scanProps),new Map(),()=>raster));
});

test('shared caption markup keeps max-content ticker layout and rasterizes the scan at a reusable midpoint',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const {CaptionSequence}=await import('../remotion/TimelineComposition');
 const {FrameContext,FrameSession}=await import('./index');
 const {evaluateGpuScene}=await import('../gpu-preview/scene');
 const {gpuCaptionRasterElement}=await import('../gpu-preview/caption-raster-element');
 const actor:import('../render/composition-adapters').CompositionElement={id:'caption',type:'caption_text',source_url:null,timeline_start:0,duration:2,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{text:'A ticker',ticker_motion:'crawl_left',animationIn:'none',animationOut:'none'}};
 const render=(props:Record<string,unknown>,tickerRaster:boolean)=>{
  const layer=evaluateGpuScene([{...actor,props:{...actor.props,...props}}],[],15,320,568,'fixture').layers[0];assert.ok(layer.kind==='caption');
  const session=new FrameSession();try{return renderToStaticMarkup(React.createElement(FrameContext.Provider,{value:{frame:15,fps:30,width:320,height:568,durationInFrames:60,rendering:true,playing:false,muted:true,volume:0,playbackRate:1,session}},React.createElement(CaptionSequence,{element:gpuCaptionRasterElement(layer),sourceAspectRatio:null,renderScale:1,tickerRaster})));}finally{session.dispose();}
 };
 assert.match(render({},true),/left:0%;.*width:max-content;.*translateX\(0px\)/);
 assert.match(render({},false),/left:100%;.*translateX\(round\(calc\(/);
 const scan=render({scan_reveal_line:true,scan_reveal_start_y:.2,scan_reveal_end_y:.8,scan_reveal_line_width:.6},false);
 assert.match(scan,/top:50%/);assert.match(scan,/width:60%/);assert.doesNotMatch(scan,/A ticker/);
});
