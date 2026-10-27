'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { InspectorVisualChoice } from './InspectorVisualChoice';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { catalogLabel, CATALOG_CATEGORIES, catalogType, matchesCatalog } from '@/lib/effects/catalog-discovery';
import type { GuideEffect } from '@/lib/effects/guide';
import { groupGuideEffects } from '@/lib/effects/guide-groups';
import { recipeHasExample, recipeMediaUrl, recipeVisualFor } from '@/lib/effects/recipe-visuals';
import { creatorGuideFor } from '@/lib/effects/creator-guides';
import { effectRecipeQuickRequest, templateSelection } from '@/lib/effects/agent-request';
import { RecipeIngredients, RecipeResult, recipeExampleMedia } from './RecipeVisualOverview';
import { RecordedEffectPreview, recordedPreviewEvents } from './RecordedEffectPreview';
import { CatalogTile, CatalogTileGrid } from './CatalogTile';
import { FilterButtons } from './FilterButtons';
import { useChatSelection } from './useChatSelection';

/** Whose templates to show: the creator's own (made or saved) or the shipped catalog; 'all' shows both, theirs first. */
type Source = 'all' | 'user' | 'catalog';
const SOURCE_LABELS = { user: 'Yours', catalog: 'Catalog' };
/** Templates build something; looks restyle a template. */
type Kind = 'templates' | 'looks';

const isLook = (effect: GuideEffect) => effect.kind === 'look';
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

/** "A, B and C", each in lower case after the first word of the sentence it joins. */
const listOf = (items: string[]) => {
  const words = items.map(item => item.charAt(0).toLowerCase() + item.slice(1));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] ?? 'your footage';
};

/** How to use this template, in the creator's words: its own inputs and the request to ask for.
 * `fromHome`: outside a project, so the first step is starting one. */
function useSteps(effect: GuideEffect, needs: { title: string }[], fromHome: boolean): string[] {
  if (isLook(effect)) return [
    ...(fromHome ? ['Start a project.'] : []),
    `${fromHome ? `In Templates → Looks, select ${effect.title}` : 'Select it here'}, and a template or a motion graphic already in your video.`,
    `Ask your agent: "${effectRecipeQuickRequest(effect)}"`,
    'Watch it in Proposals, adjust it, then click Apply.',
  ];
  const clips = !effect.brings;
  return [
    ...(fromHome ? ['Start a project.'] : []),
    effect.brings ? `${effect.brings.step}.` : `Add ${listOf(needs.map(need => need.title))} to the project.`,
    `${fromHome ? `In Templates, select ${effect.title}` : 'Select it here'}${clips ? ', then select your clips on the timeline' : ''}.`,
    `Ask your agent: "${effectRecipeQuickRequest(effect)}"`,
    'Watch it in Proposals, adjust it, then click Apply.',
  ];
}

/** Variant families keep their heading; consecutive single templates share one gallery.
 * Only templates with an example are grouped; the rest share one grid after them. */
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

/** Selecting a template joins the editor's selection, which the agent reads; it never edits. */
type TemplatePick = { isSelected: (effect: GuideEffect) => boolean; toggle: (effect: GuideEffect) => void };

/** A template is a catalog tile, the same size as Captions → Looks: its example fits whole in the tile's
 * picture and plays on hover or focus. Clicking selects it, Details opens the detail; outside a project
 * (`openOnClick`) clicking opens it. Templates without an example say so in the picture's place. */
