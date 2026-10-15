/**
 * pnpm caption-wrap-parity
 *
 * The QC gate certifies a render off `measureCaptions()`, but the human grades the PREVIEW — and
 * both the preview and the real Remotion render paint captions through `TimelineComposition`. If the
 * gate's measurement and the composition's paint disagree on how many lines a caption wraps to, the
 * gate launders the defect: it once passed a 66px Montserrat caption at three lines that actually
 * rendered on four, and the extra line sat under the platform UI where the human could see it.
 *
 * This is the cheap guard against that drift. For a fixture caption set it:
 *   1. measures each caption with `measureCaptions()` — exactly what the gate + frame-state use, and
 *   2. independently renders each with the composition's EXACT caption CSS
 *      (`captionRemotionFontFamily` + `captionTypographyCSS` — font, size, weight, letter-spacing,
 *      line-height, box width) in a headless browser and counts the real wrapped lines,
 * then fails loudly (exit 1) on any disagreement. Fixtures include the post-10 caption that first
 * exposed the gap, plus presets whose typography differs from the default (mono, bebas) so a change
 * to any preset's letter-spacing / weight / line-height is caught, not just the default.
 *
 * Run it after touching caption typography (`captionTypographyCSS`), the measurement
 * (`measure-captions.ts`), or the composition's caption styling.
 */
import { chromium, type Browser } from "playwright-core";

import { measureCaptions } from "@/lib/qc/measure-captions";
import {
  captionRemotionFontFamily,
  captionTypographyCSS,
  resolveCaptionProps,
} from "@/lib/timeline/captions";
import { getSharedFont } from "@/lib/fonts/registry";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import type { QcElement } from "@/lib/qc/check-timeline";

const CANVAS = getCompositionDimensions("9:16");

type Fixture = {
  name: string;
  props: Record<string, unknown>;
};

const FIXTURES: Fixture[] = [
  {
    // The regression: this rendered on FOUR lines but measured at three when letter-spacing was
    // dropped. It is the reason this guard exists — keep it first.
    name: "post-10 cap2 (montserrat 66) — the regression",
    props: {
      fontPreset: "montserrat",
      fontSizePx: 66,
      maxWidth: 0.84,
      text: "So I built an AI system and analyzed the top 100 best selling covers on Amazon.",
    },
  },
  {
    name: "post-10 cap1 (montserrat 66)",
    props: {
      fontPreset: "montserrat",
      fontSizePx: 66,
      maxWidth: 0.84,
      text: "I wanted to understand what makes a best selling cover.",
    },
  },
  {
    name: "post-10 cap3 (montserrat 66, authored breaks)",
    props: {
      fontPreset: "montserrat",
      fontSizePx: 66,
      maxWidth: 0.84,
      text: "After 70 genres and 7,000 covers...\n\nHere's 5 things I found ↓",
    },
  },
  {
    // Non-default typography: anton is weight 400, letterSpacing 0.03em, lineHeight 1.0 — the
    // widest tracking, so it is the most sensitive to a dropped letter-spacing.
    name: "anton preset (condensed, widest tracking)",
    props: {
      fontPreset: "anton",
      fontSizePx: 64,
      maxWidth: 0.82,
      text: "BOLD CONDENSED HEADLINES STILL HAVE TO WRAP EXACTLY WHERE THE RENDER WRAPS THEM",
    },
  },
  {
    // bebas_neue is weight 400, letterSpacing 0.03em, lineHeight 1.0.
    name: "bebas preset (condensed)",
    props: {
      fontPreset: "bebas_neue",
      fontSizePx: 72,
      maxWidth: 0.82,
      text: "Every letter of tracking pushes the wrap point and the gate has to agree with it",
    },
  },
];

function toQcCaption(fixture: Fixture, index: number): QcElement {
  return {
    id: `parity-${index}`,
    type: "caption_text",
    lane_key: "captions_0",
    timeline_start: 0,
    duration: 3,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    props: fixture.props,
  };
}

