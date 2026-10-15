import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mediaUrl, resolveMediaPath } from "@/lib/local-store/media";
import { isSafeProjectId, projectMediaDir } from "@/lib/local-store/paths";
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

function outputLocation(
  projectId: string,
  sourcePath: string,
  recipe: string,
  suffix: string,
  extension: string,
) {
  const stem = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^A-Za-z0-9._-]+/g, "-");
  const relativePath = path.join(
    "audio-effects",
    `${stem}.${sourceFingerprint(sourcePath, recipe)}.${suffix}${extension}`,
  );
  return {
    relativePath,
    absolutePath: path.join(projectMediaDir(projectId), relativePath),
    sourceUrl: mediaUrl(projectId, relativePath),
  };
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
  const output = outputLocation(
    projectId,
    treatedMediaPath,
    recipe,
    "preview-audio",
    ".m4a",
  );
  if (!fs.existsSync(output.absolutePath)) {
    fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
    execFileSync("ffmpeg", [
      "-y",
      "-v", "error",
      "-i", treatedMediaPath,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "copy",
      "-movflags", "+faststart",
      output.absolutePath,
    ], { stdio: "pipe" });
  }
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
  const output = outputLocation(projectId, sourcePath, recipe, "preview-audio-reverse", ".m4a");
  const receipt = `${output.absolutePath}.json`;
  if (fs.existsSync(receipt)) {
    const recorded = JSON.parse(fs.readFileSync(receipt, "utf8"));
    // A silent source is probed once; every later preview request skips FFprobe.
    if (recorded.source_audio === false) return null;
    const duration = Number(recorded.source_duration_seconds);
    if (fs.existsSync(output.absolutePath) && Number.isFinite(duration) && duration > 0) return { ...output, recipe, sourceDurationSeconds: duration };
  }
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration:format=duration", "-of", "json", sourcePath], { encoding: "utf8" }));
  if (!probe.streams?.length) {
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, JSON.stringify({ recipe, source_audio: false }) + "\n");
    return null;
  }
  const duration = Number(probe.streams[0]?.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (duration > MAX_REVERSED_PREVIEW_AUDIO_SECONDS) return null;
  fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
  const temporary = `${output.absolutePath}.${process.pid}.tmp.m4a`;
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", sourcePath, "-map", "0:a:0", "-vn", "-af", "areverse", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", temporary], { stdio: "pipe" });
    fs.renameSync(temporary, output.absolutePath);
  } finally { fs.rmSync(temporary, { force: true }); }
  fs.writeFileSync(receipt, JSON.stringify({ recipe, source_duration_seconds: duration }) + "\n");
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

function voiceEnhancerExecutable(): string {
  const executable = voiceEnhancerExecutableCandidates().find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(
      "Voice enhancement is not installed. From the DreamCut folder run `pnpm setup:voice`, "
      + "then try again.",
    );
  }
  return executable;
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
  const profile = findQuietestNoiseWindow(sourcePath);
  const recipe = [
    "speech-noise-reduction-v4",
    SPEECH_NOISE_REDUCTION_FILTER,
    `profile=${profile.startSeconds.toFixed(3)}-${profile.endSeconds.toFixed(3)}`,
  ].join(":");
  const output = outputLocation(projectId, sourcePath, recipe, "noise-reduced", hasVideo ? ".mp4" : ".m4a");
  if (!fs.existsSync(output.absolutePath)) {
    fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
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
      execFileSync("python3", [
        spectralGateScriptPath(),
        analysisWav,
        cleanedWav,
        "--noise-start", profile.startSeconds.toFixed(3),
        "--noise-end", profile.endSeconds.toFixed(3),
        "--reduction-db", "15",
        "--oversubtract", "1.6",
      ], { stdio: "pipe" });

      execFileSync("ffmpeg", hasVideo
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
            output.absolutePath,
          ]
        : [
            "-y",
            "-v", "error",
            "-i", cleanedWav,
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output.absolutePath,
          ], { stdio: "pipe" });
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
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
  const output = outputLocation(
    projectId,
    sourcePath,
    recipe,
    "voice-enhanced",
    hasVideo ? ".mp4" : ".m4a",
  );
  const profile = findQuietestNoiseWindow(sourcePath);
  const inputMeasurement = measureLoudnessForNormalization(sourcePath);
  if (!fs.existsSync(output.absolutePath)) {
    fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
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
      execFileSync(voiceEnhancerExecutable(), [
        "--model-base-dir", modelBaseDir ?? "DeepFilterNet3",
        "--atten-lim", String(attenuationLimitDb),
        "--log-level", "error",
        "--output-dir", stagingDir,
        originalWav,
      ], { stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
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
      execFileSync("ffmpeg", hasVideo
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
            output.absolutePath,
          ]
        : [
            "-y",
            "-v", "error",
            "-i", polishedWav,
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            output.absolutePath,
          ], { stdio: "pipe" });
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  const outputMeasurement = measureLoudnessForNormalization(output.absolutePath);
  const checkpointPath = deepFilterModelCheckpoint();
  const previewAudio = hasVideo
    ? ensurePreviewAudioClock(projectId, output.absolutePath)
    : output;
  return {
    ...output,
    recipe,
    strength,
    attenuationLimitDb,
    profile,
    inputMeasurement,
    outputMeasurement,
    inputNoiseRmsDbfs: measureRmsWindow(sourcePath, profile),
    outputNoiseRmsDbfs: measureRmsWindow(output.absolutePath, profile),
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
  const measured = measureLoudnessForNormalization(sourcePath, integratedLufs);
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
  const output = outputLocation(projectId, sourcePath, recipe, "normalized", hasVideo ? ".mp4" : ".m4a");
  if (!fs.existsSync(output.absolutePath)) {
    fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
    execFileSync("ffmpeg", [
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
      output.absolutePath,
    ], { stdio: "pipe" });
  }
  const outputMeasurement = measureLoudnessForNormalization(output.absolutePath, integratedLufs);
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

export function ensureDetachedAudio(
  projectId: string,
  sourcePath: string,
) {
  const recipe = "detach-audio-v1:aac-192k";
  const output = outputLocation(projectId, sourcePath, recipe, "detached-audio", ".m4a");
  if (!fs.existsSync(output.absolutePath)) {
    fs.mkdirSync(path.dirname(output.absolutePath), { recursive: true });
    execFileSync("ffmpeg", [
      "-y",
      "-v", "error",
      "-i", sourcePath,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      output.absolutePath,
    ], { stdio: "pipe" });
  }
  return { ...output, recipe };
}
