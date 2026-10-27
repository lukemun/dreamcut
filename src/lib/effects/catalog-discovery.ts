import type { GuideEffect } from './guide';

/** Browsing metadata never changes the recipe's editing/application contract. */
export function catalogType(effect: GuideEffect): 'Look' | 'Template' | 'Effect' {
  if (effect.kind === 'look') return 'Look';
  // Word Search Trace is a template effect: it stays in the Templates gallery under Effects.
  return effect.brings ? 'Template' : 'Effect';
}
/** User-facing names describe the result, while stored filter URLs remain compatible. */
export function catalogLabel(effect: GuideEffect): string {
  return {Look:'Look', Template:'Motion graphic', Effect:'Effect'}[catalogType(effect)];
}
export const CATALOG_CATEGORIES = [
  {value:'All', label:'All'}, {value:'Look', label:'Looks'},
  {value:'Effect', label:'Effects'},
] as const;
export const isCatalogEntry = (effect: GuideEffect) => catalogType(effect) !== 'Template' && effect.id !== 'FX-SCRATCHPAD';

export function catalogSource(effect: GuideEffect): 'user' | 'shared' | 'community' {
  return effect.source === 'community' ? 'community' : effect.origin === 'user' ? 'user' : 'shared';
}
export function matchesCatalog(effect: GuideEffect, filters: { type: string; family: string; query: string }) {
  return (filters.type === 'All' || catalogType(effect) === filters.type)
    && (filters.family === 'All' || effect.family?.title === filters.family)
    && `${effect.title} ${effect.description} ${effect.family?.title ?? ''} ${catalogType(effect)} ${catalogLabel(effect)}`.toLowerCase().includes(filters.query.trim().toLowerCase());
}
