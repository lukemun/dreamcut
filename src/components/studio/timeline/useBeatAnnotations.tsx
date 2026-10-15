"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AudioLinesIcon, MapIcon } from "lucide-react";
import { adjacentMusicalBeats, beatAnnotationSchema, projectBeatAnnotation, projectHitAnnotation, type BeatAnnotation, type MusicalMarkerKind } from "@/lib/timeline/beat-annotations";
import { WAVEFORM_SUPPORTED_TYPES } from "@/lib/timeline/media";
import type { TimelineRhythmView } from "./TimelineRhythmRows";
import { LibraryRhythmInspector } from "./LibraryRhythmInspector";
import type { TimelineElement } from "./types";
import type { FrameTag } from "@/lib/review/frame-tag-types";
import { getStoredItem } from "@/lib/persisted-key";

const markerKinds: Array<{ kind: MusicalMarkerKind; label: string; color: string }> = [
  { kind: "beat", label: "Beat grid", color: "#59d6cf" },
  { kind: "drum", label: "Drums", color: "#f59e0b" },
  { kind: "synth", label: "Synth / tonal", color: "#c084fc" },
  { kind: "other", label: "Other hits", color: "#94a3b8" },
  { kind: "bass", label: "Bass", color: "#5eead4" },
  { kind: "accompaniment", label: "Melody / other", color: "#c4b5fd" },
  { kind: "vocal", label: "Vocals", color: "#f9a8d4" },
];
const allKinds = markerKinds.map(entry => entry.kind);
function savedKinds(value: unknown, fallback: MusicalMarkerKind[]) {
  if (!Array.isArray(value)) return fallback;
  const allowed = new Set(allKinds);
  return value.filter((kind): kind is MusicalMarkerKind => typeof kind === "string" && allowed.has(kind as MusicalMarkerKind));
}

