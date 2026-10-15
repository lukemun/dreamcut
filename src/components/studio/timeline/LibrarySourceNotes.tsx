"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { useSourceNotes } from "./useSourceNotes";

function NotesEditor({c,sourceUrl}:{c:ReturnType<typeof useSourceNotes>;sourceUrl:string}) {
  const player = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  useEffect(()=>{
    const timer=setInterval(()=>{
      const node=player.current,end=stopAt.current;
      if(node && end!==null && node.currentTime>=end){stopAt.current=null;node.pause();node.currentTime=end;}
    },20);
    return ()=>clearInterval(timer);
  },[]);
  const [note,setNote] = useState("");
  const d = c.draft;
  return <div className="space-y-3" onKeyDown={e=>{if(e.key==="Escape") c.cancel();}}>
    {c.error ? <p role="alert">{c.error}</p> : null}
    {!d ? <p>Loading notes…</p> : <>
      <label className="block text-sm">Name<Input value={d.title} onChange={e=>c.setDraft({...d,title:e.target.value})}/></label>
      <label className="block text-sm">Description / intended use<textarea className="mt-1 block min-h-24 w-full rounded-md border border-[var(--chrome-line-strong)] bg-[var(--chrome-deep)] p-2 text-[var(--ink)]" value={d.description} onChange={e=>c.setDraft({...d,description:e.target.value})}/></label>
      <audio ref={player} controls src={sourceUrl} className="w-full" onSeeked={()=>{if(stopAt.current!==null && player.current && player.current.currentTime>stopAt.current)stopAt.current=null;}} />
      <label className="block text-sm">Moment note<Input value={note} onChange={e=>setNote(e.target.value)} placeholder="What happens here?"/></label>
      <Button variant="outline" size="sm" disabled={!note.trim()||c.busy} onClick={()=>{const t=player.current?.currentTime??0;c.setDraft({...d,moments:[...d.moments,{id:crypto.randomUUID(),start:t,end:t,note:note.trim()}]});setNote("");}}>Mark current time</Button>
      <ul className="space-y-2">{d.moments.map(m=><li key={m.id} className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={()=>{if(player.current){player.current.currentTime=m.start;stopAt.current=m.end>m.start?m.end:null;void player.current.play();}}}>Play {m.start.toFixed(2)}s{m.end>m.start?`–${m.end.toFixed(2)}s`:""}</Button><Input aria-label={`Note at ${m.start.toFixed(2)} seconds`} className="min-w-40 flex-1" value={m.note} onChange={e=>c.setDraft({...d,moments:d.moments.map(x=>x.id===m.id?{...x,note:e.target.value}:x)})}/><Button variant="ghost" size="sm" onClick={()=>c.setDraft({...d,moments:d.moments.filter(x=>x.id!==m.id)})}>Remove</Button></li>)}</ul>
      <div className="flex gap-2"><Button size="sm" disabled={!c.dirty||c.busy} onClick={()=>void c.commit()}>Save notes</Button><Button variant="outline" size="sm" disabled={!c.dirty||c.busy} onClick={c.cancel}>Cancel</Button><Button variant="outline" size="sm" disabled={!c.undo||c.busy} onClick={()=>void c.undo?.()}>Undo save</Button><span role="status" className="text-xs">{c.busy?"Saving…":c.dirty?"Unsaved changes":"Saved"}</span></div>
    </>}
  </div>;
}
export function LibrarySourceNotes(props:{projectId:string;assetId:string;sourceUrl:string;initiallyOpen?:boolean}) {
  const [open,setOpen]=useState(props.initiallyOpen ?? false);
  const [visited,setVisited]=useState(props.initiallyOpen ?? false);
  const c=useSourceNotes(props.projectId,props.assetId,visited);
  return <InspectorDisclosure title="Notes & moments" open={open} onOpenChange={value=>{setOpen(value);setVisited(true);}}>{open?<NotesEditor c={c} sourceUrl={props.sourceUrl}/>:null}</InspectorDisclosure>;
}
