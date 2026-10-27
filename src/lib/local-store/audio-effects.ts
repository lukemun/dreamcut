import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mediaUrl, resolveMediaPath } from "@/lib/local-store/media";
import { isSafeProjectId, portableRelative, projectMediaDir, projectsRoot } from "@/lib/local-store/paths";
import { VOICE_ENHANCEMENT_DEFAULT_STRENGTH } from "@/lib/timeline/audio-effects";

export const SPEECH_NOISE_REDUCTION_FILTER =
  "highpass=f=70,spectral-gate=reduction_db=15:oversubtract=1.6";

export const VOICE_ENHANCEMENT_POLISH_FILTER =
  "highpass=f=70,equalizer=f=3000:t=q:w=1:g=1.2,acompressor=threshold=0.125:ratio=1.6:attack=20:release=180:makeup=1.35:knee=2.8,alimiter=limit=0.841:attack=5:release=50:level=false";

export const NARRATOR_NORMALIZATION_TARGET = {
  integratedLufs: -16,
  loudnessRangeLu: 7,
  truePeakDbtp: -1.5,
} as const;

export function localMediaRelPath(sourceUrl: string, projectId: string): string | null {
  const prefix = `/api/projects/${projectId}/media/`;
  if (!sourceUrl.startsWith(prefix)) return null;
  try {
    return sourceUrl
      .slice(prefix.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}

export function resolveLocalMediaSource(
  projectId: string,
  sourceUrl: string,
  options: { allowReferencedProject?: boolean } = {},
): { absolutePath: string; relativePath: string; sourceProjectId: string } | null {
  const match = sourceUrl.match(/^\/api\/projects\/([^/]+)\/media\/(.+)$/);
  const sourceProjectId = match?.[1];
  if (
    !sourceProjectId
    || !isSafeProjectId(sourceProjectId)
    || (sourceProjectId !== projectId && options.allowReferencedProject !== true)
  ) {
    return null;
  }
  let relativePath: string;
  try {
    relativePath = match![2]!
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
  const absolutePath = relativePath
    ? resolveMediaPath(sourceProjectId, relativePath.split("/"))
    : null;
  if (!relativePath || !absolutePath || !fs.existsSync(absolutePath)) return null;
  return { absolutePath, relativePath, sourceProjectId };
}

function sourceFingerprint(sourcePath: string, recipe: string): string {
  const stat = fs.statSync(sourcePath);
  return createHash("sha256")
    .update(`${sourcePath}\0${stat.size}\0${stat.mtimeMs}\0${recipe}`)
    .digest("hex")
    .slice(0, 16);
}

export function mediaFileSha256(sourcePath: string): string {
  const hash = createHash("sha256");
  const handle = fs.openSync(sourcePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

/**
 * Where a source lives, independent of where the projects folder sits: its path under the
 * projects root (`<projectId>/media/...`) when it is inside it, else its absolute path.
 * Moving or cloning the projects folder (TIMELINE_PROJECTS_DIR, a Library move) keeps the key.
 */
export function relocatableSourceKey(sourcePath: string): string {
  const absolute = path.resolve(sourcePath);
  const relative = portableRelative(projectsRoot(), absolute);
  return relative && !relative.startsWith("../") && relative !== ".." && !path.isAbsolute(relative)
    ? `projects:${relative}`
    : `absolute:${absolute}`;
}

/**
 * A file's mtime to the nearest millisecond. Copies that keep timestamps can lose precision:
 * fs.cpSync sets them through a double in seconds, which lands within a microsecond of the
 * nearest whole millisecond, on either side of it, so truncating would split a copy from its
 * original about half the time. cp -p, clones and moves keep the exact value.
 */
function wholeMillisecondMtime(stat: fs.Stats) {
  return Math.round(stat.mtimeMs);
}

/** Size and mtime still change the key, so a rewritten source regenerates its derived file. */
function relocatableSourceFingerprint(
  sourcePath: string,
  recipe: string,
  mtime: (stat: fs.Stats) => number = wholeMillisecondMtime,
): string {
  const stat = fs.statSync(sourcePath);
  return createHash("sha256")
    .update(`relocatable-v1\0${relocatableSourceKey(sourcePath)}\0${stat.size}\0${mtime(stat)}\0${recipe}`)
    .digest("hex")
    .slice(0, 16);
}

function outputLocation(
  projectId: string,
  sourcePath: string,
  recipe: string,
  suffix: string,
  extension: string,
  fingerprint = sourceFingerprint(sourcePath, recipe),
) {
  const stem = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^A-Za-z0-9._-]+/g, "-");
  const relativePath = path.join(
    "audio-effects",
    `${stem}.${fingerprint}.${suffix}${extension}`,
  );
  return {
    relativePath,
    absolutePath: path.join(projectMediaDir(projectId), relativePath),
    sourceUrl: mediaUrl(projectId, relativePath),
  };
}

type OutputLocation = ReturnType<typeof outputLocation>;

/**
 * A file under its relocatable name, or null. A copy under an older name is valid while the
 * project has not moved: it is hard-linked to the new name (no new bytes) and the old name stays,
 * since timelines and receipts may store it. If linking fails the old name is used.
 */
function adoptLegacyName(current: string, legacies: string[]): string | null {
  if (fs.existsSync(current)) return current;
  const legacy = legacies.find((candidate) => candidate !== current && fs.existsSync(candidate));
  if (!legacy) return null;
  fs.mkdirSync(path.dirname(current), { recursive: true });
  try {
    fs.linkSync(legacy, current);
    return current;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EEXIST" ? current : legacy;
  }
}

/**
 * Where the derived file for (source, recipe) lives. Its name hashes the source's place under the
 * projects root, size, mtime to the millisecond and recipe (`relocatableSourceFingerprint`), so a
 * moved projects folder reuses it and a changed source or recipe gets a new file. Older names:
 * the absolute-path key (until 2026-10-25) and the same relocatable key with a truncated mtime
 * (preview clocks made on 2026-10-25).
 */
function derivedOutput(
  projectId: string,
  sourcePath: string,
  recipe: string,
  suffix: string,
  extension: string,
): { output: OutputLocation; legacyPaths: string[]; exists: boolean } {
  const output = outputLocation(
    projectId, sourcePath, recipe, suffix, extension,
    relocatableSourceFingerprint(sourcePath, recipe),
  );
  const legacies = [
    outputLocation(projectId, sourcePath, recipe, suffix, extension),
    outputLocation(
      projectId, sourcePath, recipe, suffix, extension,
      relocatableSourceFingerprint(sourcePath, recipe, (stat) => Math.trunc(stat.mtimeMs)),
    ),
  ];
  const found = adoptLegacyName(output.absolutePath, legacies.map((legacy) => legacy.absolutePath));
  return {
    output: legacies.find((legacy) => legacy.absolutePath === found) ?? output,
    legacyPaths: legacies.map((legacy) => legacy.absolutePath),
    exists: found != null,
  };
}

/** FFmpeg writes a temporary file that is renamed into place, so an interrupted run never looks finished. */
function renderAtomically(finalPath: string, render: (temporaryPath: string) => void) {
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  const temporary = `${finalPath}.${process.pid}.tmp${path.extname(finalPath)}`;
  try {
    render(temporary);
    fs.renameSync(temporary, finalPath);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function writeJsonAtomically(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value) + "\n");
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Analysis results for a treatment, saved beside its output so a cache hit runs no FFmpeg.
 * Keyed like the output by the source (relocatable) and the treatment's fixed recipe, before any
 * value the analysis decides. A receipt only answers while its output has the recorded size and
 * mtime; analysis is deterministic for a given source, so reading it equals measuring again.
 */
const ANALYSIS_RECEIPT_VERSION = "audio-effect-analysis-v1";

function analysisReceiptPath(projectId: string, sourcePath: string, fixedRecipe: string, suffix: string, extension: string) {
  return outputLocation(
    projectId, sourcePath, fixedRecipe, suffix, `${extension}.analysis.json`,
    relocatableSourceFingerprint(sourcePath, `${ANALYSIS_RECEIPT_VERSION}\0${fixedRecipe}`),
  ).absolutePath;
}

function outputStamp(file: string) {
  const stat = fs.statSync(file);
  return { output_size: stat.size, output_mtime_ms: wholeMillisecondMtime(stat) };
}

function readAnalysisReceipt(receiptPath: string, fixedRecipe: string) {
  const recorded = readJson(receiptPath);
  if (!recorded || recorded.version !== ANALYSIS_RECEIPT_VERSION || recorded.fixed_recipe !== fixedRecipe) return null;
  return recorded;
}

function receiptMatchesOutput(recorded: Record<string, unknown>, outputPath: string) {
  try {
    const stamp = outputStamp(outputPath);
    return recorded.output_size === stamp.output_size && recorded.output_mtime_ms === stamp.output_mtime_ms;
  } catch { return false; }
}

function writeAnalysisReceipt(receiptPath: string, fixedRecipe: string, outputPath: string, analysis: Record<string, unknown>) {
  writeJsonAtomically(receiptPath, {
    version: ANALYSIS_RECEIPT_VERSION,
    fixed_recipe: fixedRecipe,
    ...analysis,
    ...outputStamp(outputPath),
  });
}

/**
 * Build the browser playback clock for a treated video as an audio-only file.
 *
 * A treatment's full-quality MP4 remains the render authority, but mounting
 * that camera-sized container in an <audio> element makes the browser parse
 * and range-read its video track as well.  On long HEVC takes this can stall
 * the Player even though picture playback correctly uses a lightweight proxy.
 * The treated AAC packets already share the source clock, so copy them into a
 * small fast-start M4A instead of creating a second encoded clock.
 */
export function ensurePreviewAudioClock(
  projectId: string,
  treatedMediaPath: string,
) {
  const recipe = "preview-audio-clock-v1:aac-packet-copy:timing-preserved";
  const { output, exists } = derivedOutput(projectId, treatedMediaPath, recipe, "preview-audio", ".m4a");
  if (exists) return { ...output, recipe };
  renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", [
    "-y",
    "-v", "error",
    "-i", treatedMediaPath,
    "-map", "0:a:0",
    "-vn",
    "-c:a", "copy",
    "-movflags", "+faststart",
    temporary,
  ], { stdio: "pipe" }));
  return { ...output, recipe };
}

/** Longest source whose sound is reversed for preview; FFmpeg's areverse holds the whole stream in memory. */
export const MAX_REVERSED_PREVIEW_AUDIO_SECONDS = 20 * 60;

/**
 * Disposable preview track for a reversed clip: the whole source sound played
 * backward, so source time `s` is at `duration - s`. Export reverses the source
 * itself; this cache only lets the browser play reversed sound forward.
 */
export function ensureReversedPreviewAudio(projectId: string, sourcePath: string) {
  const recipe = "preview-audio-reverse-v1:areverse:aac-160k";
  const { output, legacyPaths } = derivedOutput(projectId, sourcePath, recipe, "preview-audio-reverse", ".m4a");
  const receipt = adoptLegacyName(`${output.absolutePath}.json`, legacyPaths.map((legacy) => `${legacy}.json`))
    ?? `${output.absolutePath}.json`;
  const recorded = readJson(receipt);
  if (recorded) {
    // A silent source is probed once; every later preview request skips FFprobe.
    if (recorded.source_audio === false) return null;
    const duration = Number(recorded.source_duration_seconds);
    if (fs.existsSync(output.absolutePath) && Number.isFinite(duration) && duration > 0) return { ...output, recipe, sourceDurationSeconds: duration };
  }
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration:format=duration", "-of", "json", sourcePath], { encoding: "utf8" }));
  if (!probe.streams?.length) {
    writeJsonAtomically(receipt, { recipe, source_audio: false });
    return null;
  }
  const duration = Number(probe.streams[0]?.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (duration > MAX_REVERSED_PREVIEW_AUDIO_SECONDS) return null;
  if (!fs.existsSync(output.absolutePath)) {
    renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", ["-y", "-v", "error", "-i", sourcePath, "-map", "0:a:0", "-vn", "-af", "areverse", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", temporary], { stdio: "pipe" }));
  }
  writeJsonAtomically(receipt, { recipe, source_duration_seconds: duration });
  return { ...output, recipe, sourceDurationSeconds: duration };
}

