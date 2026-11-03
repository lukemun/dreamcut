"use client";
import { useEffect,useRef,useState } from "react";
import { Player,type PlayerRef } from "@/lib/frame-runtime/player";
import { TimelineComposition } from "@/lib/remotion/TimelineComposition";
import type { CompositionElement } from "@/lib/render/composition-adapters";
import { readSurfaceTrack,sampleSurface,surfaceTrackSchema,type SurfaceTrack,type SurfaceQuad } from "@/lib/timeline/surface-track";
import { Button } from "@/components/ui/button";
import { InspectorDisclosure,InspectorItemHeader } from "./InspectorHierarchy";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { InspectorEffectNumber } from "./InspectorEffectNumber";
import type { TimelineElement } from "./types";
import { OptionSelect } from "@/components/ui/select";

type Preview={elements:CompositionElement[];dimensions:{width:number;height:number};durationInFrames:number};
const initialQuad:SurfaceQuad=[[.4,.4],[.6,.4],[.6,.6],[.4,.6]];
/** Draft corner edits stay local until Save. One saved attachment uses normal props Undo. */
export function SurfaceTrackingControls({element,elements,onPatch,title="Attach text to a surface"}: {element:TimelineElement;elements:TimelineElement[];onPatch:(patch:Record<string,unknown>)=>void;title?:string}) {
 const saved=readSurfaceTrack(element.props?.surface_track);
 const [open,setOpen]=useState(!!saved),[parentId,setParentId]=useState(saved?.parentId??""),[preview,setPreview]=useState<Preview|null>(null);
 const [time,setTime]=useState(saved?.referenceTime??0),[previewTime,setPreviewTime]=useState<number|null>(null),[start,setStart]=useState(saved?.visibleFrom??0),[end,setEnd]=useState(saved?.visibleTo??1);
 const [quad,setQuad]=useState<SurfaceQuad>(saved?sampleSurface(saved,saved.referenceTime)??initialQuad:initialQuad);
 const [draft,setDraft]=useState<SurfaceTrack|null>(saved),[error,setError]=useState(""),[jobId,setJobId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);const requestVersion=useRef(0);const player=useRef<PlayerRef>(null),drag=useRef<{index:number;quad:SurfaceQuad}|null>(null);
 const parent=elements.find(e=>e.id===parentId),projectId=element.project_id;
 const endpoint=`/api/projects/${encodeURIComponent(projectId)}/analysis/surface-tracking`;
 useEffect(()=>{setDraft(saved);setParentId(saved?.parentId??"");setTime(saved?.referenceTime??0);setStart(saved?.visibleFrom??0);setEnd(saved?.visibleTo??1);setQuad(saved?sampleSurface(saved,saved.referenceTime)??initialQuad:initialQuad);setJobId(null);setBusy(false);requestVersion.current++;},[element.id,element.props?.surface_track]); // persisted Undo/reset
 useEffect(()=>{
  if(!parent?.source_url){setPreview(null);return;}
  const abort=new AbortController();setPreview(null);setError("");
  fetch(`/api/projects/${encodeURIComponent(projectId)}/storyboard/preview?source=${encodeURIComponent(parent.source_url.replace(`/api/projects/${projectId}/media/`, ""))}`,{signal:abort.signal})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!abort.signal.aborted)setPreview(d);})
   .catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();
 },[parent?.source_url,projectId]);
 useEffect(()=>{player.current?.seekTo(Math.round((previewTime??time)*30));const q=draft&&sampleSurface(draft,previewTime??time);if(q)setQuad(q);},[time,previewTime,preview,draft]);
 useEffect(()=>{
  if(!jobId)return;const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const r=await fetch(`${endpoint}?id=${jobId}`,{signal:abort.signal});const d=await r.json();if(!r.ok)throw Error(d.error);
   if(abort.signal.aborted)return;if(d.state==="completed"){setDraft(d.track);setBusy(false);setJobId(null);}else if(d.state==="failed")throw Error(d.error);else timer=setTimeout(poll,800);
  }catch(e){if(!abort.signal.aborted){setError(String(e));setBusy(false);setJobId(null);}}};void poll();return()=>{abort.abort();clearTimeout(timer);};
 },[jobId,endpoint]);
 useEffect(()=>()=>{requestVersion.current++;},[]);
 const track=async()=>{const version=++requestVersion.current;setError("");setBusy(true);try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentId,start,end,reference:time,quad,retry:true})});const d=await r.json();if(version!==requestVersion.current)return;if(!r.ok)throw Error(d.error);if(d.state==="completed"){setDraft(d.track);setBusy(false);}else setJobId(d.id);}catch(e){if(version===requestVersion.current){setError(String(e));setBusy(false);}}};
 const duration=preview?preview.durationInFrames/30:15;
 const number=(label:string,value:number,fn:(v:number)=>void)=> <InspectorPropertyControl label={label} fields={`surface_${label.replaceAll(" ","_")}`} disabled={busy} onReset={()=>fn(label==="Source frame"?saved?.referenceTime??0:label==="Visible from"?saved?.visibleFrom??0:saved?.visibleTo??duration)}><InspectorEffectNumber label={label} value={value} min={0} max={duration} step={1/30} unit="s" onPreview={v=>{if(label==="Source frame")setPreviewTime(v);}} onCommit={fn}/></InspectorPropertyControl>;
 const correct=()=>{if(!draft)return;const sample={t:time,quad,visible:true,confidence:1};setDraft({...draft,samples:[...draft.samples.filter(s=>Math.abs(s.t-time)>1/60),sample].sort((a,b)=>a.t-b.t)});};
 return <div className="p-4"><InspectorDisclosure title={title} open={open} onOpenChange={setOpen}>
  <div className="grid gap-3">
   <InspectorItemHeader title={saved?"Tracked surface":"Track a flat object"}/>
   <OptionSelect label="Surface video" value={parentId} placeholder="Choose video…"
    options={elements.filter(e=>e.type==="video_clip"&&!e.removed_at).map(e=>({value:e.id,label:String(e.props?.title??e.source_url??"Video")}))}
    onValueChange={next=>{requestVersion.current++;setParentId(next);setDraft(null);setTime(0);setStart(0);setEnd(1);setQuad(initialQuad);setJobId(null);setBusy(false);}}/>
   {preview&&<>
    <div style={{position:"relative",aspectRatio:`${preview.dimensions.width}/${preview.dimensions.height}`,margin:"auto",width:`min(100%, ${380*preview.dimensions.width/preview.dimensions.height}px)`}}>
     <Player ref={player} component={TimelineComposition} inputProps={{elements:preview.elements}} durationInFrames={preview.durationInFrames} compositionWidth={preview.dimensions.width} compositionHeight={preview.dimensions.height} fps={30} style={{width:"100%",height:"100%"}}/>
     <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={{touchAction:"none"}}
      onPointerMove={e=>{if(!drag.current)return;const r=e.currentTarget.getBoundingClientRect();setQuad(q=>q.map((p,i)=>i===drag.current!.index?[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]:p) as SurfaceQuad);}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{if(drag.current)setQuad(drag.current.quad);drag.current=null;}}>
      <polygon points={quad.map(p=>p.map(v=>v*1000).join(",")).join(" ")} fill="rgba(40,140,255,.12)" stroke="#38a5ff" strokeWidth={4}/>
      {quad.map(([x,y],i)=><circle key={i} cx={x*1000} cy={y*1000} r={15} fill="#fff" stroke="#1268ce" strokeWidth={5} role="slider" tabIndex={0} aria-label={`${["Top left","Top right","Bottom right","Bottom left"][i]} corner`} aria-valuetext={`${Math.round(x*100)}%, ${Math.round(y*100)}%`}
       onPointerDown={e=>{drag.current={index:i,quad};e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);}}
       onKeyDown={e=>{if(e.key==="Escape"&&drag.current){setQuad(drag.current.quad);drag.current=null;}if(!e.key.startsWith("Arrow"))return;e.preventDefault();const step=e.shiftKey?.001:.005;setQuad(q=>q.map((p,j)=>j===i?[Math.max(0,Math.min(1,p[0]+(e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0))),Math.max(0,Math.min(1,p[1]+(e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0)))]:p) as SurfaceQuad);}}/>)}
     </svg>
    </div>
    {number("Source frame",time,setTime)}{number("Visible from",start,setStart)}{number("Visible until",end,setEnd)}
    <div className="flex flex-wrap gap-2"><Button disabled={busy||time<start||time>end||end<=start||end-start>15} onClick={()=>void track()}>{busy?"Tracking…":"Track both directions"}</Button>
     {draft&&<Button variant="outline" onClick={correct}>Correct corners at this frame</Button>}
    </div>
   </>}
   {draft&&<><p className="text-xs text-[var(--ink-muted)]">{draft.samples.filter(s=>s.visible).length} of {draft.samples.length} frames tracked</p>
    <div className="flex flex-wrap gap-2"><Button onClick={()=>{try{onPatch({surface_track:surfaceTrackSchema.parse({...draft,visibleFrom:start,visibleTo:end})});}catch(e){setError(String(e));}}} disabled={busy||end<start}>Save attachment</Button>
    <Button variant="outline" onClick={()=>{setDraft(saved);setStart(saved?.visibleFrom??0);setEnd(saved?.visibleTo??1);setTime(saved?.referenceTime??0);}}>Discard changes</Button></div></>}
   {saved&&<Button variant="ghost" onClick={()=>onPatch({surface_track:null})}>Detach text</Button>}
   {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
  </div>
 </InspectorDisclosure></div>;
}
