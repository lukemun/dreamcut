"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PauseIcon, PlayIcon, XIcon, RotateCcwIcon, CheckIcon, ZoomInIcon, ZoomOutIcon, ListIcon, Trash2Icon } from "lucide-react";
import { instrumentSettingsSchema, moveInstrumentHit, addManualInstrumentHit, instrumentControlTracks, instrumentFilters, updateInstrumentFilters, updateSelectedInstrumentHits, instrumentLabels, instrumentColors, instrumentHitKey, visibleInstrumentHits, type InstrumentId, type InstrumentPayload, type InstrumentSettings } from "@/lib/timeline/instrument-analysis";
import { resolveMediaTiming } from "@/lib/timeline/media";
import { Input } from "@/components/ui/input";
import { rhythmViewWindow, zoomRhythmView, readRhythmResponse } from "./rhythm-view-window";
import type { TimelineElement } from "./types";
import type { FrameTag } from "@/lib/review/frame-tag-types";
import { rhythmReviewMarks } from "./rhythm-review-marks";
import { TimelineMarks } from "./TimelineMarks";
import { RhythmWaveform } from "./RhythmWaveform";
import { getRulerTickStep } from "./canvas-helpers";
import { getStoredItem } from "@/lib/persisted-key";
import { OptionSelect } from "@/components/ui/select";

