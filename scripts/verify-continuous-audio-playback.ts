/**
 * Sound-enabled behavioral acceptance probe for Timeline Editor playback.
 *
 * Usage:
 *   pnpm verify:audio-playback --project <projectId> \
 *     [--at <boundarySeconds>] [--name <boundaryName>] [--port 3124]
 *
 * With no --at, the command selects the first flush boundary between audible
 * video clips. It seeks before that boundary, plays through it once via the
 * editor's real transport, and persists a pass/fail receipt under the project.
 */

import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-core";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { projectDir } from "@/lib/local-store/paths";
import { readTimeline } from "@/lib/local-store/store";
import {
  assessContinuousAudioPlayback,
  type ContinuousPlaybackMediaEvent,
  type ContinuousPlaybackSample,
} from "@/lib/qc/continuous-audio-playback";

const FPS = 30;
const SAMPLE_INTERVAL_MS = 100;
const DEFAULT_PRE_ROLL_SECONDS = 1.5;
const DEFAULT_POST_ROLL_SECONDS = 4;
const RAF_MIN_TICKS_PER_SECOND = 20;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const projectId = argument("project");
if (!projectId) {
  throw new Error(
    "Usage: pnpm verify:audio-playback --project <projectId> [--at <seconds>] [--name <boundaryName>] [--port 3124]",
  );
}

const requestedAt = argument("at");
const port = Number(argument("port") ?? "3124");
const preRollSeconds = Number(argument("pre") ?? DEFAULT_PRE_ROLL_SECONDS);
const postRollSeconds = Number(argument("post") ?? DEFAULT_POST_ROLL_SECONDS);
const baseUrl = `http://127.0.0.1:${port}`;

function isAudibleVideo(element: TimelineElement) {
  return element.type === "video_clip"
    && element.removed_at == null
    && (element.volume ?? 1) > 0;
}