export function useBeatAnnotations(projectId: string | undefined, elements: TimelineElement[], playhead: number, onSeek: (time: number) => void, marks: FrameTag[] = []) {
  const sources = elements.filter(e => !e.removed_at && e.source_url && WAVEFORM_SUPPORTED_TYPES.has(e.type));
  const [chosen, setChosen] = useState("");
  const reference = sources.find(e => e.id === chosen);
  const [saved, setSaved] = useState<{ key: string; annotation: BeatAnnotation | null; instrumentMarksActive: boolean } | null>(null);
  const [show, setShow] = useState(false);
  const [shownKinds, setShownKinds] = useState<MusicalMarkerKind[]>(allKinds);
  const [snapKinds, setSnapKinds] = useState<MusicalMarkerKind[]>(["beat"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inspectedTrack, setInspectedTrack] = useState<{ sourceUrl: string; trackName: string; clip: TimelineElement } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedKey = `dreamcut:rhythm-rows:${projectId}`;
  useEffect(() => {
    const read = () => { try { setExpandedId(getStoredItem(localStorage, expandedKey)); } catch { /* Optional view preference. */ } };
    read();
    const sync = (event: StorageEvent) => { if (event.key === expandedKey) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [expandedKey]);
  const expand = (id: string | null) => { setExpandedId(id); try { if (id) localStorage.setItem(expandedKey, id); else localStorage.removeItem(expandedKey); } catch { /* Optional view preference. */ } };
  const expandedClip = sources.find(e => e.id === expandedId && e.type === "music");
  const epoch = useRef(0);
  const settingsKey = `dreamcut:beats:${projectId}`;
  useEffect(() => {
    try {
      const settings = JSON.parse(getStoredItem(sessionStorage, settingsKey) ?? "null");
      if (settings) {
        setChosen(typeof settings.chosen === "string" ? settings.chosen : "");
        setShow(settings.show !== false);
        setShownKinds(savedKinds(settings.shownKinds, allKinds));
        setSnapKinds(savedKinds(settings.snapKinds, settings.snap === true ? ["beat"] : []));
      }
    } catch { /* Optional workspace preferences. */ }
  }, [settingsKey]);
  const saveSettings = (patch: Partial<{ chosen: string; show: boolean; shownKinds: MusicalMarkerKind[]; snapKinds: MusicalMarkerKind[] }>) => {
    try { sessionStorage.setItem(settingsKey, JSON.stringify({ chosen, show, shownKinds, snapKinds, ...patch })); } catch { /* Storage may be disabled. */ }
  };
  const key = `${projectId}:${reference?.id}:${reference?.source_url}`;
  const url = projectId && reference ? `/api/projects/${encodeURIComponent(projectId)}/timeline/beat-annotations?element_id=${encodeURIComponent(reference.id)}` : null;
  async function load(prepare: boolean) {
    const request = ++epoch.current;
    if (!url) { setBusy(false); setMessage(""); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method: prepare ? "POST" : "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Beat annotation failed");
      const annotation = data.annotation == null ? null : beatAnnotationSchema.parse(data.annotation);
      if (request === epoch.current) {
        setSaved({ key, annotation, instrumentMarksActive: data.instrument_marks_active === true });
      }
    } catch (error) {
      if (request === epoch.current) setMessage(error instanceof Error ? error.message : "Beat annotation failed");
    } finally { if (request === epoch.current) setBusy(false); }
  }
  useEffect(() => {
    setSaved(null);
    void load(false);
    return () => { epoch.current++; };
    // Only source identity changes read the saved annotation. Timing changes are projected below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url]);
  useEffect(() => {
    const refresh = () => void load(false);
    window.addEventListener("instrument-map-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("instrument-map-changed", refresh); window.removeEventListener("focus", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url]);
  const annotation = saved?.key === key ? saved.annotation : null;
  const beats = useMemo(() => reference && annotation ? projectBeatAnnotation(reference, annotation) : [], [reference, annotation]);
  const hits = useMemo(() => reference && annotation ? projectHitAnnotation(reference, annotation) : [], [reference, annotation]);
  const allMarkers = useMemo(() => [...beats, ...hits].sort((a, b) => a.time - b.time), [beats, hits]);
  const visibleMarkers = useMemo(() => allMarkers.filter(marker => shownKinds.includes(marker.kind)), [allMarkers, shownKinds]);
  const instrumentMarksActive = saved?.key === key && saved.instrumentMarksActive && reference?.type === "music";
  const snapTimes = useMemo(() => [...new Set((instrumentMarksActive ? hits : allMarkers.filter(marker => snapKinds.includes(marker.kind))).map(marker => Number(marker.time.toFixed(6))))].sort((a, b) => a - b), [allMarkers, hits, snapKinds, instrumentMarksActive]);
  const { previous, next } = adjacentMusicalBeats(visibleMarkers, playhead);
  const setKind = (target: "show" | "snap", kind: MusicalMarkerKind, enabled: boolean) => {
    const current = target === "show" ? shownKinds : snapKinds;
    const nextKinds = enabled ? [...new Set([...current, kind])] : current.filter(entry => entry !== kind);
    if (target === "show") setShownKinds(nextKinds); else setSnapKinds(nextKinds);
    saveSettings(target === "show" ? { shownKinds: nextKinds } : { snapKinds: nextKinds });
  };
  const controls = (element: TimelineElement | null) => {
    if (!projectId || !element?.source_url || !WAVEFORM_SUPPORTED_TYPES.has(element.type) || element.props?.runtime_source_has_audio === false) return null;
    const active = reference?.id === element.id && show;
    return <div className="grid gap-2 text-xs" aria-label="Musical beats">
      <div className="flex items-center gap-2">
      {element.type === "music" && <Button
        type="button"
        variant="outline" size="sm"
        className="h-8 min-w-0 flex-1 px-2 text-xs"
        onClick={() => setInspectedTrack({
          sourceUrl: element.source_url!,
          clip: element,
          trackName: typeof element.props?.title === "string" && element.props.title.trim()
            ? element.props.title
            : "Music clip",
        })}
      ><AudioLinesIcon size={14} />Review hits</Button>}
        <Button type="button" variant={active ? "secondary" : "outline"} size="sm" className="h-8 min-w-0 flex-1 px-2 text-xs" aria-label="Use rhythm map across timeline" aria-pressed={active} onClick={() => {
          setChosen(element.id); setShow(!active);
          saveSettings({ chosen: element.id, show: !active });
        }}><MapIcon size={14} />Markers {active ? "on" : "off"}</Button>
      </div>
      {element.type === "music" && <Button type="button" variant="outline" size="sm" className="h-8 text-xs" aria-pressed={expandedId === element.id} onClick={() => expand(expandedId === element.id ? null : element.id)}><AudioLinesIcon size={14} />{expandedId === element.id ? "Hide instrument rows" : "Show instrument rows"}</Button>}
      {active && <>
        {!annotation && <button type="button" disabled={busy} onClick={() => void load(true)} className="justify-self-start rounded border px-3 py-1.5 disabled:opacity-50">{busy ? "Analyzing rhythm…" : "Analyze rhythm"}</button>}
        <span role="status" className="text-xs text-[var(--ink-muted)]">{busy ? "Reading or preparing rhythm analysis…" : annotation ? `${beats.length} beats · ${hits.length} hits · ${annotation.tempo_bpm.toFixed(1)} BPM (estimated)` : "No rhythm map yet"}</span>
        {!!allMarkers.length && <>
          <div className={`grid ${instrumentMarksActive ? "grid-cols-[minmax(0,1fr)_44px]" : "grid-cols-[minmax(0,1fr)_44px_44px]"} items-center gap-x-2 gap-y-1 text-xs`} aria-label="Rhythm marker filters">
            <span className="text-[var(--ink-muted)]">Marker</span><span className="text-center text-[var(--ink-muted)]">Show</span>{!instrumentMarksActive && <span className="text-center text-[var(--ink-muted)]">Snap</span>}
            {markerKinds.filter(entry => allMarkers.some(marker => marker.kind === entry.kind)).map(entry => <div key={entry.kind} className="col-span-3 grid grid-cols-subgrid items-center">
              <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: entry.color }} />{entry.label}</span>
              <input aria-label={`Show ${entry.label}`} type="checkbox" checked={shownKinds.includes(entry.kind)} onChange={event => setKind("show", entry.kind, event.target.checked)} />
              {!instrumentMarksActive && <input aria-label={`Snap to ${entry.label}`} type="checkbox" checked={snapKinds.includes(entry.kind)} onChange={event => setKind("snap", entry.kind, event.target.checked)} />}
            </div>)}
          </div>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Previous shown rhythm marker" disabled={!previous} onClick={() => previous && onSeek(previous.time)} className="disabled:opacity-40">← Previous shown</button>
            <button type="button" aria-label="Next shown rhythm marker" disabled={!next} onClick={() => next && onSeek(next.time)} className="disabled:opacity-40">Next shown →</button>
          </div>
        </>}
        {message && <span role="alert" className="text-xs">{message}</span>}
      </>}
    </div>;
  };
  return {
    controls,
    rhythmView: expandedClip && projectId ? { projectId, clip: expandedClip, onClose: () => expand(null), onReview: () => setInspectedTrack({ sourceUrl: expandedClip.source_url!, clip: expandedClip, trackName: String(expandedClip.props?.title || "Music clip") }) } satisfies TimelineRhythmView : undefined,
    viewer: inspectedTrack && projectId ? <LibraryRhythmInspector
      projectId={projectId}
      sourceUrl={inspectedTrack.sourceUrl}
      trackName={inspectedTrack.trackName}
      clip={inspectedTrack.clip}
      marks={marks}
      onClose={() => setInspectedTrack(null)}
    /> : null,
    markers: show ? visibleMarkers : [],
    snapTimes: show ? snapTimes : [],
    referenceId: reference?.id,
  };
}
