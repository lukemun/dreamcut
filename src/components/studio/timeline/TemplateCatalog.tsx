'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentCount, SegmentedControl } from '@/components/ui/segmented-control';
import { MediaGallery } from '@/components/ui/media-gallery';
import type { GuideEffect } from '@/lib/effects/guide';
import { groupGuideEffects } from '@/lib/effects/guide-groups';
import { recipeHasExample, recipeMediaUrl, recipeVisualFor } from '@/lib/effects/recipe-visuals';
import { creatorGuideFor } from '@/lib/effects/creator-guides';
import { effectRecipeQuickRequest } from '@/lib/effects/agent-request';
import { RecipeIngredients, RecipeResult, RecipeStages, recipeExampleMedia } from './RecipeVisualOverview';
import { RecordedEffectPreview, recordedPreviewEvents } from './RecordedEffectPreview';
import { EffectAgentRequest } from './EffectAgentRequest';
import { InspectorDisclosure } from './InspectorHierarchy';

type Origin = 'all' | 'user' | 'shared';
type Example = { title: string; video: string; poster?: string };

function ExampleCredit({ label, credit, sourceUrl }: { label: string; credit: string; sourceUrl?: string }) {
  const url = sourceUrl ?? credit.match(/https?:\/\/[^\s;]+/)?.[0];
  const name = credit.split(';')[0].replace(' · Instagram tutorial reference', '');
  return <p className="template-credit">{label}: {url && /^https?:\/\//.test(url)
    ? <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
    : name}</p>;
}

/** The teaching media's credit; its reference sentence is dropped when the linked "Inspired by" line names it. */
function footageCredit(credit: string, linkedReference: boolean) {
  const reference = credit.search(/ (Effect reference:|Inspired by )/);
  return linkedReference && reference > 0 ? credit.slice(0, reference) : credit;
}

/** What a creator gathers for a template: its guide's inputs, else its own directions or needs. */
function templateNeeds(effect: GuideEffect): { title: string; directions?: string }[] {
  const guided = creatorGuideFor(effect)?.inputs ?? effect.inputDirections;
  if (guided?.length) return guided;
  const visual = recipeVisualFor(effect)?.inputs.filter(input => input.role === 'supply') ?? [];
  if (visual.length) return visual.map(input => ({ title: input.label }));
  return (effect.needs ?? []).map(title => ({ title }));
}

/** Variant families keep their heading; consecutive single templates share one gallery.
 * Only templates with an example are grouped; the rest gather in one quiet list after them. */
function galleryGroups(effects: GuideEffect[]) {
  const groups: { key: string; title?: string; effects: GuideEffect[] }[] = [];
  for (const group of groupGuideEffects(effects)) {
    const last = groups.at(-1);
    if (!group.title && last && !last.title) last.effects.push(...group.effects);
    else groups.push({ key: group.key, title: group.title, effects: [...group.effects] });
  }
  return groups;
}

const effectKey = (effect: GuideEffect) => `${effect.origin ?? 'shared'}-${effect.id ?? effect.skill}`;

/** A poster card: the example plays on hover or focus; clicking opens the detail. */
function TemplateCard({ effect, preview, onOpen }: { effect: GuideEffect; preview: boolean; onOpen: () => void }) {
  const visual = recipeVisualFor(effect);
  const video = visual?.video ?? effect.video;
  const poster = visual?.poster ?? (effect.poster ? recipeMediaUrl(effect.poster) : undefined);
  const still = effect.image ?? effect.poster;
  return <button type="button" onClick={onOpen} {...(preview ? recordedPreviewEvents : {})} className="template-card" data-template-key={effectKey(effect)}>
    {video ? <RecordedEffectPreview gallery src={poster ? recipeMediaUrl(video) : `${recipeMediaUrl(video)}#t=1`} poster={poster} className="template-card-media" />
      : still ? <img data-media-preview src={recipeMediaUrl(still)} alt="" loading="lazy" decoding="async" className="template-card-media" /> : null}
    <TemplateCardText effect={effect} />
  </button>;
}

function TemplateCardText({ effect, fullTitle = false }: { effect: GuideEffect; fullTitle?: boolean }) {
  return <>
    <span className="template-card-title">{fullTitle ? effect.title : effect.family?.variant ?? effect.title}</span>
    <span className="template-card-description">{effect.description}</span>
  </>;
}