function resolveBoundary() {
  if (requestedAt != null) {
    const seconds = Number(requestedAt);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid --at value: ${requestedAt}`);
    }
    return {
      seconds,
      name: argument("name") ?? `timeline-${seconds.toFixed(3)}s`,
      source: "explicit" as const,
    };
  }

  const audible = readTimeline(projectId!).elements
    .filter(isAudibleVideo)
    .sort((a, b) => a.timeline_start - b.timeline_start);
  for (let index = 1; index < audible.length; index += 1) {
    const previous = audible[index - 1]!;
    const current = audible[index]!;
    const previousEnd = previous.timeline_start + previous.duration;
    if (Math.abs(previousEnd - current.timeline_start) <= 1 / FPS + 0.001) {
      return {
        seconds: current.timeline_start,
        name: argument("name")
          ?? `${previous.id.slice(0, 8)}-to-${current.id.slice(0, 8)}`,
        source: "first-flush-audible-video-boundary" as const,
      };
    }
  }
  throw new Error(
    "No flush audible-video boundary was found. Provide --at <seconds> and --name <label>.",
  );
}

async function main() {
  const boundary = resolveBoundary();
  const startSeconds = Math.max(0, boundary.seconds - preRollSeconds);
  const observationSeconds = boundary.seconds - startSeconds + postRollSeconds;
  const boundaryFrame = Math.round(boundary.seconds * FPS);
  const startFrame = Math.round(startSeconds * FPS);

  const response = await fetch(`${baseUrl}/p/${projectId}`, { redirect: "manual" }).catch(() => null);
  if (!response || response.status >= 500) {
    throw new Error(
      `Timeline Editor is not available at ${baseUrl}. Start the review or dev server, then rerun the probe.`,
    );
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addInitScript("window.__name = (func) => func;");
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 400));
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 400)}`));

  try {
    await page.goto(`${baseUrl}/p/${projectId}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForFunction(
      () => {
        const probe = (window as unknown as {
          __timelineTransportProbe?: { getCurrentFrame: () => number | null };
        }).__timelineTransportProbe;
        return probe?.getCurrentFrame() != null;
      },
      undefined,
      { timeout: 45_000 },
    );

    const environment = await page.evaluate(async () => {
      let ticks = 0;
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const tick = () => {
          ticks += 1;
          if (performance.now() - startedAt < 1_000) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
        setTimeout(resolve, 1_500);
      });
      return { visibilityState: document.visibilityState, rafTicksPerSecond: ticks };
    });
    const environmentValid = environment.visibilityState === "visible"
      && environment.rafTicksPerSecond >= RAF_MIN_TICKS_PER_SECOND;
    if (!environmentValid) {
      throw new Error(
        `Probe environment is invalid (${environment.visibilityState}, ${environment.rafTicksPerSecond} rAF ticks/s).`,
      );
    }

    await page.evaluate((frame) => {
      const probe = (window as unknown as {
        __timelineTransportProbe: {
          isPlaying: () => boolean;
          togglePlay: () => void;
          seekToFrame: (nextFrame: number) => void;
        };
      }).__timelineTransportProbe;
      if (probe.isPlaying()) probe.togglePlay();
      probe.seekToFrame(frame);
    }, startFrame);
    await page.waitForTimeout(1_200);

    const collected = await page.evaluate(async ({
      playbackMs,
      sampleIntervalMs,
    }) => {
      const probe = (window as unknown as {
        __timelineTransportProbe: {
          isPlaying: () => boolean;
          togglePlay: () => void;
          getCurrentFrame: () => number | null;
        };
      }).__timelineTransportProbe;
      const root = document.querySelector("[data-composition-master-frame='true']");
      if (!root) throw new Error("Composition frame did not mount.");

      const startedAt = performance.now();
      const events: Array<{
        wallMs: number;
        key: string;
        audible: boolean;
        event: "waiting" | "playing" | "stalled" | "seeking" | "seeked" | "error";
      }> = [];
      const attached = new WeakSet<HTMLMediaElement>();
      const eventNames = ["waiting", "playing", "stalled", "seeking", "seeked", "error"] as const;
      const keyFor = (media: HTMLMediaElement) => media.currentSrc || media.src || media.tagName.toLowerCase();
      const attach = () => {
        for (const media of root.querySelectorAll<HTMLMediaElement>("audio,video")) {
          if (attached.has(media)) continue;
          attached.add(media);
          for (const event of eventNames) {
            media.addEventListener(event, () => {
              events.push({
                wallMs: performance.now() - startedAt,
                key: keyFor(media),
                audible: !media.muted && media.volume > 0,
                event,
              });
            });
          }
        }
      };
      const observer = new MutationObserver(attach);
      observer.observe(root, { childList: true, subtree: true });
      attach();

      const playedSeconds = (media: HTMLMediaElement) => {
        let total = 0;
        for (let index = 0; index < media.played.length; index += 1) {
          total += media.played.end(index) - media.played.start(index);
        }
        return total;
      };
      const samples: Array<{
        wallMs: number;
        frame: number | null;
        media: Array<{
          key: string;
          tag: "audio" | "video";
          audible: boolean;
          paused: boolean;
          currentTime: number;
          playedSeconds: number;
        }>;
      }> = [];

      probe.togglePlay();
      while (performance.now() - startedAt < playbackMs) {
        attach();
        samples.push({
          wallMs: performance.now() - startedAt,
          frame: probe.getCurrentFrame(),
          media: Array.from(root.querySelectorAll<HTMLMediaElement>("audio,video"))
            .filter((media) => {
              const source = media.currentSrc || media.src;
              return source.length > 0 && !source.startsWith("data:");
            })
            .map((media) => ({
              key: keyFor(media),
              tag: media.tagName.toLowerCase() as "audio" | "video",
              audible: !media.muted && media.volume > 0 && !media.paused,
              paused: media.paused,
              currentTime: media.currentTime,
              playedSeconds: playedSeconds(media),
            })),
        });
        await new Promise((resolve) => setTimeout(resolve, sampleIntervalMs));
      }
      if (probe.isPlaying()) probe.togglePlay();
      observer.disconnect();
      return { samples, events };
    }, {
      playbackMs: Math.ceil(observationSeconds * 1000),
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
    });

    const samples = collected.samples as ContinuousPlaybackSample[];
    const events = collected.events as ContinuousPlaybackMediaEvent[];
    const assessment = assessContinuousAudioPlayback({
      samples,
      events,
      fps: FPS,
      boundaryFrame,
    });
    const recordedAt = new Date().toISOString();
    const receipt = {
      schema: 1,
      kind: "continuous-audio-playback",
      projectId,
      baseUrl,
      recordedAt,
      boundary,
      window: {
        startSeconds,
        endSeconds: boundary.seconds + postRollSeconds,
        preRollSeconds: boundary.seconds - startSeconds,
        postRollSeconds,
      },
      environment,
      assessment,
      mediaEvents: events,
      consoleErrors,
    };
    const receiptDir = path.join(
      projectDir(projectId!),
      "preprocess",
      "continuous-audio-playback",
    );
    fs.mkdirSync(receiptDir, { recursive: true });
    const stamp = recordedAt.replace(/[:.]/g, "-").slice(0, 19);
    const receiptPath = path.join(receiptDir, `${boundary.name}-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    console.log(JSON.stringify(receipt, null, 2));
    console.log(`\n${assessment.pass ? "PASS" : "FAIL"} ${boundary.name}`);
    console.log(`receipt: ${receiptPath}`);
    if (!assessment.pass) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

void main();