function TemplateCard({ effect, preview, pick, onOpen, fullTitle, openOnClick }: { effect: GuideEffect; preview: boolean; pick: TemplatePick; onOpen: () => void; fullTitle: boolean; openOnClick: boolean }) {
  const visual = recipeVisualFor(effect);
  const example = recipeHasExample(effect);
  // The creator's own version leads: it is what they recognise the effect by.
  const video = effect.ownResultVideo ?? (example ? visual?.video ?? effect.video : undefined);
  const tile = (effect.ownResultVideo ? effect.tile : undefined) ?? visual?.tile ?? effect.tile;
  // A chosen tile moment replaces the poster: the tile shows that frame of the video instead.
  const poster = effect.ownResultVideo || tile?.at !== undefined ? undefined : visual?.poster ?? (effect.poster ? recipeMediaUrl(effect.poster) : undefined);
  const still = example ? effect.image ?? effect.poster : undefined;
  const title = fullTitle ? effect.title : effect.family?.variant ?? effect.title;
  // Frame the tile on the template's chosen point and moment, so its subject shows at tile size.
  const focus = tile ? { '--tile-focus': `${Math.round(tile.x * 100)}% ${Math.round(tile.y * 100)}%` } as CSSProperties : undefined;
  const picture = video ? <RecordedEffectPreview gallery deferLoad={Boolean(poster)} posterNearView src={poster || video.includes("#t=") ? recipeMediaUrl(video) : `${recipeMediaUrl(video)}#t=${tile?.at ?? 1}`} poster={poster} className="template-card-media" style={focus} />
    : still ? <img data-media-preview src={recipeMediaUrl(still)} alt="" loading="lazy" decoding="async" className="template-card-media" style={focus} />
    : <span className="template-card-name">No preview</span>;
  // The wrapper plays the example while the pointer or focus is anywhere on the tile, Details included.
  return <div className="template-card-item" data-template-key={effectKey(effect)} {...(preview && video ? recordedPreviewEvents : {})}>
    <CatalogTile label={title} detail={openOnClick ? catalogLabel(effect) : undefined} preview={picture} toggle={!openOnClick}
      selected={!openOnClick && pick.isSelected(effect)} onSelect={() => openOnClick ? onOpen() : pick.toggle(effect)}
      addLabel="Details" actionText="Details" onAdd={openOnClick ? undefined : onOpen} />
  </div>;
}