/**
 * The number of lines the COMPOSITION actually paints — measured by grouping the caption's client
 * rects by their top edge, which is scale- and metrics-independent, so it counts the same visual
 * lines the preview player and the Remotion render produce.
 */
async function measureCompositionLines(
  browser: Browser,
  fixture: Fixture,
): Promise<number> {
  const props = resolveCaptionProps(fixture.props);
  const font = getSharedFont(props.fontPreset);
  const typography = captionTypographyCSS(props.fontPreset);
  const weight = typeof typography.fontWeight === "number" ? typography.fontWeight : 600;
  const boxWidth = CANVAS.width * props.maxWidth; // contentRect is full-frame for these fixtures
  const familyQuery = font.family.replace(/ /g, "+");
  const html = `<!doctype html><link href="https://fonts.googleapis.com/css2?family=${familyQuery}:wght@${weight}&display=swap" rel="stylesheet"><div id="c"></div>`;

  const page = await browser.newPage();
  try {
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {timeout:30000});
    return await page.evaluate(
      async ({ fontFamily, family, text, boxWidth, size, weight, letterSpacing, lineHeight }) => {
        await document.fonts.load(`${weight} ${size}px "${family}"`, text || "M");
        await document.fonts.ready;
        const el = document.getElementById("c")!;
        Object.assign(el.style, {
          width: `${boxWidth}px`,
          fontFamily, // the composition's remotion family stack, e.g. "'Montserrat', Arial, sans-serif"
          fontSize: `${size}px`,
          fontWeight: String(weight),
          letterSpacing,
          lineHeight: String(lineHeight),
          whiteSpace: "pre-wrap",
          overflowWrap: "normal",
        });
        el.textContent = text;
        const range = document.createRange();
        range.selectNodeContents(el);
        // One rect per run; a wrapped line can produce several. Group by top edge = visual lines.
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        return tops.size;
      },
      {
        fontFamily: captionRemotionFontFamily(props.fontPreset),
        family: font.family,
        text: props.text,
        boxWidth,
        size: props.fontSizePx,
        weight,
        letterSpacing: typeof typography.letterSpacing === "string" ? typography.letterSpacing : "normal",
        lineHeight: typeof typography.lineHeight === "number" ? typography.lineHeight : 1.2,
      },
    );
  } finally {
    await page.close();
  }
}

async function main() {
  const captions = FIXTURES.map(toQcCaption);
  console.log(`[caption-wrap-parity] canvas ${CANVAS.width}x${CANVAS.height}, ${FIXTURES.length} fixture(s)`);

  const measured = await measureCaptions(captions, CANVAS);

  const browser = await chromium.launch({channel:"chrome",headless:true});
  const mismatches: string[] = [];
  try {
    for (let i = 0; i < FIXTURES.length; i += 1) {
      const fixture = FIXTURES[i]!;
      const gateLines = measured[`parity-${i}`]?.lines;
      const compositionLines = await measureCompositionLines(browser, fixture);
      const ok = gateLines === compositionLines;
      console.log(
        `${ok ? "  ok" : "FAIL"}  ${fixture.name}: gate=${gateLines} composition=${compositionLines}`,
      );
      if (!ok) {
        mismatches.push(
          `${fixture.name}: measureCaptions reported ${gateLines} lines, composition paints ${compositionLines}`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  if (mismatches.length > 0) {
    console.error(
      `\n[caption-wrap-parity] ${mismatches.length} caption(s) measured differently than the composition renders:`,
    );
    for (const line of mismatches) console.error(`  - ${line}`);
    console.error(
      "\nThe gate would certify a render the human sees differently. Align measure-captions.ts with"
        + " the composition's captionTypographyCSS (font, weight, letter-spacing, line-height, width).",
    );
    process.exit(1);
  }

  console.log("\n[caption-wrap-parity] PASS — the gate measures every fixture exactly as the composition paints it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