/** The example first, then what goes in, what happens, and how to ask for it. */
function TemplateDetail({ effect, variants, onSelect, onBack, request, onWatchExample, layout, children }: {
  effect: GuideEffect; variants: GuideEffect[]; onSelect: (effect: GuideEffect) => void; onBack: () => void; request: string;
  onWatchExample?: (example: Example) => void; layout: 'panel' | 'page'; children?: ReactNode;
}) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const visual = recipeVisualFor(effect);
  const example = recipeHasExample(effect);
  const media = recipeExampleMedia(effect);
  const needs = templateNeeds(effect);
  return <>
    <header className="template-detail-header">
      <Button variant="ghost" size="icon-sm" aria-label="Back to all templates" title="All templates" onClick={onBack}><ChevronLeft aria-hidden="true" /></Button>
      <h2>{effect.title}</h2>
    </header>
    {variants.length > 1 && <SegmentedControl size="sm" wrap role="group" className="template-variants" aria-label={`${effect.family?.title} variants`}>
      {variants.map(variant => <button key={variant.id} type="button" aria-pressed={variant.id === effect.id}
        onClick={() => onSelect(variant)}>{variant.family?.variant}</button>)}
    </SegmentedControl>}
    {example ? <section aria-labelledby="template-example-title" className="template-detail-section">
      <h3 id="template-example-title" className="template-section-title">Example</h3>
      <div className="template-detail">
        <div className="template-detail-result"><RecipeResult effect={effect} heading={false} maxHeight={layout === 'page' ? 'min(65vh, 560px)' : 'min(52vh, 420px)'}
          onWatch={onWatchExample && media ? () => onWatchExample({ title: effect.title, ...media }) : undefined} /></div>
        <div className="template-detail-side"><RecipeIngredients effect={effect} suppliedTitle="Made from" /></div>
      </div>
    </section> : <p className="template-detail-lead">{effect.description}</p>}
    {visual && <section className="template-detail-section"><RecipeStages effect={effect} /></section>}
    <section aria-labelledby="template-use-title" className="template-detail-section">
      <h3 id="template-use-title" className="template-section-title">Make your own</h3>
      <ol className="template-steps">
        <li><strong>{effect.brings?.step ?? 'Gather your footage'}</strong>
          {needs.length ? <ul>{needs.map(need => <li key={need.title}><span>{need.title}</span>{need.directions && <span> — {need.directions}</span>}</li>)}</ul> : null}
        </li>
        <li><strong>Paste this into chat</strong>{effect.brings ? '' : ' and add your clips'}
          <EffectAgentRequest compact key={request} request={request} />
        </li>
        <li><strong>Watch it in Proposals</strong>, adjust the sliders, then click Apply</li>
      </ol>
    </section>
    <div className="template-detail-footer">
      {children}
      {effect.limitations?.length ? <InspectorDisclosure title="Limitations" open={limitsOpen} onOpenChange={setLimitsOpen}><ul className="list-disc pl-4 text-sm">{effect.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul></InspectorDisclosure> : null}
      {visual && <p className="template-credit">{footageCredit(visual.credit, Boolean(effect.referenceCredit))}</p>}
      {effect.credit && !visual && <ExampleCredit label={effect.exampleKind === 'reference' ? 'Video by' : 'Example by'} credit={effect.credit} sourceUrl={effect.sourceUrl} />}
      {effect.referenceCredit && <ExampleCredit label="Inspired by" credit={effect.referenceCredit} />}
    </div>
  </>;
}

/** Poster cards (with variant families under their heading), then templates without an example as a quiet list. */
function TemplateSection({ title, effects, layout, height, preview, onOpen }: {
  title?: string; effects: GuideEffect[]; layout: 'panel' | 'page'; height: number; preview: boolean; onOpen: (effect: GuideEffect) => void;
}) {
  const plain = effects.filter(effect => !recipeHasExample(effect));
  return <section className="template-section" aria-label={title}>
    {title && <h3 className="template-section-heading">{title}</h3>}
    {galleryGroups(effects.filter(recipeHasExample)).map(group => <div key={group.key} className="template-group" role={group.title ? 'group' : undefined} aria-label={group.title}>
      {group.title && <h4 className="template-group-title">{group.title} <span>· {group.effects.length} {group.effects.length === 1 ? "variant" : "variants"}</span></h4>}
      <MediaGallery evenRows targetHeight={height} minCardWidth={layout === 'page' ? 170 : 150} gap={layout === 'page' ? 24 : 16}>{group.effects.map(effect =>
        <TemplateCard key={effectKey(effect)} effect={effect} preview={preview} onOpen={() => onOpen(effect)} />)}</MediaGallery>
    </div>)}
    {plain.length > 0 && <div className="template-group">
      {plain.length < effects.length && <h4 className="template-group-title">More templates</h4>}
      <ul className="template-plain-list">{plain.map(effect => <li key={effectKey(effect)}>
        <button type="button" className="template-card" data-template-key={effectKey(effect)} onClick={() => onOpen(effect)}><TemplateCardText effect={effect} fullTitle /></button>
      </li>)}</ul>
    </div>}
  </section>;
}

/**
 * The one template browser: Properties → Templates, the Library's Templates tab and Guide → Effects.
 * Poster cards for templates with an example, plain rows for those without, then one detail view.
 * `layout="panel"` scrolls inside its drawer; `layout="page"` lets the page scroll.
 * `detailExtras` adds host-specific detail content (saving settings, sharing, build guidance).
 */
