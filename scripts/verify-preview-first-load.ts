/**
 * Muted, repeatable cold-load/seek/play browser probe for the timeline editor.
 *
 * OBSERVE-ONLY baseline instrument (Stage A of the preview first-load
 * readiness work, docs/plans/2026-07-22-timeline-preview-first-load-readiness-handoff.md):
 * it measures and records; it does not assert. Assertions grow into this same
 * script as the readiness gate lands.
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-preview-first-load.ts <projectId> \
 *     [--at 57] [--runs 10] [--port 3123] [--label dev]
 *
 * Per run (fresh incognito browser context, audio muted, headless):
 *   1. Environment precheck: document.visibilityState and requestAnimationFrame
 *      tick rate. Remotion 4.0.496 playback WEDGES when rAF is starved (hidden/
 *      occluded windows) with isPlaying() stuck true — indistinguishable from
 *      the bug under investigation — so a starved environment marks the run
 *      environment_invalid instead of reporting a product failure.
 *   2. Cold-load the project page; wait for the editor's transport probe hook
 *      (window.__timelineTransportProbe, installed by TimelineStep).
 *   3. Seek to the target second through the app's real seek path.
 *   4. Sample every mounted, src-bearing <audio>/<video> element's readyState
 *      until all reach HAVE_FUTURE_DATA (3) or the observation window ends.
 *   5. Request Play ONCE through the app's real toggle; measure time to first
 *      frame advancement and to 1s of advancement; count stall intervals.
 *   6. Collect aborted media requests, failed API responses, timeline/peaks
 *      response statuses, Fast Refresh events, and console/page errors.
 *
 * The JSON receipt lands in projects/<id>/preprocess/preview-first-load/.
 * Local evidence, not a file to commit.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { projectDir, projectTimelinePath } from "@/lib/local-store/paths";

const FPS = 30;
const READY_OBSERVATION_MS = 6_000;
const PLAY_OBSERVATION_MS = 8_000;
const SAMPLE_INTERVAL_MS = 100;
const STALL_THRESHOLD_MS = 500;
const RAF_MIN_TICKS_PER_SEC = 20;

type MediaSnapshot = {
  tag: string;
  src: string;
  readyState: number;
  networkState: number;
  currentTime: number;
  paused: boolean;
  video?: { width: number; height: number; totalFrames: number; droppedFrames: number };
};

type RunRecord = {
  run: number;
  startedAt: string;
  environment: { visibilityState: string; rafTicksPerSec: number; valid: boolean };
  tEditorMountedMs: number | null;
  seek: { targetFrame: number; actualFrame: number | null };
  media: {
    afterSeek: MediaSnapshot[];
    tAllActiveReadyMs: number | null;
    final: MediaSnapshot[];
  };
  play: {
    requested: boolean;
    tFirstAdvanceMs: number | null;
    tAdvance1sMs: number | null;
    stallIntervals: number;
    endFrame: number | null;
  };
  network: {
    abortedMediaRequests: number;
    failedApiResponses: Array<{ url: string; status: number }>;
    peaksResponses: number[];
  };
  fastRefreshEvents: number;
  consoleErrors: string[];
  notes: string[];
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error(
    "Usage: pnpm exec tsx scripts/verify-preview-first-load.ts <projectId> [--at 57] [--runs 10] [--port 3123] [--label dev]",
  );
}
const targetSeconds = Number(arg("at", "57"));
const runs = Number(arg("runs", "10"));
const port = Number(arg("port", "3123"));
const label = arg("label", port === 3124 ? "review" : "dev");
/** "" (baseline loop) | "delayed-media" | "remount" | "external-reconcile" | "freeze-classify" */
const variant = arg("variant", "");
/** freeze-classify only: how long to play and sample. */
const classifySeconds = Number(arg("seconds", "14"));
const baseUrl = `http://127.0.0.1:${port}`;

function percentile(values: number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function sampleMedia(page: Page): Promise<MediaSnapshot[]> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-composition-master-frame='true']");
    if (!root) return [];
    return Array.from(root.querySelectorAll("audio,video"))
      .map((node) => {
        const media = node as HTMLMediaElement;
        return {
          tag: media.tagName.toLowerCase(),
          src: (media.currentSrc || media.src || "").slice(-72),
          readyState: media.readyState,
          networkState: media.networkState,
          currentTime: Math.round(media.currentTime * 1000) / 1000,
          paused: media.paused,
          ...(media instanceof HTMLVideoElement ? { video: { width: media.videoWidth, height: media.videoHeight, totalFrames: media.getVideoPlaybackQuality().totalVideoFrames, droppedFrames: media.getVideoPlaybackQuality().droppedVideoFrames } } : {}),
        };
      })
      .filter((snapshot) => snapshot.src.length > 0);
  });
}

