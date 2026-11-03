import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureVideo as renderMedia, renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from "sharp";

import {
  buildColinEffectProofElements,
  COLIN_EFFECT_PROOF_FPS,
  COLIN_EFFECT_PROOF_HEIGHT,
  COLIN_EFFECT_PROOF_ID,
  COLIN_EFFECT_PROOF_LANE_ORDER,
  COLIN_EFFECT_PROOF_WIDTH,
} from "../src/lib/remotion/colin-effect-proof";
import { readKeyframeMap } from "../src/lib/timeline/keyframes";

type RgbaImage = { data: Buffer; width: number; height: number };
type Pixel = { r: number; g: number; b: number; a: number };

const FRAMES = [0, COLIN_EFFECT_PROOF_FPS, COLIN_EFFECT_PROOF_FPS * 2] as const;
const PANEL_COLORS = {
  top: "#e12d41",
  middle: "#0fbe78",
  bottom: "#285feb",
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function panelSvg(color: string, label: string) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${COLIN_EFFECT_PROOF_WIDTH}" height="${COLIN_EFFECT_PROOF_HEIGHT}">
      <rect width="100%" height="100%" fill="${color}"/>
      <rect x="80" width="20" height="100%" fill="#ff00ff"/>
      <text x="180" y="590" text-anchor="middle" font-family="Arial" font-size="24" fill="#ffffff">${label}</text>
    </svg>
  `);
}

async function writePanelMedia(mediaDir: string) {
  fs.mkdirSync(mediaDir, { recursive: true });
  for (const [name, color] of Object.entries(PANEL_COLORS)) {
    await sharp(panelSvg(color, name.toUpperCase())).png().toFile(path.join(mediaDir, `${name}.png`));
  }
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Temporary media server did not bind a TCP port"));
      resolve(address.port);
    });
  });
}

async function startMediaServer(mediaDir: string) {
  const server = createServer((request, response) => {
    const name = path.basename(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const filePath = path.join(mediaDir, name);
    if (!/^(top|middle|bottom)\.png$/.test(name) || !fs.existsSync(filePath)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
    fs.createReadStream(filePath).pipe(response);
  });
  const port = await listen(server);
  return {
    server,
    urls: {
      top: `http://127.0.0.1:${port}/top.png`,
      middle: `http://127.0.0.1:${port}/middle.png`,
      bottom: `http://127.0.0.1:${port}/bottom.png`,
    },
  };
}

async function rgba(filePath: string): Promise<RgbaImage> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixel(image: RgbaImage, x: number, y: number): Pixel {
  const index = (Math.round(y) * image.width + Math.round(x)) * 4;
  return {
    r: image.data[index] ?? 0,
    g: image.data[index + 1] ?? 0,
    b: image.data[index + 2] ?? 0,
    a: image.data[index + 3] ?? 0,
  };
}

function countPixels(
  image: RgbaImage,
  bounds: { left: number; top: number; right: number; bottom: number },
  predicate: (value: Pixel) => boolean,
) {
  let count = 0;
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (predicate(pixel(image, x, y))) count += 1;
    }
  }
  return count;
}

function markerCentroidX(image: RgbaImage) {
  let weighted = 0;
  let count = 0;
  for (let y = 315; y <= 325; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const value = pixel(image, x, y);
      if (value.r > 35 && value.b > 35 && value.r > value.g * 2 && value.b > value.g * 2) {
        weighted += x;
        count += 1;
      }
    }
  }
  assert(count > 20, "Could not locate the middle panel's magenta transform marker");
  return weighted / count;
}

function greenBandBounds(image: RgbaImage) {
  const rows: number[] = [];
  for (let y = 0; y < image.height; y += 1) {
    const value = pixel(image, 20, y);
    if (value.g > 20 && value.g > value.r * 1.7 && value.g > value.b * 1.3) rows.push(y);
  }
  assert(rows.length > 2, "Could not locate the middle panel's Mirror band");
  return { top: rows[0]!, bottom: rows.at(-1)! };
}

