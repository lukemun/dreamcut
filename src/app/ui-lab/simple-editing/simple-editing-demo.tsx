"use client";
import { useState } from "react";
import { VisualMaskEditor } from "@/components/studio/timeline/VisualMaskEditor";
import { CutoutEffectControls } from "@/components/studio/timeline/CutoutEffectControls";
import { TransitionThumbnail } from "@/components/studio/timeline/TransitionThumbnail";
import { maskInsetStyle, readLineMaskRotation, resolveMaskInsetAtTime, upsertMaskInsetKeyframe } from "@/lib/timeline/media-transform";
import type { TimelineElement } from "@/components/studio/timeline/types";

export function SimpleEditingDemo() {
  const [history, setHistory] = useState<Record<string, unknown>[]>([{}]);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [time, setTime] = useState(0);
  const [feather, setFeather] = useState(0);
  const props = history[index];
  const commit = (next: Record<string, unknown>) => { setHistory([...history.slice(0, index + 1), { ...props, ...next }]); setIndex(index + 1); };
  const mask = resolveMaskInsetAtTime(preview ?? props, time);
  return <main style={{ minHeight: "100vh", background: "#172832", color: "white", padding: 32, fontFamily: "system-ui" }}>
    <h1 style={{ fontSize: 26 }}>Simple editing · interactive sample</h1>
    <p style={{ color: "#b8c9d3", marginBlock: 12 }}>Isolated demo. These controls are the real editor component; your project is unchanged.</p>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 420px) minmax(260px, 440px)", gap: 32 }}>
      <div data-composition-master-frame="true" style={{ position: "relative", aspectRatio: "9/16", background: "#0a171e", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, ...maskInsetStyle(mask, feather, readLineMaskRotation(preview ?? props), { width: 360, height: 640 }) }}>
          <svg viewBox="0 0 360 640" width="100%" height="100%" aria-label="Example subject">
            <rect width="360" height="640" fill="#487889"/><circle cx="180" cy="195" r="62" fill="#e4b697"/><path d="M70 540V340Q180 255 290 340V540Z" fill="#b4d6c6"/><path d="M118 190Q105 100 180 100Q260 100 242 190L220 146H137Z" fill="#403231"/>
            <text x="180" y="600" textAnchor="middle" fill="white" fontSize="18">Selected layer</text>
          </svg>
        </div>
      </div>
      <section style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <h2>Applied effects</h2>
        <CutoutEffectControls element={{ props: { ...props, custom_cutout_receipt: { scratchpad_treatment: {} } } }} onPreview={setPreview} onPatch={commit} />
        <h2>Shape mask</h2>
        <label>Feather <input aria-label="Demo feather" type="range" min="0" max="0.5" step="0.01" value={feather} onChange={e => setFeather(Number(e.target.value))} /></label>
        <VisualMaskEditor element={{ id: "demo", props, type: "still" } as TimelineElement} time={time} commit={commit} clear={() => setPreview(null)} preview={(v, rotation) => setPreview({ ...props, mask_inset: [Number(v.top)/100, Number(v.right)/100, Number(v.bottom)/100, Number(v.left)/100], ...(rotation != null ? { mask_line_rotation: rotation } : {}), keyframes: undefined })} />
        <div style={{ display: "flex", gap: 20 }}>
          <button disabled={index === 0} onClick={() => setIndex(index - 1)}>Undo</button>
          <button disabled={index === history.length - 1} onClick={() => setIndex(index + 1)}>Redo</button>
          <button onClick={() => commit(upsertMaskInsetKeyframe(props, time, resolveMaskInsetAtTime(props, time)))}>◇ Add keyframe</button>
        </div>
        <label>Playhead: {time}s <input aria-label="Demo playhead" type="range" min="0" max="5" step="1" value={time} onChange={e => setTime(Number(e.target.value))} /></label>
        <output aria-label="Saved edits">Saved edits: {index}</output>
        <pre aria-label="Mask data" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(props, null, 2)}</pre>
        <h2>Transition samples</h2>
        <div style={{ display: "flex", gap: 12 }}>{(["fade", "slide", "wipe"] as const).map(type => <div key={type}><TransitionThumbnail type={type}/>{type}</div>)}</div>
      </section>
    </div>
  </main>;
}