async function runTransportOwnershipVariant() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await openEditor(context);
  try {
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
      return {
        visibilityState: document.visibilityState,
        rafTicksPerSec: ticks,
      };
    });
    const environmentValid = environment.visibilityState === "visible"
      && environment.rafTicksPerSec >= RAF_MIN_TICKS_PER_SEC;
    if (!environmentValid) {
      console.log(JSON.stringify({
        schema: 1,
        kind: "preview-transport-ownership",
        projectId,
        label,
        baseUrl,
        targetSeconds,
        recordedAt: new Date().toISOString(),
        environment,
        pass: null,
        verdict: "environment_invalid: visible Player verification required",
      }, null, 2));
      return;
    }

    const targetFrame = Math.round(targetSeconds * FPS);
    await page.evaluate((frame) => {
      (window as unknown as {
        __timelineTransportProbe: { seekToFrame: (nextFrame: number) => void };
      }).__timelineTransportProbe.seekToFrame(frame);
    }, targetFrame);
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const result = await page.evaluate(async ({ sampleMs, playbackMs, settleMs }) => {
      const probe = (window as unknown as {
        __timelineTransportProbe: {
          seekToFrame: (nextFrame: number) => void;
          togglePlay: () => void;
          isPlaying: () => boolean;
          getCurrentFrame: () => number | null;
        };
      }).__timelineTransportProbe;
      const root = document.querySelector("[data-composition-master-frame='true']");
      if (!root) throw new Error("composition frame did not mount");

      const mediaSnapshot = () => Array.from(root.querySelectorAll<HTMLMediaElement>("audio,video"))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          src: element.currentSrc || element.src || "",
          currentTime: element.currentTime,
          paused: element.paused,
        }))
        .filter((entry) => entry.src && !entry.src.startsWith("data:"));

      const samples: Array<{
        frame: number | null;
        playing: boolean;
        media: ReturnType<typeof mediaSnapshot>;
      }> = [];
      probe.togglePlay();
      const startedAt = performance.now();
      while (performance.now() - startedAt < playbackMs) {
        samples.push({
          frame: probe.getCurrentFrame(),
          playing: probe.isPlaying(),
          media: mediaSnapshot(),
        });
        await new Promise((resolve) => setTimeout(resolve, sampleMs));
      }

      if (probe.isPlaying()) probe.togglePlay();
      const pausedAt = {
        frame: probe.getCurrentFrame(),
        media: mediaSnapshot(),
      };
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      const afterPause = {
        frame: probe.getCurrentFrame(),
        playing: probe.isPlaying(),
        media: mediaSnapshot(),
      };
      return { samples, pausedAt, afterPause };
    }, { sampleMs: 50, playbackMs: 3_500, settleMs: 750 });

    let audioRewinds = 0;
    const lastAudioTimeBySource = new Map<string, number>();
    for (const sample of result.samples) {
      for (const media of sample.media) {
        if (media.tag !== "audio") continue;
        const previous = lastAudioTimeBySource.get(media.src);
        if (previous != null && media.currentTime < previous - 0.15) audioRewinds += 1;
        lastAudioTimeBySource.set(media.src, media.currentTime);
      }
    }

    const pausedAudioBySource = new Map(
      result.pausedAt.media
        .filter((media) => media.tag === "audio")
        .map((media) => [media.src, media.currentTime]),
    );
    const audioAdvancedAfterPause = result.afterPause.media
      .filter((media) => media.tag === "audio")
      .some((media) => media.currentTime > (pausedAudioBySource.get(media.src) ?? media.currentTime) + 0.03);
    const pauseFrameDelta = Math.abs(
      (result.afterPause.frame ?? 0) - (result.pausedAt.frame ?? 0),
    );
    const startFrame = result.samples[0]?.frame ?? null;
    const endFrame = result.samples.at(-1)?.frame ?? null;
    const frameAdvance = startFrame != null && endFrame != null ? endFrame - startFrame : 0;
    const pass = frameAdvance >= FPS
      && audioRewinds === 0
      && !result.afterPause.playing
      && pauseFrameDelta <= 1
      && !audioAdvancedAfterPause;
    const receipt = {
      schema: 1,
      kind: "preview-transport-ownership",
      projectId,
      label,
      baseUrl,
      targetSeconds,
      recordedAt: new Date().toISOString(),
      environment,
      frameAdvance,
      audioRewinds,
      pauseFrameDelta,
      audioAdvancedAfterPause,
      playingAfterPause: result.afterPause.playing,
      pass,
    };
    const receiptDir = path.join(projectDir(projectId), "preprocess", "preview-first-load");
    fs.mkdirSync(receiptDir, { recursive: true });
    const stamp = receipt.recordedAt.replace(/[:.]/g, "-").slice(0, 19);
    const receiptPath = path.join(receiptDir, `transport-ownership-${label}-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`\nreceipt: ${receiptPath}`);
    if (!pass) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runOnce(context: BrowserContext, runIndex: number): Promise<RunRecord> {
  const record: RunRecord = {
    run: runIndex,
    startedAt: new Date().toISOString(),
    environment: { visibilityState: "unknown", rafTicksPerSec: 0, valid: false },
    tEditorMountedMs: null,
    seek: { targetFrame: Math.round(targetSeconds * FPS), actualFrame: null },
    media: { afterSeek: [], tAllActiveReadyMs: null, final: [] },
    play: { requested: false, tFirstAdvanceMs: null, tAdvance1sMs: null, stallIntervals: 0, endFrame: null },
    network: { abortedMediaRequests: 0, failedApiResponses: [], peaksResponses: [] },
    fastRefreshEvents: 0,
    consoleErrors: [],
    notes: [],
  };

  // tsx/esbuild `keepNames` wraps transpiled functions in a `__name(...)`
  // helper; page.evaluate serializes those functions into the page, where the
  // helper doesn't exist. Provide a no-op so evaluate callbacks run.
  await context.addInitScript("window.__name = (func) => func;");
  const page = await context.newPage();
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("Fast Refresh")) record.fastRefreshEvents += 1;
    if (message.type() === "error") record.consoleErrors.push(text.slice(0, 300));
  });
  page.on("pageerror", (error) => {
    record.consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED") && request.url().includes("/media/")) {
      record.network.abortedMediaRequests += 1;
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    if (url.includes("/timeline/peaks")) record.network.peaksResponses.push(response.status());
    if (response.status() >= 400) {
      record.network.failedApiResponses.push({ url: url.slice(-90), status: response.status() });
    }
  });

  try {
    // 1. Environment precheck on a blank page.
    await page.goto("about:blank");
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
      return { visibilityState: document.visibilityState, rafTicksPerSec: ticks };
    });
    record.environment = {
      ...environment,
      valid: environment.visibilityState === "visible" && environment.rafTicksPerSec >= RAF_MIN_TICKS_PER_SEC,
    };
    if (!record.environment.valid) {
      record.notes.push(
        "environment_invalid: rAF starved or page hidden — Remotion 4.0.496 wedges here by design; measurements would blame the product for the environment",
      );
      return record;
    }

    // 2. Cold load.
    const t0 = Date.now();
    await page.goto(`${baseUrl}/p/${projectId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Editor mounted = probe registered AND the Remotion Player actually
    // attached (getCurrentFrame readable). Probe-only is not enough: during
    // Fast Refresh churn the probe can exist while the Player is between
    // mounts, and a seek issued then silently no-ops.
    await page.waitForFunction(
      () => {
        const probe = (window as unknown as {
          __timelineTransportProbe?: { getCurrentFrame: () => number | null };
        }).__timelineTransportProbe;
        return Boolean(probe) && probe!.getCurrentFrame() != null;
      },
      undefined,
      { timeout: 30_000 },
    );
    record.tEditorMountedMs = Date.now() - t0;

    // 3. Seek through the app's real path. Retry once if a mid-load remount
    // detached the Player between the mount check and the seek.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.evaluate((frame) => {
        (window as unknown as {
          __timelineTransportProbe: { seekToFrame: (frame: number) => void };
        }).__timelineTransportProbe.seekToFrame(frame);
      }, record.seek.targetFrame);
      record.seek.actualFrame = await page.evaluate(() =>
        (window as unknown as {
          __timelineTransportProbe: { getCurrentFrame: () => number | null };
        }).__timelineTransportProbe.getCurrentFrame());
      if (record.seek.actualFrame != null) break;
      record.notes.push("seek_retry: player detached between mount check and seek");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    record.media.afterSeek = await sampleMedia(page);

    // 4. Readiness observation: all src-bearing media to HAVE_FUTURE_DATA (3).
    const readyStart = Date.now();
    while (Date.now() - readyStart < READY_OBSERVATION_MS) {
      const snapshots = await sampleMedia(page);
      if (snapshots.length > 0 && snapshots.every((snapshot) => snapshot.readyState >= 3)) {
        record.media.tAllActiveReadyMs = Date.now() - readyStart;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }

    // 5. One Play request through the app's real toggle.
    const startFrame = record.seek.actualFrame ?? record.seek.targetFrame;
    await page.evaluate(() => {
      (window as unknown as {
        __timelineTransportProbe: { togglePlay: () => void };
      }).__timelineTransportProbe.togglePlay();
    });
    record.play.requested = true;
    const playStart = Date.now();
    let lastFrame = startFrame;
    let lastFrameChangeAt = playStart;
    while (Date.now() - playStart < PLAY_OBSERVATION_MS) {
      const frame = await page.evaluate(() =>
        (window as unknown as {
          __timelineTransportProbe: { getCurrentFrame: () => number | null };
        }).__timelineTransportProbe.getCurrentFrame());
      const now = Date.now();
      if (frame != null && frame > lastFrame) {
        if (record.play.tFirstAdvanceMs == null && frame > startFrame) {
          record.play.tFirstAdvanceMs = now - playStart;
        }
        lastFrame = frame;
        lastFrameChangeAt = now;
      } else if (
        record.play.tFirstAdvanceMs != null
        && now - lastFrameChangeAt >= STALL_THRESHOLD_MS
      ) {
        record.play.stallIntervals += 1;
        lastFrameChangeAt = now;
      }
      if (frame != null && frame >= startFrame + FPS) {
        record.play.tAdvance1sMs = now - playStart;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
    }
    record.play.endFrame = lastFrame;
    record.media.final = await sampleMedia(page);

    // Stop playback before closing so shared audio tags release cleanly.
    await page.evaluate(() => {
      const probe = (window as unknown as {
        __timelineTransportProbe?: { isPlaying: () => boolean; togglePlay: () => void };
      }).__timelineTransportProbe;
      if (probe?.isPlaying()) probe.togglePlay();
    });
  } catch (error) {
    record.notes.push(`run_error: ${String(error).slice(0, 300)}`);
  } finally {
    await page.close().catch(() => {});
  }
  return record;
}