export function TemplateCatalog({ effects, layout, active = true, loading = false, error, warning, requestFor = effect => effectRecipeQuickRequest(effect), onWatchExample, detailExtras, galleryHeight }: {
  effects: GuideEffect[]; layout: 'panel' | 'page'; active?: boolean; loading?: boolean; error?: string; warning?: string;
  requestFor?: (effect: GuideEffect) => string; onWatchExample?: (example: Example) => void;
  detailExtras?: (effect: GuideEffect, controls: { close: () => void }) => ReactNode; galleryHeight?: number;
}) {
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<Origin>('all');
  const [selected, setSelected] = useState<GuideEffect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Opening or leaving a detail starts at its top; the first render never moves the page.
  const shownKey = selected ? effectKey(selected) : '';
  const lastKey = useRef(shownKey);
  const keyboardBack = useRef(false);
  useEffect(() => {
    if (lastKey.current === shownKey) return;
    const previous = lastKey.current;
    lastKey.current = shownKey;
    // Keyboard place: Back takes focus in a detail; leaving it returns focus to the card that opened it.
    const target = shownKey ? root.current?.querySelector<HTMLElement>('.template-detail-header button')
      : keyboardBack.current ? root.current?.querySelector<HTMLElement>(`[data-template-key="${CSS.escape(previous)}"]`) : null;
    target?.focus({ preventScroll: true });
    if (!shownKey && target) { target.scrollIntoView({ block: 'center' }); return; }
    if (layout === 'panel') scroller.current?.scrollTo({ top: 0 });
    else if ((root.current?.getBoundingClientRect().top ?? 0) < 0) root.current?.scrollIntoView({ block: 'start' });
  }, [shownKey, layout]);
  useEffect(() => {
    if (!active) root.current?.querySelectorAll('video').forEach(video => { video.pause(); video.currentTime = 0; });
  }, [active]);
  const matching = effects.filter(effect => `${effect.title} ${effect.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const originOf = (effect: GuideEffect): Exclude<Origin, 'all'> => effect.origin === 'user' ? 'user' : 'shared';
  const counts = { all: matching.length, user: matching.filter(effect => originOf(effect) === 'user').length, shared: matching.filter(effect => originOf(effect) === 'shared').length };
  // The filter appears only when there is something of the creator's own to filter by.
  const hasOwn = effects.some(effect => originOf(effect) === 'user');
  const shownOrigin: Origin = hasOwn ? origin : 'all';
  const visible = matching.filter(effect => shownOrigin === 'all' || originOf(effect) === shownOrigin);
  // Under All, the creator's own templates and shared ones read as two titled sections.
  const sections = (['user', 'shared'] as const).map(value => ({ value, effects: visible.filter(effect => originOf(effect) === value) })).filter(section => section.effects.length);
  const titled = shownOrigin === 'all' && sections.length > 1;
  const height = galleryHeight ?? (layout === 'page' ? 240 : 180);
  return <div ref={root} className="recipe-catalog" data-layout={layout}>
    {!selected && <div className="template-toolbar">
      <div className="template-search"><Search size={16} aria-hidden="true" />
        <Input type="search" aria-label="Search templates" placeholder="Search templates…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      {hasOwn && <SegmentedControl size={layout === 'page' ? 'md' : 'sm'} role="group" aria-label="Show templates" className="template-origin">{([['all', 'All'], ['user', 'Yours'], ['shared', 'Shared']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={shownOrigin === value} onClick={() => setOrigin(value)}>{label}<SegmentCount>{counts[value]}</SegmentCount></button>)}</SegmentedControl>}
    </div>}
    <div ref={scroller} className="template-scroller">
      {selected ? <TemplateDetail key={effectKey(selected)} effect={selected} layout={layout} request={requestFor(selected)} onWatchExample={onWatchExample}
        variants={selected.family ? effects.filter(effect => effect.family?.id === selected.family?.id && effect.origin === selected.origin) : []}
        onSelect={setSelected} onBack={() => { keyboardBack.current = document.activeElement?.matches(':focus-visible') ?? false; setSelected(null); }}>
        {detailExtras?.(selected, { close: () => setSelected(null) })}
      </TemplateDetail> : <>
        {loading ? <p role="status" className="template-status">Loading templates…</p> : error ? <p role="alert" className="template-status">{error}</p> : !visible.length ? <p className="template-status">No matching templates.</p> : null}
        {warning && <p role="status" className="template-status">{warning}</p>}
        {sections.map(section => <TemplateSection key={section.value} title={titled ? section.value === 'user' ? 'Your templates' : 'Shared templates' : undefined}
          effects={section.effects} layout={layout} height={height} preview={active} onOpen={setSelected} />)}
      </>}
    </div>
  </div>;
}
