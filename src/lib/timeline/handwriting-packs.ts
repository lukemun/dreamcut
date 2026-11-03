import { getSharedFont } from '../fonts/registry';
import { PREPARED_HANDWRITING_FONTS } from './handwriting-status';

/**
 * Handwriting stroke packs are large (several MB per font), so the editor never
 * imports them statically. Each font loads on demand through a literal `import()`
 * (one async chunk per file) and is cached; renderers read loaded packs
 * synchronously and register a frame-session resource until the pack is present.
 * Node tools/tests that need every pack synchronously use `handwriting-packs-sync.ts`.
 */
export type LineStroke = { segments: { d: string; width: number; length: number }[]; region?: string; clockLength?: number };
export type HandwritingPack = {
  lineStrokes?: Record<string, LineStroke[]>;
  fontId: string;
  outlines: Record<string, { d: string; advance: number; bounds: number[] }>;
  strokes: Record<string, number[][][]>;
  widths: Record<string, number>;
  sweeps: Record<string, string[][]>;
  metrics: { unitsPerEm: number; spaceAdvance: number; kerning: Record<string, number>; baseline: number; lineHeight: number; paddingLeft: number; paddingRight: number };
};
/** Previous saved-stroke Permanent Marker route (`PermanentMarkerText`). */
export type MarkerSavedData = {
  outlines: Record<string, { d: string; advance: number; bounds: number[] }>;
  guides: Record<string, number[][][]>;
  regions: Record<string, string[]>;
  metrics: { spaceAdvance: number; kerning: Record<string, number> };
  widths: Record<string, number>;
};
export type HandwritingPackMode = 'saved_strokes' | 'line_mask';
type Assets = { saved?: HandwritingPack; line?: HandwritingPack; marker?: MarkerSavedData };

/** Asset key for the previous saved-stroke Permanent Marker data. */
export const MARKER_SAVED_ASSET_KEY = 'permanent_marker:saved_strokes';
/** Fonts with a saved-stroke pack (`HANDWRITING_PACKS` before lazy loading). */
export const SAVED_HANDWRITING_FONT_IDS: readonly string[] = Object.keys(PREPARED_HANDWRITING_FONTS);
/** Fonts with a continuous line-mask pack (`LINE_HANDWRITING_PACKS` before lazy loading). */
export const LINE_HANDWRITING_FONT_IDS: readonly string[] = [...SAVED_HANDWRITING_FONT_IDS, 'permanent_marker'];
export const hasHandwritingPack = (fontId: string, mode: HandwritingPackMode) =>
  (mode === 'line_mask' ? LINE_HANDWRITING_FONT_IDS : SAVED_HANDWRITING_FONT_IDS).includes(fontId);

type JsonModule = Promise<{ default: unknown }>;
/** Pack JSON is generated data validated by the pack tests, not by type inference. */
const json = async (module: JsonModule) => (await module).default as never;
async function preparedFont(fontId: string, ...files: JsonModule[]): Promise<Assets> {
  const [outlines, strokes, widths, metrics, sweeps, lineStrokes] = await Promise.all(files.map(json));
  const saved: HandwritingPack = { fontId, outlines, strokes, widths, metrics, sweeps };
  return { saved, line: { ...saved, lineStrokes } };
}

