import {Fixture,registerFixtureGroup} from '@/lib/frame-runtime/fixtures';
import {TimelineComposition} from './TimelineComposition';
import type {CompositionElement} from '../render/composition-adapters';
import type {SurfaceTrack,SurfaceQuad} from '../timeline/surface-track';
import {useLayoutEffect} from 'react';
import {useFrameState} from '../frame-runtime';
export function SurfaceTrackFixture({enabled=true,text='NOTE',presentedTime,sourceVideo}:{enabled?:boolean;text?:string;presentedTime?:number;sourceVideo?:string}) {
 const {session,rendering}=useFrameState();
 useLayoutEffect(()=>{
  if(!rendering && presentedTime!=null) session.presentedFrames.publish('timeline-video:surface-parent:0',presentedTime);
  return ()=>session.presentedFrames.remove('timeline-video:surface-parent:0');
 },[session,rendering,presentedTime]);
 const source=sourceVideo??`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#606060"/></svg>')}`;
 const parent:CompositionElement={id:'surface-parent',type:sourceVideo?'video_clip':'still',source_url:source,props:sourceVideo?{source_duration_seconds:1,source_width:320,source_height:320,preview_source_url:sourceVideo,preview_proxy_validation:{contract:'preview-proxy-v1',url:sourceVideo,ok:true,width:320,height:320}}:{},timeline_start:0,duration:1,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:null,fade_in:0,fade_out:0};
 const track:SurfaceTrack={version:1,id:'surface-fixture',parentId:parent.id,sourceUrl:source,sourceSha256:'a'.repeat(64),width:320,height:320,referenceTime:0,visibleFrom:0,visibleTo:.8,samples:Array.from({length:31},(_,i)=>({t:i/30,quad:[[.1+i/100,.15],[.7+i/200,.1],[.75,.7-i/200],[.1,.7]] as SurfaceQuad,visible:enabled,confidence:1}))};
 const caption:CompositionElement={...parent,id:'surface-text',type:'caption_text',source_url:null,lane_key:'captions_0',lane_index:10,props:{text,fontPreset:'sans',fontSizePx:42,textColor:'#ffffff',textAlign:'center',surface_track:track}};
 return <TimelineComposition elements={[parent,caption]} laneOrderKeys={['captions_0','visual_0']}/>;
}
registerFixtureGroup(()=><Fixture id="SurfaceTrackFixture" component={SurfaceTrackFixture} width={320} height={320} fps={30} durationInFrames={30}/>);
