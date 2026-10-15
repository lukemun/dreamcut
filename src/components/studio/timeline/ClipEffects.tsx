'use client';
import { useState, type ReactNode } from 'react';
import { RecordedEffectPreview, recordedPreviewEvents } from './RecordedEffectPreview';
import { InspectorItemHeader } from './InspectorHierarchy';
import { Button } from '@/components/ui/button';
import { subjectEffectState, subjectEffectPreset, removeSubjectEffect, setSubjectEffectEnabled, type SubjectEffect } from '@/lib/timeline/clip-effects';
import { gradientMapPreset, gradientMapRemovalPatch, hasGradientMapData } from '@/lib/timeline/gradient-map';
import { glitchPreset, glitchRemovalPatch, hasGlitchData } from '@/lib/timeline/glitch';
import type { LookEffect } from './ClipLookControls';

type Props = Record<string, unknown>;
/** Picture treatments any image or video can take; subject effects need a cutout. */
const LOOK_EFFECTS = {
  glitch: { label: 'Glitch', present: hasGlitchData, preset: glitchPreset, remove: glitchRemovalPatch },
  gradient_map: { label: 'Color Map', present: hasGradientMapData, preset: gradientMapPreset, remove: gradientMapRemovalPatch },
} as const satisfies Record<LookEffect, { label: string; present: (props: Props) => boolean; preset: (props: Props) => Props; remove: (props: Props) => Props }>;
const isLook = (effect: string | null): effect is LookEffect => !!effect && Object.hasOwn(LOOK_EFFECTS, effect);

