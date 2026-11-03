/**
 * Regression probe for continuous fader auditioning while the Player runs.
 *
 * The probe clones a project, starts playback inside the target audio clip,
 * drives the editor-only preview gain store at pointer-move frequency, and
 * proves that both Player and media clocks keep advancing without navigation.
 *
 * Usage:
 *   pnpm verify:audio-live-gain --project <projectId> \
 *     --element <audioElementId> [--low 0.25] [--high 0.65] [--port 3124]
 */

import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import { projectDir } from "@/lib/local-store/paths";
import { readTimeline } from "@/lib/local-store/store";

const FPS = 30;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceProjectId = argument("project");
const elementId = argument("element");
const port = Number(argument("port") ?? "3124");
const lowGain = Number(argument("low") ?? "0.25");
const highGain = Number(argument("high") ?? "0.65");

if (
  !sourceProjectId
  || !elementId
  || !Number.isFinite(lowGain)
  || !Number.isFinite(highGain)
) {
  throw new Error(
    "Usage: pnpm verify:audio-live-gain --project <projectId> "
      + "--element <audioElementId> [--low 0.25] [--high 0.65] [--port 3124]",
  );
}

const requiredElementId = elementId;
const fixtureProjectId = `qa-audio-live-gain-${Date.now()}`;
const fixtureDir = projectDir(fixtureProjectId);
const sourceDir = projectDir(sourceProjectId);
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  if (!fs.existsSync(sourceDir)) throw new Error(`Project not found: ${sourceProjectId}`);
  fs.cpSync(sourceDir, fixtureDir, { recursive: true });

  const timeline = readTimeline(fixtureProjectId);
  const element = timeline.elements.find((candidate) => candidate.id === elementId);
  if (!element?.source_url) throw new Error(`Audio element not found: ${elementId}`);
  const sourceNeedle = path.basename(element.source_url).split("?")[0]!;
  const startFrame = Math.max(0, Math.floor((element.timeline_start + 0.25) * FPS));

  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript("window.__name = (func) => func;");
  let mainFrameNavigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });

  try {
    await page.goto(`${baseUrl}/p/${fixtureProjectId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForFunction(
      () => {
        const target = window as unknown as {
          __timelineTransportProbe?: { getCurrentFrame: () => number | null };
          __timelineAudioPreviewGainProbe?: { set: (id: string, gain: number) => void };
        };
        return target.__timelineTransportProbe?.getCurrentFrame() != null
          && typeof target.__timelineAudioPreviewGainProbe?.set === "function";
      },
      undefined,
      { timeout: 45_000 },
    );
    await page.waitForTimeout(1_200);
    const navigationBaseline = mainFrameNavigations;

    const receipt = await page.evaluate(async ({
      targetElementId,
      needle,
      targetFrame,
      low,
      high,
    }) => {
      const target = window as unknown as {
        __timelineTransportProbe: {
          getCurrentFrame: () => number | null;
          isPlaying: () => boolean;
          togglePlay: () => void;
          seekToFrame: (frame: number) => void;
        };
        __timelineAudioPreviewGainProbe: {
          set: (id: string, gain: number) => void;
          clear: (id: string) => void;
        };
      };
      const transport = target.__timelineTransportProbe;
      const gainProbe = target.__timelineAudioPreviewGainProbe;
      if (transport.isPlaying()) transport.togglePlay();
      transport.seekToFrame(targetFrame);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      transport.togglePlay();
      // Judge the live fader, not the browser's initial decoder wake-up. The
      // continuous-playback gate owns cold-start readiness separately.
      await new Promise((resolve) => setTimeout(resolve, 700));

      const samples: Array<{
        wallMs: number;
        frame: number;
        mediaTime: number | null;
        buffering: boolean;
      }> = [];
      const startedAt = performance.now();
      let nextGainAt = startedAt;
      let gainIndex = 0;
      const durationMs = 3_000;
      while (performance.now() - startedAt < durationMs) {
        const now = performance.now();
        if (now >= nextGainAt) {
          gainProbe.set(targetElementId, gainIndex % 2 === 0 ? low : high);
          gainIndex += 1;
          nextGainAt += 33;
        }
        const root = document.querySelector("[data-composition-master-frame='true']");
        const media = root
          ? Array.from(root.querySelectorAll<HTMLMediaElement>("audio,video"))
            .find((candidate) => (candidate.currentSrc || candidate.src).includes(needle))
          : null;
        samples.push({
          wallMs: now - startedAt,
          frame: transport.getCurrentFrame() ?? -1,
          mediaTime: media?.currentTime ?? null,
          buffering: document.querySelector("[data-preview-buffering='true']") != null,
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      gainProbe.clear(targetElementId);
      if (transport.isPlaying()) transport.togglePlay();

      const validFrames = samples.filter((sample) => sample.frame >= 0);
      const validMedia = samples.filter((sample) => sample.mediaTime != null);
      let longestPlayerStallMs = 0;
      let stallStartedAt = validFrames[0]?.wallMs ?? 0;
      let previousFrame = validFrames[0]?.frame ?? -1;
      let mediaRewinds = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const sample = samples[index]!;
        if (sample.frame !== previousFrame) {
          longestPlayerStallMs = Math.max(longestPlayerStallMs, sample.wallMs - stallStartedAt);
          stallStartedAt = sample.wallMs;
          previousFrame = sample.frame;
        }
        const previousMediaTime = samples[index - 1]!.mediaTime;
        if (
          sample.mediaTime != null
          && previousMediaTime != null
          && sample.mediaTime < previousMediaTime - 0.1
        ) {
          mediaRewinds += 1;
        }
      }
      const firstFrame = validFrames[0]?.frame ?? -1;
      const lastFrame = validFrames.at(-1)?.frame ?? -1;
      const firstMediaTime = validMedia[0]?.mediaTime ?? null;
      const lastMediaTime = validMedia.at(-1)?.mediaTime ?? null;
      const wallSeconds = (samples.at(-1)?.wallMs ?? 0) / 1_000;
      const playerGrowthSeconds = firstFrame >= 0 && lastFrame >= 0
        ? (lastFrame - firstFrame) / 30
        : 0;
      return {
        gainUpdates: gainIndex,
        wallSeconds,
        playerGrowthSeconds,
        playerClockRatio: wallSeconds > 0 ? playerGrowthSeconds / wallSeconds : 0,
        mediaGrowthSeconds: firstMediaTime != null && lastMediaTime != null
          ? lastMediaTime - firstMediaTime
          : 0,
        mediaFoundSamples: validMedia.length,
        mediaRewinds,
        longestPlayerStallMs,
        bufferingSamples: samples.filter((sample) => sample.buffering).length,
      };
    }, {
      targetElementId: requiredElementId,
      needle: sourceNeedle,
      targetFrame: startFrame,
      low: lowGain,
      high: highGain,
    });

    const pass = receipt.gainUpdates >= 60
      && receipt.playerClockRatio >= 0.75
      && receipt.playerClockRatio <= 1.25
      && receipt.mediaGrowthSeconds >= 1
      && receipt.mediaRewinds === 0
      && receipt.longestPlayerStallMs < 400
      && mainFrameNavigations === navigationBaseline;
    console.log(JSON.stringify({
      pass,
      sourceProjectId,
      fixtureProjectId,
      elementId,
      lowGain,
      highGain,
      mainFrameNavigations,
      navigationBaseline,
      ...receipt,
    }, null, 2));
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
