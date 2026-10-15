'use client';
import { SUBJECT_WINDOW_DEFAULTS, SUBJECT_WINDOW_RANGES, normalizeSubjectWindowMode, type SubjectWindowNumberField } from '@/lib/timeline/subject-window';
import { InspectorEffectNumber } from './InspectorEffectNumber';
import { InspectorPropertyControl } from './InspectorPropertyControl';
import { InspectorItemHeader } from './InspectorHierarchy';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';

type Clip = { id: string; type: string; source_url: string | null; removed_at?: string | null; props?: Record<string, unknown> | null };

const rows = [
  ["subject_window_feather", "Edge softness", 1, "px", 1],
  ["subject_window_expand", "Expand edge", 1, "px", 1],
  ["subject_window_strength", "Strength", 100, "%", 1],
] as const satisfies readonly (readonly [SubjectWindowNumberField, string, number, string, number])[];

const RESET = { ...SUBJECT_WINDOW_DEFAULTS, subject_window_mode: "inside", subject_window_enabled: true };
const REMOVE = { subject_window_parent_id: null, subject_window_mask: null, subject_window_enabled: null, subject_window_mode: null,
  subject_window_feather: null, subject_window_expand: null, subject_window_strength: null };

/** Show this clip only inside (or outside) another clip's moving subject. The subject clip owns timing and placement. */
export function SubjectWindowControls({ props, elements, onPreview, onPatch }: {
  props: Record<string, unknown>; elements: readonly Clip[];
  onPreview: (patch: Record<string, unknown> | null) => void; onPatch: (patch: Record<string, unknown>) => void;
}) {
  if (typeof props.subject_window_parent_id !== 'string' || !props.subject_window_mask) return null;
  const enabled = props.subject_window_enabled !== false;
  const subject = elements.find(element => element.id === props.subject_window_parent_id && !element.removed_at);
  // The prepared mask belongs to the subject's footage, so any clip of the same footage can carry the window.
  const candidates = subject ? elements.filter(element => !element.removed_at && element.type === 'video_clip' && element.source_url === subject.source_url) : [];
  const name = (clip: Clip) => String(clip.props?.title ?? clip.props?.label ?? 'Video clip');
  const mode = normalizeSubjectWindowMode(props.subject_window_mode);
  return <div className="grid gap-3 border-t border-[var(--chrome-line)] pt-3" role="group" aria-label="Subject Window effect">
    <InspectorItemHeader title="Subject Window" enabled={enabled} onEnabledChange={value => onPatch({ subject_window_enabled: value })} actions={<>
      <Button variant="ghost" size="sm" aria-label="Reset Subject Window" onClick={() => onPatch(RESET)}>Reset</Button>
      <Button variant="ghost" size="sm" aria-label="Remove Subject Window" onClick={() => onPatch(REMOVE)}>Remove</Button>
    </>} />
    {enabled ? <>
      <InspectorPropertyControl fields="subject_window_parent_id" label="Subject" disabled onReset={() => {}}>
        {subject ? <NativeSelect aria-label="Subject" value={subject.id} disabled={candidates.length < 2} onChange={event => onPatch({ subject_window_parent_id: event.target.value })}>
          {candidates.map((clip, index) => <option key={clip.id} value={clip.id}>{candidates.filter(other => name(other) === name(clip)).length > 1 ? `${name(clip)} (${index + 1})` : name(clip)}</option>)}
        </NativeSelect> : <span className="text-xs text-[var(--ink-muted)]">Subject clip removed</span>}
      </InspectorPropertyControl>
      <InspectorPropertyControl fields="subject_window_mode" label="Show footage" disabled={false} onReset={() => onPatch({ subject_window_mode: 'inside' })}>
        <NativeSelect aria-label="Show footage" value={mode} onChange={event => onPatch({ subject_window_mode: event.target.value })}>
          <option value="inside">Inside subject</option>
          <option value="outside">Outside subject</option>
        </NativeSelect>
      </InspectorPropertyControl>
      {rows.map(([field, label, scale, unit, step]) => {
        const [min, max] = SUBJECT_WINDOW_RANGES[field];
        const value = Number(props[field] ?? SUBJECT_WINDOW_DEFAULTS[field]) * scale;
        return <InspectorPropertyControl key={field} fields={field} label={label} disabled={false} onReset={() => onPatch({ [field]: SUBJECT_WINDOW_DEFAULTS[field] })}>
          <InspectorEffectNumber label={label} value={value} min={min * scale} max={max * scale} step={step} unit={unit}
            onPreview={next => onPreview(next === null ? null : { [field]: next / scale })} onCommit={next => onPatch({ [field]: next / scale })} />
        </InspectorPropertyControl>;
      })}
    </> : null}
  </div>;
}