// Quiet fill, no outline: open space over lines (editor-visual-system.md).
const button = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--chrome-raised)] px-3 text-sm hover:bg-[var(--chrome-selected-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] disabled:opacity-40";
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;


export function LibraryRhythmInspector({ projectId, sourceUrl, trackName, clip, marks = [], onClose }: { projectId: string; sourceUrl: string; trackName: string; clip?: TimelineElement; marks?: FrameTag[]; onClose: () => void }) {
  const [payload, setPayload] = useState<InstrumentPayload | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysisRefresh, setAnalysisRefresh] = useState(0);
  const [draft, setDraft] = useState<InstrumentSettings | null>(null);
  const [undoSavedSettings, setUndoSavedSettings] = useState<InstrumentSettings | null>(null);
  const [listening, setListening] = useState<Array<InstrumentId | "mix">>(["mix"]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [selectedHit, setSelectedHit] = useState<{ instrument: InstrumentId; time: number } | null>(null);
  const [selectedHitKeys, setSelectedHitKeys] = useState<string[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [rulerWidth, setRulerWidth] = useState(900);
  const ruler = useRef<HTMLDivElement | null>(null);
  const [draggingHit, setDraggingHit] = useState<{ instrument: InstrumentId; from: number; to: number } | null>(null);
  const hitDrag = useRef<{ instrument: InstrumentId; from: number; to: number; x: number; left: number; width: number; moved: boolean } | null>(null);
  const suppressHitClick = useRef(false);
  const focusMovedHit = useRef<string | null>(null);
  const [activePanel, setActivePanel] = useState<"waveforms" | "saved">("waveforms");
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const channels = useRef<Array<{ id: InstrumentId | "mix"; node: HTMLAudioElement }>>([]);
  const position = useRef(0);
  const wantPlayback = useRef(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const url = `/api/projects/${encodeURIComponent(projectId)}/library/instruments`;
  const undoKey = `dreamcut:rhythm-hit-undo:${projectId}:${sourceUrl}`;
  const duration = payload?.result?.duration ?? 0;
  const clipTiming = clip && duration > 0 ? resolveMediaTiming({ ...clip, _source_duration: duration }) : null;
  const rangeStart = clipTiming ? Math.max(0, Math.min(duration, clipTiming.trimStart)) : 0;
  const rangeEnd = clipTiming ? Math.max(rangeStart, Math.min(duration, rangeStart + clipTiming.visibleSourceDuration)) : duration;
  const rangeSpan = Math.max(0.001, rangeEnd - rangeStart);
  const { span, start: windowStart, end } = rhythmViewWindow(viewStart, viewSpan ?? rangeSpan, rangeStart, rangeEnd);
  const changeView = (start: number, length: number) => {
    const next = rhythmViewWindow(start, length, rangeStart, rangeEnd);
    setViewStart(next.start); setViewSpan(next.span);
  };
  const zoomView = (factor: number) => {
    const anchor = time >= windowStart && time <= end ? time : windowStart + span / 2;
    const next = zoomRhythmView(windowStart, span, factor, anchor, rangeStart, rangeEnd);
    changeView(next.start, next.span);
  };
  const ready = payload?.state === "ready";
  useEffect(() => {
    if (!ready || activePanel !== "waveforms" || !ruler.current) return;
    const node = ruler.current;
    const measure = () => setRulerWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, activePanel]);
  const mediaUrl = ready ? `${url}/${payload.key}` : sourceUrl;

  useEffect(() => {
    if (duration <= 0) return;
    position.current = rangeStart;
    setTime(rangeStart);
    setViewStart(rangeStart);
    for (const channel of channels.current) if (channel.node.readyState >= 1) channel.node.currentTime = windowStart;
  }, [duration, rangeStart]);

  useEffect(() => { const previous = document.activeElement as HTMLElement | null; panel.current?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const response = await fetch(`${url}?source_url=${encodeURIComponent(sourceUrl)}`, { cache: "no-store" });
        const data = await readRhythmResponse<InstrumentPayload>(response);
        if (active) {
          setPayload(data); setLoadError("");
          try {
            const saved = JSON.parse(getStoredItem(localStorage, undoKey) ?? "null");
            setUndoSavedSettings(saved && JSON.stringify(saved.after) === JSON.stringify(data.settings) ? instrumentSettingsSchema.parse(saved.before) : null);
          } catch { /* Keep this view's reversal when browser storage is unavailable. */ }
          timeout = setTimeout(read, data.state === "preparing" ? 1500 : 30000);
        }
      } catch (error) { if (active) { setLoadError(error instanceof Error ? error.message : "Could not load instruments"); timeout = setTimeout(read, 1500); } }
    };
    void read();
    return () => { active = false; clearTimeout(timeout); };
  }, [url, sourceUrl, busy, analysisRefresh, undoKey]);
  useEffect(() => {
    const ids: Array<InstrumentId | "mix"> = ready ? ["mix", "other", "drums", "bass", "vocals"] : ["mix"];
    const group = ids.map(id => ({ id, node: new Audio(ready ? `${mediaUrl}/${id}` : mediaUrl) }));
    channels.current = group;
    const node = group[0]!.node;
    audio.current = node;
    for (const channel of group) { channel.node.preload = "auto"; channel.node.volume = channel.id === "mix" ? 1 : 0; }
    const load = () => { node.currentTime = Math.min(Math.max(position.current, rangeStart), Math.max(0, node.duration - 0.01)); };
    const play = () => setPlaying(true);
    const pause = () => setPlaying(false);
    const ended = () => { wantPlayback.current = false; setPlaying(false); };
    const error = () => { setMessage("Audio could not load. Retry separation if an instrument is missing."); setPlaying(false); };
    node.addEventListener("loadedmetadata", load); node.addEventListener("play", play); node.addEventListener("pause", pause); node.addEventListener("ended", ended); node.addEventListener("error", error);
    return () => { node.removeEventListener("loadedmetadata", load); node.removeEventListener("play", play); node.removeEventListener("pause", pause); node.removeEventListener("ended", ended); node.removeEventListener("error", error); for (const channel of group) { channel.node.pause(); channel.node.removeAttribute("src"); channel.node.load(); } channels.current = []; };
  }, [mediaUrl, ready, rangeStart]);
  useEffect(() => {
    for (const channel of channels.current) channel.node.volume = listening.includes(channel.id) ? 1 : 0;
  }, [listening, mediaUrl, ready]);
  const playChannels = async () => {
    try {
      await Promise.all(channels.current.map(async ({ node }) => {
        if (node.readyState < 1) await new Promise<void>((resolve, reject) => {
          node.addEventListener("loadedmetadata", () => resolve(), { once: true });
          node.addEventListener("error", () => reject(new Error("Audio unavailable")), { once: true });
        });
        node.currentTime = position.current;
      }));
      if (!wantPlayback.current) return;
      await Promise.all(channels.current.map(({ node }) => node.play()));
    } catch { wantPlayback.current = false; channels.current.forEach(({ node }) => node.pause()); setMessage("Could not play this track."); }
  };
  const toggleInstrument = (id: InstrumentId | "mix") => setListening(current => current.includes(id) ? current.filter(value => value !== id) : id === "mix" ? ["mix"] : [...current.filter(value => value !== "mix"), id]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const node = audio.current;
      if (node && !node.paused) {
        if (duration > 0 && node.currentTime >= end - 0.03) {
          if (loop) channels.current.forEach(channel => { channel.node.currentTime = windowStart; });
          else { wantPlayback.current = false; channels.current.forEach(channel => channel.node.pause()); }
        }
        for (const channel of channels.current) if (channel.node !== node && channel.node.readyState >= 1 && Math.abs(channel.node.currentTime - node.currentTime) > 0.08) channel.node.currentTime = node.currentTime;
        position.current = node.currentTime; setTime(node.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, loop, windowStart, end]);
  const seek = (seconds: number) => {
    const next = Math.max(rangeStart, Math.min(rangeEnd || audio.current?.duration || 0, seconds));
    position.current = next; setTime(next);
    if (next < windowStart || next > end) setViewStart(Math.max(rangeStart, Math.min(rangeEnd - span, next - span / 2)));
    for (const channel of channels.current) if (channel.node.readyState >= 1) channel.node.currentTime = next;
  };
  const togglePlayback = () => {
    if (!audio.current) return;
    wantPlayback.current = audio.current.paused;
    if (audio.current.paused) { if (position.current < windowStart || position.current >= end - 0.05) seek(windowStart); void playChannels(); } else channels.current.forEach(({ node }) => node.pause());
  };
  const request = async (method: "POST" | "PATCH", settings?: InstrumentSettings, restoring = false) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_url: sourceUrl, settings }) });
      const data = await readRhythmResponse<InstrumentPayload>(response);
      if (method === "PATCH") {
        const previous = payload?.settings ? structuredClone(payload.settings) : null;
        try {
          if (restoring) localStorage.removeItem(undoKey);
          else if (previous) localStorage.setItem(undoKey, JSON.stringify({ before: previous, after: data.settings }));
        } catch { /* Reversal remains available in this view when storage is disabled. */ }
        setUndoSavedSettings(restoring ? null : previous);
      }
      setPayload(data); setDraft(null);
      if (restoring) { setSelectedHit(null); setSelectedHitKeys([]); }
      if (method === "PATCH") setMessage(restoring ? "Previous hit marks restored." : "Marked hits saved.");
      window.dispatchEvent(new CustomEvent("instrument-map-changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update instruments"); }
    finally { setBusy(false); }
  };
  const settings = draft ?? payload?.settings;
  const loadPreset = (id: string) => {
    const preset = payload?.presets?.find(value => value.id === id);
    if (!preset) return;
    wantPlayback.current = false;
    channels.current.forEach(({ node }) => node.pause());
    setPresetId(id); setPresetName(preset.name);
    setDraft({ ...structuredClone(preset.settings), marked_hits: preset.settings.marked_hits ?? [] });
    setSelectedHit(preset.viewer?.selected_hit ?? null);
    setSelectedHitKeys(preset.viewer?.selected_hit ? [instrumentHitKey(preset.viewer.selected_hit.instrument, preset.viewer.selected_hit.time)] : []);
    setListening(preset.viewer?.listening ?? ["mix"]); setLoop(preset.viewer?.loop ?? false);
    const start = Math.max(rangeStart, Math.min(rangeEnd, preset.settings.snapshot?.start ?? rangeStart));
    const finish = Math.max(start, Math.min(rangeEnd, preset.settings.snapshot?.end ?? rangeEnd));
    const playhead = Math.max(start, Math.min(finish, preset.viewer?.playhead ?? start));
    position.current = playhead; setTime(playhead);
    for (const channel of channels.current) if (channel.node.readyState >= 1) channel.node.currentTime = playhead;
    setViewStart(start); setViewSpan(Math.max(0.001, finish - start));
    setActivePanel("waveforms");
    setMessage(`Loaded “${preset.name}” — hits and configuration restored.`);
  };
  const storePreset = async (rename: boolean) => {
    if (busy || !presetName.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_url: sourceUrl, action: rename ? "rename_preset" : "save_preset", preset_id: presetId, name: presetName.trim(), settings, view: { start: windowStart, end }, viewer: { listening, loop, playhead: time, selected_hit: selectedHit } }) });
      const data = await readRhythmResponse<InstrumentPayload>(response);
      setPayload(data);
      if (!rename) setPresetId(data.presets?.at(-1)?.id ?? "");
      setMessage(rename ? "Preset renamed." : `Saved “${presetName.trim()}”.${draft ? " Apply hits to use these changes on the timeline." : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save preset"); }
    finally { setBusy(false); }
  };
  const save = (next: InstrumentSettings) => {
    const filtersChanged = next.minimum_strength !== settings?.minimum_strength || next.keep_strongest_percent !== settings?.keep_strongest_percent || next.minimum_gap_seconds !== settings?.minimum_gap_seconds;
    setDraft(filtersChanged ? { ...next, snapshot: undefined } : next);
  };
  const selectedTracks = instrumentControlTracks(listening);
  const addHit = (instrument: InstrumentId) => {
    const at = position.current;
    if (!settings || busy || !Number.isFinite(at) || at < rangeStart || at >= rangeEnd) return;
    save(addManualInstrumentHit({ ...settings, marked_hits: settings.marked_hits ?? [] }, instrument, at));
    setSelectedHit({ instrument, time: at });
    setSelectedHitKeys([instrumentHitKey(instrument, at)]);
    setMessage(`${instrumentLabels[instrument]} hit added at ${at.toFixed(3)}s. Apply hits to save it.`);
  };
  const boundedHitTime = (at: number) => Math.max(rangeStart, Math.min(Math.floor((rangeEnd - 0.000001) * 1e6) / 1e6, Number(at.toFixed(6))));
  const moveHit = (instrument: InstrumentId, from: number, to: number) => {
    if (!settings || busy) return;
    const at = boundedHitTime(to);
    focusMovedHit.current = instrumentHitKey(instrument, at);
    save(moveInstrumentHit({ ...settings, marked_hits: settings.marked_hits ?? [] }, instrument, from, at));
    setSelectedHit({ instrument, time: at });
    setSelectedHitKeys(current => [...new Set([...current.filter(key => key !== instrumentHitKey(instrument, from)), instrumentHitKey(instrument, at)])]);
    setMessage(`${instrumentLabels[instrument]} hit moved to ${at.toFixed(3)}s. Apply hits to save it.`);
  };
  const filters = settings ? instrumentFilters(settings, selectedTracks[0] ?? "mix") : null;
  const saveFilters = (patch: Partial<NonNullable<typeof filters>>) => {
    if (settings && selectedTracks.length) setDraft(updateInstrumentFilters(settings, selectedTracks, patch));
  };
  const close = () => { if (draft) setMessage("Apply hits or discard your changes before closing."); else onClose(); };
  const lanes = payload?.result ? ["mix", "other", "drums", "bass", "vocals"].map(id => payload.result!.lanes.find(lane => lane.id === id)!) : [];
  const candidateKeys = lanes.filter(lane => lane.id !== "mix" && selectedTracks.includes(lane.id)).flatMap(lane => visibleInstrumentHits(lane, settings!, { candidates: true })
    .filter(hit => hit.time_seconds >= windowStart && hit.time_seconds < end)
    .map(hit => instrumentHitKey(lane.id, hit.time_seconds)));
  const markedKeys = new Set(settings?.marked_hits ?? []);
  const selectedKeys = new Set(selectedHitKeys);
  const markedCount = candidateKeys.filter(key => markedKeys.has(key)).length;
  const toggleHitSelection = (instrument: InstrumentId, seconds: number) => {
    const key = instrumentHitKey(instrument, seconds);
    const next = selectedKeys.has(key) ? selectedHitKeys.filter(value => value !== key) : [...selectedHitKeys, key];
    setSelectedHitKeys(next);
    setSelectedHit(next.includes(key) ? { instrument, time: seconds } : null);
  };
  const updateSelectedHits = (action: "mark" | "unmark" | "remove") => {
    if (!settings || busy || !selectedHitKeys.length) return;
    save(updateSelectedInstrumentHits(settings, selectedHitKeys, action));
    setMessage(action === "mark" ? `${selectedHitKeys.length} hits marked for alignment.` : action === "unmark" ? `${selectedHitKeys.length} alignment marks removed.` : `${selectedHitKeys.length} hits removed. Discard or undo to restore them.`);
    if (action === "remove") { setSelectedHitKeys([]); setSelectedHit(null); setSelectionOpen(false); }
  };
  const playheadX = (time - windowStart) / span * 100;
  const rulerStep = getRulerTickStep(rulerWidth / span);
  const rulerLabelStep = rulerWidth / span * rulerStep < 42 ? rulerStep * 2 : rulerStep;
  const rulerMinorStep = rulerLabelStep >= 1 ? rulerLabelStep / 2 : rulerLabelStep;
  const rulerFirstIndex = Math.ceil((windowStart - 0.000001) / rulerMinorStep);
  const rulerTickCount = Math.min(1000, Math.ceil(span / rulerMinorStep) + 2);
  const rulerTicks = Array.from({ length: rulerTickCount }, (_, index) => {
    const seconds = Number(((rulerFirstIndex + index) * rulerMinorStep).toFixed(3));
    const major = Math.abs(seconds / rulerLabelStep - Math.round(seconds / rulerLabelStep)) < 0.0001;
    return { seconds, major };
  }).filter(tick => tick.seconds >= windowStart - 0.0001 && tick.seconds <= end + 0.0001);
  const visibleMarks = rhythmReviewMarks(clip, marks, windowStart, end);
  const removeSelectedHit = () => {
    if (activePanel !== "waveforms") return;
    updateSelectedHits("remove");
  };

  return createPortal(<div className="fixed inset-0 z-(--layer-dialog) flex items-center justify-center bg-black/65 p-4">
    <div ref={panel} role="dialog" aria-modal="true" aria-label={`Instrument inspector: ${trackName}`} tabIndex={-1} className="editor-chrome flex h-[94dvh] w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-[var(--edge-outline)] bg-[var(--chrome-deep)] text-[var(--ink)] shadow-2xl outline-none" onKeyDown={event => {
      if (!panel.current?.contains(event.target as Node)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        if (hitDrag.current) { const original = hitDrag.current.from; hitDrag.current = null; setDraggingHit(null); seek(original); event.preventDefault(); return; }
        close();
      }
      if (event.key === "Tab") {
        const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,a[href]') ?? []).filter(target => target.getClientRects().length > 0);
        if (targets?.length) { const first = targets[0]!; const last = targets[targets.length - 1]!; if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
      const target = event.target;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.stopPropagation();
        if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"]')) return;
        event.preventDefault();
        if (!event.repeat) removeSelectedHit();
        return;
      }
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea,select,input:not([type="range"]):not([type="checkbox"]):not([type="number"]):not([type="radio"])'))) return;
      if (event.code === "Space" || event.key === " " || event.key.toLowerCase() === "r") {
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        if (event.code === "Space" || event.key === " ") togglePlayback();
        else { seek(windowStart); wantPlayback.current = true; void playChannels(); }
      }
    }}>
      <header className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3">
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{trackName}</h2><p className="text-xs text-[var(--ink-secondary)]">{clip ? `Timeline clip · ${clock(rangeStart)}–${clock(rangeEnd)}` : "Rhythm viewer"}</p></div>
        <div className="flex gap-1" aria-label="Rhythm views">{(["waveforms", "saved"] as const).map(value => <button type="button" key={value} aria-pressed={activePanel === value} onClick={() => setActivePanel(value)} className={`rounded px-3 py-2 text-sm ${activePanel === value ? "bg-[var(--chrome-raised)] text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>{value === "waveforms" ? "Waveforms" : "Saved hits"}</button>)}</div>
        <button type="button" className={button} aria-label="Close instrument inspector" onClick={close}><XIcon size={18} /></button>
      </header>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button type="button" className={button} aria-label={playing ? "Pause track" : "Play track"} aria-keyshortcuts="Space" title="Play / pause (Space)" onClick={togglePlayback}>{playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}{playing ? "Pause" : "Play"}<kbd className="text-xs text-[var(--ink-muted)]">Space</kbd></button>
        <button type="button" className={button} aria-label="Replay visible range" aria-keyshortcuts="R" title="Replay visible range (R)" onClick={() => { seek(windowStart); wantPlayback.current = true; void playChannels(); }}><RotateCcwIcon size={16} /><kbd className="text-xs text-[var(--ink-muted)]">R</kbd></button>
        <span className="min-w-32 font-mono text-base tabular-nums" aria-label="Track playhead">{clock(time)} <span className="text-[var(--ink-muted)]">/ {clock(rangeEnd)}</span></span>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={loop} onCheckedChange={setLoop} />Loop visible range</label>
        <button type="button" className="ml-auto text-xs text-[var(--ink-secondary)] underline" disabled={busy} onClick={() => setAnalysisRefresh(value => value + 1)}>Refresh analysis</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
        {!ready ? <div className="flex min-h-64 flex-col items-center justify-center gap-4">{payload?.state === "preparing" || payload?.state === "failed" ? <p className="text-base">{payload.message}</p> : null}{payload?.state !== "preparing" ? <button type="button" className={button} disabled={busy || !payload} onClick={() => void request("POST")}>{payload?.state === "failed" ? "Retry separation" : "Separate instruments"}</button> : <p className="text-sm text-[var(--ink-secondary)]">Preparing audio and hit markers locally…</p>}</div> : <>
          {activePanel === "saved" ? <div className="flex shrink-0 flex-wrap items-center gap-2">
            <OptionSelect label="Saved hit preset" value={presetId} disabled={busy} className="h-9 min-w-0 max-w-64"
              options={[{ value: "", label: "Current saved hits" }, ...(payload.presets ?? []).map(preset => ({ value: preset.id, label: preset.name }))]}
              onValueChange={next => {
              if (next) { loadPreset(next); return; }
              setPresetId(""); setPresetName(""); setDraft(null); setSelectedHit(null); setSelectedHitKeys([]);
              setViewStart(rangeStart); setViewSpan(null); setActivePanel("waveforms");
              setMessage("Current applied hits loaded.");
            }} />
            <input aria-label="Hit preset name" placeholder="Name this hit set…" maxLength={80} value={presetName} onChange={event => setPresetName(event.target.value)} className="h-9 min-w-28 flex-1 rounded border border-[var(--edge-outline)] bg-transparent px-2 text-sm" />
            <button type="button" className={button} disabled={busy || !presetName.trim()} onClick={() => void storePreset(false)}>Save snapshot</button>
            {presetId ? <button type="button" className={button} disabled={busy || !presetName.trim()} onClick={() => void storePreset(true)}>Rename</button> : null}
          </div> : null}
          {activePanel === "saved" ? <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid gap-2">
              {(payload.presets ?? []).map(preset => {
                const snapshot = preset.settings.snapshot;
                const kept = snapshot?.hits.filter(hit => !preset.settings.excluded_hits.includes(instrumentHitKey(hit.instrument, hit.time_seconds)) && (preset.settings.marked_hits === undefined || preset.settings.marked_hits.includes(instrumentHitKey(hit.instrument, hit.time_seconds)))).length;
                return <article key={preset.id} className="flex items-center gap-3 rounded bg-[var(--chrome-panel)] p-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{preset.name}</p><p className="text-xs text-[var(--ink-muted)]">{snapshot ? `${kept} hits · ${clock(snapshot.start)}–${clock(snapshot.end)}` : "Legacy filter configuration"} · {new Date(preset.saved_at).toLocaleString()}</p></div>
                  <button type="button" className={button} disabled={busy} onClick={() => loadPreset(preset.id)}>Load snapshot</button>
                  <button type="button" className={button} disabled={busy} onClick={() => { setPresetId(preset.id); setPresetName(preset.name); }}>Edit name</button>
                </article>;
              })}
              {!payload.presets?.length ? <p className="text-sm text-[var(--ink-muted)]">No snapshots yet.</p> : null}
            </div>
          </div> : null}
          {activePanel === "waveforms" ? <div className="shrink-0 rounded bg-[var(--chrome-panel)] p-2"><div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs" aria-label="Hit filters">
            {[
              { key: "keep_strongest_percent" as const, label: "Hits to keep", value: filters!.keep_strongest_percent, max: 100, step: 1, unit: "%", scale: 1, reset: 100 },
              { key: "minimum_strength" as const, label: "Strength cutoff", value: Number((filters!.minimum_strength * 100).toFixed(1)), max: 100, step: 0.1, unit: "%", scale: 100, reset: 0 },
              { key: "minimum_gap_seconds" as const, label: "Min. hit gap", value: filters!.minimum_gap_seconds, max: 5, step: 0.01, unit: "s", scale: 1, reset: 0 },
            ].map(control => { const mixed = selectedTracks.some(id => instrumentFilters(settings!, id)[control.key] * control.scale !== control.value); return <div key={control.key} className="grid grid-cols-[minmax(30px,1fr)_52px_14px_20px] items-center gap-x-1 gap-y-1">
              <label htmlFor={control.key} className="col-span-4 text-[var(--ink-secondary)]">{control.label}{mixed ? " · Mixed" : ""}</label>
              <input id={control.key} aria-label={control.label} type="range" min={0} max={control.max} step={control.step} value={control.value} disabled={busy || !selectedTracks.length} className="min-w-0 w-full" onChange={event => saveFilters({ [control.key]: Number(event.target.value) / control.scale })} />
              <input aria-label={control.label + " value"} type="number" min={0} max={control.max} step={control.step} value={mixed ? "" : control.value} placeholder={mixed ? "Mixed" : undefined} disabled={busy || !selectedTracks.length} className="h-7 min-w-0 w-full rounded border border-[var(--edge-outline)] bg-transparent px-1.5 text-right tabular-nums" onChange={event => { if (event.target.value !== "" && event.target.validity.valid) saveFilters({ [control.key]: Number(event.target.value) / control.scale }); }} />
              <span className="text-[var(--ink-muted)]">{control.unit}</span>
              <button type="button" aria-label={`Reset ${control.label}`} title={`Reset ${control.label} to ${control.reset}${control.unit}`} disabled={busy || !selectedTracks.length || (!mixed && control.value === control.reset)} className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-muted)] disabled:opacity-30" onClick={() => saveFilters({ [control.key]: control.reset / control.scale })}><RotateCcwIcon size={12} /></button>
            </div>; })}
            <div className="col-span-3 mt-1 flex flex-wrap items-center gap-2"><span className="text-[var(--ink-muted)]">{listening.includes("mix") ? "All instruments · Full mix" : selectedTracks.length ? selectedTracks.map(id => instrumentLabels[id]).join(" + ") : "Select instruments to adjust hits"}</span>{[{ label: "All", percent: 100 }, { label: "Top 50%", percent: 50 }, { label: "Top 10%", percent: 10 }, { label: "Top 1%", percent: 1 }].map(preset => <button key={preset.label} type="button" disabled={busy || !selectedTracks.length} className="rounded bg-[var(--chrome-raised)] px-2 py-0.5 text-xs hover:bg-[var(--chrome-selected-bg)] disabled:opacity-40" onClick={() => saveFilters({ keep_strongest_percent: preset.percent, minimum_strength: 0, minimum_gap_seconds: 0 })}>{preset.label}</button>)}<span role="status" className="ml-auto text-[var(--ink-secondary)]">{markedCount} marked · {candidateKeys.length} candidates{draft ? " · Unsaved" : ""}</span></div>
          </div></div> : null}
          {activePanel === "waveforms" ? <><div className="flex shrink-0 flex-wrap items-center gap-2 text-xs" aria-label="Waveform time range">
            <label className="flex items-center gap-2">Start <Input aria-label="Waveform view start seconds" type="number" min={rangeStart} max={end - Math.min(0.25, rangeSpan)} step={0.01} value={Number(windowStart.toFixed(2))} className="h-9 w-24 text-center tabular-nums" onChange={event => { if (event.target.value.trim()) changeView(Number(event.target.value), end - Number(event.target.value)); }} /><span>s</span></label>
            <label className="flex items-center gap-2">End <Input aria-label="Waveform view end seconds" type="number" min={windowStart + Math.min(0.25, rangeSpan)} max={rangeEnd} step={0.01} value={Number(end.toFixed(2))} className="h-9 w-24 text-center tabular-nums" onChange={event => { if (event.target.value.trim()) changeView(windowStart, Number(event.target.value) - windowStart); }} /><span>s</span></label>
            <button type="button" aria-label="Zoom out waveform" className={button} disabled={span >= rangeSpan} onClick={() => zoomView(2)}><ZoomOutIcon size={16} /></button>
            <input aria-label="Waveform zoom" className="min-w-20 flex-1" type="range" min={0} max={100} step={1} value={Math.log(rangeSpan / span) / Math.max(0.001, Math.log(rangeSpan / Math.min(0.25, rangeSpan))) * 100} onChange={event => {
              const nextSpan = rangeSpan / Math.pow(rangeSpan / Math.min(0.25, rangeSpan), Number(event.target.value) / 100);
              zoomView(nextSpan / span);
            }} />
            <button type="button" aria-label="Zoom in waveform" className={button} disabled={span <= Math.min(0.25, rangeSpan)} onClick={() => zoomView(0.5)}><ZoomInIcon size={16} /></button>
            <span className="tabular-nums text-[var(--ink-muted)]">{span.toFixed(2)}s visible</span>
            <button type="button" aria-label={clip ? "Fit trimmed clip" : "Fit entire track"} className={button} onClick={() => { setViewSpan(null); setViewStart(rangeStart); }}>Fit</button>
          </div>
          {span < rangeSpan ? <input aria-label="Waveform view position" className="w-full shrink-0" type="range" min={rangeStart} max={Math.max(rangeStart, rangeEnd - span)} step={0.01} value={windowStart} onChange={event => setViewStart(Number(event.target.value))} /> : null}
          <div className="grid min-h-0 flex-1 grid-cols-[120px_minmax(0,1fr)] overflow-y-auto" style={{ gridTemplateRows: `${clip ? 48 : 28}px repeat(${lanes.length}, minmax(76px, 1fr))` }}>
            <div className="flex items-center justify-between pr-4 text-xs text-[var(--ink-muted)]"><span>Instrument</span><span>Select</span></div>
            <div ref={ruler} aria-label="Waveform time ruler; click to place playhead" className="relative cursor-crosshair overflow-hidden border-b border-[var(--panel-group-divider,var(--chrome-line))]" onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); const bounds = event.currentTarget.getBoundingClientRect(); seek(windowStart + (event.clientX - bounds.left) / bounds.width * span); }} onPointerMove={event => { if (event.buttons !== 1 || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = event.currentTarget.getBoundingClientRect(); seek(windowStart + (event.clientX - bounds.left) / bounds.width * span); }}>{rulerTicks.map(tick => <span key={tick.seconds} aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l border-[var(--chrome-line)]" style={{ left: `${(tick.seconds - windowStart) / span * 100}%`, opacity: tick.major ? 0.9 : 0.5 }}><span className={`absolute bottom-0 left-0 border-l border-[var(--ink-muted)] ${tick.major ? "h-2" : "h-1"}`} />{tick.major ? <span className="absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-[var(--ink-secondary)]">{tick.seconds.toFixed(rulerLabelStep < 1 ? 1 : 0)}s</span> : null}</span>)}<TimelineMarks marks={visibleMarks.map(mark => ({id:mark.id,label:mark.label,time:mark.sourceTime,note:mark.note}))} start={windowStart} duration={span} onSelect={mark => seek(mark.time)} /></div>
            {lanes.map(lane => {
              const color = instrumentColors[lane.id];
              const hits = lane.id === "mix" ? [] : visibleInstrumentHits(lane, settings!, { candidates: true }).filter(hit => hit.time_seconds >= windowStart && hit.time_seconds <= end);
              return <div key={lane.id} className="col-span-2 grid min-h-0 grid-cols-subgrid border-b border-[var(--panel-group-divider,var(--chrome-line))]">
                <div className="flex flex-col justify-center gap-1 pr-4"><span className="text-sm font-medium" style={{ color }}>{instrumentLabels[lane.id]}</span><label className="flex items-center gap-2 text-xs"><Checkbox aria-label={`Select ${instrumentLabels[lane.id]} for listening and ${lane.id === "mix" ? "all instrument hit controls" : "hit controls"}`} checked={listening.includes(lane.id)} onCheckedChange={() => toggleInstrument(lane.id)} />{listening.includes(lane.id) ? "Selected" : "Select"}</label>{lane.id !== "mix" ? <button type="button" aria-label={`Add ${instrumentLabels[lane.id]} hit at playhead`} title={`Add a ${instrumentLabels[lane.id]} hit at ${time.toFixed(3)}s`} disabled={busy || time < rangeStart || time >= rangeEnd} className="inline-flex min-h-7 items-center justify-center rounded bg-[var(--chrome-raised)] px-1.5 text-xs hover:bg-[var(--chrome-selected-bg)] disabled:opacity-40" onClick={() => addHit(lane.id as InstrumentId)}>Add hit</button> : null}</div>
                <div className="relative min-h-0 overflow-hidden bg-black/15" aria-label={`${instrumentLabels[lane.id]} waveform`}>
                  <RhythmWaveform peaks={lane.peaks} duration={duration} start={windowStart} span={span} color={color} opacity={listening.includes(lane.id) ? 0.9 : 0.45} />
                  {visibleMarks.map(mark => <div key={mark.id} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-rose-300" style={{ left: `${(mark.sourceTime - windowStart) / span * 100}%` }} />)}
                  {hits.map(hit => {
                    const marked = markedKeys.has(instrumentHitKey(lane.id, hit.time_seconds));
                    const selected = selectedKeys.has(instrumentHitKey(lane.id, hit.time_seconds));
                    const at = draggingHit?.instrument === lane.id && draggingHit.from === hit.time_seconds ? draggingHit.to : hit.time_seconds;
                    return <button type="button" key={hit.time_seconds} ref={node => {
                      if (node && focusMovedHit.current === instrumentHitKey(lane.id, hit.time_seconds)) {
                        focusMovedHit.current = null; node.focus({ preventScroll: true });
                      }
                    }} disabled={busy} aria-label={`${instrumentLabels[lane.id]} hit at ${hit.time_seconds.toFixed(3)} seconds${marked ? ", marked for alignment" : ""}`} aria-pressed={selected} title={`${at.toFixed(3)}s${marked ? " · Marked" : ""}`} onPointerDown={event => {
                      if (event.button !== 0 || busy) return;
                      event.stopPropagation();
                      setSelectedHit({ instrument: lane.id as InstrumentId, time: hit.time_seconds });
                      const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      hitDrag.current = { instrument: lane.id as InstrumentId, from: hit.time_seconds, to: hit.time_seconds, x: event.clientX, left: bounds.left, width: bounds.width, moved: false };
                    }} onPointerMove={event => {
                      const drag = hitDrag.current;
                      if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                      event.stopPropagation();
                      if (!drag.moved && Math.abs(event.clientX - drag.x) < 3) return;
                      drag.moved = true;
                      drag.to = boundedHitTime(Math.max(windowStart, Math.min(end - 0.000001, drag.from + (event.clientX - drag.x) / Math.max(1, drag.width) * span)));
                      wantPlayback.current = false; channels.current.forEach(({ node }) => node.pause());
                      setDraggingHit({ instrument: drag.instrument, from: drag.from, to: drag.to });
                    }} onPointerUp={event => {
                      const drag = hitDrag.current;
                      hitDrag.current = null;
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      if (drag?.moved) {
                        suppressHitClick.current = true;
                        moveHit(drag.instrument, drag.from, drag.to);
                        setTimeout(() => { suppressHitClick.current = false; }, 0);
                      }
                      setDraggingHit(null);
                    }} onPointerCancel={() => { hitDrag.current = null; setDraggingHit(null); }}
                    onKeyDown={event => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault(); event.stopPropagation();
                      moveHit(lane.id as InstrumentId, hit.time_seconds, hit.time_seconds + (event.key === "ArrowRight" ? 0.01 : -0.01));
                    }}
                    onClick={() => { if (suppressHitClick.current) { suppressHitClick.current = false; return; } toggleHitSelection(lane.id as InstrumentId, hit.time_seconds); }} className={`absolute inset-y-0 z-10 -translate-x-1/2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${selected ? "z-20" : ""}`} style={{ left: `${(at - windowStart) / span * 100}%`, cursor: draggingHit ? "grabbing" : "ew-resize", touchAction: "none", width: 16, minWidth: 0, minHeight: 0, border: "none", borderRadius: 0, padding: 0, background: "transparent", boxShadow: "none" }}>
                      <span className="absolute inset-y-2 left-1/2" style={{ background: selected ? "#fcd34d" : marked ? "white" : color, width: selected || marked ? 2 : 1, opacity: selected || marked ? 1 : 0.35 }} />
                      {selected ? <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-amber-300 bg-amber-300/20 shadow-[0_0_0_2px_rgba(0,0,0,.7)]" /> : null}
                      {marked ? <CheckIcon aria-hidden="true" size={14} className="absolute left-1/2 top-0 -translate-x-1/2 rounded-sm bg-white text-black" /> : <span className="absolute left-1/2 top-1 h-2 w-2 -translate-x-1/2 rotate-45 border" style={{ borderColor: color, background: "var(--chrome-deep)" }} />}
                    </button>;
                  })}
                  {playheadX >= 0 && playheadX <= 100 ? <div data-playhead={time.toFixed(3)} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-yellow-200 shadow-[0_0_4px_black]" style={{ left: `${playheadX}%` }}><span className="absolute -left-1 top-0 h-2 w-2 bg-yellow-200" /></div> : null}
                </div>
              </div>;
            })}
          </div></> : null}
          <div className="relative flex shrink-0 flex-wrap items-center gap-2 pt-2 text-xs">
            <div className="inline-flex items-center gap-px rounded-md bg-[var(--chrome-raised)]" role="group" aria-label="Selected hit actions">
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-l-md px-2.5 text-sm hover:bg-white/10" aria-expanded={selectionOpen} aria-controls="rhythm-selected-hits" onClick={() => setSelectionOpen(open => !open)}><ListIcon size={14} />Selected ({selectedHitKeys.length})</button>
              <button type="button" className="h-8 rounded-md px-2.5 text-sm hover:bg-white/10 disabled:opacity-40" disabled={busy || !selectedHitKeys.length} onClick={() => updateSelectedHits("mark")}>Mark</button>
              <button type="button" className="h-8 rounded-md px-2.5 text-sm hover:bg-white/10 disabled:opacity-40" disabled={busy || !selectedHitKeys.length} onClick={() => updateSelectedHits("unmark")}>Unmark</button>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--destructive)] hover:bg-white/10 disabled:opacity-40" aria-label="Remove selected hits" title="Remove selected hits" disabled={busy || !selectedHitKeys.length} onClick={() => updateSelectedHits("remove")}><Trash2Icon size={15} /></button>
            </div>
            {selectionOpen ? <div id="rhythm-selected-hits" role="region" aria-label="Selected hits" className="absolute bottom-full left-0 z-50 mb-2 max-h-56 w-72 overflow-y-auto rounded-md border border-[var(--edge-outline)] bg-[var(--chrome-deep)] p-1 shadow-xl">
              <div className="flex items-center justify-between gap-2 px-2 py-1.5"><strong className="text-xs">Selected hits</strong><button type="button" className="text-xs text-[var(--ink-secondary)] disabled:opacity-40" disabled={!selectedHitKeys.length} onClick={() => { setSelectedHitKeys([]); setSelectedHit(null); }}>Deselect all</button></div>
              {selectedHitKeys.length ? selectedHitKeys.map(key => { const [instrument, seconds] = key.split(":") as [InstrumentId, string]; const at = Number(seconds); return <div key={key} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5"><button type="button" className="min-w-0 flex-1 truncate px-1 py-1 text-left tabular-nums" onClick={() => { seek(at); setSelectedHit({ instrument, time: at }); }}>{instrumentLabels[instrument]} · {at.toFixed(3)}s {markedKeys.has(key) ? "✓" : ""}</button><button type="button" aria-label={`Deselect ${instrumentLabels[instrument]} hit at ${at.toFixed(3)} seconds`} className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/10" onClick={() => { setSelectedHitKeys(current => current.filter(value => value !== key)); if (selectedHit?.instrument === instrument && selectedHit.time === at) setSelectedHit(null); }}><XIcon size={13} /></button></div>; }) : <p className="px-2 py-2 text-[var(--ink-muted)]">No hits selected</p>}
            </div> : null}
            {selectedHit && selectedHitKeys.length === 1 ? <button type="button" className={button} disabled={busy} onClick={() => { setListening([selectedHit.instrument]); seek(Math.max(rangeStart, selectedHit.time - 0.35)); wantPlayback.current = true; void playChannels(); }}><PlayIcon size={14} />Hear</button> : null}
            <div className="ml-auto flex items-center gap-2">
              {draft ? <><button type="button" className={button} disabled={busy} onClick={() => { setDraft(null); setSelectedHit(null); setSelectedHitKeys([]); setPresetId(""); setPresetName(""); setMessage("Current saved hits restored."); }}>Discard</button><button type="button" className={button} disabled={busy} onClick={() => void request("PATCH", settings!)}>{busy ? "Saving…" : "Save changes"}</button></> : null}
              {undoSavedSettings && !draft ? <button type="button" className={button} disabled={busy} onClick={() => void request("PATCH", undoSavedSettings, true)}>Undo</button> : null}
            </div>
          </div>
        </>}
        {loadError || message ? <p role="status" className="shrink-0 text-xs text-[var(--ink-secondary)]">{loadError || message}</p> : null}
      </div>
    </div>
  </div>, document.body);
}
