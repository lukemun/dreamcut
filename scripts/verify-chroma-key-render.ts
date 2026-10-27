/**
 * Real pixel proof that a chroma key removes its key colour in the RENDER, through
 * the production `TimelineComposition` — not a bespoke fixture. A green plate with a
 * red subject sits on `visual_1` above a blue plate on `visual_0`; after the key, the
 * backdrop must read blue and the subject must still read red.
 *
 * Run: pnpm verify:chroma-key
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from "sharp";

import { CHROMA_KEY_MODEL } from "../src/lib/timeline/chroma-key";

const execFileAsync = promisify(execFile);

const WIDTH = 640;
const HEIGHT = 360;
const KEY_COLOR = "#00b140";
const SUBJECT_COLOR = { r: 220, g: 30, b: 40 };
const BACKDROP_COLOR = { r: 20, g: 40, b: 200 };
/** Well inside the red square. */
const SUBJECT_SAMPLE = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
/** Well outside it, where the green plate used to be. */
const KEYED_SAMPLE = { x: 40, y: 40 };

const reportPath = path.resolve("testing/results/chroma-key/latest.json");

async function pixelAt(file: string, x: number, y: number) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0] as const;
}

const distance = (pixel: readonly number[], target: { r: number; g: number; b: number }) =>
  Math.max(
    Math.abs((pixel[0] ?? 0) - target.r),
    Math.abs((pixel[1] ?? 0) - target.g),
    Math.abs((pixel[2] ?? 0) - target.b),
  );

/** A green plate with a centred red square, encoded as a real decodable clip. */
async function writeGreenScreenSource(file: string) {
  const squareWidth = Math.round(WIDTH / 3);
  const squareHeight = Math.round(HEIGHT / 3);
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `color=c=${KEY_COLOR}:s=${WIDTH}x${HEIGHT}:r=30:d=2`,
    "-f", "lavfi", "-i", `color=c=0x${SUBJECT_COLOR.r.toString(16).padStart(2, "0")}${SUBJECT_COLOR.g.toString(16).padStart(2, "0")}${SUBJECT_COLOR.b.toString(16).padStart(2, "0")}:s=${squareWidth}x${squareHeight}:r=30:d=2`,
    "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
    "-movflags", "+faststart",
    file,
    "-loglevel", "error",
  ]);
}

function timelineElements({ keyed }: { keyed: boolean }) {
  const shared = {
    project_id: "chroma-key-verify",
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    timeline_start: 0,
    duration: 2,
    trim_start: 0,
    trim_end: 0,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    transition_in: null,
    transition_out: null,
  };

  return [
    {
      ...shared,
      id: "backdrop",
      type: "still",
      lane_key: "visual_0",
      lane_index: 0,
      source_url: "/chroma-backdrop.png",
      props: { source_width: WIDTH, source_height: HEIGHT },
    },
    {
      ...shared,
      id: "keyed-clip",
      type: "video_clip",
      lane_key: "visual_1",
      lane_index: 1,
      source_url: "/chroma-source.mp4",
      props: {
        source_width: WIDTH,
        source_height: HEIGHT,
        source_duration_seconds: 2,
        ...(keyed
          ? {
              chroma_key_color: KEY_COLOR,
              chroma_key_model: CHROMA_KEY_MODEL,
              chroma_key_tolerance: 0.3,
              chroma_key_softness: 0.1,
              chroma_key_spill: 0.3,
            }
          : {}),
      },
    },
  ];
}