export type NoiseProfileWindow = {
  startSeconds: number;
  endSeconds: number;
  rmsDbfs: number;
};

export type RmsWindowObservation = NoiseProfileWindow & {
  rmsLinear: number;
};

function spectralGateScriptPath(): string {
  const candidates = [
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/denoise-take-audio-spectral-gate.py",
    ),
    path.resolve(process.cwd(), "scripts", "denoise-take-audio-spectral-gate.py"),
    path.resolve(
      process.cwd(),
      "tools",
      "timeline-editor",
      "scripts",
      "denoise-take-audio-spectral-gate.py",
    ),
  ];
  const scriptPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!scriptPath) {
    throw new Error("The local speech-cleanup processor is unavailable");
  }
  return scriptPath;
}

export function voiceEnhancerExecutableCandidates(
  platform: NodeJS.Platform = process.platform,
): string[] {
  const executablePath = platform === "win32"
    ? ["Scripts", "deepFilter.exe"]
    : ["bin", "deepFilter"];
  return [
    process.env.AUDIO_ENHANCE_EXECUTABLE,
    path.join(voiceEnhancementVenvDir(platform), ...executablePath),
    ...legacyVoiceEnhancementVenvDirs(platform).map(directory => path.join(directory, ...executablePath)),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

/** Installs created under earlier product names (OpenEdit, then OpenSequence) stay usable without reinstalling. */
export function legacyVoiceEnhancementVenvDirs(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): string[] {
  if (platform === "darwin") {
    return ["OpenEdit", "OpenSequence"].map(name => path.join(homeDirectory, "Library", "Caches", name, "voice-enhancement-py311"));
  }
  if (platform === "win32") {
    const local = environment.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local");
    return ["OpenEdit", "OpenSequence"].map(name => path.join(local, name, "Cache", "voice-enhancement-py311"));
  }
  const cache = environment.XDG_CACHE_HOME ?? path.join(homeDirectory, ".cache");
  return ["open-edit", "opensequence"].map(name => path.join(cache, name, "voice-enhancement-py311"));
}

export function voiceEnhancementVenvDir(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir(),
): string {
  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Caches", "DreamCut", "voice-enhancement-py311");
  }
  if (platform === "win32") {
    return path.join(
      environment.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local"),
      "DreamCut",
      "Cache",
      "voice-enhancement-py311",
    );
  }
  return path.join(
    environment.XDG_CACHE_HOME ?? path.join(homeDirectory, ".cache"),
    "dreamcut",
    "voice-enhancement-py311",
  );
}

/**
 * The interpreter a pip-generated launcher runs. A virtual environment's launchers hard-code the
 * absolute path of the folder they were installed into, so a renamed or moved folder (an earlier
 * product name, a cleared cache) leaves a launcher that exists but cannot start. POSIX launchers
 * start with a `#!` line; Windows launchers (`deepFilter.exe`) carry it near the end of the file.
 */
export function launcherInterpreter(launcher: string): string | null {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(launcher);
  } catch {
    return null;
  }
  if (bytes.subarray(0, 2).toString("latin1") === "#!") {
    const head = bytes.subarray(2, Math.min(bytes.length, 4096)).toString("utf8");
    const line = head.split(/\r?\n/, 1)[0]!.trim();
    const target = line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.split(/\s+/, 1)[0]!;
    // pip falls back to a `#!/bin/sh` wrapper that execs the interpreter when its path is very long.
    if (target === "/bin/sh") return /'''exec' "([^"]+)"/.exec(head)?.[1] ?? null;
    return target && !/\/(?:bash|env)$/.test(target) ? target : null;
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 64 * 1024)).toString("latin1");
  const match = /#!\s*"?([^"\r\n]*python[^"\r\n]*?\.exe)"?\s*\r?\n/i.exec(tail);
  return match?.[1]?.trim() ?? null;
}

export type VoiceEnhancerInstall =
  | { status: "ready"; executable: string }
  | { status: "broken"; executable: string; missingInterpreter: string }
  | { status: "missing" };

/** Finds the first voice-enhancement launcher that can actually start, reporting a broken one otherwise. */
export function voiceEnhancerInstall(
  candidates: string[] = voiceEnhancerExecutableCandidates(),
): VoiceEnhancerInstall {
  let broken: VoiceEnhancerInstall | null = null;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const interpreter = launcherInterpreter(candidate);
    // existsSync follows symlinks, so a venv python pointing at an uninstalled base Python also counts as broken.
    if (interpreter && !fs.existsSync(interpreter)) {
      broken ??= { status: "broken", executable: candidate, missingInterpreter: interpreter };
      continue;
    }
    return { status: "ready", executable: candidate };
  }
  return broken ?? { status: "missing" };
}

/** The one command that installs or repairs voice enhancement (scripts/setup-voice.mjs) in either kind of install. */
export const VOICE_SETUP_COMMAND = "Run `npx dreamcut setup-voice` (in a DreamCut source checkout: `pnpm setup:voice`), then try again.";

export function voiceEnhancerInstallProblem(install: VoiceEnhancerInstall): string | null {
  if (install.status === "ready") return null;
  if (install.status === "missing") return `Voice enhancement is not installed. ${VOICE_SETUP_COMMAND}`;
  return `Voice enhancement needs reinstalling: ${install.executable} points at ${install.missingInterpreter}, `
    + `which no longer exists (the folder was moved or renamed). ${VOICE_SETUP_COMMAND}`;
}

function voiceEnhancerExecutable(): string {
  const install = voiceEnhancerInstall();
  if (install.status !== "ready") throw new Error(voiceEnhancerInstallProblem(install)!);
  return install.executable;
}

export function deepFilterModelCheckpointCandidates(
  platform: NodeJS.Platform = process.platform,
): string[] {
  const modelPath = ["DeepFilterNet3", "checkpoints", "model_120.ckpt.best"];
  if (platform === "darwin") {
    return [path.join(os.homedir(), "Library", "Caches", "DeepFilterNet", ...modelPath)];
  }
  if (platform === "win32") {
    return [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "DeepFilterNet", ...modelPath),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "DeepFilterNet", "Cache", ...modelPath),
    ].filter((candidate): candidate is string => Boolean(candidate));
  }
  return [path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "DeepFilterNet", ...modelPath)];
}

function deepFilterModelCheckpoint(): string | null {
  return deepFilterModelCheckpointCandidates().find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function deepFilterModelBaseDir(): string | null {
  const checkpoint = deepFilterModelCheckpoint();
  return checkpoint ? path.dirname(path.dirname(checkpoint)) : null;
}

function clampVoiceEnhancementStrength(strength: number) {
  return Math.max(0, Math.min(100, Math.round(strength)));
}

export function voiceEnhancementAttenuationLimitDb(strength: number) {
  // DeepFilterNet 0.5.6 declares --atten-lim as an integer. Keep the UI's
  // five-point strength steps, but convert them to the nearest supported dB.
  return Math.round(clampVoiceEnhancementStrength(strength) * 0.3);
}

export function measureRmsWindow(
  sourcePath: string,
  window: Pick<NoiseProfileWindow, "startSeconds" | "endSeconds">,
) {
  const decoded = execFileSync("ffmpeg", [
    "-v", "error",
    "-ss", String(window.startSeconds),
    "-t", String(window.endSeconds - window.startSeconds),
    "-i", sourcePath,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", "48000",
    "-f", "f32le",
    "pipe:1",
  ], { maxBuffer: 16 * 1024 * 1024 });
  const sampleCount = Math.floor(decoded.length / 4);
  let sumSquares = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = decoded.readFloatLE(index * 4);
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, sampleCount));
  return Number((20 * Math.log10(Math.max(rms, Number.EPSILON))).toFixed(2));
}

/** L1 extraction: fixed-window RMS observations from one source artifact. The
 * 8 kHz analysis copy is descriptive only; the 48 kHz authority is processed
 * separately. */
export function extractRmsWindowObservations(sourcePath: string): RmsWindowObservation[] {
  const sampleRate = 8_000;
  const decoded = execFileSync("ffmpeg", [
    "-v", "error",
    "-i", sourcePath,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", String(sampleRate),
    "-f", "f32le",
    "pipe:1",
  ], { maxBuffer: 128 * 1024 * 1024 });
  const sampleCount = Math.floor(decoded.length / 4);
  const windowSamples = Math.min(sampleCount, Math.round(sampleRate * 0.5));
  const stepSamples = Math.max(1, Math.round(sampleRate * 0.1));
  if (windowSamples < Math.round(sampleRate * 0.2)) {
    throw new Error("Audio is too short to learn a background-noise profile");
  }

  const squares = new Float64Array(sampleCount + 1);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = decoded.readFloatLE(index * 4);
    squares[index + 1] = squares[index]! + sample * sample;
  }

  const observations: RmsWindowObservation[] = [];
  const firstSample = Math.min(Math.round(sampleRate * 0.25), Math.max(0, sampleCount - windowSamples));
  const lastStart = Math.max(firstSample, sampleCount - windowSamples - Math.round(sampleRate * 0.25));
  for (let start = firstSample; start <= lastStart; start += stepSamples) {
    const sumSquares = squares[start + windowSamples]! - squares[start]!;
    const rms = Math.sqrt(sumSquares / windowSamples);
    observations.push({
      startSeconds: Number((start / sampleRate).toFixed(3)),
      endSeconds: Number(((start + windowSamples) / sampleRate).toFixed(3)),
      rmsDbfs: Number((20 * Math.log10(Math.max(rms, Number.EPSILON))).toFixed(2)),
      rmsLinear: rms,
    });
  }
  return observations;
}

/** L2 per-item analysis: select a usable background-only candidate from the
 * source's L1 observations without re-decoding when this rule changes. */
export function selectQuietestNoiseWindow(
  observations: RmsWindowObservation[],
): NoiseProfileWindow {
  const best = observations
    // True digital silence contains no usable stationary-noise fingerprint.
    .filter((observation) => observation.rmsLinear >= 10 ** (-75 / 20))
    .reduce<RmsWindowObservation | null>(
      (quietest, observation) =>
        quietest == null || observation.rmsLinear < quietest.rmsLinear
          ? observation
          : quietest,
      null,
    );
  if (!best) {
    throw new Error("Could not find a usable background-noise window");
  }
  return {
    startSeconds: best.startSeconds,
    endSeconds: best.endSeconds,
    rmsDbfs: best.rmsDbfs,
  };
}

export function findQuietestNoiseWindow(sourcePath: string): NoiseProfileWindow {
  return selectQuietestNoiseWindow(extractRmsWindowObservations(sourcePath));
}

export function ensureNoiseReducedMedia(
  projectId: string,
  sourcePath: string,
  hasVideo: boolean,
) {
  const fixedRecipe = `speech-noise-reduction-v4:${SPEECH_NOISE_REDUCTION_FILTER}`;
  const extension = hasVideo ? ".mp4" : ".m4a";
  const receiptPath = analysisReceiptPath(projectId, sourcePath, fixedRecipe, "noise-reduced", extension);
  const recorded = readAnalysisReceipt(receiptPath, fixedRecipe);
  const profile = isNoiseProfileWindow(recorded?.profile)
    ? recorded.profile
    : findQuietestNoiseWindow(sourcePath);
  const recipe = [
    fixedRecipe,
    `profile=${profile.startSeconds.toFixed(3)}-${profile.endSeconds.toFixed(3)}`,
  ].join(":");
  const { output, exists } = derivedOutput(projectId, sourcePath, recipe, "noise-reduced", extension);
  if (!exists) {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-speech-cleanup-"));
    const analysisWav = path.join(stagingDir, "analysis.wav");
    const cleanedWav = path.join(stagingDir, "cleaned.wav");
    try {
      // L1 extraction: decode one source, preserving timing, and remove only
      // sub-speech rumble before learning its stationary-noise fingerprint.
      execFileSync("ffmpeg", [
        "-y",
        "-v", "error",
        "-i", sourcePath,
        "-map", "0:a:0",
        "-af", "highpass=f=70",
        "-ac", "1",
        "-ar", "48000",
        "-c:a", "pcm_s16le",
        analysisWav,
      ], { stdio: "pipe" });

      // L2 per-item derivation: apply the extracted profile to every frame.
      // This is intentionally a separate pass; an in-stream profile captured
      // near the end of a take cannot retroactively clean earlier samples.
      // An installed DreamCut names its own Python with NumPy (scripts/feature-tools.mjs); a checkout uses the system's.
      execFileSync(process.env.DREAMCUT_PYTHON || "python3", [
        spectralGateScriptPath(),
        analysisWav,
        cleanedWav,
        "--noise-start", profile.startSeconds.toFixed(3),
        "--noise-end", profile.endSeconds.toFixed(3),
        "--reduction-db", "15",
        "--oversubtract", "1.6",
      ], { stdio: "pipe" });

      renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", hasVideo
        ? [
            "-y",
            "-v", "error",
            "-i", sourcePath,
            "-i", cleanedWav,
            "-map", "0:v:0?",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            temporary,
          ]
        : [
            "-y",
            "-v", "error",
            "-i", cleanedWav,
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            temporary,
          ], { stdio: "pipe" }));
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  if (!recorded || recorded.recipe !== recipe || !receiptMatchesOutput(recorded, output.absolutePath)) {
    writeAnalysisReceipt(receiptPath, fixedRecipe, output.absolutePath, { recipe, profile });
  }
  const previewAudio = hasVideo
    ? ensurePreviewAudioClock(projectId, output.absolutePath)
    : output;
  return {
    ...output,
    recipe,
    profile,
    previewAudioSourceUrl: previewAudio.sourceUrl,
    previewAudioAbsolutePath: previewAudio.absolutePath,
  };
}

export function ensureVoiceEnhancedMedia(
  projectId: string,
  sourcePath: string,
  hasVideo: boolean,
  requestedStrength = VOICE_ENHANCEMENT_DEFAULT_STRENGTH,
) {
  const strength = clampVoiceEnhancementStrength(requestedStrength);
  const attenuationLimitDb = voiceEnhancementAttenuationLimitDb(strength);
  const recipe = [
    "voice-enhancement-v1",
    "deepfilternet=0.5.6",
    "model=DeepFilterNet3:model_120.ckpt.best",
    `strength=${strength}`,
    `attenuation_limit_db=${attenuationLimitDb}`,
    VOICE_ENHANCEMENT_POLISH_FILTER,
  ].join(":");
  const extension = hasVideo ? ".mp4" : ".m4a";
  const { output, exists } = derivedOutput(projectId, sourcePath, recipe, "voice-enhanced", extension);
  const receiptPath = analysisReceiptPath(projectId, sourcePath, recipe, "voice-enhanced", extension);
  const recorded = exists ? readAnalysisReceipt(receiptPath, recipe) : null;
  if (recorded && isVoiceEnhancementMeasurements(recorded.measurements) && receiptMatchesOutput(recorded, output.absolutePath)) {
    return voiceEnhancementResult(projectId, output, hasVideo, recipe, strength, attenuationLimitDb, recorded.measurements);
  }
  const profile = findQuietestNoiseWindow(sourcePath);
  const inputMeasurement = measureLoudnessForNormalization(sourcePath);
  if (!exists) {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-voice-enhancement-"));
    const originalWav = path.join(stagingDir, "original.wav");
    const modelWav = path.join(stagingDir, "original_DeepFilterNet3.wav");
    const polishedWav = path.join(stagingDir, "enhanced.wav");
    try {
      execFileSync("ffmpeg", [
        "-y",
        "-v", "error",
        "-i", sourcePath,
        "-map", "0:a:0",
        "-ac", "1",
        "-ar", "48000",
        "-c:a", "pcm_s16le",
        originalWav,
      ], { stdio: "pipe" });
      const modelBaseDir = deepFilterModelBaseDir();
      const enhancer = voiceEnhancerExecutable();
      try {
        execFileSync(enhancer, [
          "--model-base-dir", modelBaseDir ?? "DeepFilterNet3",
          "--atten-lim", String(attenuationLimitDb),
          "--log-level", "error",
          "--output-dir", stagingDir,
          originalWav,
        ], { stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "EACCES") throw error;
        throw new Error(`Voice enhancement could not start ${enhancer} (${code}). ${VOICE_SETUP_COMMAND}`);
      }
      if (!fs.existsSync(modelWav)) {
        throw new Error("DeepFilterNet3 did not produce enhanced audio");
      }
      execFileSync("ffmpeg", [
        "-y",
        "-v", "error",
        "-i", modelWav,
        "-af", VOICE_ENHANCEMENT_POLISH_FILTER,
        "-ar", "48000",
        "-c:a", "pcm_s16le",
        polishedWav,
      ], { stdio: "pipe" });
      renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", hasVideo
        ? [
            "-y",
            "-v", "error",
            "-i", sourcePath,
            "-i", polishedWav,
            "-map", "0:v:0?",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            temporary,
          ]
        : [
            "-y",
            "-v", "error",
            "-i", polishedWav,
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            temporary,
          ], { stdio: "pipe" }));
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  const measurements: VoiceEnhancementMeasurements = {
    profile,
    inputMeasurement,
    outputMeasurement: measureLoudnessForNormalization(output.absolutePath),
    inputNoiseRmsDbfs: measureRmsWindow(sourcePath, profile),
    outputNoiseRmsDbfs: measureRmsWindow(output.absolutePath, profile),
  };
  writeAnalysisReceipt(receiptPath, recipe, output.absolutePath, { measurements });
  return voiceEnhancementResult(projectId, output, hasVideo, recipe, strength, attenuationLimitDb, measurements);
}

type VoiceEnhancementMeasurements = {
  profile: NoiseProfileWindow;
  inputMeasurement: LoudnormMeasurement;
  outputMeasurement: LoudnormMeasurement;
  inputNoiseRmsDbfs: number;
  outputNoiseRmsDbfs: number;
};

function voiceEnhancementResult(
  projectId: string,
  output: OutputLocation,
  hasVideo: boolean,
  recipe: string,
  strength: number,
  attenuationLimitDb: number,
  measurements: VoiceEnhancementMeasurements,
) {
  const checkpointPath = deepFilterModelCheckpoint();
  const previewAudio = hasVideo
    ? ensurePreviewAudioClock(projectId, output.absolutePath)
    : output;
  return {
    ...output,
    recipe,
    strength,
    attenuationLimitDb,
    profile: measurements.profile,
    inputMeasurement: measurements.inputMeasurement,
    outputMeasurement: measurements.outputMeasurement,
    inputNoiseRmsDbfs: measurements.inputNoiseRmsDbfs,
    outputNoiseRmsDbfs: measurements.outputNoiseRmsDbfs,
    previewAudioSourceUrl: previewAudio.sourceUrl,
    previewAudioAbsolutePath: previewAudio.absolutePath,
    model: {
      engine: "DeepFilterNet3",
      packageVersion: "0.5.6",
      checkpoint: "model_120.ckpt.best",
      checkpointSha256: checkpointPath ? mediaFileSha256(checkpointPath) : null,
      delayCompensation: true,
    },
  };
}

export type LoudnormMeasurement = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  output_i: string;
  output_tp: string;
  output_lra: string;
  output_thresh: string;
  normalization_type: string;
  target_offset: string;
};

export function measureLoudnessForNormalization(
  sourcePath: string,
  integratedLufs: number = NARRATOR_NORMALIZATION_TARGET.integratedLufs,
): LoudnormMeasurement {
  const target = { ...NARRATOR_NORMALIZATION_TARGET, integratedLufs };
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", sourcePath,
    "-map", "0:a:0",
    "-af", `loudnorm=I=${target.integratedLufs}:LRA=${target.loudnessRangeLu}:TP=${target.truePeakDbtp}:print_format=json`,
    "-f", "null",
    "-",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Could not measure audio loudness");
  }
  const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error("FFmpeg did not return loudness measurements");
  return JSON.parse(match[0]) as LoudnormMeasurement;
}

export function ensureLoudnessNormalizedMedia(
  projectId: string,
  sourcePath: string,
  hasVideo: boolean,
  integratedLufs: number = NARRATOR_NORMALIZATION_TARGET.integratedLufs,
) {
  const target = { ...NARRATOR_NORMALIZATION_TARGET, integratedLufs };
  const extension = hasVideo ? ".mp4" : ".m4a";
  const fixedRecipe = `narrator-loudnorm-v1:I=${target.integratedLufs}:LRA=${target.loudnessRangeLu}:TP=${target.truePeakDbtp}`;
  const receiptPath = analysisReceiptPath(projectId, sourcePath, fixedRecipe, "normalized", extension);
  const recorded = readAnalysisReceipt(receiptPath, fixedRecipe);
  const measured = isLoudnormMeasurement(recorded?.measured)
    ? recorded.measured
    : measureLoudnessForNormalization(sourcePath, integratedLufs);
  const secondPass = [
    `loudnorm=I=${target.integratedLufs}`,
    `LRA=${target.loudnessRangeLu}`,
    `TP=${target.truePeakDbtp}`,
    `measured_I=${measured.input_i}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_TP=${measured.input_tp}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  const recipe = `narrator-loudnorm-v1:${secondPass}`;
  const { output, exists } = derivedOutput(projectId, sourcePath, recipe, "normalized", extension);
  if (!exists) {
    renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", [
      "-y",
      "-v", "error",
      "-i", sourcePath,
      ...(hasVideo ? ["-map", "0:v:0?", "-c:v", "copy"] : ["-vn"]),
      "-map", "0:a:0",
      "-af", secondPass,
      "-ar", "48000",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      temporary,
    ], { stdio: "pipe" }));
  }
  const reuseOutputMeasurement = recorded?.recipe === recipe
    && isLoudnormMeasurement(recorded.outputMeasurement)
    && receiptMatchesOutput(recorded, output.absolutePath);
  const outputMeasurement = reuseOutputMeasurement
    ? recorded.outputMeasurement as LoudnormMeasurement
    : measureLoudnessForNormalization(output.absolutePath, integratedLufs);
  if (!reuseOutputMeasurement) {
    writeAnalysisReceipt(receiptPath, fixedRecipe, output.absolutePath, { recipe, measured, outputMeasurement });
  }
  const previewAudio = hasVideo
    ? ensurePreviewAudioClock(projectId, output.absolutePath)
    : output;
  return {
    ...output,
    recipe,
    measured,
    outputMeasurement,
    target,
    previewAudioSourceUrl: previewAudio.sourceUrl,
    previewAudioAbsolutePath: previewAudio.absolutePath,
  };
}

const LOUDNORM_FIELDS = [
  "input_i", "input_tp", "input_lra", "input_thresh",
  "output_i", "output_tp", "output_lra", "output_thresh",
  "normalization_type", "target_offset",
] as const;

function isLoudnormMeasurement(value: unknown): value is LoudnormMeasurement {
  return value != null && typeof value === "object"
    && LOUDNORM_FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === "string");
}

function isNoiseProfileWindow(value: unknown): value is NoiseProfileWindow {
  const window = value as NoiseProfileWindow | null;
  return window != null && typeof window === "object"
    && [window.startSeconds, window.endSeconds, window.rmsDbfs].every((n) => typeof n === "number" && Number.isFinite(n));
}

function isVoiceEnhancementMeasurements(value: unknown): value is VoiceEnhancementMeasurements {
  const recorded = value as VoiceEnhancementMeasurements | null;
  return recorded != null && typeof recorded === "object"
    && isNoiseProfileWindow(recorded.profile)
    && isLoudnormMeasurement(recorded.inputMeasurement)
    && isLoudnormMeasurement(recorded.outputMeasurement)
    && Number.isFinite(recorded.inputNoiseRmsDbfs)
    && Number.isFinite(recorded.outputNoiseRmsDbfs);
}

export function ensureDetachedAudio(
  projectId: string,
  sourcePath: string,
) {
  const recipe = "detach-audio-v1:aac-192k";
  const { output, exists } = derivedOutput(projectId, sourcePath, recipe, "detached-audio", ".m4a");
  if (!exists) {
    renderAtomically(output.absolutePath, (temporary) => execFileSync("ffmpeg", [
      "-y",
      "-v", "error",
      "-i", sourcePath,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      temporary,
    ], { stdio: "pipe" }));
  }
  return { ...output, recipe };
}
