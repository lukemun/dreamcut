"use client";

import { useState, type ReactNode } from "react";
import { EffectRecipeDetails } from "./EffectRecipeInstructions";
import { TemplateCatalog } from "./TemplateCatalog";
import rhythm from "./guide-rhythm.json";
import styles from "./GuideEffects.module.css";
import type { GuideEffect } from "@/lib/effects/guide";

const media = "/guide/effects/";
export { guideEffects } from "@/lib/effects/guide-examples";

function RhythmInput() {
  const [time, setTime] = useState(0);
  return <div className={styles.rhythm}>
    <p>Motivation · Feel Good — Opening rhythm</p>
    <svg viewBox="0 0 450 140" role="img" aria-label="Opening rhythm with eight selected drum and melody hits">
      {rhythm.lanes.map((lane, row) => <g key={lane.id}>
        <text x="8" y={28 + row * 38}>{lane.label}</text>
        {lane.peaks.map((peak, i) => <line key={i} x1={68 + i * 2} x2={68 + i * 2} y1={24 + row * 38 - peak * 14} y2={24 + row * 38 + peak * 14} className={styles.wave} />)}
        {lane.hits.map(hit => <g key={hit} className={styles.hit}><line x1={68 + hit / rhythm.duration * 360} x2={68 + hit / rhythm.duration * 360} y1={8 + row * 38} y2={40 + row * 38}/><circle cx={68 + hit / rhythm.duration * 360} cy={8 + row * 38} r="3"/></g>)}
      </g>)}
      <line x1={68 + time / rhythm.duration * 360} x2={68 + time / rhythm.duration * 360} y1="4" y2="117" className={styles.playhead}/>
      <text x="68" y="136">0:00</text><text x="397" y="136">0:06.4</text>
    </svg>
    <span className={styles.caption}>8 opening hits selected</span>
    <audio controls preload="metadata" src={`${media}contour-opening-audio.m4a`} aria-label="Play opening music with selected hits" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} />
  </div>;
}

/** Guide → Templates: the gallery list (`galleryTemplates`) in the shared template browser, plus collapsed build guidance. */
export function GuideEffects({ effects, warning, browse, startAction, onDetailChange, discovery = false }: { discovery?: boolean; effects: GuideEffect[]; warning?: string; browse?: boolean; startAction?: (effect: GuideEffect) => ReactNode; onDetailChange?: (open: boolean) => void }) {
  // Outside a project (the home page) the detail is only what to supply and film; build steps stay in the Guide.
  return <TemplateCatalog discovery={discovery} layout="page" effects={effects} warning={warning} browse={browse} startAction={startAction} onDetailChange={onDetailChange}
    detailExtras={startAction ? undefined : effect => <EffectRecipeDetails effect={effect}>
      {effect.useCases && <section className={styles.useCases}><h3>Use this for</h3><ul>{effect.useCases.map(useCase => <li key={useCase}>{useCase}</li>)}</ul></section>}
      {effect.skill === "layered-paper-cutout" && <RhythmInput />}
    </EffectRecipeDetails>} />;
}