/** One loader per asset key. Literal paths keep each file in its own on-demand chunk. */
const LOADERS: Record<string, () => Promise<Assets>> = {
  indie_flower: () => preparedFont('indie_flower', import('./handwriting/fonts/indie-flower/outlines.json'), import('./handwriting/fonts/indie-flower/strokes.json'), import('./handwriting/fonts/indie-flower/widths.json'), import('./handwriting/fonts/indie-flower/metrics.json'), import('./handwriting/fonts/indie-flower/sweeps.json'), import('./handwriting/fonts/indie-flower/line-strokes.json')),
  caveat: () => preparedFont('caveat', import('./handwriting/fonts/caveat/outlines.json'), import('./handwriting/fonts/caveat/strokes.json'), import('./handwriting/fonts/caveat/widths.json'), import('./handwriting/fonts/caveat/metrics.json'), import('./handwriting/fonts/caveat/sweeps.json'), import('./handwriting/fonts/caveat/line-strokes.json')),
  romantic_script: () => preparedFont('romantic_script', import('./handwriting/fonts/petit-formal-script/outlines.json'), import('./handwriting/fonts/petit-formal-script/strokes.json'), import('./handwriting/fonts/petit-formal-script/widths.json'), import('./handwriting/fonts/petit-formal-script/metrics.json'), import('./handwriting/fonts/petit-formal-script/sweeps.json'), import('./handwriting/fonts/petit-formal-script/line-strokes.json')),
  handwritten_script: () => preparedFont('handwritten_script', import('./handwriting/fonts/great-vibes/outlines.json'), import('./handwriting/fonts/great-vibes/strokes.json'), import('./handwriting/fonts/great-vibes/widths.json'), import('./handwriting/fonts/great-vibes/metrics.json'), import('./handwriting/fonts/great-vibes/sweeps.json'), import('./handwriting/fonts/great-vibes/line-strokes.json')),
  allura: () => preparedFont('allura', import('./handwriting/fonts/allura/outlines.json'), import('./handwriting/fonts/allura/strokes.json'), import('./handwriting/fonts/allura/widths.json'), import('./handwriting/fonts/allura/metrics.json'), import('./handwriting/fonts/allura/sweeps.json'), import('./handwriting/fonts/allura/line-strokes.json')),
  parisienne: () => preparedFont('parisienne', import('./handwriting/fonts/parisienne/outlines.json'), import('./handwriting/fonts/parisienne/strokes.json'), import('./handwriting/fonts/parisienne/widths.json'), import('./handwriting/fonts/parisienne/metrics.json'), import('./handwriting/fonts/parisienne/sweeps.json'), import('./handwriting/fonts/parisienne/line-strokes.json')),
  sacramento: () => preparedFont('sacramento', import('./handwriting/fonts/sacramento/outlines.json'), import('./handwriting/fonts/sacramento/strokes.json'), import('./handwriting/fonts/sacramento/widths.json'), import('./handwriting/fonts/sacramento/metrics.json'), import('./handwriting/fonts/sacramento/sweeps.json'), import('./handwriting/fonts/sacramento/line-strokes.json')),
  comic_neue: () => preparedFont('comic_neue', import('./handwriting/fonts/comic-neue/outlines.json'), import('./handwriting/fonts/comic-neue/strokes.json'), import('./handwriting/fonts/comic-neue/widths.json'), import('./handwriting/fonts/comic-neue/metrics.json'), import('./handwriting/fonts/comic-neue/sweeps.json'), import('./handwriting/fonts/comic-neue/line-strokes.json')),
  alex_brush: () => preparedFont('alex_brush', import('./handwriting/fonts/alex-brush/outlines.json'), import('./handwriting/fonts/alex-brush/strokes.json'), import('./handwriting/fonts/alex-brush/widths.json'), import('./handwriting/fonts/alex-brush/metrics.json'), import('./handwriting/fonts/alex-brush/sweeps.json'), import('./handwriting/fonts/alex-brush/line-strokes.json')),
  lobster: () => preparedFont('lobster', import('./handwriting/fonts/lobster/outlines.json'), import('./handwriting/fonts/lobster/strokes.json'), import('./handwriting/fonts/lobster/widths.json'), import('./handwriting/fonts/lobster/metrics.json'), import('./handwriting/fonts/lobster/sweeps.json'), import('./handwriting/fonts/lobster/line-strokes.json')),
  pacifico: () => preparedFont('pacifico', import('./handwriting/fonts/pacifico/outlines.json'), import('./handwriting/fonts/pacifico/strokes.json'), import('./handwriting/fonts/pacifico/widths.json'), import('./handwriting/fonts/pacifico/metrics.json'), import('./handwriting/fonts/pacifico/sweeps.json'), import('./handwriting/fonts/pacifico/line-strokes.json')),
  yellowtail: () => preparedFont('yellowtail', import('./handwriting/fonts/yellowtail/outlines.json'), import('./handwriting/fonts/yellowtail/strokes.json'), import('./handwriting/fonts/yellowtail/widths.json'), import('./handwriting/fonts/yellowtail/metrics.json'), import('./handwriting/fonts/yellowtail/sweeps.json'), import('./handwriting/fonts/yellowtail/line-strokes.json')),
  permanent_marker: async () => {
    const [outlines, metrics, lineStrokes] = await Promise.all([
      json(import('./handwriting/fonts/permanent-marker/line-source/outlines.json')),
      json(import('./handwriting/fonts/permanent-marker/line-source/metrics.json')),
      json(import('./handwriting/fonts/permanent-marker/line-strokes.json')),
    ]);
    return { line: { fontId: 'permanent_marker', outlines, metrics, lineStrokes, strokes: {}, widths: {}, sweeps: {} } };
  },
  [MARKER_SAVED_ASSET_KEY]: async () => {
    const [outlines, guides, regions, metrics, widths] = await Promise.all([
      json(import('./handwriting/fonts/permanent-marker/outlines.json')),
      json(import('./handwriting/fonts/permanent-marker/strokes.json')),
      json(import('./handwriting/fonts/permanent-marker/regions.json')),
      json(import('./handwriting/fonts/permanent-marker/metrics.json')),
      json(import('./handwriting/fonts/permanent-marker/widths.json')),
    ]);
    return { marker: { outlines, guides, regions, metrics, widths } };
  },
};

