import { Fixture,registerFixtureGroup } from "@/lib/frame-runtime/fixtures";
import { SubjectGlowFilter } from "./SubjectGlowFilter";
import { GradeCanvasFilter } from "./GradeCanvasFilter";
import {buildColorGradeFilterDescriptor,readColorGradeProps} from "../timeline/color-grade";
import { upsertKeyframe } from "../timeline/keyframes";
import { Video, Img, Freeze, useCurrentFrame } from "@/lib/frame-runtime";
import { TimelineComposition } from "./TimelineComposition";
import { PerspectiveTitleReveal } from "./PerspectiveTitleReveal";
import { resolveCaptionProps } from "../timeline/captions";
import { renderContractCases, type EffectRenderCase } from "../render/effect-render-contract";
import type { CompositionElement } from "../render/composition-adapters";
import type { TimelineTransition, TimelineTransitionParams } from "@/components/studio/timeline/types";
const picture=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g"><stop stop-color="#c06030"/><stop offset="1" stop-color="#30b070"/></linearGradient></defs><rect x="20" y="20" width="120" height="120" fill="url(#g)"/><path d="M20 50h120M20 80h120M20 110h120" stroke="#303090" stroke-width="10"/></svg>')}`;
const fullCanvasPicture=`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#c06030"/></svg>')}`;
const cases=renderContractCases();
export function EffectControlFixture({sourceVideo="",caseIndex=-1,variant=-1,animated=false}:{sourceVideo?:string;caseIndex?:number;variant?:number;animated?:boolean}){
 const frame=useCurrentFrame();
 const entry=cases[caseIndex<0?Math.floor(frame/3)%cases.length:caseIndex] as typeof cases[number] & EffectRenderCase;
 const changed=(variant<0?frame%3:variant)===1;
 let props:Record<string,unknown>={source_width:160,source_height:160,color_grade_model:"dreamcut-scene-v2",...(entry.media==="video"?{chroma_key_model:"color-key-v1",preview_source_url:sourceVideo,preview_proxy_validation:{contract:"preview-proxy-v1",url:sourceVideo,ok:true,width:160,height:160},chroma_key_color:"#00ff00",chroma_key_tolerance:.18,chroma_key_softness:.6,chroma_key_spill:.25}:{}),...entry.context,[entry.property]:changed?entry.value:entry.identity};
 if(animated) props=upsertKeyframe(upsertKeyframe(props,entry.property,0,entry.identity as number),entry.property,1,entry.value as number);
 // Source fixture data only, never a saved or mutated project timeline.
 // The cycling scalar proof samples timed windows at the same local second as
 // the isolated scalar capture. The separate window proof uses the real 0–2s clock.
 const element:CompositionElement={id:"contract-subject",type:entry.media==="video"?"video_clip":"still",source_url:entry.media==="video"?sourceVideo:entry.fullCanvas?fullCanvasPicture:picture,props,timeline_start:0,duration:10,lane_key:"visual_0",lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0};
 const backdrop:CompositionElement={...element,id:"contract-background",type:"still",source_url:`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#506090"/></svg>')}`,props:{},lane_key:"visual_1",lane_index:1};
 const composition=<TimelineComposition elements={[element,backdrop]} laneOrderKeys={["visual_0","visual_1"]}/>;
 return caseIndex<0 ? <Freeze frame={30}>{composition}</Freeze> : composition;
}
function TitleFixture(){return <PerspectiveTitleReveal props={resolveCaptionProps({text:"OPEN",fontPreset:"display_serif",mediaFillUrls:[picture],cameraRevealBlurSamples:1,cameraRevealDurationSeconds:1.5})}/>;}
function RepeatedSourceFixture({sourceVideo="",sharedTitle=false}:{sourceVideo?:string;sharedTitle?:boolean}){
 return <><Video src={sourceVideo} title={sharedTitle?"reused texture":undefined} muted trimBefore={30} style={{position:"absolute",left:0,width:80,height:80}}/><Video src={sourceVideo} title={sharedTitle?"reused texture":undefined} muted style={{position:"absolute",left:80,width:80,height:80}}/></>;
}
registerFixtureGroup(()=><Fixture id="RepeatedSourceFixture" component={RepeatedSourceFixture} width={160} height={160} fps={30} durationInFrames={30}/>);
function MediaClockFixture({sourceVideo="",loop=false}:{sourceVideo?:string;loop?:boolean}){return <Video src={sourceVideo} loop={loop} muted style={{width:160,height:160}}/>;}
/** The source ends at 0.5s; opacity and movement must keep running during its hold. */
function TailHoldMotionFixture({sourceVideo=""}:{sourceVideo?:string}) {
 // Exercise the cutout decoder path (the fixture's alpha is fully opaque).
 let props:Record<string,unknown>={sticker_outline:true,sticker_outline_width:0,has_alpha:true,source_duration_seconds:3,source_width:160,source_height:160,preview_source_url:sourceVideo,preview_proxy_validation:{contract:"preview-proxy-v1",url:sourceVideo,ok:true,width:160,height:160}};
 for (const [field,values] of Object.entries({sticker_outline_width:[[0,0],[.5,0],[.75,16],[1,8]],media_opacity:[[0,0],[.5,0],[1,1]],media_offset_x:[[0,0],[.5,0],[1,.3]],directional_blur_x:[[0,0],[.5,0],[.75,20],[1,0]]}))
  for(const [time,value] of values) props=upsertKeyframe(props,field,time,value);
 const element:CompositionElement={id:"held-source",type:"video_clip",source_url:sourceVideo,props,timeline_start:0,duration:1.5,lane_key:"visual_0",lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:2.5,fade_in:0,fade_out:0};
 const backdrop:CompositionElement={...element,id:"hold-backdrop",type:"still",source_url:fullCanvasPicture,props:{},lane_key:"visual_1",lane_index:1,trim_end:0};
 return <TimelineComposition elements={[element,backdrop]} laneOrderKeys={["visual_0","visual_1"]}/>;
}
registerFixtureGroup(()=><Fixture id="TailHoldMotionFixture" component={TailHoldMotionFixture} width={160} height={160} fps={30} durationInFrames={45}/>);
const cube="LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n";
function LutFixture({enabled=true,glow=false}:{enabled?:boolean;glow?:boolean}){return <GradeCanvasFilter lut={{assetId:"0123456789abcdef",sourceUrl:`data:text/plain,${encodeURIComponent(cube)}`,intensity:enabled?.7:0}} descriptor={buildColorGradeFilterDescriptor(readColorGradeProps({}),{includeIdentity:true})!}><SubjectGlowFilter props={glow?{subject_glow:2,subject_glow_radius:42}:undefined} seconds={0} width={160}><Img src={picture} style={{width:"100%",height:"100%"}}/></SubjectGlowFilter></GradeCanvasFilter>;}
registerFixtureGroup(()=><><Fixture id="EffectControlFixture" component={EffectControlFixture} width={160} height={160} fps={30} durationInFrames={cases.length*3} defaultProps={{}}/><Fixture id="MediaClockFixture" component={MediaClockFixture} width={160} height={160} fps={50} durationInFrames={150}/><Fixture id="LutContractFixture" component={LutFixture} width={160} height={160} fps={30} durationInFrames={60}/><Fixture id="Title3DFixture" component={TitleFixture} width={320} height={180} fps={30} durationInFrames={60}/></>);