/** The example first, then what the creator supplies, how to film it, and how to start. */
function TemplateDetail({ effect, variants, onSelect, onBack, pick, onWatchExample, layout, startAction, templateNamed, discovery = false, action, children }: {
  discovery?: boolean; effect: GuideEffect; variants: GuideEffect[]; onSelect: (effect: GuideEffect) => void; onBack: () => void; pick: TemplatePick;
  /** For a look: the gallery card of a template it works with, so the detail can open it. */
  templateNamed?: (title: string) => GuideEffect | undefined;
  onWatchExample?: (example: Example) => void; layout: 'panel' | 'page'; startAction?: (effect: GuideEffect) => ReactNode; children?: ReactNode;
  /** The host's panel action (Wide's Expand), kept in reach while the details are open. */
  action?: ReactNode;
}) {
  const visual = recipeVisualFor(effect);
  const example = recipeHasExample(effect);
  const media = recipeExampleMedia(effect);
  const needs = templateNeeds(effect);
  const selected = pick.isSelected(effect);
  // A wide example needs the full width, so its Input goes beneath it; a tall one leaves room beside it.
  const [wide, setWide] = useState<boolean>();
  const readShape = (event: SyntheticEvent) => {
    const shown = event.target;
    if (!(shown instanceof HTMLVideoElement || shown instanceof HTMLImageElement) || !shown.closest('.template-detail-result')) return;
    const [w, h] = shown instanceof HTMLVideoElement ? [shown.videoWidth, shown.videoHeight] : [shown.naturalWidth, shown.naturalHeight];
    if (w && h) setWide(w / h >= 1.1);
  };
  return <>
    <header className="template-detail-header">
      <Button variant="ghost" size="icon-sm" aria-label={discovery ? 'Back to catalog' : isLook(effect) ? 'Back to all looks' : 'Back to all templates'} title={discovery ? 'Back to catalog' : isLook(effect) ? 'All looks' : 'All templates'} onClick={onBack}><ChevronLeft aria-hidden="true" /></Button>
      <h2>{effect.title}</h2>
      {/* The way to start sits with the title, so it is in view however long the detail is. */}
      {(!discovery || startAction) && <div className="template-start">
        {startAction ? startAction(effect)
          : <Button variant={selected ? 'secondary' : 'outline'} size="sm" aria-pressed={selected} onClick={() => pick.toggle(effect)}
            title={effect.brings ? 'Select, then ask your agent' : 'Select, then tell your agent which clips to use'}>
            {selected ? <><Check aria-hidden="true" />Selected</> : 'Select'}</Button>}
        {action}
      </div>}
    </header>
    {/* The example and what the creator supplies, in matching boxes (side by side when there is room,
        stacked when not), then how to film it; DreamCut's own steps stay out of the way. */}
    <div className={example ? 'template-detail' : undefined}>
      <div className="template-media" data-shape={wide === undefined ? undefined : wide ? 'wide' : 'tall'} onLoadedMetadataCapture={readShape} onLoadCapture={readShape}>
        {example ? <section className="template-media-box template-detail-result" aria-labelledby="template-result-title">
          <h3 id="template-result-title" className="template-section-title">{effect.tutorialVideo && !effect.ownResultVideo ? 'Full reference & tutorial' : 'Result'}</h3>
          <RecipeResult effect={effect} heading={false} maxHeight={layout === 'page' ? 'min(55vh, 480px)' : 'min(52vh, 420px)'}
            onWatch={onWatchExample && media ? () => onWatchExample({ title: effect.title, ...media }) : undefined} />
        </section>
          : <p className="template-detail-lead">{effect.description}</p>}
        <RecipeIngredients effect={effect} className="template-media-box" />
      </div>
      <div className="template-detail-side">
    {variants.length > 1 && <section className="template-variant-previews" aria-label="Variants">
      <h3 className="template-section-title">Variants</h3>
      <InspectorVisualChoice label={`${effect.family?.title} variants`} value={effectKey(effect)} options={variants.map(variant => {
        const media = recipeExampleMedia(variant);
        return {value: effectKey(variant), label: variant.family?.variant ?? variant.title, preview: media
          ? <RecordedEffectPreview gallery src={media.video} poster={media.poster} className="template-variant-media" />
          : <span>{catalogType(variant)}</span>};
      })} onChange={key => { const variant = variants.find(item => effectKey(item) === key); if (variant) onSelect(variant); }} />
    </section>}

        {effect.worksWith?.length ? <section aria-labelledby="template-works-title">
          <h3 id="template-works-title" className="template-section-title">Works with</h3>
          <ul className="template-works">{effect.worksWith.map(title => {
            const template = templateNamed?.(title);
            return <li key={title}>{template ? <Button variant="outline" size="sm" onClick={() => onSelect(template)}>{title}</Button> : title}</li>;
          })}</ul>
        </section> : null}
        {needs.length > 0 && !isLook(effect) && <section aria-labelledby="template-film-title">
          <h3 id="template-film-title" className="template-section-title">{effect.brings ? effect.brings.step : 'How to film'}</h3>
          <ul className="template-needs">{needs.map(need => <li key={need.title}><strong>{need.title}</strong>{need.directions && <span>{need.directions}</span>}</li>)}</ul>
        </section>}
      </div>
    </div>
    {/* Its own section across the full width, after what to supply. */}
    <section aria-labelledby="template-use-title" className="template-use-section">
      <h3 id="template-use-title" className="template-section-title">How to use</h3>
      <ol className="template-use">{useSteps(effect, needs, discovery || Boolean(startAction)).map(step => <li key={step}>{step}</li>)}</ol>
    </section>
    <div className="template-detail-footer">
      {children}
      {visual && <p className="template-credit">{footageCredit(visual.credit, Boolean(effect.referenceCredit))}</p>}
      {effect.credit && !visual && <ExampleCredit label={effect.exampleKind === 'reference' ? 'Video by' : 'Example by'} credit={effect.credit} sourceUrl={effect.sourceUrl} />}
      {effect.referenceCredit && <ExampleCredit label="Inspired by" credit={effect.referenceCredit} />}
    </div>
  </>;
}