const loaded = new Map<string, Assets>();
const pending = new Map<string, Promise<void>>();

export const isHandwritingAssetKey = (key: string) => Object.hasOwn(LOADERS, key);
export const handwritingAssetsLoaded = (key: string) => loaded.has(key);
/** Synchronous priming for Node callers that already hold the parsed packs. */
export function primeHandwritingAssets(key: string, assets: Assets) {
  if (!isHandwritingAssetKey(key)) throw new Error(`Unknown handwriting pack: ${key}`);
  loaded.set(key, assets);
}
/** Loads one asset key once. Unknown keys reject; a failed load can be retried. */
export function loadHandwritingAssets(key: string): Promise<void> {
  if (loaded.has(key)) return Promise.resolve();
  if (!isHandwritingAssetKey(key)) return Promise.reject(new Error(`Unknown handwriting pack: ${key}`));
  let promise = pending.get(key);
  if (!promise) {
    promise = LOADERS[key]().then(assets => { loaded.set(key, assets); }).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}
export const loadAllHandwritingAssets = () => Promise.all(Object.keys(LOADERS).map(loadHandwritingAssets)).then(() => undefined);

/**
 * The asset a `HandwritingText` render needs, mirroring its route selection:
 * line mask (default) → line pack; saved strokes → saved pack, or the previous
 * Permanent Marker data. Null means the pen-script fallback, which needs no pack.
 */
export function handwritingAssetKey(fontId: string | undefined, revealMode?: HandwritingPackMode): string | null {
  if (!fontId) return null;
  if (revealMode !== 'saved_strokes' && hasHandwritingPack(fontId, 'line_mask')) return fontId;
  if (fontId === 'permanent_marker') return MARKER_SAVED_ASSET_KEY;
  return hasHandwritingPack(fontId, 'saved_strokes') ? fontId : null;
}
/** Same condition as the caption renderer's HandwritingText branch. */
export function captionHandwritingAssetKey(props: { fontPreset?: string; handwritingRevealMode?: HandwritingPackMode; animationIn?: string; animationOut?: string; styleVariant?: string }) {
  const handwriting = props.animationIn === 'handwriting' || props.animationOut === 'handwriting' || (props.styleVariant === 'image_fill' && props.animationIn === 'write_on');
  return handwriting ? handwritingAssetKey(props.fontPreset, props.handwritingRevealMode) : null;
}

/** Loaded pack or undefined. Callers gate rendering on `loadHandwritingAssets`. */
export function getHandwritingPack(fontId: string, mode: HandwritingPackMode): HandwritingPack | undefined {
  const assets = loaded.get(fontId);
  return mode === 'line_mask' ? assets?.line : assets?.saved;
}
export function getMarkerSavedData(): MarkerSavedData {
  const data = loaded.get(MARKER_SAVED_ASSET_KEY)?.marker;
  if (!data) throw new Error('Permanent Marker saved strokes are not loaded; await loadHandwritingAssets first');
  return data;
}
export function handwritingFallbackFamily(fontId: string) { return getSharedFont(fontId).remotionFontFamily; }