function StillAlphaFixture({source=""}:{source?:string}) { return <Img src={source} style={{width:"100%",height:"100%"}}/>; }
registerFixtureGroup(()=><Fixture id="StillAlphaFixture" component={StillAlphaFixture} width={320} height={180} fps={30} durationInFrames={61}/>);

/** Native boundary transitions, through the production layering and source clocks. */
function SmearTransitionFixture({params = {}, type = "whip"}: {params?: TimelineTransitionParams; type?: TimelineTransition["type"]}) {
 const transition = {id:"smear-fixture",from_element_id:"outgoing",to_element_id:"incoming",type,duration_seconds:1,params:{motion:"smear",direction:"from-right",...params}} as TimelineTransition;
 const base: CompositionElement = {id:"outgoing",type:"still",source_url:picture,props:{},timeline_start:0,duration:2,lane_key:"visual_0",lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,transition_out:transition};
 const incoming: CompositionElement = {...base,id:"incoming",source_url:`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#206070"/><circle cx="90" cy="80" r="45" fill="#e09030"/><path d="M0 30h160M0 80h160M0 130h160" stroke="#502070" stroke-width="8"/></svg>')}`,timeline_start:2,transition_out:null,transition_in:transition};
 return <TimelineComposition elements={[base,incoming]} laneOrderKeys={["visual_0"]}/>;
}
registerFixtureGroup(()=><Fixture id="SmearTransitionFixture" component={SmearTransitionFixture} width={160} height={160} fps={30} durationInFrames={90}/>);

/** Two actual moving video sources exercise every transition through the production compositor. */
function TransitionVideoFixture({type="fade",sourceVideo="",otherVideo=""}:{type?:TimelineTransition['type'];sourceVideo?:string;otherVideo?:string}) {
 const transition={id:'video-transition',from_element_id:'video-out',to_element_id:'video-in',type,duration_seconds:1,params:{direction:'from-right'}} as TimelineTransition;
 const properties=(url:string)=>({source_duration_seconds:3,source_width:160,source_height:160,preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:160,height:160}});
 const outgoing:CompositionElement={id:'video-out',type:'video_clip',source_url:sourceVideo,props:properties(sourceVideo),timeline_start:0,duration:2,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,transition_out:transition};
 const incoming:CompositionElement={...outgoing,id:'video-in',source_url:otherVideo,props:properties(otherVideo),timeline_start:2,transition_out:null,transition_in:transition};
 return <TimelineComposition elements={[outgoing,incoming]} laneOrderKeys={['visual_0']}/>;
}
registerFixtureGroup(()=><Fixture id="TransitionVideoFixture" component={TransitionVideoFixture} width={160} height={160} fps={30} durationInFrames={120}/>);
