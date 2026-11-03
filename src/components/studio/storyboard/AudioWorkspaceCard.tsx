"use client";
import { Play, Pause, Maximize2, Trash2 } from "lucide-react";
import { MediaMembershipBadges } from "./MediaMembershipBadges";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WaveformPreview } from "../timeline/WaveformPreview";
import type { StoryboardAsset } from "@/lib/storyboard/model";
import styles from "./storyboard.module.css";

export function AudioWorkspaceCard({asset, selected, onSelect, onOpen, onRemove}: {
  asset: StoryboardAsset; selected: boolean; onSelect: (add: boolean) => void; onOpen: () => void; onRemove?: () => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing,setPlaying] = useState(false), [position,setPosition] = useState(0);
  const [duration,setDuration] = useState(asset.duration ?? 0), [error,setError] = useState("");
  const toggle = () => {
    const node=player.current; if(!node)return;
    setError("");
    if(!node.paused) { node.pause(); return; }
    node.closest('[aria-label="Media workspace"]')?.querySelectorAll<HTMLAudioElement>('audio').forEach(other=>{if(other!==node)other.pause();});
    if(node.ended)node.currentTime=0;
    void node.play().catch(()=>setError("Could not play. Try again."));
  };
  return <article className={styles.audioCard} data-active={selected} onKeyDown={event=>{
    if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
    if(event.code!=="Space" || event.metaKey || event.ctrlKey || event.altKey)return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)toggle();
  }}>
    <div className="flex items-center gap-2">
      <button className={styles.audioSelect} aria-pressed={selected} onClick={event=>onSelect(event.metaKey||event.ctrlKey||event.shiftKey)} onDoubleClick={()=>{player.current?.pause();onOpen();}}><strong>{asset.name}</strong></button>
      <span className="shrink-0 text-xs tabular-nums text-[var(--ink-secondary)]">{duration.toFixed(2)}s</span>
    </div>
    <MediaMembershipBadges asset={asset} />
    <audio ref={player} src={asset.url} preload="metadata" onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setError("Audio unavailable")} />
    <WaveformPreview detailed compact track={{source_url:asset.url,track_name:asset.name}} progress={duration ? position/duration : 0} onSeek={fraction=>{if(player.current){player.current.currentTime=fraction*duration;setPosition(fraction*duration);}}} />
    <div className="flex items-center gap-2">
      <Button size="icon-sm" variant="outline" aria-label={`${playing ? "Pause" : "Play"} ${asset.name}`} title={`${playing ? "Pause" : "Play"} (Space)`} onClick={toggle}>{playing ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}</Button>
      <span className="flex-1 text-xs tabular-nums text-[var(--ink-secondary)]">{position.toFixed(2)}s</span>
      {onRemove && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${asset.name} from media`} onClick={onRemove}><Trash2 aria-hidden="true" /></Button>}
      <Button size="icon-sm" variant="ghost" aria-label={`Open ${asset.name} for review`} title="Open for review and marks" onClick={()=>{player.current?.pause();onOpen();}}><Maximize2 aria-hidden="true" /></Button>
    </div>
    {error && <p role="alert" className="text-xs">{error}</p>}
  </article>;
}
