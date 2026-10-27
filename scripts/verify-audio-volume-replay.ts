/**
 * Regression probe for the editor sequence:
 * play an audio clip -> seek back -> change gain -> replay without refreshing.
 *
 * The probe works on a temporary project clone and removes it afterward.
 *
 * Usage:
 *   pnpm verify:audio-volume-replay --project <projectId> \
 *     --element <audioElementId> [--volume 1.08] [--port 3124]
 */

import fs from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright-core";

import { projectDir } from "@/lib/local-store/paths";
import { readTimeline } from "@/lib/local-store/store";
import { shouldUseWebAudioForMedia } from "@/lib/remotion/media-web-audio";

const FPS = 30;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceProjectId = argument("project");
const elementId = argument("element");
const port = Number(argument("port") ?? "3124");
const requestedVolume = Number(argument("volume") ?? "1.08");

if (!sourceProjectId || !elementId || !Number.isFinite(requestedVolume)) {
  throw new Error(
    "Usage: pnpm verify:audio-volume-replay --project <projectId> "
      + "--element <audioElementId> [--volume 1.08] [--port 3124]",
  );
}

const fixtureProjectId = `qa-audio-volume-replay-${Date.now()}`;
const fixtureDir = projectDir(fixtureProjectId);
const sourceDir = projectDir(sourceProjectId);
const baseUrl = `http://127.0.0.1:${port}`;

type TransportProbe = {
  isPlaying: () => boolean;
  togglePlay: () => void;
  seekToFrame: (frame: number) => void;
};

function envelopeNeedsAmplification(
  volume: number | null | undefined,
  envelope: unknown[],
) {
  return Number(volume) > 1
    || envelope.some((point) => (
      point != null
      && typeof point === "object"
      && Number((point as { volume?: unknown }).volume) > 1
    ));
}

async function transport(page: Page, command: "stop" | "play" | "seek", frame?: number) {
  await page.evaluate(({ nextCommand, nextFrame }) => {
    const probe = (window as unknown as { __timelineTransportProbe: TransportProbe })
      .__timelineTransportProbe;
    if (nextCommand === "stop" && probe.isPlaying()) probe.togglePlay();
    if (nextCommand === "play" && !probe.isPlaying()) probe.togglePlay();
    if (nextCommand === "seek") probe.seekToFrame(nextFrame ?? 0);
  }, { nextCommand: command, nextFrame: frame });
}

