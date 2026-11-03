'use client';
import { recordedPreviewEvents } from './RecordedEffectPreview';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type InspectorVisualOption<T extends string> = {
  value: T; label: string; preview: ReactNode;
};
/**
 * Visual parameter choice. Focus never commits; Enter/Space select one value.
 * `inline` is for 2–4 small glyph choices (rotate, flip): one full-width row,
 * glyph beside its label, selection as the raised surface.
 */
export function InspectorVisualChoice<T extends string>({ label, value, options, onChange, disabled = false, centered = false, initialLimit, inline = false }: {
  label: string; value: T; options: readonly InspectorVisualOption<T>[];
  onChange: (value: T) => void; disabled?: boolean; centered?: boolean; initialLimit?: number; inline?: boolean;
}) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + count) % count;
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  if (inline) return <div role="radiogroup" aria-label={label} className="flex w-full min-w-0 flex-1 gap-0.5 rounded-lg bg-[var(--chrome-deep)] p-[3px]">
    {options.map((option, index) => <button key={option.value} type="button" role="radio"
      aria-checked={value === option.value} disabled={disabled} {...recordedPreviewEvents}
      tabIndex={value === option.value || (!options.some(item => item.value === value) && index === 0) ? 0 : -1}
      onClick={() => { if (value !== option.value) onChange(option.value); }}
      onKeyDown={event => moveFocus(event, index, options.length)}
      className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-md px-2 py-1 text-[length:var(--ui-text-body)] leading-tight font-medium text-[var(--ink-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)] aria-checked:bg-[var(--chrome-raised)] aria-checked:text-[var(--ink)] aria-checked:shadow-[0_1px_2px_rgb(0_0_0/25%)] disabled:opacity-40">
      <span aria-hidden="true" className="flex shrink-0 items-center">{option.preview}</span>
      <span className="whitespace-nowrap">{option.label}</span>
    </button>)}
  </div>;
  const [expanded, setExpanded] = useState(false);
  const limit = Math.max(1, initialLimit ?? options.length);
  const canCollapse = options.length > limit;
  const leading = options.slice(0, limit);
  const selected = options.find(option => option.value === value);
  const visibleOptions = expanded || !canCollapse ? options
    : selected && !leading.includes(selected) ? [...leading.slice(0, limit - 1), selected] : leading;
  // Fill the property row: in a shrink-to-fit flex item an auto-fit grid collapses to one column.
  return <div className="grid w-full min-w-0 flex-1 gap-2"><div role="radiogroup" aria-label={label} className={`${centered ? "items-start" : ""} grid w-full min-w-0 ${options.length <= 4 ? "grid-cols-[repeat(auto-fit,minmax(64px,1fr))]" : "grid-cols-[repeat(auto-fit,minmax(90px,1fr))]"} gap-2`}>
    {visibleOptions.map((option, index) => <button key={option.value} type="button" role="radio"
      aria-checked={value === option.value} disabled={disabled} {...recordedPreviewEvents}
      tabIndex={value === option.value || (!visibleOptions.some(item => item.value === value) && index === 0) ? 0 : -1}
      onClick={() => { if (value !== option.value) onChange(option.value); }}
      onKeyDown={event => moveFocus(event, index, visibleOptions.length)}
      className={`${centered ? "items-center text-center" : "text-left"} flex min-w-0 flex-col overflow-hidden rounded-md border border-transparent bg-[var(--chrome-deep)] p-2 text-[length:var(--ui-text-body)] text-[var(--ink)] hover:bg-[var(--chrome-raised)] focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)] aria-checked:border-[var(--chrome-selected-ring)] disabled:opacity-40`}>
      <span aria-hidden="true" className="mb-2 block">{option.preview}</span>
      <span className={`${centered ? "w-full" : ""} block font-medium [overflow-wrap:anywhere]`}>{value === option.value ? '✓ ' : ''}{option.label}</span>
    </button>)}
  </div>
    {canCollapse && <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${options.length} options`}</Button>}
  </div>;
}
