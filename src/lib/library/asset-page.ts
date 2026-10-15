/** Paging is opt-in: existing full-inventory clients retain their contract. */
export const assetArrayKeys = ['visuals', 'voice_clips', 'music_tracks', 'sfx_tracks', 'captions', 'book_visuals', 'book_audio_assets'] as const;
export type AssetPage = { nextOffset: number | null; total: number; counts: Record<string, number>; facets?: Record<string, string[]> };
/** Filter chips per category: each reads one field, may hold several values, and is matched exactly. */
const FACETS: Record<string, Record<string, (asset: Record<string, unknown>) => unknown>> = {
  music: { mood: asset => asset.moods, energy: asset => asset.energy },
  sfx: { sfx_category: asset => asset.category, motion: asset => (asset.editorial as { motion?: unknown } | undefined)?.motion },
};
const facetValues = (value: unknown) => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim().toLowerCase());
const mostCommon = (values: string[], limit = 12) => [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
export type LibrarySource = 'project' | 'catalog' | 'all';
/** Shared catalog entries (stock, reference clips) versus the creator's own media: this project's
 * imports and generations plus their personal library, which every project lists as theirs. */
export const librarySourceOf = (asset: Record<string, unknown>): Exclude<LibrarySource, 'all'> => asset.is_catalog === true && asset.is_personal !== true ? 'catalog' : 'project';
export const parseLibrarySource = (value: string | null): LibrarySource => value === 'catalog' || value === 'all' ? value : value === 'project' ? 'project' : 'all';
export function pageAssets<T extends Record<string, unknown>>(inventory: T, params: URLSearchParams): T & { page?: AssetPage } {
  const category = params.get('category');
  if (!category) return inventory;
  const groups: Record<string, string[]> = { stills: ['visuals'], videos: ['visuals'], music: ['music_tracks'], sfx: ['sfx_tracks'], audio: ['music_tracks', 'sfx_tracks'], voice: ['voice_clips'], captions: ['captions'], book: ['book_visuals', 'book_audio_assets'], layout: [] };
  if (!(category in groups)) throw new Error('Unknown asset category');
  const arrays = Object.fromEntries(assetArrayKeys.map(key => [key, (inventory[key] ?? []) as Record<string, unknown>[]]));
  const counts: Record<string, number> = { stills: arrays.visuals.filter(a => a.type === 'still').length, videos: arrays.visuals.filter(a => a.type === 'video_clip').length, music: arrays.music_tracks.length, sfx: arrays.sfx_tracks.length, voice: arrays.voice_clips.length, captions: arrays.captions.length, book: arrays.book_visuals.length + arrays.book_audio_assets.length };
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const inCategory = groups[category].flatMap(key => arrays[key].filter(a => (category !== 'stills' && category !== 'videos') || a.type === (category === 'stills' ? 'still' : 'video_clip')).map(asset => ({key, asset})));
  const facetReaders = FACETS[category] ?? {};
  const facets = Object.fromEntries(Object.entries(facetReaders).map(([name, read]) => [name, mostCommon(inCategory.flatMap(({asset}) => facetValues(read(asset))))]));
  const activeFacets = Object.entries(facetReaders).map(([name, read]) => [read, (params.get(name) ?? '').trim().toLowerCase()] as const).filter(([, value]) => value);
  // Pictures, videos, music and sounds: the creator's own media comes first and can be shown alone; the shared catalog is a separate source.
  const visualCategory = category === 'stills' || category === 'videos';
  const sourcedCategory = visualCategory || category === 'music' || category === 'sfx';
  const source = sourcedCategory ? parseLibrarySource(params.get('source')) : 'all';
  // Both visual kinds are counted so the Library can open on the kind this project actually has.
  if (visualCategory) for (const type of ['stills', 'videos'] as const) for (const kind of ['project', 'catalog'] as const)
    counts[`${type}_${kind}`] = arrays.visuals.filter(asset => asset.type === (type === 'stills' ? 'still' : 'video_clip') && librarySourceOf(asset) === kind).length;
  if (category === 'music' || category === 'sfx') for (const kind of ['project', 'catalog'] as const)
    counts[`${category}_${kind}`] = inCategory.filter(({asset}) => librarySourceOf(asset) === kind).length;
  const matching = inCategory.filter(({asset}) => (source === 'all' || librarySourceOf(asset) === source)
    && (!q || JSON.stringify(asset).toLowerCase().includes(q))
    && activeFacets.every(([read, value]) => facetValues(read(asset)).includes(value)));
  if (sourcedCategory) matching.sort((a, b) => Number(librarySourceOf(a.asset) === 'catalog') - Number(librarySourceOf(b.asset) === 'catalog'));
  const integer = (name: string, fallback: number) => { const n = Number(params.get(name) ?? fallback); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback; };
  const offset = integer('offset', 0), limit = Math.max(1, Math.min(100, integer('limit', 40)));
  const result: Record<string, unknown> = {...inventory, ...Object.fromEntries(assetArrayKeys.map(key => [key, []]))};
  for (const {key, asset} of matching.slice(offset, offset + limit)) (result[key] as unknown[]).push(asset);
  return {...result, page: {counts, total: matching.length, nextOffset: offset + limit < matching.length ? offset + limit : null, ...(Object.keys(facets).length ? {facets} : {})}} as unknown as T & {page: AssetPage};
}
export function mergeAssetPages<T extends Record<string, unknown>>(previous: T, next: T): T {
  return {...next, ...Object.fromEntries(assetArrayKeys.map(key => [key, [...previous[key] as unknown[], ...next[key] as unknown[]]]))};
}
