/**
 * Regression probe: changing an audio clip's timeline position while preview
 * is mounted must not silence that clip or another overlapping audio track.
 *
 * The probe works on a temporary project clone and deletes it afterward.
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

if (!sourceProjectId || !elementId) {
  throw new Error(
    "Usage: tsx scripts/verify-audio-timing-edit-replay.ts "
      + "--project <projectId> --element <audioElementId> [--port 3124]",
  );
}

const fixtureProjectId = `qa-audio-timing-edit-${Date.now()}`;
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
  const movedStart = Number((element.timeline_start + 0.2).toFixed(3));

  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript("window.__name = (func) => func;");

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

    const result = await page.evaluate(async ({
      projectId,
      targetElementId,
      nextStart,
      targetSourceNeedle,
      startFrame,
    }) => {
      const transport = (window as unknown as {
        __timelineTransportProbe: {
          getCurrentFrame: () => number | null;
          isPlaying: () => boolean;
          togglePlay: () => void;
          seekToFrame: (frame: number) => void;
        };
      }).__timelineTransportProbe;
      if (transport.isPlaying()) transport.togglePlay();
      transport.seekToFrame(startFrame);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      transport.togglePlay();
      await new Promise((resolve) => setTimeout(resolve, 800));
      const channelNodesBefore = new Map(
        Array.from(document.querySelectorAll<HTMLAudioElement>("[data-timeline-preview-audio-id]"))
          .map((node) => [node.dataset.timelinePreviewAudioId!, node]),
      );

      const editStarts = [
        nextStart - 0.12,
        nextStart + 0.08,
        nextStart - 0.06,
        nextStart + 0.04,
        nextStart - 0.02,
        nextStart,
      ];
      for (const timelineStart of editStarts) {
        const response = await fetch(`/api/projects/${projectId}/timeline/elements/${targetElementId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeline_start: timelineStart }),
        });
        if (!response.ok) throw new Error(`Timing patch failed: ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      const channelNodesAfter = new Map(
        Array.from(document.querySelectorAll<HTMLAudioElement>("[data-timeline-preview-audio-id]"))
          .map((node) => [node.dataset.timelinePreviewAudioId!, node]),
      );
      const channelIdentityStable = (
        channelNodesBefore.size > 0
        && channelNodesBefore.size === channelNodesAfter.size
        && Array.from(channelNodesBefore).every(
          ([id, node]) => channelNodesAfter.get(id) === node,
        )
      );
      const duplicateRemotionStandaloneAudioCount = document.querySelectorAll(
        "audio[title^='timeline-audio:']",
      ).length;
      if (transport.isPlaying()) transport.togglePlay();
      transport.seekToFrame(startFrame);
      await new Promise((resolve) => setTimeout(resolve, 500));
      transport.togglePlay();

      const samples: Array<{
        frame: number | null;
        targetTime: number | null;
        audibleAudioCount: number;
        activeSources: string[];
        activeTopologies: string[];
        readiness: string | null;
        buffering: boolean;
      }> = [];
      const deadline = performance.now() + 1_500;
      while (performance.now() < deadline) {
        const root = document.querySelector("[data-composition-master-frame='true']");
        const audio = root ? Array.from(root.querySelectorAll<HTMLAudioElement>("audio")) : [];
        const target = audio.find((node) => (node.currentSrc || node.src).includes(targetSourceNeedle));
        samples.push({
          frame: transport.getCurrentFrame(),
          targetTime: target?.currentTime ?? null,
          audibleAudioCount: audio.filter(
            (node) => !node.paused && !node.muted && node.volume > 0,
          ).length,
          activeSources: audio
            .filter((node) => !node.paused && !node.muted && node.volume > 0)
            .map((node) => (node.currentSrc || node.src).split("/").at(-1) ?? "unknown"),
          activeTopologies: audio
            .filter((node) => !node.paused && !node.muted && node.volume > 0)
            .map((node) => node.title.split(":").at(-1) ?? "unmarked"),
          readiness: document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state") ?? null,
          buffering: document.querySelector("[data-preview-buffering='true']") != null,
        });
        await new Promise((resolve) => setTimeout(resolve, 75));
      }
      if (transport.isPlaying()) transport.togglePlay();

      const frames = samples.map((sample) => sample.frame).filter((frame): frame is number => frame != null);
      const targetTimes = samples
        .map((sample) => sample.targetTime)
        .filter((time): time is number => time != null);
      return {
        playerGrowthFrames: (frames.at(-1) ?? 0) - (frames[0] ?? 0),
        targetFoundSamples: targetTimes.length,
        targetGrowthSeconds: targetTimes.length > 1
          ? Math.max(...targetTimes) - Math.min(...targetTimes)
          : 0,
        overlappingAudioSamples: samples.filter((sample) => sample.audibleAudioCount >= 2).length,
        activeSourceSets: [...new Set(samples.map((sample) => sample.activeSources.sort().join(" + ")))],
        activeTopologySets: [...new Set(samples.map((sample) => sample.activeTopologies.sort().join(" + ")))],
        channelIdentityStable,
        duplicateRemotionStandaloneAudioCount,
        audibleSamples: samples.filter((sample) => sample.audibleAudioCount >= 1).length,
        bufferingSamples: samples.filter((sample) => sample.buffering).length,
        warmingSamples: samples.filter((sample) => sample.readiness === "warming").length,
      };
    }, {
      projectId: fixtureProjectId,
      targetElementId: element.id,
      nextStart: movedStart,
      targetSourceNeedle: sourceNeedle,
      startFrame: Math.round(Math.max(0, movedStart - 0.3) * FPS),
    });

    const pass = result.playerGrowthFrames >= 20
      && result.targetFoundSamples >= 5
      && result.targetGrowthSeconds >= 0.5
      && result.overlappingAudioSamples >= 3
      && result.channelIdentityStable
      && result.duplicateRemotionStandaloneAudioCount === 0
      && result.activeTopologySets.every(
        (set) => set === "" || set.split(" + ").every((topology) => topology === "persistent-web-audio"),
      )
      && result.audibleSamples >= 3
      && result.bufferingSamples < 10
      && result.warmingSamples < 10;
    console.log(JSON.stringify({ pass, sourceProjectId, fixtureProjectId, elementId, movedStart, ...result }, null, 2));
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