/** Selection reveals one editor; recipe discovery and construction belong in Library. */
export function ClipEffects({ props, alpha, gridControls, windowControls, appliedTreatments = [], onPatch, children, lookControls }: {
  props: Record<string, unknown>; alpha: boolean;
  gridControls?: ReactNode;
  windowControls?: ReactNode;
  appliedTreatments?: {id: string; label: string; controls: ReactNode}[];
  onPatch: (patch: Record<string, unknown>) => void; children: (effect: SubjectEffect) => ReactNode;
  lookControls?: (effect: LookEffect) => ReactNode;
}) {
  const effects = ['flash', 'glow'] as const;
  const looks = lookControls ? (Object.keys(LOOK_EFFECTS) as LookEffect[]) : [];
  const applied = effects.filter(effect => subjectEffectState(props, effect) !== 'removed');
  const appliedLooks = looks.filter(effect => LOOK_EFFECTS[effect].present(props));
  const hasGrid = !!props.grid_matte_mask;
  const hasWindow = typeof props.subject_window_parent_id === 'string' && !!props.subject_window_mask && !!windowControls;
  const [selected, setSelected] = useState<string | null>(null);
  const selectedTreatment = appliedTreatments.find(item => item.id === selected);
  const current = selectedTreatment ? selectedTreatment.id : selected === 'grid' && hasGrid ? 'grid' : selected === 'window' && hasWindow ? 'window'
    : applied.includes(selected as SubjectEffect) ? selected as SubjectEffect
    : appliedLooks.includes(selected as LookEffect) ? selected as LookEffect
    : applied[0] ?? appliedLooks[0] ?? (hasGrid ? 'grid' : hasWindow ? 'window' : appliedTreatments[0]?.id ?? null);
  const treatment = appliedTreatments.find(item => item.id === current);
  const labelFor = (effect: SubjectEffect) => effect === 'glow' ? 'Subject Glow' : 'Subject Flash';
  const tileClass = 'flex min-h-16 min-w-[112px] max-w-48 flex-1 basis-28 items-center overflow-hidden rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-panel)] text-left text-xs hover:border-[var(--chrome-focus-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)] aria-pressed:border-[var(--chrome-focus-ring)]';
  return <div className="grid min-w-0 gap-3">
    <span className="text-xs text-[var(--ink-muted)]">{applied.length + appliedLooks.length + Number(hasGrid) + Number(hasWindow) + appliedTreatments.length} applied</span>
    <div role="group" aria-label="Clip effects" className="flex flex-wrap items-start gap-2">
      {effects.filter(effect => alpha || applied.includes(effect)).map(effect => {
        const present = applied.includes(effect);
        const label = labelFor(effect);
        return <button key={effect} type="button" aria-pressed={present ? current === effect : undefined} className={tileClass} {...recordedPreviewEvents}
          onClick={() => {
            if (present) { setSelected(effect); }
            else if (alpha) { onPatch(subjectEffectPreset(props, effect)); setSelected(effect); }
          }}>
          <RecordedEffectPreview name={`effect-${effect}`} className="block h-16 w-16 shrink-0 rounded-l object-contain" />
          <span className="min-w-0 py-1"><span className="block px-2 font-medium">{label}</span>
          <span className="block px-2 pb-2 text-[var(--ink-muted)]">{present ? `${current === effect ? '✓ ' : ''}Applied` : 'Add effect'}</span></span>
        </button>;
      })}
      {looks.map(effect => {
        const present = appliedLooks.includes(effect);
        return <button key={effect} type="button" aria-pressed={present ? current === effect : undefined} className={tileClass}
          onClick={() => { if (!present) onPatch(LOOK_EFFECTS[effect].preset(props)); setSelected(effect); }}>
          <span className="min-w-0 py-1"><span className="block px-2 font-medium">{LOOK_EFFECTS[effect].label}</span>
          <span className="block px-2 pb-2 text-[var(--ink-muted)]">{present ? `${current === effect ? '✓ ' : ''}Applied` : 'Add effect'}</span></span>
        </button>;
      })}
      {hasGrid && <Button variant="outline" aria-pressed={current === 'grid'} onClick={() => { setSelected('grid'); }}>Moving Grid Matte · Applied</Button>}
      {hasWindow && <Button variant="outline" aria-pressed={current === 'window'} onClick={() => { setSelected('window'); }}>Subject Window · Applied</Button>}
      {appliedTreatments.map(item => <Button key={item.id} variant="outline" aria-pressed={current === item.id} onClick={() => setSelected(item.id)}>{item.label} · Applied</Button>)}
    </div>
    {treatment ? <div role="group" aria-label={`${treatment.label} effect`} className="grid gap-3 border-t border-[var(--chrome-line)] pt-3"><InspectorItemHeader title={treatment.label} />{treatment.controls}</div> : current === 'grid' ? gridControls : current === 'window' ? windowControls : isLook(current) && lookControls ? <div role="group" aria-label={`${LOOK_EFFECTS[current].label} effect`} className="grid gap-3 border-t border-[var(--chrome-line)] pt-3">
      <InspectorItemHeader title={LOOK_EFFECTS[current].label} actions={<>
        <Button variant="ghost" size="sm" aria-label={`Reset ${LOOK_EFFECTS[current].label}`} onClick={() => onPatch(LOOK_EFFECTS[current].preset(props))}>Reset</Button>
        <Button variant="ghost" size="sm" aria-label={`Remove ${LOOK_EFFECTS[current].label}`} onClick={() => { onPatch(LOOK_EFFECTS[current].remove(props)); setSelected(null); }}>Remove</Button>
      </>} />
      {lookControls(current)}
    </div> : current ? <div role="group" aria-label={`${labelFor(current as SubjectEffect)} effect`} className="grid gap-3 border-t border-[var(--chrome-line)] pt-3">
      <InspectorItemHeader title={labelFor(current as SubjectEffect)} enabled={subjectEffectState(props, current as SubjectEffect) === 'enabled'} onEnabledChange={value => onPatch(setSubjectEffectEnabled(props, current as SubjectEffect, value))} actions={<>
        <Button variant="ghost" size="sm" aria-label={`Reset ${labelFor(current as SubjectEffect)}`} onClick={() => onPatch(subjectEffectPreset(props, current as SubjectEffect))}>Reset</Button>
        <Button variant="ghost" size="sm" aria-label={`Remove ${labelFor(current as SubjectEffect)}`} onClick={() => onPatch(removeSubjectEffect(props, current as SubjectEffect))}>Remove</Button>
      </>} />
      {subjectEffectState(props, current as SubjectEffect) === 'enabled' ? children(current as SubjectEffect) : <p className="m-0 text-xs text-[var(--ink-muted)]">Off</p>}
    </div> : null}
  </div>;
}
