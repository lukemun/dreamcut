"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { SliderScrubControl } from "./InspectorNumericControls";
import { ChevronDown, Download, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/select";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import type { TimelineElement } from "./types";
import type { ProjectHistoryDescriptor } from "./external-history";
import { buildLaneDefs } from "./adapters";
import { videoAudioStatus } from "./video-audio-status";
import { captionAudioSourceId } from "@/lib/timeline/caption-audio-link";
import { speechTranscript, speechPauses, speechFillers, speechWordMatches } from "@/lib/timeline/speech-transcript";
import { sourceTimeToTimelineTime } from "@/lib/timeline/speed-steps";
import { captionTranscriptSrt, captionTranscriptTime } from "./caption-transcript";

type History = { before: ProjectHistoryDescriptor; after: ProjectHistoryDescriptor };
type Snapshot = {revision:string;groups:ReturnType<typeof speechTranscript>};
export function GenerateCaptionsControl({ projectId, elements, selectedElement, onGenerated, onSeek, view = "transcript" }: {
  view?: "transcript" | "looks";
  projectId:string;elements:TimelineElement[];selectedElement:TimelineElement|null;
  onGenerated:(history:History)=>void;onSeek?:(id:string,time:number)=>void;
}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [chosen,setChosen]=useState<string|null>(null);
  const [limit,setLimit]=useState("1");
  const [minimum,setMinimum]=useState("0.6");
  const [minimumDraft,setMinimumDraft]=useState<string|null>(null);
  const [progress,setProgress]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [pronunciation,setPronunciation]=useState<{sessionId:string;text:string;words:string[];remaining:TimelineElement[]}|null>(null);
  const [remainingClips,setRemainingClips]=useState<TimelineElement[]>([]);
  const [spellings,setSpellings]=useState<Record<string,string>>({});
  const [editing,setEditing]=useState<string|null>(null);
  const [inlineIndex,setInlineIndex]=useState<number|null>(null);
  const inlineCommitHandled=useRef(false);
  const [draft,setDraft]=useState("");
  const [selection,setSelection]=useState<{id:string;first:number;last:number}|null>(null);
  const [query,setQuery]=useState("");
  const [matchIndex,setMatchIndex]=useState(-1);
  const endpoint=`/api/projects/${encodeURIComponent(projectId)}/timeline/transcript`;
  const load=async()=>{const response=await fetch(endpoint);const data=await response.json();if(!response.ok)throw Error(data.error);setSnapshot(data);};
  useEffect(()=>{
    let active=true;
    void fetch(endpoint).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(active)setSnapshot(data);}).catch(error=>{if(active)setMessage(error.message);});
    return()=>{active=false;};
  },[endpoint,elements]);
  const lanes=useMemo(()=>{
    const sources=elements.filter(e=>!e.removed_at&&["video_clip","vo_full","vo_segment"].includes(e.type)&&e.volume>0&&videoAudioStatus(e)?.state!=="none");
    const labels=new Map(buildLaneDefs(elements.filter(e=>!e.removed_at),new Map(),1,{}).map(l=>[l.key,l.label]));
    return [...new Set(sources.map(e=>e.lane_key))].map(key=>({key,label:labels.get(key)??"Speech",clips:sources.filter(e=>e.lane_key===key).sort((a,b)=>a.timeline_start-b.timeline_start)}));
  },[elements]);
  const preferred=elements.find(e=>e.id===(selectedElement?.type==="caption_text"?captionAudioSourceId(selectedElement):selectedElement?.id))?.lane_key;
  const laneKey=lanes.find(l=>l.key===chosen)?.key??lanes.find(l=>l.key===preferred)?.key??lanes[0]?.key;
  useEffect(()=>{
    const captions=snapshot?.groups.filter(group=>group.source.lane_key===laneKey).flatMap(group=>group.captions)??[];
    if(captions.length)setLimit(String(Math.min(12,Math.max(...captions.map(caption=>String(caption.props?.text??"").trim().split(/\s+/).length)))));
  },[snapshot,laneKey]);
  const groups=snapshot?.groups.filter(g=>g.source.lane_key===laneKey)??[];
  const captioned=groups.filter(g=>g.words.length);
  const allElements=groups.flatMap(g=>[g.source,...g.captions]);
  const pauses=laneKey?speechPauses(allElements,laneKey,Number(minimumDraft??minimum),0.2):[];
  const fillers=laneKey?speechFillers(allElements,laneKey):[];
  const fillerWords=new Set(fillers.flatMap(f=>Array.from({length:f.last-f.first+1},(_,i)=>`${f.sourceId}:${f.first+i}`)));
  const matches=captioned.flatMap(group=>speechWordMatches(group.words,query).map(match=>({...match,group})));
  const matchedWords=new Set(matches.flatMap(m=>Array.from({length:m.last-m.first+1},(_,i)=>`${m.group.source.id}:${m.first+i}`)));
  const goToMatch=(step:number)=>{
    if(!matches.length)return;
    const index=(Math.max(-1,Math.min(matchIndex,matches.length-1))+step+matches.length)%matches.length;
    const {group,first,last}=matches[index]!,word=group.words[first]!;
    setMatchIndex(index);setSelection({id:group.source.id,first,last});
    onSeek?.(word.captionId,group.source.timeline_start+sourceTimeToTimelineTime(group.source,word.start));
  };
  const downloadSubtitles=()=>{
    const url=URL.createObjectURL(new Blob([captionTranscriptSrt(elements)],{type:"application/x-subrip"})),link=document.createElement("a");
    link.href=url;link.download="captions.srt";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const call=async(url:string,body:unknown)=>{
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error??"Could not update the transcript.");return data;
  };
  const mutate=async(action:string,extra:Record<string,unknown>={})=>{
    if(!snapshot||!laneKey||progress)return;
    setMessage("");setProgress(action==="correct"?"Updating word timing…":"Updating timeline…");
    try{
      const result=await call(endpoint,{action,laneKey,revision:snapshot.revision,wordLimit:Number(limit),minimum:Number(minimum),keep:0.2,...extra});
      if(result.needsPronunciation){setPronunciation({...result,remaining:[]});setSpellings({});return;}
      onGenerated(result.history);setEditing(null);setSelection(null);await load();
    }catch(error){setMessage((error as Error).message);}finally{setProgress(null);}
  };
  const transcribe=async(remaining?:TimelineElement[])=>{
    const lane=lanes.find(l=>l.key===laneKey);if(!lane||progress)return;
    const clips=remaining??(remainingClips.length?remainingClips:lane.clips);
    setRemainingClips([]);
    setMessage("");
    try{
      for(const [index,clip] of clips.entries()){
        setProgress(`Transcribing ${index+1} of ${clips.length}…`);
        const url=`/api/projects/${encodeURIComponent(projectId)}/timeline/captions/generate`;
        const {sessionId,text}=await call(url,{action:"transcribe",elementId:clip.id});
        if(!String(text??"").trim())continue;
        setProgress(`Timing words ${index+1} of ${clips.length}…`);
        const result=await call(url,{action:"generate",sessionId,text,wordLimit:Number(limit)});
        if(result.needsPronunciation){setPronunciation({...result,remaining:clips.slice(index+1)});setSpellings({});return;}
        onGenerated(result.history);
      }
      await load();
    }catch(error){setMessage((error as Error).message);}finally{setProgress(null);}
  };
  const confirmPronunciation=async()=>{
    if(!pronunciation||progress)return;
    setMessage("");setProgress("Timing words…");
    let remaining:TimelineElement[]=[];
    try{
      const result=await call(`/api/projects/${encodeURIComponent(projectId)}/timeline/captions/generate`,{action:"generate",sessionId:pronunciation.sessionId,text:pronunciation.text,wordLimit:Number(limit),pronunciations:spellings});
      if(result.needsPronunciation){setPronunciation({...result,remaining:pronunciation.remaining});return;}
      onGenerated(result.history);remaining=pronunciation.remaining;setPronunciation(null);setEditing(null);await load();
    }catch(error){setMessage((error as Error).message);}finally{setProgress(null);}
    // Remaining clips can be resumed explicitly without repeating the completed one.
    if(remaining.length)setRemainingClips(remaining);
  };
  if(!lanes.length)return elements.some(e=>e.type==="caption_text"&&!e.removed_at)?null:<p className="py-2 text-sm text-[var(--ink-secondary)]">Add a clip with speech.</p>;
  const busy=!!progress||!!editing;
  const feedback=<>
    {progress&&<p role="status" className="flex items-center gap-2 text-sm text-[var(--ink-secondary)]"><LoaderCircle aria-hidden className="size-4 animate-spin"/>{progress}</p>}
    {message&&<p role="alert" className="text-sm text-[var(--destructive)]">{message}</p>}
  </>;
  const wordCountControl=<InspectorSection sectionId="caption-word-count" title="Words per line" collapsible={false}
    headerAction={<OptionSelect size="sm" className="w-20" label="Words per line" value={limit}
      options={Array.from({length:12},(_,i)=>({value:String(i+1),label:String(i+1)}))} disabled={busy}
      onValueChange={value=>{setLimit(value);void mutate("regroup",{wordLimit:Number(value)});}}/>}/>;
  const saveWords=()=>{
    const group=captioned.find(g=>g.source.id===editing);
    if(!group||!selection||progress||inlineCommitHandled.current)return;
    // Enter can cause blur before React renders the pending state. Resolve once.
    inlineCommitHandled.current=true;
    const original=group.words.slice(Math.min(selection.first,selection.last),Math.max(selection.first,selection.last)+1).map(word=>word.text).join(" ");
    if(!draft.trim()||draft.trim()===original){setEditing(null);return;}
    const words=group.words.map(w=>w.text);
    words.splice(Math.min(selection.first,selection.last),Math.abs(selection.last-selection.first)+1,draft.trim());
    void mutate("correct",{elementId:editing,text:words.join(" ")}).finally(()=>{inlineCommitHandled.current=false;});
  };
  const beginWordEdit=(id:string,index:number,text:string)=>{
    if(progress)return;
    inlineCommitHandled.current=false;
    setSelection({id,first:index,last:index});setEditing(id);setInlineIndex(index);setDraft(text);
  };
  if(view==="looks")return captioned.length?<div className="-mx-4 grid">{wordCountControl}{feedback}</div>:null;
  const selectionRange=selection&&{first:Math.min(selection.first,selection.last),last:Math.max(selection.first,selection.last)};
  const editSelection=()=>{
    const group=captioned.find(g=>g.source.id===selection?.id);
    if(!group||!selectionRange)return;
    inlineCommitHandled.current=false;
    setEditing(group.source.id);
    setInlineIndex(selectionRange.first===selectionRange.last?selectionRange.first:null);
    setDraft(group.words.slice(selectionRange.first,selectionRange.last+1).map(w=>w.text).join(" "));
  };
  const transcriptActions=selection&&selectionRange&&!editing?<div className="flex flex-wrap items-center justify-end gap-1">
    <Button size="sm" variant="outline" disabled={!!progress} onClick={()=>void mutate("cut",{elementId:selection.id,firstWord:selectionRange.first,lastWord:selectionRange.last})}>Cut</Button>
    <Button size="sm" variant="ghost" disabled={!!progress} onClick={editSelection}>Edit</Button>
    <Button size="sm" variant="ghost" onClick={()=>setSelection(null)}>Clear</Button>
  </div>:<div className="flex items-center justify-end gap-1">
    <Button size="sm" variant={captioned.length?"outline":"default"} disabled={busy} onClick={()=>void transcribe()}>
      {remainingClips.length?"Continue transcribing":"Transcribe"}
    </Button>
    {captioned.length>0&&<Button size="sm" variant="ghost" aria-label="Download subtitles" title="Download subtitles (.srt)" onClick={downloadSubtitles}>
      <Download aria-hidden className="size-4"/>SRT
    </Button>}
  </div>;
  // Sections span the shelf so headings and dividers line up with Properties.
  return <div className="-mx-4 grid" aria-label="Speech transcript">
    {lanes.length>1&&<div className="px-3.5 py-2.5">
      <OptionSelect label="Speech track" value={laneKey??""} options={lanes.map(l=>({value:l.key,label:l.label}))} disabled={!!progress}
        onValueChange={value=>{setChosen(value);setEditing(null);setSelection(null);setRemainingClips([]);setPronunciation(null);}}/>
    </div>}
    {captioned.length>0&&<>
      {wordCountControl}
      <InspectorSection sectionId="transcript-pauses" title="Pauses" collapsible={false}
        headerAction={<RemovalButton label="Clean up" listLabel="Pauses to cut" disabled={busy} onRemove={()=>void mutate("cleanup")}
          items={pauses.map(p=>({id:p.sourceId,start:p.start,text:`${p.duration.toFixed(1)}s pause`}))} onSeek={onSeek}/>}>
        <InspectorPropertyControl label="Minimum gap" fields="minimum_gap" disabled={busy} onReset={()=>{setMinimum("0.6");setMinimumDraft(null);}}>
          <SliderScrubControl label="Minimum gap" unit="s" min={0.3} max={3} step={0.1} fallback={0.6} value={minimumDraft??minimum} disabled={busy}
            onChange={setMinimumDraft} onCommit={value=>{if(value)setMinimum(value);setMinimumDraft(null);}} onCancel={()=>setMinimumDraft(null)}/>
        </InspectorPropertyControl>
      </InspectorSection>
      <InspectorSection sectionId="transcript-fillers" title="Filler words" collapsible={false}
        headerAction={<RemovalButton label="Remove" listLabel="Filler words to cut" disabled={busy} onRemove={()=>void mutate("fillers")}
          items={fillers.map(f=>({id:f.sourceId,start:f.start,text:f.text}))} onSeek={onSeek}/>}/>
    </>}
    <InspectorSection sectionId="caption-transcript" title="Transcript" collapsible={false} headerAction={transcriptActions}>
      {pronunciation&&<div className="grid gap-3" aria-label="Word pronunciation">
        {pronunciation.words.map(word=><label key={word} className="grid gap-1.5 text-[length:var(--ui-text-body)] font-medium text-[var(--ink)]">
          {word} sounds like
          <Input aria-label={`How ${word} sounds`} placeholder="Spell it as it sounds" value={spellings[word]??""} disabled={!!progress}
            onChange={e=>setSpellings(current=>({...current,[word]:e.target.value}))}/>
        </label>)}
        <div className="flex gap-2">
          <Button size="sm" disabled={!!progress||pronunciation.words.some(word=>!spellings[word]?.trim())} onClick={()=>void confirmPronunciation()}>Use pronunciations</Button>
          <Button size="sm" variant="ghost" disabled={!!progress} onClick={()=>setPronunciation(null)}>Cancel</Button>
        </div>
      </div>}
      {feedback}
      {editing&&inlineIndex===null?<div className="grid gap-2">
        <textarea aria-label="Edit selected words" autoFocus value={draft} disabled={!!progress}
          className="caption-transcript-surface min-h-24 w-full resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
          onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape")setEditing(null);}}/>
        <div className="flex gap-2">
          <Button size="sm" disabled={!!progress||!draft.trim()} onClick={saveWords}>Save words</Button>
          <Button size="sm" variant="ghost" disabled={!!progress} onClick={()=>setEditing(null)}>Cancel</Button>
        </div>
      </div>:captioned.length>0&&<>
      <div className="flex items-center gap-2">
        <Input type="search" aria-label="Find words" placeholder="Find" value={query} className="h-8"
          onChange={event=>{setQuery(event.target.value);setMatchIndex(-1);}}
          onKeyDown={event=>{
            event.stopPropagation();
            if(event.key==="Enter"){event.preventDefault();goToMatch(event.shiftKey?-1:1);}
            if(event.key==="Escape"){event.preventDefault();setQuery("");setMatchIndex(-1);}
          }}/>
        {query.trim()&&<span role="status" className="shrink-0 text-sm tabular-nums text-[var(--ink-secondary)]">
          {!matches.length?"None":matchIndex>=0&&matchIndex<matches.length?`${matchIndex+1} of ${matches.length}`:`${matches.length} found`}
        </span>}
      </div>
      <div className="caption-transcript-surface" aria-label="Full transcript">
        {captioned.map(group=><span key={group.source.id}>
          {group.words.map((word,index)=>{
            const time=group.source.timeline_start+sourceTimeToTimelineTime(group.source,word.start);
            const pause=pauses.find(p=>p.sourceId===group.source.id&&Math.abs(p.end-time)<0.001);
            const selected=selection?.id===group.source.id&&!!selectionRange&&index>=selectionRange.first&&index<=selectionRange.last;
            return <span key={`${word.captionId}:${index}`}>
              {pause&&<button type="button" className="caption-transcript-pause" disabled={busy}
                aria-label={`Delete ${pause.duration.toFixed(1)} second pause at ${captionTranscriptTime(pause.start)}`}
                onClick={()=>void mutate("cleanup",{starts:[pause.start]})}>{pause.duration.toFixed(1)}s<span aria-hidden="true">×</span></button>}
              {editing===group.source.id&&inlineIndex===index?<Input autoFocus aria-label="Edit word" value={draft} disabled={!!progress}
                style={{width:`${Math.max(5,Math.min(24,draft.length+2))}ch`}} className="inline-block h-7 px-1 align-baseline text-sm"
                onFocus={event=>event.target.select()} onChange={event=>setDraft(event.target.value)} onBlur={saveWords}
                onKeyDown={event=>{event.stopPropagation();if(event.nativeEvent.isComposing)return;if(event.key==="Escape"){event.preventDefault();inlineCommitHandled.current=true;setEditing(null);}if(event.key==="Enter"){event.preventDefault();saveWords();}}}/>
              :<button type="button" disabled={busy} title="Double-click to edit" aria-pressed={selected} className="caption-transcript-word"
                data-filler={fillerWords.has(`${group.source.id}:${index}`)||undefined} data-match={matchedWords.has(`${group.source.id}:${index}`)||undefined}
                onDoubleClick={()=>beginWordEdit(group.source.id,index,word.text)}
                onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();beginWordEdit(group.source.id,index,word.text);}}}
                onClick={event=>{
                  onSeek?.(word.captionId,time);
                  setSelection(current=>event.shiftKey&&current?.id===group.source.id?{...current,last:index}:{id:group.source.id,first:index,last:index});
                }}>{word.text}</button>}{" "}
            </span>;
          })}
        </span>)}
      </div></>}
    </InspectorSection>
  </div>;
}

