"use client";
/** Disposable engineering fixture. Never used for creator timelines. */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Player,type PlayerRef} from '@/lib/frame-runtime/player';
import {usePreparedPlayback,usePreparedPlaybackBlocks} from '@/components/studio/timeline/usePreparedPlayback';
import {PreparedPlaybackComposition,PreparedPlaybackStatus} from '@/components/studio/timeline/PreparedPlayback';
import {TimelinePreviewAudioMixer} from '@/components/studio/timeline/TimelinePreviewAudioMixer';
import {preparedPlaybackPlan,preparedPlaybackRanges} from '@/lib/timeline/prepared-playback-plan';
import {Button} from '@/components/ui/button';
import type {CompositionElement} from '@/lib/render/composition-adapters';
export default function PreparedPlaybackProof(){
 const [backend,setBackend]=useState<'standard'|'rust'>('standard');
 const [project,setProject]=useState(''),[elements,setElements]=useState<CompositionElement[]>([]),[text,setText]=useState('ONE'),[dark,setDark]=useState(true),[optimized,setOptimized]=useState(false),[frame,setFrame]=useState(0),[gain,setGain]=useState(.2),[variant,setVariant]=useState(false),[attached,setAttached]=useState<PlayerRef|null>(null);
 const player=useRef<PlayerRef>(null);
 useEffect(()=>{const query=new URLSearchParams(location.search),id=query.get('project');if(!id?.startsWith('prepared-playback-test-'))return;setBackend(query.get('backend')==='rust'?'rust':'standard');setOptimized(query.get('mode')==='blocks');setProject(id);let cancelled=false;
 const load=async()=>{
  const response=await fetch(`/api/projects/${id}/timeline`),timeline=await response.json();
  if(cancelled)return;
  // Exercise a stable prepared source binding; proxy upgrades deliberately invalidate cache.
  if(timeline.elements.some((e:CompositionElement)=>(e.props?.runtime_preview_preparation as {state?:string}|undefined)?.state==='preparing')){timer=setTimeout(()=>void load(),300);return;}
  setElements(timeline.elements);
 };
 let timer:ReturnType<typeof setTimeout>|undefined;void load();return()=>{cancelled=true;clearTimeout(timer);};},[]);
 const handlePlayer=useCallback((value:PlayerRef|null)=>{player.current=value;setAttached(value);},[]);
 useEffect(()=>{if(!attached)return;const update=(event:{detail:{frame:number}})=>setFrame(event.detail.frame);attached.addEventListener('frameupdate',update);return()=>attached.removeEventListener('frameupdate',update);},[attached]);
 const live=useMemo(()=>({elements:elements.map(e=>e.type==='caption_text'?{...e,props:{...e.props,text}}:e.lane_key.startsWith('sound_effect_')?{...e,volume:gain}:e.id==='front'&&variant?{...e,props:{...e.props,media_scale:.35}}:e),laneOrderKeys:['captions_0','visual_1','visual_0','sound_effect_0'],externalAudioPreview:optimized}),[elements,text,gain,variant,optimized]);
 const input=useMemo(()=>({backend,width:160,height:160,fps:30,durationInFrames:120,inputProps:live}),[live,backend]);
 const plan=useMemo(()=>preparedPlaybackPlan(input),[input]),ranges=useMemo(()=>preparedPlaybackRanges(input),[input]);
 const full=usePreparedPlayback(project,input,elements.length>0&&!optimized);
 const parts=usePreparedPlaybackBlocks(project,plan.input,ranges,frame,elements.length>0&&optimized);
 const prepared=optimized?parts:full,url=prepared.status?.state==='ready'?prepared.status.url:undefined;
 return <main className={dark?'dark':''} style={{padding:20,background:dark?'#171717':'#fafafa',color:dark?'white':'black',minHeight:'100vh'}}>
 <h1>Prepared playback test</h1>
 <p>Two overlapping moving layers with editable text. Changes remain editable.</p>
 <div style={{position:'relative',width:'min(100%, 480px)'}}>
 <Player ref={handlePlayer} component={PreparedPlaybackComposition} inputProps={optimized?{live,blocks:parts.blocks,overlayCaptions:plan.overlayCaptions}:{live,url}} playbackBlocked={prepared.blocked} resumeWhenUnblocked={optimized} autoPlayWhenReady={!optimized&&Boolean(url)} durationInFrames={120} compositionWidth={160} compositionHeight={160} fps={30} controls style={{width:'100%',aspectRatio:'1'}}/>
 {optimized&&<TimelinePreviewAudioMixer elements={live.elements} player={attached}/>}
 <PreparedPlaybackStatus status={prepared.status} onRetry={prepared.retry}/>
 </div>
 <Button onClick={()=>setText(t=>t==='ONE'?'TWO':'ONE')}>Change text</Button>
 <Button onClick={()=>setDark(d=>!d)}>Toggle appearance</Button>
 {optimized&&<><Button onClick={()=>setGain(g=>g===.2?.6:.2)}>Change sound</Button><Button onClick={()=>setVariant(v=>!v)}>Switch picture</Button></>}
 <output aria-label="Current text">{text}</output>
 <output aria-label="Current sound">{gain}</output>
 {optimized&&<output aria-label="Prepared frame count">{ranges.reduce((n,[a,b])=>n+b-a+1,0)}</output>}
 </main>;
}
