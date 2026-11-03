"use client";
import { Play, Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InspectorDisclosure } from "../timeline/InspectorHierarchy";
import { Button } from "@/components/ui/button";
import { FrameTagControls } from "../timeline/FrameTagControls";
import { TimelineMarks } from "../timeline/TimelineMarks";
import { WaveformPreview } from "../timeline/WaveformPreview";
import { useSourceNotes } from "../timeline/useSourceNotes";

function EditableDescription({value, busy, save}: {value:string;busy:boolean;save:(value:string)=>void}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <InspectorDisclosure title="Description" open={open} onOpenChange={setOpen}>
    <textarea aria-label="Media description" className="w-full min-h-20 rounded border border-[var(--chrome-line)] bg-[var(--chrome-deep)] p-2" value={draft} maxLength={8000} onChange={e=>setDraft(e.target.value)} />
    <div className="flex gap-2"><Button size="sm" disabled={busy || draft===value} onClick={()=>save(draft)}>Save description</Button><Button size="sm" variant="ghost" disabled={draft===value} onClick={()=>setDraft(value)}>Cancel</Button></div>
  </InspectorDisclosure>;
}

/** One source clock for playback, waveform seeking and persisted spoken-reference marks. */
export function SourceAudioTimeline({ projectId, assetId, sourceUrl, name, duration }: {
  projectId: string; assetId: string; sourceUrl: string; name: string; duration: number;
}) {
  const notes = useSourceNotes(projectId, assetId);
  const player = useRef<HTMLAudioElement>(null), stopAt = useRef<number | null>(null);
  const [position, setPosition] = useState(0), [length, setLength] = useState(duration);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [playError, setPlayError] = useState("");
  const marks = notes.draft?.moments ?? [], active = marks.find(m => m.id === selected);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const node = player.current;
      if (!node) return;
      if (stopAt.current !== null && node.currentTime >= stopAt.current) {
        node.pause(); node.currentTime = stopAt.current; stopAt.current = null;
      }
      setPosition(node.currentTime);
      if (!node.paused) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const seek = (time: number) => {
    if (!player.current) return;
    stopAt.current = null;
    player.current.currentTime = Math.max(0, Math.min(length, time));
    setPosition(player.current.currentTime);
  };
  const play = () => { setPlayError(""); void player.current?.play().catch(() => setPlayError("Audio could not play. Try again.")); };
  const add = (start: number, end: number) => {
    if (!notes.draft || notes.busy) return;
    const number = Math.max(0, ...marks.map(m => Number(/^Mark (\d+)$/.exec(m.note)?.[1] ?? 0))) + 1;
    const mark = { id: crypto.randomUUID(), start, end, note: `Mark ${number}` };
    const next = { ...notes.draft, moments: [...marks, mark] };
    notes.setDraft(next); void notes.commit(next); setSelected(mark.id);
  };
  return <div className="space-y-2" tabIndex={0} aria-label={`Source timeline: ${name}`} onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === "Space") {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) { if(player.current?.paused) play(); else player.current?.pause(); }
      return;
    }
    if (event.key.toLowerCase() === "m" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault(); event.stopPropagation(); const t = player.current?.currentTime ?? 0; add(t, t);
    }
  }}>
    <audio ref={player} src={sourceUrl} preload="metadata" onLoadedMetadata={e => setLength(e.currentTarget.duration)}
      onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setPlayError("Audio could not load.")} />
    <div className="flex items-center gap-2" role="group" aria-label="Playback">
      <Button size="icon-sm" variant="default" aria-label={playing ? "Pause" : "Play"} title={`${playing ? "Pause" : "Play"} (Space)`} onClick={() => playing ? player.current?.pause() : play()}>{playing ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}</Button>
      <span className="text-xs tabular-nums">{position.toFixed(2)} / {length.toFixed(2)} s</span>

    </div>
    <div className="relative pt-7">
      <TimelineMarks marks={marks.map(m => ({id:m.id,label:m.note,time:m.start,end:m.end}))} duration={length} selectedId={selected} onSelect={mark => { setSelected(mark.id); seek(mark.time); }} />
      <div className="flex justify-between text-xs tabular-nums text-[var(--ink-secondary)]" aria-label="Source time ruler">{Array.from({length:5},(_,i) => <span key={i}>{(length*i/4).toFixed(2)}s</span>)}</div>
      <WaveformPreview detailed track={{ source_url: sourceUrl, track_name: name }} progress={length ? position / length : 0} onSeek={fraction => seek(fraction * length)} />
      {active && active.end > active.start && <div aria-hidden className="pointer-events-none absolute bottom-0 h-[120px] border-x-2 border-[var(--timeline-review-marker-color)] bg-[var(--timeline-review-marker-color)] opacity-20" style={{ left: `${active.start / length * 100}%`, width: `${(active.end-active.start)/length*100}%` }} />}
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--chrome-line)] pt-2 text-xs text-[var(--ink-secondary)]">
      <FrameTagControls tags={marks.map(mark => ({id:mark.id,label:mark.note,timeline_seconds:mark.start}))}
        busy={!notes.draft || notes.busy} onAdd={() => { const time=player.current?.currentTime ?? 0; add(time,time); }}
        onSeek={time => { setSelected(marks.find(mark => mark.start === time)?.id ?? null); seek(time); }}
        onRemove={id => { if (notes.draft) { const next={...notes.draft,moments:marks.filter(mark => mark.id !== id)}; notes.setDraft(next); void notes.commit(next); if(selected===id)setSelected(null); } }}
        onClear={() => { if(notes.draft){const next={...notes.draft,moments:[]};notes.setDraft(next);void notes.commit(next);setSelected(null);} }}
        outlineButtonClassName="" ghostButtonClassName="" />
      <Button size="sm" variant="ghost" disabled={!notes.undo || notes.busy} onClick={() => void notes.undo?.()}>Undo mark</Button>
      <span role="status">{notes.busy ? "Saving mark…" : active ? `${active.note}: ${active.start.toFixed(2)}s${active.end > active.start ? `–${active.end.toFixed(2)}s` : ""}` : ""}</span>

    </div>
    {notes.draft && <EditableDescription value={notes.draft.description} busy={notes.busy} save={description=>{if(notes.draft)void notes.commit({...notes.draft,description});}} />}
    {(notes.error || playError) && <p role="alert">{notes.error || playError}</p>}
    {notes.error && notes.dirty && <Button size="sm" onClick={() => void notes.commit()}>Retry saving mark</Button>}
  </div>;
}