type GateProbePage = Page;

async function openEditor(context: BrowserContext): Promise<GateProbePage> {
  await context.addInitScript("window.__name = (func) => func;");
  const page = await context.newPage();
  await page.goto(`${baseUrl}/p/${projectId}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForFunction(
    () => {
      const probe = (window as unknown as {
        __timelineTransportProbe?: { getCurrentFrame: () => number | null };
      }).__timelineTransportProbe;
      return Boolean(probe) && probe!.getCurrentFrame() != null;
    },
    undefined,
    { timeout: 45_000 },
  );
  return page;
}

const readGate = (page: GateProbePage) =>
  page.evaluate(() => ({
    state: document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state") ?? null,
    sessionId: Number(document.querySelector("[data-preview-session-id]")?.getAttribute("data-preview-session-id") ?? "-1"),
    statusText: (document.querySelector("[role=status]") as HTMLElement | null)?.innerText ?? null,
    frame: (window as unknown as {
      __timelineTransportProbe: { getCurrentFrame: () => number | null };
    }).__timelineTransportProbe.getCurrentFrame(),
  }));

/**
 * Variant: every media response delayed 6s. Proves the gate is honest under
 * genuinely slow media — visible warming, queued (not silent) Play, the 4s
 * "still loading" escalation — and that removing the delay lets the queued
 * intent start WITHOUT a second click or reload.
 */
async function runDelayedMediaVariant() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const DELAY_MS = 6_000;
  let delayEnabled = true;
  await context.route("**/media/**", async (route) => {
    if (delayEnabled) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    await route.continue().catch(() => {});
  });
  const page = await openEditor(context);
  const result: Record<string, unknown> = {};
  try {
    await page.evaluate((frame) => {
      (window as unknown as {
        __timelineTransportProbe: { seekToFrame: (frame: number) => void };
      }).__timelineTransportProbe.seekToFrame(frame);
    }, Math.round(targetSeconds * FPS));
    await page.evaluate(() => {
      (window as unknown as {
        __timelineTransportProbe: { togglePlay: () => void };
      }).__timelineTransportProbe.togglePlay();
    });
    const requested = await readGate(page);
    result.gateAfterPlayRequest = requested.state;

    // Playhead must hold still while warming; after ~4.5s the truthful
    // escalation text must be visible.
    await new Promise((resolve) => setTimeout(resolve, 4_500));
    const during = await readGate(page);
    result.frameHeldWhileWarming = during.frame != null
      && Math.abs(during.frame - Math.round(targetSeconds * FPS)) <= 1;
    result.stateDuringDelay = during.state;
    result.escalationText = during.statusText;

    // Lift the delay: the queued intent must start playback on its own.
    delayEnabled = false;
    const t0 = Date.now();
    let started = false;
    while (Date.now() - t0 < 15_000) {
      const now = await readGate(page);
      if (now.state === "playing" && now.frame != null && now.frame > Math.round(targetSeconds * FPS) + 5) {
        started = true;
        result.autoStartAfterRecoveryMs = Date.now() - t0;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    result.autoStartedWithoutSecondClick = started;
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(JSON.stringify({ variant: "delayed-media", targetSeconds, ...result }, null, 2));
}

/**
 * Variant: induce a REAL Fast Refresh remount (dev server only) by touching a
 * source file mid-playback. Proves the two-stage restore: session id
 * increments, the frame is preserved (no restart-from-zero, no big backward
 * jump), and a previously playing session resumes with NO second click.
 */
async function runRemountVariant() {
  const touchTarget = path.join(
    process.cwd(),
    "src/components/studio/timeline/TimelinePlaybackShell.tsx",
  );
  const original = fs.readFileSync(touchTarget, "utf8");
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await openEditor(context);
  const result: Record<string, unknown> = {};
  try {
    await page.evaluate((frame) => {
      (window as unknown as {
        __timelineTransportProbe: { seekToFrame: (frame: number) => void };
      }).__timelineTransportProbe.seekToFrame(frame);
    }, Math.round(targetSeconds * FPS));
    await page.evaluate(() => {
      (window as unknown as {
        __timelineTransportProbe: { togglePlay: () => void };
      }).__timelineTransportProbe.togglePlay();
    });
    // Wait for actual playback before inducing the remount.
    const playStart = Date.now();
    let playingBefore = false;
    while (Date.now() - playStart < 10_000) {
      const now = await readGate(page);
      if (now.state === "playing" && now.frame != null && now.frame > Math.round(targetSeconds * FPS) + 15) {
        playingBefore = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    result.playingBeforeRemount = playingBefore;
    const before = await readGate(page);
    result.frameAtTouch = before.frame;
    result.sessionBefore = before.sessionId;

    fs.writeFileSync(touchTarget, `${original}\n// fr-probe ${Date.now()}\n`);
    let sawWarming = false;
    let resumed = false;
    let minFrameSeen = Number.POSITIVE_INFINITY;
    const t0 = Date.now();
    let after = before;
    while (Date.now() - t0 < 25_000) {
      after = await readGate(page);
      if (after.frame != null) minFrameSeen = Math.min(minFrameSeen, after.frame);
      if (after.state === "warming" && after.sessionId > before.sessionId) sawWarming = true;
      if (
        after.sessionId > before.sessionId
        && after.state === "playing"
        && after.frame != null
        && before.frame != null
        && after.frame > before.frame
      ) {
        resumed = true;
        result.autoResumeMs = Date.now() - t0;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    result.sessionAfter = after.sessionId;
    result.sawWarmingOnRemount = sawWarming;
    result.autoResumedWithoutClick = resumed;
    // Frame preservation: playback never restarted from zero or jumped far back.
    result.minFrameSeen = Number.isFinite(minFrameSeen) ? minFrameSeen : null;
    result.framePreserved = before.frame != null
      && Number.isFinite(minFrameSeen)
      && minFrameSeen >= before.frame - FPS; // within 1s of the detach frame
  } finally {
    fs.writeFileSync(touchTarget, original);
    await browser.close().catch(() => {});
  }
  console.log(JSON.stringify({ variant: "remount", targetSeconds, ...result }, null, 2));
}

/**
 * Variant: touch timeline.json without changing its contents and prove the
 * external-revision path refreshes data in place. The Player/readiness session
 * and playhead must survive, and the full-screen initial loader must not return.
 */
async function runExternalReconcileVariant() {
  const timelinePath = projectTimelinePath(projectId);
  const originalStat = fs.statSync(timelinePath);
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await openEditor(context);
  const result: Record<string, unknown> = {};
  try {
    const targetFrame = Math.round(targetSeconds * FPS);
    await page.evaluate((frame) => {
      (window as unknown as {
        __timelineTransportProbe: { seekToFrame: (frame: number) => void };
      }).__timelineTransportProbe.seekToFrame(frame);
    }, targetFrame);
    await page.waitForTimeout(250);

    const before = await readGate(page);
    result.frameBefore = before.frame;
    result.sessionBefore = before.sessionId;
    fs.utimesSync(timelinePath, originalStat.atime, new Date());

    let sawInitialLoader = false;
    let sawUpdateToast = false;
    const started = Date.now();
    while (Date.now() - started < 8_000) {
      const bodyText = await page.locator("body").innerText();
      if (bodyText.includes("Loading timeline…")) sawInitialLoader = true;
      if (bodyText.includes("Timeline changed on disk")) {
        sawUpdateToast = true;
        break;
      }
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    const after = await readGate(page);
    result.updateObserved = sawUpdateToast;
    result.initialLoaderReturned = sawInitialLoader;
    result.frameAfter = after.frame;
    result.sessionAfter = after.sessionId;
    result.playerSessionPreserved = after.sessionId === before.sessionId;
    result.playheadPreserved = before.frame != null
      && after.frame != null
      && Math.abs(after.frame - before.frame) <= 1;
  } finally {
    fs.utimesSync(timelinePath, originalStat.atime, originalStat.mtime);
    await browser.close().catch(() => {});
  }
  console.log(JSON.stringify({ variant: "external-reconcile", targetSeconds, ...result }, null, 2));
}

/**
 * Variant: play from --at for --seconds and classify every stall interval.
 * Answers "the screen froze but audio kept playing — is it the product or the
 * machine?" in one command. Three signatures, opposite implications:
 *
 * - CLOCK-STALL+AUDIO-RUNNING — Remotion paused the clock (buffering) while an
 *   audio element briefly outran the pause: the audible-freeze symptom. Load-
 *   correlated (proven 2026-07-22: stalls concentrate at decoder-dense
 *   sections and grow with CPU contention); recovers on its own.
 * - picture lag — clock and audio ran, video decode fell behind: pure decoder
 *   starvation (load/hardware class).
 * - rAF starved / hidden — environment, not product (the 4.0.496 wedge).
 */
async function runFreezeClassifyVariant() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await openEditor(context);
  try {
    await page.evaluate(() => {
      const events: unknown[] = [];
      (window as unknown as { __mediaEvents: unknown[] }).__mediaEvents = events;
      for (const type of ["loadstart", "loadedmetadata", "canplay", "seeking", "seeked", "waiting", "stalled", "suspend", "play", "pause", "error"]) {
        document.addEventListener(type, event => {
          const a = event.target;
          if (!(a instanceof HTMLAudioElement) || events.length >= 2000) return;
          events.push({t:performance.now(),type,src:new URL(a.currentSrc || a.src, location.href).pathname,ct:a.currentTime,ready:a.readyState,network:a.networkState});
        }, true);
      }
    });
    await page.evaluate((frame) => {
      (window as unknown as {
        __timelineTransportProbe: { seekToFrame: (frame: number) => void };
      }).__timelineTransportProbe.seekToFrame(frame);
    }, Math.round(targetSeconds * FPS));
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const readinessStarted = Date.now();
    if (process.argv.includes("--settled")) {
      try {
        await page.waitForFunction(() => document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state") === "ready", undefined, {timeout: 30_000});
      } catch (error) {
        const evidence = await page.evaluate(() => ({gate:document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state"), events:(window as unknown as {__mediaEvents:unknown[]}).__mediaEvents, media:Array.from(document.querySelectorAll<HTMLMediaElement>("audio,video")).filter(a=>a.src).map(a=>({src:a.src,ready:a.readyState,network:a.networkState,time:a.currentTime,seeking:a.seeking,paused:a.paused,premounted:a.dataset.previewPremounted,buffered:Array.from({length:a.buffered.length},(_,i)=>[a.buffered.start(i),a.buffered.end(i)])}))}));
        const dir=path.join(projectDir(projectId), "preprocess", "preview-first-load");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`startup-timeout-${Date.now()}.json`),JSON.stringify(evidence,null,2));
        throw error;
      }
    }
    const startupReadinessMs = Date.now() - readinessStarted;

    const collected = await page.evaluate(async (seconds) => {
      const probe = (window as unknown as {
        __timelineTransportProbe: {
          togglePlay: () => void;
          isPlaying: () => boolean;
          getCurrentFrame: () => number | null;
        };
      }).__timelineTransportProbe;
      let rafTicks = 0;
      let rafRunning = true;
      const rafLoop = () => {
        rafTicks += 1;
        if (rafRunning) requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);

      type Sample = {
        t: number;
        frame: number | null;
        rafTicks: number;
        videos: Array<{ src: string; ct: number; paused: boolean; ready: number; seeking: boolean; premounted: boolean; path: string }>;
        gate: string | null;
        playing: boolean;
        audios: Array<{ src: string; ct: number; paused: boolean; ready: number; seeking: boolean; preload: string; path: string; network: number; buffered: number[][] }>;
      };
      const samples: Sample[] = [];
      let stoppedEarly = false;
      probe.togglePlay();
      const t0 = performance.now();
      while (performance.now() - t0 < seconds * 1000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        samples.push({
          t: Math.round(performance.now() - t0),
          frame: probe.getCurrentFrame(),
          rafTicks,
          gate: document.querySelector("[data-preview-state]")?.getAttribute("data-preview-state") ?? null,
          playing: probe.isPlaying(),
          videos: Array.from(document.querySelectorAll("video"))
            .filter((v) => (v.currentSrc || v.src) && !(v.currentSrc || v.src).startsWith("data:"))
            .map((v) => ({
              src: (v.currentSrc || v.src).split("/").pop()?.slice(-40) ?? "",
              ct: Math.round(v.currentTime * 1000) / 1000,
              paused: v.paused,
              ready: v.readyState,
              seeking: v.seeking,
              premounted: v.dataset.previewPremounted === "true",
              path: new URL(v.currentSrc || v.src).pathname,
            })),
          audios: Array.from(document.querySelectorAll("audio"))
            .filter((a) => (a.currentSrc || a.src) && !(a.currentSrc || a.src).startsWith("data:"))
            .map((a) => ({ src: (a.currentSrc || a.src).split("/").pop()?.slice(-40) ?? "", ct: Math.round(a.currentTime * 1000) / 1000, paused: a.paused, ready: a.readyState, seeking: a.seeking, preload: a.preload, path: new URL(a.currentSrc || a.src).pathname, network: a.networkState, buffered: Array.from({length:a.buffered.length}, (_, i) => [a.buffered.start(i), a.buffered.end(i)]) })),
        });
        if (!probe.isPlaying() && samples.at(-1)?.gate === "ready") {
          stoppedEarly = true;
          break;
        }
      }
      rafRunning = false;
      if (probe.isPlaying()) probe.togglePlay();
      return { samples, visibility: document.visibilityState, stoppedEarly, mediaEvents: (window as unknown as { __mediaEvents: unknown[] }).__mediaEvents };
    }, classifySeconds);

    const samples = collected.samples;
    let clockStallMs = 0;
    let pictureLagMs = 0;
    let cleanMs = 0;
    let audioRanDuringClockStallMs = 0;
    let lastRaf = 0;
    const rafRates: number[] = [];
    const stallMap: Record<string, string> = {};
    for (let i = 1; i < samples.length; i += 1) {
      const dt = samples[i].t - samples[i - 1].t;
      const frameAdvanced = (samples[i].frame ?? 0) > (samples[i - 1].frame ?? 0);
      const audioAdvanced = samples[i].audios.some(
        a => { const previous = samples[i - 1].audios.find(p => p.path === a.path); return !a.paused && previous != null && a.ct > previous.ct; },
      );
      const activeVideos = samples[i].videos.filter((v) => !v.paused);
      const videoAdvanced = activeVideos.length === 0
        || activeVideos.some((v) => {
          const previous = samples[i - 1].videos.find((p) => p.path === v.path);
          return previous != null && v.ct > previous.ct;
        });
      rafRates.push((samples[i].rafTicks - lastRaf) / (dt / 1000));
      lastRaf = samples[i].rafTicks;
      const timelineSec = Math.floor((samples[i].frame ?? 0) / FPS);
      if (!frameAdvanced) {
        clockStallMs += dt;
        if (audioAdvanced) {
          audioRanDuringClockStallMs += dt;
          stallMap[timelineSec] = "CLOCK-STALL+AUDIO-RUNNING";
        } else {
          stallMap[timelineSec] = stallMap[timelineSec] ?? "clock+audio stalled";
        }
      } else if (!videoAdvanced) {
        pictureLagMs += dt;
      } else {
        cleanMs += dt;
      }
    }
    const rafAvg = Math.round(rafRates.reduce((sum, rate) => sum + rate, 0) / Math.max(1, rafRates.length));
    const windowMs = cleanMs + pictureLagMs + clockStallMs;
    const verdict = collected.stoppedEarly
      ? "playback stopped before the sample window ended — no buffering conclusion"
      : collected.visibility !== "visible" || rafAvg < RAF_MIN_TICKS_PER_SEC
      ? "environment_invalid: hidden or rAF-starved page; do not attribute stalls to loading alone"
      : clockStallMs > windowMs * 0.15
        ? "clock stalls observed; correlate media readiness/events before attributing the cause"
        : pictureLagMs > windowMs * 0.15
          ? "picture starvation — clock and audio ran while video decode lagged (load/hardware class)"
          : clockStallMs >= STALL_THRESHOLD_MS ? "playback advanced with intermittent clock stalls" : "no sustained clock stall observed";
    const receipt = {
      schema: 1,
      kind: "preview-freeze-classify",
      projectId,
      label,
      baseUrl,
      startSeconds: targetSeconds,
      classifySeconds,
      settledStart: process.argv.includes("--settled"),
      startupReadinessMs,
      recordedAt: new Date().toISOString(),
      machine: { platform: `${os.platform()} ${os.release()}`, cpus: os.cpus().length },
      visibility: collected.visibility,
      stoppedEarly: collected.stoppedEarly,
      rafTicksPerSecAvg: rafAvg,
      cleanMs,
      pictureLagMs,
      clockStallMs,
      audioRanDuringClockStallMs,
      stallMap,
      mediaEvents: collected.mediaEvents,
      samples: samples.map(({ audios, ...sample }) => ({ ...sample, audios: audios.filter((audio) => audio.preload === "auto" || !audio.paused) })),
      verdict,
    };
    const receiptDir = path.join(projectDir(projectId), "preprocess", "preview-first-load");
    fs.mkdirSync(receiptDir, { recursive: true });
    const stamp = receipt.recordedAt.replace(/[:.]/g, "-").slice(0, 19);
    const receiptPath = path.join(receiptDir, `freeze-classify-${label}-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify(receipt, null, 2));
    console.log(`\nreceipt: ${receiptPath}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  if (variant === "delayed-media") return runDelayedMediaVariant();
  if (variant === "remount") return runRemountVariant();
  if (variant === "external-reconcile") return runExternalReconcileVariant();
  if (variant === "freeze-classify") return runFreezeClassifyVariant();
  if (variant === "transport-ownership") return runTransportOwnershipVariant();
  const receiptDir = path.join(projectDir(projectId), "preprocess", "preview-first-load");
  fs.mkdirSync(receiptDir, { recursive: true });

  let gitHead = "unknown";
  try {
    gitHead = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // best-effort provenance only
  }

  // no-user-gesture-required: a suspended AudioContext wedges Remotion
  // 4.0.496's resume handshake exactly like the product bug under study —
  // an autoplay-blocked probe would report false failures forever.
  const browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const records: RunRecord[] = [];
  try {
    for (let index = 1; index <= runs; index += 1) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const record = await runOnce(context, index);
      records.push(record);
      await context.close().catch(() => {});
      const ready = record.media.tAllActiveReadyMs;
      const advance = record.play.tAdvance1sMs;
      console.log(
        `run ${index}/${runs}: mount ${record.tEditorMountedMs ?? "—"}ms · allReady ${ready ?? "TIMEOUT"}ms · advance1s ${advance ?? "TIMEOUT"}ms · stalls ${record.play.stallIntervals} · aborts ${record.network.abortedMediaRequests} · FR ${record.fastRefreshEvents} · errors ${record.consoleErrors.length}${record.notes.length ? ` · ${record.notes[0]}` : ""}`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const valid = records.filter((record) => record.environment.valid);
  const summary = {
    validRuns: valid.length,
    environmentInvalidRuns: records.length - valid.length,
    tEditorMountedMs: {
      p50: percentile(valid.map((r) => r.tEditorMountedMs ?? Number.NaN), 50),
      p90: percentile(valid.map((r) => r.tEditorMountedMs ?? Number.NaN), 90),
    },
    tAllActiveReadyMs: {
      p50: percentile(valid.map((r) => r.media.tAllActiveReadyMs ?? Number.NaN), 50),
      p90: percentile(valid.map((r) => r.media.tAllActiveReadyMs ?? Number.NaN), 90),
      timeouts: valid.filter((r) => r.media.tAllActiveReadyMs == null).length,
    },
    tAdvance1sMs: {
      p50: percentile(valid.map((r) => r.play.tAdvance1sMs ?? Number.NaN), 50),
      p90: percentile(valid.map((r) => r.play.tAdvance1sMs ?? Number.NaN), 90),
      timeouts: valid.filter((r) => r.play.requested && r.play.tAdvance1sMs == null).length,
    },
    totalStallIntervals: valid.reduce((sum, r) => sum + r.play.stallIntervals, 0),
    totalAbortedMediaRequests: valid.reduce((sum, r) => sum + r.network.abortedMediaRequests, 0),
    totalFastRefreshEvents: valid.reduce((sum, r) => sum + r.fastRefreshEvents, 0),
    totalConsoleErrors: valid.reduce((sum, r) => sum + r.consoleErrors.length, 0),
    peaksNon200: valid.flatMap((r) => r.network.peaksResponses).filter((status) => status !== 200).length,
  };

  const receipt = {
    schema: 1,
    kind: "preview-first-load-baseline",
    projectId,
    label,
    baseUrl,
    targetSeconds,
    requestedRuns: runs,
    gitHead,
    machine: {
      platform: `${os.platform()} ${os.release()}`,
      cpus: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    },
    recordedAt: new Date().toISOString(),
    summary,
    runs: records,
  };

  const stamp = receipt.recordedAt.replace(/[:.]/g, "-").slice(0, 19);
  const receiptPath = path.join(receiptDir, `${label}-${stamp}.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\nsummary (${label}, ${valid.length}/${records.length} valid runs):`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nreceipt: ${receiptPath}`);
}

void main();
