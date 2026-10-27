/**
 * Font-accurate caption measurement.
 *
 * `check-timeline.ts` can only ESTIMATE a caption's box (average glyph width, no DOM). That
 * estimate is honest but coarse — it over-estimates height, so it fails loud rather than
 * passing something out of bounds. What it cannot do is DECIDE: an estimated overflow might
 * be real or might be the estimate.
 *
 * This module measures the real thing — the exact loaded face, laid out by a real browser —
 * so the gate can BLOCK on measured truth instead of hedging on a guess.
 *
 * The rule this exists to enforce: **there is one gate, and it does not lie.** A qc run that
 * reports PASS on a video whose captions are four lines deep and under the platform's UI is
 * worse than no gate at all, because it launders the defect.
 *
 * "Measures the real thing" means the SAME typography `TimelineComposition` paints. The wrap of a
 * line is decided by font face, size, weight, letter-spacing and the box width — so this reads
 * every one of those from `captionTypographyCSS(fontPreset)`, the composition's single source. It
 * once diverged: letter-spacing was dropped and lineHeight hardcoded, so a caption that renders
 * on four lines measured at three and the gate passed an overlap the human could see. Any future
 * drift is caught by `scripts/caption-wrap-parity.ts` (`pnpm caption-wrap-parity`), which renders a
 * fixture set with the composition's exact CSS and fails if this measurement disagrees on lines.
 *
 * Known gap: the box width here is `canvas.width * maxWidth`, i.e. the full frame. The composition
 * narrows it by the caption's `contentRect` when the caption sits over a letter/pillar-boxed
 * visual (source AR ≠ canvas AR); measuring the full width there would UNDER-count lines. Closing
 * it needs the caption→visual association threaded in; do that before trusting the gate on mixed-AR
 * timelines.
 */
import { measurePreparedHandwriting } from "./measure-handwriting";
import { chromium } from "playwright-core";

import { getSharedFont, SHARED_FONT_BY_ID, type SharedFontId } from "@/lib/fonts/registry";
import {
  captionDisplayText,
  captionTypographyCSS,
  resolveCaptionFontSizePx,
  resolveCaptionProps,
} from "@/lib/timeline/captions";
import type { QcElement } from "@/lib/qc/check-timeline";

export type MeasuredCaption = {
  /** Layout box width in canvas px — the space the caption is ALLOWED, not the space it uses. */
  width: number;
  /** Rendered text height in canvas px. */
  height: number;
  /** Real wrapped line count. */
  lines: number;
  /** The family the browser actually resolved — proof the intended face loaded. */
  loadedFamily: string;
  /**
   * Width of the INK — the glyphs themselves, not the layout box.
   *
   * The two differ by the whole empty remainder of a centred line, and anything that samples the
   * layout box for "the caption's colour" reads mostly background. One short word in a 972px box
   * measured as grey because the sampler was averaging his t-shirt.
   */
  inkWidth: number;
};

export type CaptionMeasurements = Record<string, MeasuredCaption>;

/**
 * Measures every caption with its real loaded font. Throws if the intended face does not
 * load, because a measurement taken against a fallback font is a measurement of the wrong
 * thing — and silently measuring the wrong thing is the failure this module exists to prevent.
 */
