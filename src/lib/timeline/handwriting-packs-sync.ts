/**
 * Node-only synchronous pack access for tests, QC scripts and pack audits.
 * Never import this from editor/renderer code: it statically bundles every font
 * (~66 MB). The browser uses `loadHandwritingAssets` from `handwriting-packs.ts`.
 * Importing this module primes that loader's cache so shared renderers work
 * synchronously in Node.
 */
import indie_flowerLines from './handwriting/fonts/indie-flower/line-strokes.json';
import caveatLines from './handwriting/fonts/caveat/line-strokes.json';
import romantic_scriptLines from './handwriting/fonts/petit-formal-script/line-strokes.json';
import handwritten_scriptLines from './handwriting/fonts/great-vibes/line-strokes.json';
import alluraLines from './handwriting/fonts/allura/line-strokes.json';
import parisienneLines from './handwriting/fonts/parisienne/line-strokes.json';
import sacramentoLines from './handwriting/fonts/sacramento/line-strokes.json';
import comic_neueLines from './handwriting/fonts/comic-neue/line-strokes.json';
import alex_brushLines from './handwriting/fonts/alex-brush/line-strokes.json';
import lobsterLines from './handwriting/fonts/lobster/line-strokes.json';
import pacificoLines from './handwriting/fonts/pacifico/line-strokes.json';
import yellowtailLines from './handwriting/fonts/yellowtail/line-strokes.json';
import markerLineOutlines from './handwriting/fonts/permanent-marker/line-source/outlines.json';
import markerLineMetrics from './handwriting/fonts/permanent-marker/line-source/metrics.json';
import markerLines from './handwriting/fonts/permanent-marker/line-strokes.json';
import alexOutlines from './handwriting/fonts/alex-brush/outlines.json';
import alexStrokes from './handwriting/fonts/alex-brush/strokes.json';
import alexWidths from './handwriting/fonts/alex-brush/widths.json';
import alexMetrics from './handwriting/fonts/alex-brush/metrics.json';
import alexSweeps from './handwriting/fonts/alex-brush/sweeps.json';
import lobsterOutlines from './handwriting/fonts/lobster/outlines.json';
import lobsterStrokes from './handwriting/fonts/lobster/strokes.json';
import lobsterWidths from './handwriting/fonts/lobster/widths.json';
import lobsterMetrics from './handwriting/fonts/lobster/metrics.json';
import lobsterSweeps from './handwriting/fonts/lobster/sweeps.json';
import pacificoOutlines from './handwriting/fonts/pacifico/outlines.json';
import pacificoStrokes from './handwriting/fonts/pacifico/strokes.json';
import pacificoWidths from './handwriting/fonts/pacifico/widths.json';
import pacificoMetrics from './handwriting/fonts/pacifico/metrics.json';
import pacificoSweeps from './handwriting/fonts/pacifico/sweeps.json';
import yellowtailOutlines from './handwriting/fonts/yellowtail/outlines.json';
import yellowtailStrokes from './handwriting/fonts/yellowtail/strokes.json';
import yellowtailWidths from './handwriting/fonts/yellowtail/widths.json';
import yellowtailMetrics from './handwriting/fonts/yellowtail/metrics.json';
import yellowtailSweeps from './handwriting/fonts/yellowtail/sweeps.json';
import indieOutlines from './handwriting/fonts/indie-flower/outlines.json';
import indieStrokes from './handwriting/fonts/indie-flower/strokes.json';
import indieWidths from './handwriting/fonts/indie-flower/widths.json';
import indieMetrics from './handwriting/fonts/indie-flower/metrics.json';
import indieSweeps from './handwriting/fonts/indie-flower/sweeps.json';
import caveatOutlines from './handwriting/fonts/caveat/outlines.json';
import caveatStrokes from './handwriting/fonts/caveat/strokes.json';
import caveatWidths from './handwriting/fonts/caveat/widths.json';
import caveatMetrics from './handwriting/fonts/caveat/metrics.json';
import caveatSweeps from './handwriting/fonts/caveat/sweeps.json';
import petitOutlines from './handwriting/fonts/petit-formal-script/outlines.json';
import petitStrokes from './handwriting/fonts/petit-formal-script/strokes.json';
import petitWidths from './handwriting/fonts/petit-formal-script/widths.json';
import petitMetrics from './handwriting/fonts/petit-formal-script/metrics.json';
import petitSweeps from './handwriting/fonts/petit-formal-script/sweeps.json';
import greatOutlines from './handwriting/fonts/great-vibes/outlines.json';
import greatStrokes from './handwriting/fonts/great-vibes/strokes.json';
import greatWidths from './handwriting/fonts/great-vibes/widths.json';
import greatMetrics from './handwriting/fonts/great-vibes/metrics.json';
import greatSweeps from './handwriting/fonts/great-vibes/sweeps.json';
import alluraOutlines from './handwriting/fonts/allura/outlines.json';
import alluraStrokes from './handwriting/fonts/allura/strokes.json';
import alluraWidths from './handwriting/fonts/allura/widths.json';
import alluraMetrics from './handwriting/fonts/allura/metrics.json';
import alluraSweeps from './handwriting/fonts/allura/sweeps.json';
import parisienneOutlines from './handwriting/fonts/parisienne/outlines.json';
import parisienneStrokes from './handwriting/fonts/parisienne/strokes.json';
import parisienneWidths from './handwriting/fonts/parisienne/widths.json';
import parisienneMetrics from './handwriting/fonts/parisienne/metrics.json';
import parisienneSweeps from './handwriting/fonts/parisienne/sweeps.json';
import sacramentoOutlines from './handwriting/fonts/sacramento/outlines.json';
import sacramentoStrokes from './handwriting/fonts/sacramento/strokes.json';
import sacramentoWidths from './handwriting/fonts/sacramento/widths.json';
import sacramentoMetrics from './handwriting/fonts/sacramento/metrics.json';
import sacramentoSweeps from './handwriting/fonts/sacramento/sweeps.json';
import comicOutlines from './handwriting/fonts/comic-neue/outlines.json';
import comicStrokes from './handwriting/fonts/comic-neue/strokes.json';
import comicWidths from './handwriting/fonts/comic-neue/widths.json';
import comicMetrics from './handwriting/fonts/comic-neue/metrics.json';
import comicSweeps from './handwriting/fonts/comic-neue/sweeps.json';
import markerSavedOutlines from './handwriting/fonts/permanent-marker/outlines.json';
import markerSavedGuides from './handwriting/fonts/permanent-marker/strokes.json';
import markerSavedRegions from './handwriting/fonts/permanent-marker/regions.json';
import markerSavedMetrics from './handwriting/fonts/permanent-marker/metrics.json';
import markerSavedWidths from './handwriting/fonts/permanent-marker/widths.json';
import { MARKER_SAVED_ASSET_KEY, primeHandwritingAssets, type HandwritingPack, type MarkerSavedData } from './handwriting-packs';
export const HANDWRITING_PACKS: Record<string, HandwritingPack> = {
  indie_flower: { fontId: 'indie_flower', outlines: indieOutlines, strokes: indieStrokes, widths: indieWidths, metrics: indieMetrics, sweeps: indieSweeps },
  caveat: { fontId: 'caveat', outlines: caveatOutlines, strokes: caveatStrokes, widths: caveatWidths, metrics: caveatMetrics, sweeps: caveatSweeps },
  romantic_script: { fontId: 'romantic_script', outlines: petitOutlines, strokes: petitStrokes, widths: petitWidths, metrics: petitMetrics, sweeps: petitSweeps },
  handwritten_script: { fontId: 'handwritten_script', outlines: greatOutlines, strokes: greatStrokes, widths: greatWidths, metrics: greatMetrics, sweeps: greatSweeps },
  allura: { fontId: 'allura', outlines: alluraOutlines, strokes: alluraStrokes, widths: alluraWidths, metrics: alluraMetrics, sweeps: alluraSweeps },
  parisienne: { fontId: 'parisienne', outlines: parisienneOutlines, strokes: parisienneStrokes, widths: parisienneWidths, metrics: parisienneMetrics, sweeps: parisienneSweeps },
  sacramento: { fontId: 'sacramento', outlines: sacramentoOutlines, strokes: sacramentoStrokes, widths: sacramentoWidths, metrics: sacramentoMetrics, sweeps: sacramentoSweeps },
  alex_brush: { fontId: 'alex_brush', outlines: alexOutlines, strokes: alexStrokes, widths: alexWidths, metrics: alexMetrics, sweeps: alexSweeps },
  lobster: { fontId: 'lobster', outlines: lobsterOutlines, strokes: lobsterStrokes, widths: lobsterWidths, metrics: lobsterMetrics, sweeps: lobsterSweeps },
  pacifico: { fontId: 'pacifico', outlines: pacificoOutlines, strokes: pacificoStrokes, widths: pacificoWidths, metrics: pacificoMetrics, sweeps: pacificoSweeps },
  yellowtail: { fontId: 'yellowtail', outlines: yellowtailOutlines, strokes: yellowtailStrokes, widths: yellowtailWidths, metrics: yellowtailMetrics, sweeps: yellowtailSweeps },
  comic_neue: { fontId: 'comic_neue', outlines: comicOutlines, strokes: comicStrokes, widths: comicWidths, metrics: comicMetrics, sweeps: comicSweeps },
};