function meanAbsoluteRgbError(left: RgbaImage, right: RgbaImage) {
  assert(left.width === right.width && left.height === right.height, "Parity images have different dimensions");
  let sum = 0;
  const channels = left.width * left.height * 3;
  for (let index = 0; index < left.data.length; index += 4) {
    sum += Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0));
    sum += Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0));
    sum += Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
  }
  return sum / channels;
}

function assertAuthoredProof(elements: ReturnType<typeof buildColinEffectProofElements>) {
  const caption = elements.find((element) => element.id === "proof-title");
  assert(caption?.type === "caption_text" && caption.props?.text === "PORTLAND", "Proof title must remain editable caption data");
  const panels = elements.filter((element) => element.type === "still");
  assert(panels.length === 3, "Proof must contain three visual panels");
  for (const panel of panels) {
    const keyframes = readKeyframeMap(panel.props);
    for (const field of ["media_scale", "media_offset_x", "media_offset_y", "mask_inset", "media_opacity", "mask_feather"]) {
      const values = keyframes[field]?.map((point) => JSON.stringify(point.v)) ?? [];
      assert(values.length === 3 && new Set(values).size === 3, `${panel.id} must have three distinct ${field} values`);
    }
  }
  const middleMasks = readKeyframeMap(panels.find((panel) => panel.id === "proof-middle")?.props).mask_inset ?? [];
  assert(middleMasks.every((point) => Array.isArray(point.v) && Math.abs((point.v[0] ?? 0) - (point.v[2] ?? 0)) < 0.001), "Middle panel must use a symmetric Mirror band");
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "colin-effect-proof-"));
  const projectDir = path.join(temporaryRoot, "projects", "colin-effect-proof");
  const mediaDir = path.join(projectDir, "media");
  const framesDir = path.join(temporaryRoot, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  let serveUrl: string | null = null;
  let server: Server | null = null;

  try {
    await writePanelMedia(mediaDir);
    const media = await startMediaServer(mediaDir);
    server = media.server;
    const elements = buildColinEffectProofElements(media.urls);
    assertAuthoredProof(elements);

    fs.mkdirSync(projectDir, { recursive: true });
    const createdAt = "2026-07-13T00:00:00.000Z";
    const timelineElements = elements.map((element) => ({
      ...element,
      project_id: "colin-effect-proof",
      beat_id: null,
      voice_clip_id: null,
      character_id: null,
      position_locked: false,
      removed_at: null,
      removed_reason: null,
      created_at: createdAt,
      updated_at: createdAt,
    }));
    fs.writeFileSync(path.join(projectDir, "timeline.json"), `${JSON.stringify({ elements: timelineElements, transitions: [] }, null, 2)}\n`);
    fs.writeFileSync(path.join(projectDir, "metadata.json"), `${JSON.stringify({
      output_aspect_ratio: "9:16",
      lane_order_keys: COLIN_EFFECT_PROOF_LANE_ORDER,
      lane_defaults: {},
      muted_lane_keys: [],
      delivery_target: "web",
      title: "Generated Colin Effect Proof",
      generated_fixture: true,
    }, null, 2)}\n`);

    const inputProps = { elements, laneOrderKeys: [...COLIN_EFFECT_PROOF_LANE_ORDER] };
    serveUrl = await bundle({
      entryPoint: path.resolve("src/lib/remotion/ColinEffectProofFixture.tsx"),
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...(config.resolve?.alias ?? {}),
            "@": path.resolve("src"),
          },
        },
      }),
      onProgress: () => undefined,
    });
    const composition = await selectComposition({
      serveUrl,
      id: COLIN_EFFECT_PROOF_ID,
      inputProps,
    });

    const stillPaths: string[] = [];
    for (const frame of FRAMES) {
      const output = path.join(framesDir, `still-${frame}.png`);
      await renderStill({ composition, serveUrl, inputProps, output, imageFormat: "png", frame });
      stillPaths.push(output);
    }
    const stills = await Promise.all(stillPaths.map(rgba));
    const [initial, knocked, open] = stills;
    assert(initial && knocked && open, "Expected three representative proof frames");

    const top = pixel(initial, 20, 100);
    const middle = pixel(initial, 20, 320);
    const bottom = pixel(initial, 20, 550);
    assert(top.r > top.g * 2 && top.r > top.b * 2, "Initial frame does not show the red top panel");
    assert(middle.g > middle.r * 2 && middle.g > middle.b * 1.5, "Initial frame does not show the green middle panel");
    assert(bottom.b > bottom.r * 2 && bottom.b > bottom.g * 1.5, "Initial frame does not show the blue bottom panel");

    const titleBounds = { left: 35, top: 220, right: 325, bottom: 310 };
    const isTitleYellow = (value: Pixel) => value.r > 180 && value.g > 140 && value.b < 100;
    const initialTitlePixels = countPixels(initial, titleBounds, isTitleYellow);
    const openTitlePixels = countPixels(open, titleBounds, isTitleYellow);
    assert(initialTitlePixels < 20, `Caption leaked above its covering panel (${initialTitlePixels} yellow pixels)`);
    assert(openTitlePixels > 1_000, `Masked panel did not reveal the editable caption (${openTitlePixels} yellow pixels)`);

    const middleBrightness = [initial, knocked, open].map((image) => {
      const value = pixel(image, 20, 320);
      return value.r + value.g + value.b;
    });
    assert(
      middleBrightness[0]! > middleBrightness[1]! + 30 && middleBrightness[1]! > middleBrightness[2]! + 20,
      `Opacity keyframes did not reduce middle-panel brightness: ${middleBrightness.join("/")}`,
    );

    const markerCentroids = [initial, knocked, open].map(markerCentroidX);
    assert(Math.abs(markerCentroids[0]! - markerCentroids[1]!) > 15, `First transform knock did not move the marker: ${markerCentroids.join("/")}`);
    assert(Math.abs(markerCentroids[1]! - markerCentroids[2]!) > 30, `Second transform knock did not move the marker: ${markerCentroids.join("/")}`);

    const openBand = greenBandBounds(open);
    const bandCenter = (openBand.top + openBand.bottom) / 2;
    assert(Math.abs(bandCenter - (COLIN_EFFECT_PROOF_HEIGHT - 1) / 2) <= 2, `Mirror band is not symmetric around frame center: ${openBand.top}-${openBand.bottom}`);

    const videoPath = path.join(temporaryRoot, "colin-effect-proof.mp4");
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: "h264",
      crf: 1,
      outputLocation: videoPath,
    });
    execFileSync("ffmpeg", [
      "-y", "-v", "error", "-i", videoPath,
      "-vf", `select='${FRAMES.map((frame) => `eq(n\\,${frame})`).join("+")}'`,
      "-fps_mode", "vfr",
      path.join(framesDir, "export-%02d.png"),
    ]);
    const exportPaths = fs.readdirSync(framesDir)
      .filter((name) => name.startsWith("export-") && name.endsWith(".png"))
      .sort()
      .map((name) => path.join(framesDir, name));
    assert(exportPaths.length === FRAMES.length, `Expected ${FRAMES.length} exported proof frames, got ${exportPaths.length}`);
    const exported = await Promise.all(exportPaths.map(rgba));
    const parityErrors = stills.map((still, index) => meanAbsoluteRgbError(still, exported[index]!));
    assert(parityErrors.every((error) => error < 4), `Still/export pixel parity exceeded tolerance: ${parityErrors.join("/")}`);

    console.log(JSON.stringify({
      verified: true,
      project: "generated temporary colin-effect-proof",
      frames: [...FRAMES],
      title_pixels: { covered: initialTitlePixels, revealed: openTitlePixels },
      middle_panel_brightness: middleBrightness,
      transform_marker_centroid_x: markerCentroids.map((value) => Number(value.toFixed(2))),
      mirror_band: openBand,
      still_export_mean_absolute_rgb_error: parityErrors.map((value) => Number(value.toFixed(3))),
      live_demo_touched: false,
      artifacts_retained: process.env.KEEP_COLIN_PROOF_ARTIFACTS === "1" ? temporaryRoot : null,
    }, null, 2));
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (serveUrl) fs.rmSync(serveUrl, { recursive: true, force: true });
    if (process.env.KEEP_COLIN_PROOF_ARTIFACTS !== "1") fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
