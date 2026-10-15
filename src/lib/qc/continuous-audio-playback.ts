export type ContinuousPlaybackMediaSample = {
  key: string;
  tag: "audio" | "video";
  audible: boolean;
  paused: boolean;
  currentTime: number;
  playedSeconds: number;
};

export type ContinuousPlaybackSample = {
  wallMs: number;
  frame: number | null;
  media: ContinuousPlaybackMediaSample[];
};

export type ContinuousPlaybackMediaEvent = {
  wallMs: number;
  key: string;
  audible: boolean;
  event: "waiting" | "playing" | "stalled" | "seeking" | "seeked" | "error";
};

export type ContinuousPlaybackAssessment = {
  pass: boolean;
  reasons: string[];
  elapsedMs: number;
  frameAdvance: number;
  clockAdvanceSeconds: number;
  clockToWallRatio: number;
  crossedBoundary: boolean;
  stallMs: number;
  waitingEvents: number;
  waitingResumePairs: number;
  unexpectedPlayingRestarts: number;
  mediaRewinds: number;
  peakAudibleNodes: number;
  duplicateAudibleSourceSamples: number;
  playedRangeGrowthSeconds: number;
};

const MIN_CLOCK_TO_WALL_RATIO = 0.8;
const MAX_CLOCK_TO_WALL_RATIO = 1.25;
const MAX_STALL_SHARE = 0.15;
const STALL_SAMPLE_THRESHOLD_MS = 300;

function countWaitingResumePairs(events: ContinuousPlaybackMediaEvent[]) {
  const waitingByKey = new Map<string, boolean>();
  let pairs = 0;
  for (const event of [...events]
    .filter((candidate) => candidate.audible)
    .sort((a, b) => a.wallMs - b.wallMs)) {
    if (event.event === "waiting") waitingByKey.set(event.key, true);
    if (event.event === "playing" && waitingByKey.get(event.key)) {
      pairs += 1;
      waitingByKey.set(event.key, false);
    }
  }
  return pairs;
}

function countUnexpectedPlayingRestarts(events: ContinuousPlaybackMediaEvent[]) {
  const stateByKey = new Map<string, { hasPlayed: boolean; waiting: boolean }>();
  let restarts = 0;
  for (const event of [...events]
    .filter((candidate) => candidate.audible)
    .sort((a, b) => a.wallMs - b.wallMs)) {
    const state = stateByKey.get(event.key) ?? { hasPlayed: false, waiting: false };
    if (event.event === "waiting") state.waiting = true;
    if (event.event === "playing") {
      if (state.hasPlayed && !state.waiting) restarts += 1;
      state.hasPlayed = true;
      state.waiting = false;
    }
    stateByKey.set(event.key, state);
  }
  return restarts;
}