/** Continuous masks are the selected default; original saved packs remain intact. */
export const LINE_HANDWRITING_PACKS: Record<string, HandwritingPack> = {
  indie_flower: { ...HANDWRITING_PACKS.indie_flower, lineStrokes: indie_flowerLines },
  caveat: { ...HANDWRITING_PACKS.caveat, lineStrokes: caveatLines },
  romantic_script: { ...HANDWRITING_PACKS.romantic_script, lineStrokes: romantic_scriptLines },
  handwritten_script: { ...HANDWRITING_PACKS.handwritten_script, lineStrokes: handwritten_scriptLines },
  allura: { ...HANDWRITING_PACKS.allura, lineStrokes: alluraLines },
  parisienne: { ...HANDWRITING_PACKS.parisienne, lineStrokes: parisienneLines },
  sacramento: { ...HANDWRITING_PACKS.sacramento, lineStrokes: sacramentoLines },
  comic_neue: { ...HANDWRITING_PACKS.comic_neue, lineStrokes: comic_neueLines },
  alex_brush: { ...HANDWRITING_PACKS.alex_brush, lineStrokes: alex_brushLines },
  lobster: { ...HANDWRITING_PACKS.lobster, lineStrokes: lobsterLines },
  pacifico: { ...HANDWRITING_PACKS.pacifico, lineStrokes: pacificoLines },
  yellowtail: { ...HANDWRITING_PACKS.yellowtail, lineStrokes: yellowtailLines },
  permanent_marker: { fontId: 'permanent_marker', outlines: markerLineOutlines, metrics: markerLineMetrics, lineStrokes: markerLines, strokes: {}, widths: {}, sweeps: {} },
};

export const MARKER_SAVED_DATA: MarkerSavedData = { outlines: markerSavedOutlines, guides: markerSavedGuides, regions: markerSavedRegions, metrics: markerSavedMetrics, widths: markerSavedWidths };

for (const [fontId, line] of Object.entries(LINE_HANDWRITING_PACKS)) primeHandwritingAssets(fontId, { line, saved: HANDWRITING_PACKS[fontId] });
primeHandwritingAssets(MARKER_SAVED_ASSET_KEY, { marker: MARKER_SAVED_DATA });