async function measureSourcePlayback(page: Page, sourceNeedle: string, playbackMs: number) {
  return page.evaluate(async ({ needle, durationMs }) => {
    const root = document.querySelector("[data-composition-master-frame='true']");
    if (!root) throw new Error("Composition frame did not mount.");
    const playedSeconds = (media: HTMLMediaElement) => {
      let total = 0;
      for (let index = 0; index < media.played.length; index += 1) {
        total += media.played.end(index) - media.played.start(index);
      }
      return total;
    };
    let minimumTime = Number.POSITIVE_INFINITY;
    let maximumTime = Number.NEGATIVE_INFINITY;
    let minimumPlayed = Number.POSITIVE_INFINITY;
    let maximumPlayed = Number.NEGATIVE_INFINITY;
    const deadline = performance.now() + durationMs;
    while (performance.now() < deadline) {
      const media = Array.from(root.querySelectorAll<HTMLMediaElement>("audio,video"))
        .find((candidate) => (candidate.currentSrc || candidate.src).includes(needle));
      if (media) {
        minimumTime = Math.min(minimumTime, media.currentTime);
        maximumTime = Math.max(maximumTime, media.currentTime);
        const played = playedSeconds(media);
        minimumPlayed = Math.min(minimumPlayed, played);
        maximumPlayed = Math.max(maximumPlayed, played);
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    return {
      found: Number.isFinite(minimumTime),
      currentTimeGrowth: Number.isFinite(minimumTime) ? maximumTime - minimumTime : 0,
      playedRangeGrowth: Number.isFinite(minimumPlayed) ? maximumPlayed - minimumPlayed : 0,
    };
  }, { needle: sourceNeedle, durationMs: playbackMs });
}

async function playPass(page: Page, startFrame: number, sourceNeedle: string) {
  await transport(page, "stop");
  await transport(page, "seek", startFrame);
  await page.waitForTimeout(1_200);
  await transport(page, "play");
  const result = await measureSourcePlayback(page, sourceNeedle, 2_500);
  await transport(page, "stop");
  return result;
}

async function main() {
  if (!fs.existsSync(sourceDir)) throw new Error(`Project not found: ${sourceProjectId}`);
  fs.cpSync(sourceDir, fixtureDir, { recursive: true });

  const timeline = readTimeline(fixtureProjectId);
  const element = timeline.elements.find((candidate) => candidate.id === elementId);
  if (!element?.source_url) throw new Error(`Audio element not found: ${elementId}`);
  const sourceNeedle = path.basename(element.source_url).split("?")[0]!;
  // Start inside the clip so this gate measures replay after mutation rather
  // than conflating it with cold decoder startup at the clip boundary.
  const startFrame = Math.max(0, Math.floor((element.timeline_start + 0.25) * FPS));
  const envelope = Array.isArray(element.props?.volume_envelope)
    ? element.props.volume_envelope
    : [
        { time_seconds: 0, volume: element.volume ?? 1 },
        { time_seconds: element.duration, volume: element.volume ?? 1 },
      ];
  const nextEnvelope = envelope.map((point) => (
    point && typeof point === "object"
      ? { ...point, volume: requestedVolume }
      : point
  ));
  const originalUsesWebAudio = shouldUseWebAudioForMedia({
    src: element.source_url,
    needsAmplification: envelopeNeedsAmplification(element.volume, envelope),
  });
  const testedUsesWebAudio = shouldUseWebAudioForMedia({
    src: element.source_url,
    needsAmplification: envelopeNeedsAmplification(requestedVolume, nextEnvelope),
  });

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
      () => (window as unknown as {
        __timelineTransportProbe?: { getCurrentFrame: () => number | null };
      }).__timelineTransportProbe?.getCurrentFrame() != null,
      undefined,
      { timeout: 45_000 },
    );
    await page.waitForTimeout(1_200);
    const navigationBaseline = mainFrameNavigations;
    const firstPass = await playPass(page, startFrame, sourceNeedle);

    const patchResponse = await page.evaluate(async ({
      projectId,
      targetElementId,
      volume,
      volumeEnvelope,
    }) => {
      const response = await fetch(
        `/api/projects/${projectId}/timeline/elements/${targetElementId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            volume,
            props: { volume_envelope: volumeEnvelope },
          }),
        },
      );
      return { ok: response.ok, status: response.status, body: await response.text() };
    }, {
      projectId: fixtureProjectId,
      targetElementId: elementId,
      volume: requestedVolume,
      volumeEnvelope: nextEnvelope,
    });
    if (!patchResponse.ok) {
      throw new Error(`Volume patch failed (${patchResponse.status}): ${patchResponse.body}`);
    }

    // Stable review reconciles external timeline revisions in place.
    await page.waitForTimeout(1_500);
    const secondPass = await playPass(page, startFrame, sourceNeedle);
    const pass = firstPass.found
      && firstPass.currentTimeGrowth > 0.5
      && secondPass.found
      && secondPass.currentTimeGrowth > 0.5
      && mainFrameNavigations === navigationBaseline;
    const receipt = {
      pass,
      sourceProjectId,
      fixtureProjectId,
      elementId,
      originalVolume: element.volume,
      testedVolume: requestedVolume,
      originalTopology: originalUsesWebAudio ? "web-audio" : "native-media",
      testedTopology: testedUsesWebAudio ? "web-audio" : "native-media",
      topologyChanged: originalUsesWebAudio !== testedUsesWebAudio,
      mainFrameNavigations,
      navigationBaseline,
      firstPass,
      secondPass,
    };
    console.log(JSON.stringify(receipt, null, 2));
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