export function assessContinuousAudioPlayback({
  samples,
  events,
  fps,
  boundaryFrame,
}: {
  samples: ContinuousPlaybackSample[];
  events: ContinuousPlaybackMediaEvent[];
  fps: number;
  boundaryFrame: number;
}): ContinuousPlaybackAssessment {
  const ordered = [...samples].sort((a, b) => a.wallMs - b.wallMs);
  const first = ordered[0];
  const last = ordered.at(-1);
  const elapsedMs = first && last ? Math.max(0, last.wallMs - first.wallMs) : 0;
  const startFrame = first?.frame ?? 0;
  const endFrame = last?.frame ?? startFrame;
  const frameAdvance = Math.max(0, endFrame - startFrame);
  const clockAdvanceSeconds = fps > 0 ? frameAdvance / fps : 0;
  const clockToWallRatio = elapsedMs > 0 ? clockAdvanceSeconds / (elapsedMs / 1000) : 0;
  const crossedBoundary = startFrame <= boundaryFrame && endFrame >= boundaryFrame;

  let stallMs = 0;
  let mediaRewinds = 0;
  let peakAudibleNodes = 0;
  let duplicateAudibleSourceSamples = 0;
  const firstPlayed = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const previousTimes = new Map<string, number>();
  let lastFrameAdvanceWallMs = first?.wallMs ?? 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const sample = ordered[index]!;
    const previous = ordered[index - 1];
    if (previous && sample.frame != null && previous.frame != null) {
      if (sample.frame > previous.frame) {
        lastFrameAdvanceWallMs = sample.wallMs;
      } else if (sample.wallMs - lastFrameAdvanceWallMs >= STALL_SAMPLE_THRESHOLD_MS) {
        stallMs += sample.wallMs - previous.wallMs;
      }
    }

    const audible = sample.media.filter((media) => media.audible);
    peakAudibleNodes = Math.max(peakAudibleNodes, audible.length);
    const sourceCounts = new Map<string, number>();
    for (const media of audible) {
      sourceCounts.set(media.key, (sourceCounts.get(media.key) ?? 0) + 1);
      if (!firstPlayed.has(media.key)) firstPlayed.set(media.key, media.playedSeconds);
      lastPlayed.set(media.key, Math.max(lastPlayed.get(media.key) ?? 0, media.playedSeconds));
      const previousTime = previousTimes.get(media.key);
      if (previousTime != null && media.currentTime < previousTime - 0.15) mediaRewinds += 1;
      previousTimes.set(media.key, media.currentTime);
    }
    if ([...sourceCounts.values()].some((count) => count > 1)) {
      duplicateAudibleSourceSamples += 1;
    }
  }

  const playedRangeGrowthSeconds = [...lastPlayed.entries()].reduce(
    (sum, [key, end]) => sum + Math.max(0, end - (firstPlayed.get(key) ?? end)),
    0,
  );
  const waitingEvents = events.filter(
    (event) => event.audible && event.event === "waiting",
  ).length;
  const waitingResumePairs = countWaitingResumePairs(events);
  const unexpectedPlayingRestarts = countUnexpectedPlayingRestarts(events);
  const reasons: string[] = [];

  if (ordered.length < 2 || elapsedMs < 1_000) reasons.push("observation window was too short");
  if (!crossedBoundary) reasons.push("Player did not cross the named boundary");
  if (clockToWallRatio < MIN_CLOCK_TO_WALL_RATIO) {
    reasons.push(`Player clock advanced at only ${(clockToWallRatio * 100).toFixed(0)}% of wall time`);
  }
  if (clockToWallRatio > MAX_CLOCK_TO_WALL_RATIO) {
    reasons.push(`Player clock advanced at ${(clockToWallRatio * 100).toFixed(0)}% of wall time`);
  }
  if (elapsedMs > 0 && stallMs > elapsedMs * MAX_STALL_SHARE) {
    reasons.push(`Player stalled for ${stallMs}ms (${Math.round((stallMs / elapsedMs) * 100)}% of the window)`);
  }
  if (waitingResumePairs > 1) reasons.push(`${waitingResumePairs} waiting/resume pairs indicate a buffering loop`);
  if (unexpectedPlayingRestarts > 0) {
    reasons.push(`${unexpectedPlayingRestarts} audible source restart(s) occurred without buffering`);
  }
  if (mediaRewinds > 0) reasons.push(`${mediaRewinds} audible media rewind(s) detected`);
  if (peakAudibleNodes === 0) reasons.push("no audible media node was active");
  if (duplicateAudibleSourceSamples > 0) {
    reasons.push("the same audible source owned more than one media node");
  }
  if (playedRangeGrowthSeconds < Math.min(0.5, clockAdvanceSeconds * 0.4)) {
    reasons.push("audible played ranges did not grow with the Player clock");
  }

  return {
    pass: reasons.length === 0,
    reasons,
    elapsedMs,
    frameAdvance,
    clockAdvanceSeconds,
    clockToWallRatio,
    crossedBoundary,
    stallMs,
    waitingEvents,
    waitingResumePairs,
    unexpectedPlayingRestarts,
    mediaRewinds,
    peakAudibleNodes,
    duplicateAudibleSourceSamples,
    playedRangeGrowthSeconds,
  };
}