/** One grid of tiles (variant families under their heading); templates without an example come last. */
function TemplateSection({ effects, preview, pick, onOpen, openOnClick, looks = false, unified = false }: {
  effects: GuideEffect[]; preview: boolean; pick: TemplatePick; onOpen: (effect: GuideEffect) => void; openOnClick: boolean;
  /** Look families count looks, not variants. */
  looks?: boolean; unified?: boolean;
}) {
  const groups = (unified ? [{key:'all',title:undefined,effects}] : looks ? [{ key: 'looks', title: undefined, effects: effects.filter(recipeHasExample) }]
    : [...galleryGroups(effects.filter(recipeHasExample)), { key: 'plain', title: undefined, effects: effects.filter(effect => !recipeHasExample(effect)) }])
    .filter(group => group.effects.length);
  return <section className="template-section">
    {groups.map(group => <div key={group.key} className="template-group">
      {group.title && <h4 className="template-group-title">{group.title} <span>· {group.effects.length} {looks ? (group.effects.length === 1 ? "look" : "looks") : group.effects.length === 1 ? "variant" : "variants"}</span></h4>}
      <CatalogTileGrid label={group.title ?? (looks ? 'Looks' : 'Templates')}>{group.effects.map(effect =>
        <TemplateCard key={effectKey(effect)} effect={effect} preview={preview} pick={pick} fullTitle={!group.title} onOpen={() => onOpen(effect)} openOnClick={openOnClick} />)}</CatalogTileGrid>
    </div>)}
  </section>;
}

/**
 * The one template browser: Properties → Templates, the Library's Templates tab and Guide → Effects.
 * One grid of catalog tiles, then one detail view. All · Yours · Catalog separates the creator's own templates from the shipped ones.
 * Clicking a card selects it (the shared editor selection the agent reads); Details opens it.
 * `layout="panel"` scrolls inside its drawer; `layout="page"` lets the page scroll.
 * `detailExtras` adds host-specific detail content (saving settings, sharing, build guidance).
 * `toolbarAction` sits at the end of the search row (after the source pills); `kindAction` at the end of the Effects / Looks row
 * (Wide's Expand), falling back to the search row when there are no looks to switch to; a template's details keep it beside Select.
 * `browse={false}` drops the filter and search for a short showcase.
 */
