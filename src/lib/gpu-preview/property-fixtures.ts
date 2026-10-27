import {renderContractCases,type EffectRenderCase} from '../render/effect-render-contract';
import type {CompositionElement} from '../render/composition-adapters';
import type {GridMatteMask} from '../timeline/grid-matte';
/** Exact authored artwork from RendererContractFixture. Rasterize to PNG for
 * decoded GPU stills; do not substitute opaque or featureless sources. Tests
 * guard these strings against drift from the Standard fixture owner. */
export const GPU_PROPERTY_FIXTURE_SVGS={
 picture:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g"><stop stop-color="#c06030"/><stop offset="1" stop-color="#30b070"/></linearGradient></defs><rect x="20" y="20" width="120" height="120" fill="url(#g)"/><path d="M20 50h120M20 80h120M20 110h120" stroke="#303090" stroke-width="10"/></svg>',
 fullCanvas:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#c06030"/></svg>',
 backdrop:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#506090"/></svg>',
 video:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g"><stop stop-color="#00ff00"/><stop offset=".6" stop-color="#80a090"/><stop offset="1" stop-color="#e04020"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/></svg>',
} as const;
export type GpuPropertyFixtureAssets={
 picture:string;fullCanvas:string;backdrop:string;
 video:{url:string;durationSeconds:number};
 /** Prepared grayscale mask with the SAME content as /fixtures/grid-matte. */
 gridMask:GridMatteMask;
};
export type GpuPropertyFixtureVariant={elements:CompositionElement[];laneOrderKeys:string[]};
export type GpuPropertyFixture={
 caseIndex:number;property:ReturnType<typeof renderContractCases>[number]['property'];
 sourceType:'video'|'still';minimumChangedPixels:number;keyframeable:boolean;
 /** Scalar conformance samples at local second 1, as the Standard verifier. */
 primaryFrame:number;sampleFrames:number[];width:160;height:160;fps:30;
 baseline:GpuPropertyFixtureVariant;active:GpuPropertyFixtureVariant;reset:GpuPropertyFixtureVariant;
};
/** Projection only: no timeline mutation, capability bypass, or pass judgement.
 * Caller must run every returned obligation, recording unsupported/error cases.
 * The same elements feed Standard and candidate captures; reset uses registry
 * identity with the exact same supporting context, never a context-free source. */
export function gpuPropertyFixtures(assets:GpuPropertyFixtureAssets):GpuPropertyFixture[]{
 if(![assets.picture,assets.fullCanvas,assets.backdrop,assets.video.url,assets.gridMask.source_url].every(v=>typeof v==='string'&&v.length>0)||!Number.isFinite(assets.video.durationSeconds)||assets.video.durationSeconds<3)throw Error('GPU property fixture assets incomplete');
 if(!Number.isFinite(assets.gridMask.fps)||assets.gridMask.fps<=0||!Number.isSafeInteger(assets.gridMask.frame_count)||assets.gridMask.frame_count<1||assets.gridMask.width!==160||assets.gridMask.height!==160||assets.gridMask.source_start_seconds!==0||assets.gridMask.frame_count/assets.gridMask.fps<3)throw Error('GPU property fixture mask must cover the standard source interval');
 return renderContractCases().map((raw,caseIndex)=>{
  const entry=raw as typeof raw&EffectRenderCase;
  const context=structuredClone(entry.context??{});
  if(context.grid_matte_mask)context.grid_matte_mask=structuredClone(assets.gridMask);
  if(context.subject_window_mask)context.subject_window_mask=structuredClone(assets.gridMask);
  const variant=(active:boolean):GpuPropertyFixtureVariant=>{
   const isVideo=entry.media==='video';
   const props:Record<string,unknown>={source_width:160,source_height:160,color_grade_model:'dreamcut-scene-v2',
    ...(isVideo?{source_duration_seconds:assets.video.durationSeconds,chroma_key_model:'color-key-v1',preview_source_url:assets.video.url,preview_proxy_validation:{contract:'preview-proxy-v1',url:assets.video.url,ok:true,width:160,height:160},chroma_key_color:'#00ff00',chroma_key_tolerance:.18,chroma_key_softness:.6,chroma_key_spill:.25}:{}),
    ...structuredClone(context),[entry.property]:structuredClone(active?entry.value:entry.identity)};
   const subject:CompositionElement={id:'contract-subject',type:isVideo?'video_clip':'still',source_url:isVideo?assets.video.url:entry.fullCanvas?assets.fullCanvas:assets.picture,props,timeline_start:0,duration:10,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0};
   const backdrop:CompositionElement={...subject,id:'contract-background',type:'still',source_url:assets.backdrop,props:{},lane_key:'visual_1',lane_index:1};
   return {elements:[subject,backdrop],laneOrderKeys:['visual_0','visual_1']};
  };
  return {caseIndex,property:entry.property,sourceType:entry.media==='video'?'video':'still',minimumChangedPixels:entry.minimumChangedPixels,keyframeable:entry.keyframeable,
   primaryFrame:30,sampleFrames:[0,15,30,60,30,15],width:160,height:160,fps:30,baseline:variant(false),active:variant(true),reset:variant(false)};
 });
}