/** A bulk cut beside a caret that lists what it will take out, joined like the Marks control. */
function RemovalButton({ label, listLabel, items, disabled, onRemove, onSeek }: {
  label: string; listLabel: string; items: { id: string; start: number; text: string }[]; disabled: boolean;
  onRemove: () => void; onSeek?: (id: string, time: number) => void;
}) {
  const off = !items.length || disabled;
  return <div role="group" aria-label={label} className="flex items-stretch overflow-hidden rounded-lg border border-border dark:border-input dark:bg-input/30">
    <Button size="sm" variant="ghost" className="rounded-none" disabled={off} onClick={onRemove}>{label} ({items.length})</Button>
    {off ? <Button size="sm" variant="ghost" className="rounded-none border-l border-border px-1.5 dark:border-input" disabled aria-label={listLabel}><ChevronDown aria-hidden /></Button>
      : <ActionMenu trigger={<Button size="sm" variant="ghost" className="rounded-none border-l border-border px-1.5 dark:border-input" aria-label={listLabel} title={listLabel}><ChevronDown aria-hidden /></Button>}>
        <div className="max-h-72 overflow-y-auto">
          {items.map(item => <ActionMenuItem key={item.start} onClick={() => onSeek?.(item.id, item.start)}>
            <span className="flex gap-3"><span className="tabular-nums text-[var(--ink-muted)]">{captionTranscriptTime(item.start)}</span>{item.text}</span>
          </ActionMenuItem>)}
        </div>
      </ActionMenu>}
  </div>;
}