export function TemplateCatalog({ effects, layout, active = true, loading = false, error, warning, onWatchExample, detailExtras, toolbarAction, kindAction, browse = true, startAction, onDetailChange, discovery = false }: {
  discovery?: boolean; effects: GuideEffect[]; layout: 'panel' | 'page'; active?: boolean; loading?: boolean; error?: string; warning?: string;
  /** false: a short showcase without the filter and search (the home page's top rows). */
  browse?: boolean;
  /** Outside a project (the home page): cards open their details, and this replaces the Select step. */
  startAction?: (effect: GuideEffect) => ReactNode;
  /** Told when a template's details open or close, so a host can make room. */
  onDetailChange?: (open: boolean) => void;
  onWatchExample?: (example: Example) => void;
  detailExtras?: (effect: GuideEffect, controls: { close: () => void }) => ReactNode; toolbarAction?: ReactNode; kindAction?: ReactNode;
}) {
  const params = useSearchParams();
  const [localQuery, setLocalQuery] = useState('');
  // Looks open first; the creator switches to Effects (code: the 'templates' kind).
  const [kind, setKind] = useState<Kind>('looks');
  const [localSelected, setLocalSelected] = useState<GuideEffect | null>(null);
  // Guide URLs preserve the result set and detail across reloads and browser Back.
  const updateParams = (patch: Record<string, string | null>, push = false) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(patch)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history[push ? 'pushState' : 'replaceState'](null, '', url);
  };
  const query = discovery ? params.get('q') ?? '' : localQuery;
  const requestedType = discovery ? params.get('type') : null;
  const typeFilter = requestedType === 'Look' || requestedType === 'Effect' ? requestedType : 'All';
  const selected = discovery ? effects.find(effect => effectKey(effect) === params.get('item')) ?? null : localSelected;
  const setQuery = (value: string) => discovery ? updateParams({q:value}) : setLocalQuery(value);
  const setTypeFilter = (value: string) => updateParams({type:value === 'All' ? null : value, family:null});
  // Yours narrows any kind to the creator's own templates (made or saved), Catalog to the shipped ones.
  const [localSource, setLocalSource] = useState<Source>('all');
  const requestedSource = params.get('source');
  const source: Source = !discovery ? localSource : requestedSource === 'yours' ? 'user' : requestedSource === 'catalog' ? 'catalog' : 'all';
  const setSource = (value: string) => discovery ? updateParams({source:value === 'user' ? 'yours' : value === 'catalog' ? 'catalog' : null}) : setLocalSource(value as Source);
  const catalogScroll = useRef(0);
  const setSelected = (value: GuideEffect | null) => {
    if (value && !selected) catalogScroll.current = scroller.current?.scrollTop ?? root.current?.closest('.guide-page-body')?.scrollTop ?? 0;
    return discovery ? updateParams({item:value ? effectKey(value) : null}, true) : setLocalSelected(value);
  };
  const selection = useChatSelection('templates');
  const pick: TemplatePick = {
    isSelected: effect => selection.selectedIds.has(templateSelection(effect).id),
    toggle: effect => selection.toggle(templateSelection(effect)),
  };
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Opening or leaving a detail starts at its top; the first render never moves the page.
  const shownKey = selected ? effectKey(selected) : '';
  const detailOpen = Boolean(selected);
  useEffect(() => { onDetailChange?.(detailOpen); }, [detailOpen, onDetailChange]);
  const lastKey = useRef(shownKey);
  const keyboardBack = useRef(false);
  useEffect(() => {
    if (lastKey.current === shownKey) return;
    const previous = lastKey.current;
    lastKey.current = shownKey;
    const previousEffect = effects.find(effect => effectKey(effect) === previous);
    if (previousEffect?.family && selected?.family?.id === previousEffect.family.id) return;
    // Keyboard place: Back takes focus in a detail; leaving it returns focus to the card that opened it.
    const target = shownKey ? root.current?.querySelector<HTMLElement>('.template-detail-header button')
      : keyboardBack.current ? root.current?.querySelector<HTMLElement>(`[data-template-key="${CSS.escape(previous)}"] article > button:last-of-type`) : null;
    target?.focus({ preventScroll: true });
    if (!shownKey) {
      const scrollHost = layout === 'panel' ? scroller.current : root.current?.closest('.guide-page-body');
      scrollHost?.scrollTo({top:catalogScroll.current});
      return;
    }
    if (layout === 'panel') scroller.current?.scrollTo({ top: 0 });
    else { const page = root.current?.closest('.guide-page-body'); if (page) page.scrollTop = 0; else if ((root.current?.getBoundingClientRect().top ?? 0) < 0) root.current?.scrollIntoView({ block: 'start' }); }
  }, [shownKey, layout, effects, selected]);
  useEffect(() => {
    if (!active) root.current?.querySelectorAll('video').forEach(video => { video.pause(); video.currentTime = 0; });
  }, [active]);
  // Looks sit beside templates as their own kind; the short showcase shows templates only.
  const hasLooks = browse && effects.some(isLook);
  const shownKind: Kind = hasLooks ? kind : 'templates';
  const ofKind = effects.filter(effect => !browse ? true : discovery ? matchesCatalog(effect, {type:typeFilter, family:'All', query:''}) : isLook(effect) === (shownKind === 'looks'));
  const matching = ofKind.filter(effect => `${effect.title} ${effect.description} ${effect.family?.title ?? ''} ${catalogType(effect)} ${catalogLabel(effect)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const originOf = (effect: GuideEffect): Exclude<Source, 'all'> => effect.origin === 'user' || effect.fromYours ? 'user' : 'catalog';
  // The pills appear once the creator has templates of their own; until then everything is the catalog.
  const hasOwn = browse && effects.some(effect => originOf(effect) === 'user');
  const shownSource = hasOwn ? source : 'all';
  const visible = matching.filter(effect => shownSource === 'all' || originOf(effect) === shownSource);
  // The creator's own templates come first; the pills name the split, so the sections carry no headings.
  const sections = (['user', 'catalog'] as const).map(value => ({ value, effects: visible.filter(effect => originOf(effect) === value) })).filter(section => section.effects.length);
  const sourcePills = hasOwn && <FilterButtons inline label="Source" value={shownSource} values={['user', 'catalog']} labels={SOURCE_LABELS} onChange={setSource} />;
  return <div ref={root} className="recipe-catalog" data-layout={layout} data-discovery={discovery || undefined}>
    {discovery && <div className="catalog-heading"><PageHeader id="templates-title" title="Templates" /></div>}
    {!selected && browse && discovery && <div className="catalog-toolbar">
      <div className="catalog-search-filters" role="group" aria-label="Search and filter templates">
        <div className="template-search"><Search size={16} aria-hidden="true" /><Input type="search" aria-label="Search catalog" placeholder="Search templates…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      </div>
      <div className="catalog-gallery-controls" role="group" aria-label="Filter templates">
        <SegmentedControl className="catalog-filter-pills" role="group" aria-label="Template category">
          {CATALOG_CATEGORIES.map(category => <button type="button" key={category.value} aria-pressed={typeFilter === category.value} onClick={() => setTypeFilter(category.value)}>{category.label}</button>)}
        </SegmentedControl>
        {sourcePills && <span className="catalog-source-filter">{sourcePills}</span>}
        <span role="status" className="catalog-count">{visible.length} {visible.length === 1 ? 'result' : 'results'}</span>
        {query && <Button variant="ghost" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
      </div>
    </div>}
    {!selected && browse && !discovery && <div className="template-toolbar">
      {/* Pick what to browse first; the search then looks through it. */}
      {hasLooks && <div className="template-kind-row"><SegmentedControl size={layout === 'page' ? 'md' : 'sm'} fill role="group" aria-label="Show" className="template-kind">{([['templates', 'Effects'], ['looks', 'Looks']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={shownKind === value} onClick={() => setKind(value)}>{label}</button>)}</SegmentedControl>
        {kindAction && <span className="template-toolbar-action">{kindAction}</span>}</div>}
      <div className="template-toolbar-row">
        <div className="template-search"><Search size={16} aria-hidden="true" />
          <Input type="search" aria-label={shownKind === 'looks' ? 'Search looks' : 'Search effects'} placeholder={shownKind === 'looks' ? 'Search looks…' : 'Search effects…'} value={query} onChange={event => setQuery(event.target.value)} /></div>
        {sourcePills}
        {toolbarAction && <span className="template-toolbar-action">{toolbarAction}</span>}
        {kindAction && !hasLooks && <span className="template-toolbar-action">{kindAction}</span>}
      </div>
    </div>}
    <div ref={scroller} className="template-scroller">
      {selected ? <TemplateDetail effect={selected} layout={layout} discovery={discovery} pick={pick} onWatchExample={onWatchExample} startAction={startAction} action={kindAction}
        templateNamed={title => effects.find(effect => !isLook(effect) && effect.title === title)}
        variants={selected.family ? effects.filter(effect => effect.family?.id === selected.family?.id && effect.origin === selected.origin) : []}
        onSelect={setSelected} onBack={() => { keyboardBack.current = document.activeElement?.matches(':focus-visible') ?? false; setSelected(null); }}>
        {detailExtras?.(selected, { close: () => setSelected(null) })}
      </TemplateDetail> : <>
        {loading ? <p role="status" className="template-status">Loading templates…</p> : error ? <p role="alert" className="template-status">{error}</p> : !visible.length ? <p className="template-status">{discovery ? 'No matches. Try another search or clear the filters.' : shownSource === 'user' && !query ? `None of yours yet. Save one from a template's details.` : shownKind === 'looks' ? 'No matching looks.' : 'No matching effects.'}</p> : null}
        {warning && <p role="status" className="template-status">{warning}</p>}
        {discovery ? <TemplateSection effects={visible} preview={active} pick={pick} onOpen={setSelected} openOnClick unified /> : sections.map(section => <TemplateSection unified={!browse} key={section.value}
          effects={section.effects} preview={active} pick={pick} onOpen={setSelected} openOnClick={Boolean(startAction)} looks={shownKind === 'looks'} />)}
      </>}
    </div>
  </div>;
}
