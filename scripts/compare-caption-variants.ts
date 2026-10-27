// Renders the SAME frame under several caption treatments so a human can judge
// legibility on real footage instead of on a swatch. Nothing is written to the
// timeline — variants are swapped in memory on the composition elements, so this
// is safe to run against a live project mid-review.
//
// Run: pnpm exec tsx scripts/compare-caption-variants.ts [--project <id>]
//        [--at 26.5,41.0,52.0] [--variants bold_outline,black_card,boxed]
//        [--position 0.78] [--animation none]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";

import { buildCompositionElements } from "@/lib/render/composition-adapters";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import { activeElements, activeTransitions, readTimeline } from "@/lib/local-store/store";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PROJECT_ID = flag("project", "tutorial-cover-thumbnail-test-short");
const BASE = process.env.MEDIA_BASE ?? "http://127.0.0.1:3123";
const FPS = 30;
const TIMES = flag("at", "26.5,41.0,52.0").split(",").map(Number);
const VARIANTS = flag("variants", "bold_outline,black_card,boxed").split(",");
const POSITION = Number(flag("position", "NaN"));          // optional absY override
const ANIMATION = flag("animation", "");                    // optional animationIn override
const OUTLINES = flag("outlines", "").split(",").filter(Boolean).map(Number);  // optional outlineWidthPx sweep
const OUT_DIR = flag("out", path.join(os.tmpdir(), `caption-variants-${PROJECT_ID}`));

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const timeline = readTimeline(PROJECT_ID);
  const layout = buildTimelineTransitionLayout(activeElements(timeline), activeTransitions(timeline));
  const base = buildCompositionElements(layout.renderedElements, new Set<string>()).map((element) => {
    const url = element.source_url;
    return !url || /^https?:\/\//i.test(url) ? element : { ...element, source_url: `${BASE}${url}` };
  });

  const serveUrl = await bundle({
    entryPoint: path.resolve("src/lib/remotion/index.ts"),
    webpackOverride: (config) => ({
      ...config,
      resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve(process.cwd(), "src") } },
    }),
    onProgress: () => undefined,
  });

  const written: string[] = [];
  const sweep: Array<{ variant: string; outline: number | null }> = OUTLINES.length
    ? VARIANTS.flatMap((variant) => OUTLINES.map((outline) => ({ variant, outline })))
    : VARIANTS.map((variant) => ({ variant, outline: null }));
  for (const { variant, outline } of sweep) {
    const elements = base.map((element) => element.type === "caption_text"
      ? {
        ...element,
        props: {
          ...element.props,
          styleVariant: variant,
          ...(outline != null ? { outlineWidthPx: outline } : {}),
          ...(Number.isFinite(POSITION) ? { absY: POSITION } : {}),
          ...(ANIMATION ? { animationIn: ANIMATION, animationInDuration: 0.45 } : {}),
        },
      }
      : element);

    const inputProps = { elements, laneOrderKeys: [], renderScale: 1 };
    const composition = await selectComposition({ serveUrl, id: "TimelineComposition", inputProps, timeoutInMilliseconds: 30_000 });
    composition.width = 1080;
    composition.height = 1920;
    composition.durationInFrames = Math.round(60 * FPS);

    for (const seconds of TIMES) {
      const output = path.join(OUT_DIR, `${seconds}s-${variant}${outline != null ? `-o${outline}` : ""}${ANIMATION ? `-${ANIMATION}` : ""}.png`);
      await renderStill({ composition, serveUrl, output, imageFormat: "png", frame: Math.round(seconds * FPS), inputProps });
      written.push(output);
      console.log(`  ${seconds}s · ${variant}${outline != null ? ` · outline ${outline}px` : ""}`);
    }
  }

  console.log(`\n${written.length} stills → ${OUT_DIR}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