export async function measureCaptions(
  captions: QcElement[],
  canvas: { width: number; height: number },
): Promise<CaptionMeasurements> {
  if (captions.length === 0) return {};

  const preparedMeasurements: CaptionMeasurements = {};
  const ordinaryCaptions: QcElement[] = [];
  for (const caption of captions) {
    const measured = await measurePreparedHandwriting(caption.props ?? {}, canvas.width);
    if (measured) preparedMeasurements[caption.id] = measured;
    else ordinaryCaptions.push(caption);
  }
  if (!ordinaryCaptions.length) return preparedMeasurements;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();

    const measurements: CaptionMeasurements = {...preparedMeasurements};
    for (const caption of ordinaryCaptions) {
      const props = caption.props ?? {};
      const fontId: SharedFontId =
        typeof props.fontPreset === "string" && props.fontPreset in SHARED_FONT_BY_ID
          ? (props.fontPreset as SharedFontId)
          : "clean_sans";
      const font = getSharedFont(fontId);
      const maxWidth = typeof props.maxWidth === "number" ? props.maxWidth : 0.78;
      const resolved = resolveCaptionProps(props);
      const measuredText = captionDisplayText(resolved);
      const measuredFontSize = resolveCaptionFontSizePx(resolved, canvas.width * maxWidth);
      const textTransform = "none";

      // Wrap is decided by the exact typography the COMPOSITION paints, not a house default.
      // `captionTypographyCSS(fontPreset)` is the single source for letterSpacing / lineHeight /
      // weight in `TimelineComposition`; measuring without it (the old code hardcoded lineHeight
      // 1.2, no letter-spacing, weight 600) narrows the text and drops a line — e.g. a 66px
      // Montserrat caption that renders on FOUR lines was measured at THREE, so the QC box came
      // back a line short and an overlap the human could see passed the gate.
      const typography = captionTypographyCSS(fontId);
      const weight = typeof typography.fontWeight === "number" ? typography.fontWeight : 600;
      // These display faces ship as a single 400-weight file. The composition intentionally
      // asks the browser to synthesize its 600 presentation weight; load/check the real face at
      // its available weight, then measure with the same synthesized 600 CSS the editor paints.
      const fontLoadWeight = ["permanent_marker", "archivo_black", "abril_fatface", "allura", "indie_flower", "anton", "bebas_neue", "display_serif"].includes(fontId) ? 400 : weight;
      const letterSpacing = typeof typography.letterSpacing === "string" ? typography.letterSpacing : "normal";
      const lineHeight = typeof typography.lineHeight === "number" ? typography.lineHeight : 1.2;

      const familyQuery = font.family.replace(/ /g, "+");
      const html = `<!doctype html><link href="https://fonts.googleapis.com/css2?family=${familyQuery}:wght@${fontLoadWeight}&display=swap" rel="stylesheet"><div id="caption"></div>`;
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, { timeout: 30000 });

      measurements[caption.id] = await page.evaluate(
        async ({ family, textValue, width, size, fontWeight, fontLoadWeight, letterSpacing, lineHeight, textTransform, singleLine }) => {
          // A symbol-only label may use browser fallback; a Latin probe still verifies
          // that the requested face loaded before measuring the actual rendered glyph.
          const loaded = await document.fonts.load(`${fontLoadWeight} ${size}px "${family}"`, `${textValue} M`);
          await document.fonts.ready;
          if (loaded.length === 0 || !document.fonts.check(`${fontLoadWeight} ${size}px "${family}"`)) {
            throw new Error(`Exact font did not load: ${family} ${fontLoadWeight}`);
          }
          const element = document.getElementById("caption")!;
          Object.assign(element.style, {
            width: `${width}px`,
            fontFamily: `"${family}"`,
            fontSize: `${size}px`,
            fontWeight: String(fontWeight),
            lineHeight: String(lineHeight),
            textTransform,
            letterSpacing,
            whiteSpace: singleLine ? "nowrap" : "pre-wrap",
            overflowWrap: "normal",
          });
          element.textContent = textValue;
          const rect = element.getBoundingClientRect();
          // A Range over the contents bounds the GLYPHS, not the block — the only way to get the
          // real ink extent of a centred line without re-implementing text layout.
          const range = document.createRange();
          range.selectNodeContents(element);
          const ink = range.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            lines: Math.round(rect.height / (size * lineHeight)),
            loadedFamily: getComputedStyle(element).fontFamily,
            inkWidth: ink.width,
          };
        },
        {
          family: font.family,
          textValue: measuredText,
          width: canvas.width * maxWidth,
          size: measuredFontSize,
          fontWeight: weight,
          fontLoadWeight,
          letterSpacing,
          lineHeight,
          textTransform,
          singleLine: resolved.singleLine,
        },
      );
    }
    return measurements;
  } finally {
    await browser.close();
  }
}