async function main() {
  const publicDir = await mkdtemp(path.join(tmpdir(), "chroma-key-public-"));
  const outputDir = await mkdtemp(path.join(tmpdir(), "chroma-key-out-"));
  const keyedPath = path.join(outputDir, "keyed.png");
  const unkeyedPath = path.join(outputDir, "unkeyed.png");
  let serveUrl: string | null = null;

  try {
    await writeGreenScreenSource(path.join(publicDir, "chroma-source.mp4"));
    await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: { ...BACKDROP_COLOR, alpha: 1 } },
    }).png().toFile(path.join(publicDir, "chroma-backdrop.png"));

    serveUrl = await bundle({
      entryPoint: path.resolve("src/lib/remotion/index.ts"),
      webpackOverride: (config: any) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") },
        },
      }),
      onProgress: () => undefined,
    });

    // Serve the fixture media from the bundle root, where the renderer's static
    // server resolves the `/chroma-*.{mp4,png}` URLs the elements carry.
    await copyFile(path.join(publicDir, "chroma-source.mp4"), path.join(serveUrl, "chroma-source.mp4"));
    await copyFile(path.join(publicDir, "chroma-backdrop.png"), path.join(serveUrl, "chroma-backdrop.png"));

    const sourceBytes = {backdrop: (await readFile(path.join(publicDir,"chroma-backdrop.png"))).toString("base64"),video:(await readFile(path.join(publicDir,"chroma-source.mp4"))).toString("base64")};
    const renderVariant = async (keyed: boolean, output: string) => {
      const inputProps = { elements: timelineElements({ keyed }).map(element => ({...element, source_url: `data:${element.type === "still" ? "image/png" : "video/mp4"};base64,${sourceBytes[element.type === "still" ? "backdrop" : "video"]}`})), // lane_order_keys is TOP-first: index 0 composites in front. The keyed clip leads.
      laneOrderKeys: ["visual_1", "visual_0"], renderScale: 1 };
      const composition = await selectComposition({
        serveUrl: serveUrl!,
        id: "TimelineComposition",
        inputProps,
        timeoutInMilliseconds: 60_000,
      });
      composition.width = WIDTH;
      composition.height = HEIGHT;
      composition.durationInFrames = 60;
      await renderStill({
        composition,
        serveUrl: serveUrl!,
        output,
        inputProps,
        frame: 30,
        imageFormat: "png",
        // colorKey() runs on WebGL2; without an OpenGL renderer the effect silently no-ops.
        chromiumOptions: { gl: "angle" },
        timeoutInMilliseconds: 120_000,
      });
    };

    await renderVariant(false, unkeyedPath);
    await renderVariant(true, keyedPath);

    const unkeyedBackdrop = await pixelAt(unkeyedPath, KEYED_SAMPLE.x, KEYED_SAMPLE.y);
    const unkeyedSubject = await pixelAt(unkeyedPath, SUBJECT_SAMPLE.x, SUBJECT_SAMPLE.y);
    const keyedBackdrop = await pixelAt(keyedPath, KEYED_SAMPLE.x, KEYED_SAMPLE.y);
    const keyedSubject = await pixelAt(keyedPath, SUBJECT_SAMPLE.x, SUBJECT_SAMPLE.y);

    // Guard the guard: if the un-keyed render already showed blue, the "key worked"
    // assertion below would pass without the effect ever running.
    if (distance(unkeyedBackdrop, BACKDROP_COLOR) < 40) {
      throw new Error(
        `Control render is not showing the green plate at (${KEYED_SAMPLE.x},${KEYED_SAMPLE.y}): ${unkeyedBackdrop.join("/")}. `
        + "The keyed lane is not covering the backdrop, so this test proves nothing.",
      );
    }
    if (distance(unkeyedSubject, SUBJECT_COLOR) > 40) {
      throw new Error(`Control render lost the red subject: ${unkeyedSubject.join("/")}`);
    }
    if (distance(keyedBackdrop, BACKDROP_COLOR) > 40) {
      throw new Error(
        `Chroma key did not reveal the lower lane: expected the blue backdrop, got ${keyedBackdrop.join("/")}. `
        + "Check that the owned WebGL chroma pass ran and TimelineVideo routed the keyed source through it.",
      );
    }
    if (distance(keyedSubject, SUBJECT_COLOR) > 55) {
      throw new Error(`Chroma key ate the subject: expected red, got ${keyedSubject.join("/")}`);
    }

    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { dependencies?: Record<string, string> };
    const report = {
      generated_at: new Date().toISOString(),
      composition: "TimelineComposition (production render path)",
      fixture: `${WIDTH}x${HEIGHT}, green plate + red subject on visual_1 over a blue plate on visual_0`,
      key: { color: KEY_COLOR, tolerance: 0.3, softness: 0.1, spill: 0.3, model: CHROMA_KEY_MODEL },
      runtime: {
        engine: "dreamcut-react-chromium-ffmpeg",
        playwright: packageJson.dependencies?.["playwright-core"],
        remotion_runtime: false,
        open_gl: "angle",
      },
      pixels: {
        unkeyed: { backdrop_sample: unkeyedBackdrop, subject_sample: unkeyedSubject },
        keyed: { backdrop_sample: keyedBackdrop, subject_sample: keyedSubject },
      },
      thresholds: { backdrop_channel_delta_max: 40, subject_channel_delta_max: 55, control_separation_min: 40 },
    };
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `Chroma key render verified. Backdrop ${unkeyedBackdrop.slice(0, 3).join("/")} -> ${keyedBackdrop.slice(0, 3).join("/")}; `
      + `subject held at ${keyedSubject.slice(0, 3).join("/")}; report ${reportPath}`,
    );
  } finally {
    if (process.env.CHROMA_DEBUG_DIR) {
      await mkdir(process.env.CHROMA_DEBUG_DIR, { recursive: true });
      for (const f of ["keyed.png", "unkeyed.png"]) {
        await copyFile(path.join(outputDir, f), path.join(process.env.CHROMA_DEBUG_DIR, f)).catch(() => {});
      }
    }
    await rm(publicDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
    if (serveUrl) await rm(serveUrl, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
