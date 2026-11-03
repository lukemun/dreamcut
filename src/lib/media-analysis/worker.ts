import { discreteObservationCoverage } from "./observation-coverage";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { hostname } from "node:os";

import {
  heartbeatJob,
  readAssetBindings,
  readJob,
  readManifest,
  writeAssetBindings,
  writeJob,
  writeManifest,
} from "../local-store/media-analysis";
import { publishMediaContextDataset, readMediaContextIndex } from "../local-store/media-context";
import { mediaUrl } from "../local-store/media";
import { mediaAnalysisContentDir, portableRelative, projectMediaDir } from "../local-store/paths";
import { writeJsonFileAtomic } from "../local-store/atomic-json";
import { readPeaks, withProjectLock, writePeaks } from "../local-store/store";
import type { AnalysisJob, AnalysisManifest, CacheDisposition, ProbeResult, ResourceClass, StageAttempt, StageCacheIdentity, StageToolIdentity } from "./schema";
import { calculateTimingRollup } from "./timing";
import { cacheDispositionForPrepared, createStageCacheIdentity, prepareStageRecord, stageArtifactRelativePath } from "./stage-cache";
import { AppleVisionDetector } from "./apple-vision";
import { buildShotBoundedTracks, type TrackDetection } from "./semantic-tracks";
import type { Shot } from "./shot-association";
import { enforceMediaAnalysisCacheBudget } from "./cache-budget";
import { sourceNeedsSdrRenderAuthority } from "./color-profile";
import {
  extractWaveformPeaksFromPcmWav,
  type WaveformPeaksArtifact,
  WAVEFORM_PEAK_RECIPE_ID,
  WAVEFORM_PEAK_TARGET_SAMPLES,
} from "./waveform-peaks";

type CommandResult = {
  stdout: string;
  stderr: string;
  cpuUserMs: number;
  cpuSystemMs: number;
  peakRssBytes: number | null;
};

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try { return await fn(); } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

export function defaultFfmpegConcurrency(): number {
  const requested = Number(process.env.MEDIA_ANALYSIS_FFMPEG_CONCURRENCY ?? 2);
  return Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 2;
}

export function decodeSmokeArgs(
  sourcePath: string,
  probe: Pick<ProbeResult, "has_video" | "has_audio">,
): string[] {
  const maps = [
    ...(probe.has_video ? ["-map", "0:v:0?"] : []),
    ...(probe.has_audio ? ["-map", "0:a:0?"] : []),
  ];
  return ["-v", "error", "-i", sourcePath, ...maps, "-f", "null", "-"];
}

export class SourceChangedError extends Error {
  constructor(readonly size: number, readonly mtimeMs: number) { super("source_changed_during_preprocessing"); }
}

export async function acquireAnalysisStageLease(
  fingerprint: string,
  stage: string,
  owner: string,
  cancelled: () => boolean,
  leaseMs = 30_000,
): Promise<() => void> {
  const leaseDirectory = path.join(mediaAnalysisContentDir(fingerprint), "leases");
  fs.mkdirSync(leaseDirectory, { recursive: true });
  const leasePath = path.join(leaseDirectory, `${stage.replace(/[^a-z0-9_-]/gi, "_")}.lock`);
  while (true) {
    if (cancelled()) throw new Error("cancelled");
    try {
      const descriptor = fs.openSync(leasePath, "wx", 0o600);
      const lease = { owner, stage, acquired_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), expires_at: new Date(Date.now() + leaseMs).toISOString() };
      fs.writeFileSync(descriptor, `${JSON.stringify(lease)}\n`);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      const heartbeatTimer = setInterval(() => {
        try {
          const current = JSON.parse(fs.readFileSync(leasePath, "utf8")) as { owner?: string };
          if (current.owner !== owner) return;
          const now = Date.now();
          writeJsonFileAtomic(leasePath, { ...lease, heartbeat_at: new Date(now).toISOString(), expires_at: new Date(now + leaseMs).toISOString() });
        } catch { /* lease ownership will be checked by the caller's job heartbeat */ }
      }, Math.max(1_000, Math.floor(leaseMs / 3)));
      heartbeatTimer.unref();
      return () => {
        clearInterval(heartbeatTimer);
        try {
          const current = JSON.parse(fs.readFileSync(leasePath, "utf8")) as { owner?: string };
          if (current.owner === owner) fs.unlinkSync(leasePath);
        } catch { /* lease was already reclaimed */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const current = JSON.parse(fs.readFileSync(leasePath, "utf8")) as { expires_at?: string };
        if (current.expires_at && Date.parse(current.expires_at) <= Date.now()) {
          fs.unlinkSync(leasePath);
          continue;
        }
      } catch {
        try {
          if (Date.now() - fs.statSync(leasePath).mtimeMs > leaseMs) fs.unlinkSync(leasePath);
        } catch { /* another worker reclaimed it */ }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

export async function fingerprintStableSource(filePath: string, afterRead?: () => Promise<void> | void): Promise<string> {
  const before = fs.statSync(filePath);
  const fingerprint = await sha256File(filePath);
  await afterRead?.();
  const after = fs.statSync(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new SourceChangedError(after.size, after.mtimeMs);
  return fingerprint;
}

export function runMeasuredCommand(command: string, args: string[], cancelled: () => boolean): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const useTime = fs.existsSync("/usr/bin/time");
    const timeArgs = process.platform === "darwin" ? ["-l"] : ["-v"];
    const child = spawn(useTime ? "/usr/bin/time" : command, useTime ? [...timeArgs, command, ...args] : args, {
      stdio: ["ignore", "pipe", "pipe"],
      // FFmpeg and detector helpers may themselves create descendants. A
      // dedicated process group lets cancellation stop the whole stage rather
      // than only the /usr/bin/time wrapper and leaving expensive work alive.
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    let terminationStarted = false;
    let forceTimer: ReturnType<typeof setTimeout> | null = null;
    const signalTree = (signal: NodeJS.Signals) => {
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, signal); return; } catch { /* already exited */ }
      }
      try { child.kill(signal); } catch { /* already exited */ }
    };
    const timer = setInterval(() => {
      if (!cancelled() || terminationStarted) return;
      terminationStarted = true;
      signalTree("SIGTERM");
      forceTimer = setTimeout(() => signalTree("SIGKILL"), 750);
      forceTimer.unref?.();
    }, 50);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (forceTimer) clearTimeout(forceTimer);
      const userSeconds = /(?:^|\n)\s*([\d.]+)\s+user\s*$/m.exec(stderr)?.[1]
        ?? /User time \(seconds\):\s*([\d.]+)/.exec(stderr)?.[1]
        ?? /(?:^|\n)user\s+([\d.]+)\s*$/m.exec(stderr)?.[1];
      const systemSeconds = /(?:^|\n)\s*([\d.]+)\s+sys\s*$/m.exec(stderr)?.[1]
        ?? /System time \(seconds\):\s*([\d.]+)/.exec(stderr)?.[1]
        ?? /(?:^|\n)sys\s+([\d.]+)\s*$/m.exec(stderr)?.[1];
      const macRss = /(?:^|\n)\s*(\d+)\s+maximum resident set size\s*$/m.exec(stderr)?.[1];
      const gnuRssKb = /Maximum resident set size \(kbytes\):\s*(\d+)/.exec(stderr)?.[1];
      const peakRssBytes = macRss ? Number(macRss) : gnuRssKb ? Number(gnuRssKb) * 1024 : null;
      const user = Number(userSeconds ?? 0) * 1000;
      const system = Number(systemSeconds ?? 0) * 1000;
      if (cancelled()) return reject(new Error("cancelled"));
      if (code !== 0) return reject(new Error(`${command} exited ${code ?? signal}: ${stderr.slice(-2_000)}`));
      resolve({ stdout, stderr, cpuUserMs: user, cpuSystemMs: system, peakRssBytes });
    });
  });
}

const toolIdentityPromises = new Map<string, Promise<StageToolIdentity>>();
function resolveToolIdentity(command: string, cancelled: () => boolean): Promise<StageToolIdentity> {
  const existing = toolIdentityPromises.get(command);
  if (existing) return existing;
  const pending = runMeasuredCommand(command, ["-version"], cancelled)
    .then((result) => ({ name: command, version: result.stdout.split("\n")[0]?.trim() || "unknown" }))
    .catch(() => ({ name: command, version: "unavailable" }));
  toolIdentityPromises.set(command, pending);
  return pending;
}

export async function warmMediaToolIdentities(): Promise<void> {
  await Promise.all([resolveToolIdentity("ffprobe", () => false), resolveToolIdentity("ffmpeg", () => false)]);
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function blankManifest(fingerprint: string, sourceSize: number): AnalysisManifest {
  return {
    schema_version: 2, fingerprint_sha256: fingerprint, source_size_bytes: sourceSize,
    probe: null, derivatives: {}, stages: {}, stage_records: {}, stage_history: [], attempts: [], timing: calculateTimingRollup([]),
    detector: { status: "unavailable", reason: "Apple Vision is not promoted until fixture thresholds pass." },
    updated_at: new Date().toISOString(),
  };
}

export async function processAnalysisJob(
  job: AnalysisJob,
  owner: string,
  options: {
    afterFingerprintRead?: () => Promise<void> | void;
    beforeFinalSourceStat?: () => Promise<void> | void;
    ffmpegConcurrency?: number;
    /** Semantic detection is expensive and remains explicit opt-in even after
     * the local Apple Vision candidate is promoted. */
    detectorEnabled?: boolean;
  } = {},
): Promise<AnalysisJob> {
  const sourcePath = path.join(projectMediaDir(job.project_id), job.relative_path);
  let initialStat: fs.Stats;
  try {
    initialStat = fs.statSync(sourcePath);
  } catch (error) {
    const failed: AnalysisJob = { ...job, status: "failed", lease: null, finished_at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    writeJob(failed);
    return failed;
  }
  const sourceSize = initialStat.size;
  const ffmpegPool = new Semaphore(options.ffmpegConcurrency ?? defaultFfmpegConcurrency());
  let fingerprint = job.fingerprint_sha256;
  if (job.source_size_bytes !== initialStat.size || job.source_mtime_ms !== initialStat.mtimeMs) fingerprint = null;
  let manifest: AnalysisManifest | null = fingerprint ? readManifest(fingerprint) : null;
  const pendingAttempts: StageAttempt[] = [];
  let heartbeatAt = Date.now();
  let releasePipelineLease: (() => void) | null = null;
  let leaseLost = false;
  const cancelled = () => leaseLost || readJob(job.job_id)?.cancellation_requested_at != null;
  const jobHeartbeatTimer = setInterval(() => {
    try { heartbeatJob(job.job_id, owner); } catch { leaseLost = true; }
  }, 10_000);
  jobHeartbeatTimer.unref();
  const heartbeat = () => {
    if (Date.now() - heartbeatAt > 5_000) {
      heartbeatJob(job.job_id, owner);
      heartbeatAt = Date.now();
    }
  };

  type RecordedResult<T> = {
    value: T;
    cpuUserMs?: number;
    cpuSystemMs?: number;
    peakRssBytes?: number | null;
    bytesRead?: number | null;
    bytesWritten?: number | null;
    sourceSeconds?: number | null;
    framesProcessed?: number | null;
    chunksProcessed?: number | null;
    warnings?: string[];
  };
  type QueueMark = { wall: Date; monotonic: bigint };
  const queueMark = (): QueueMark => ({ wall: new Date(), monotonic: process.hrtime.bigint() });
  const record = async <T>(recordOptions: {
    stage: string; resource: ResourceClass; dependencies?: string[];
    cacheDisposition?: CacheDisposition; queued?: QueueMark;
    identity?: StageCacheIdentity; artifactPath?: string | null;
    tool?: StageToolIdentity;
    run: () => Promise<RecordedResult<T>>;
  }): Promise<T> => {
    const queued = recordOptions.queued ?? queueMark();
    const startedAt = new Date();
    const startedMonotonic = process.hrtime.bigint();
    const cpuBefore = process.cpuUsage();
    let status: StageAttempt["status"] = "completed";
    let error: string | null = null;
    let result: RecordedResult<T> | undefined;
    if (manifest && recordOptions.identity) {
      prepareStageRecord(manifest, recordOptions.identity);
      manifest.stage_records[recordOptions.stage] = {
        ...manifest.stage_records[recordOptions.stage], status: "running", updated_at: startedAt.toISOString(), stale_reason: null,
      };
      manifest.stages[recordOptions.stage] = "running";
      writeManifest(manifest);
    }
    try {
      if (cancelled()) throw new Error("cancelled");
      heartbeat();
      result = await recordOptions.run();
      return result.value;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      status = error === "cancelled" ? "cancelled" : "failed";
      throw caught;
    } finally {
      const finishedAt = new Date();
      const finishedMonotonic = process.hrtime.bigint();
      const cpu = process.cpuUsage(cpuBefore);
      const activeWallMs = Number(finishedMonotonic - startedMonotonic) / 1_000_000;
      const queueWaitMs = Number(startedMonotonic - queued.monotonic) / 1_000_000;
      const artifactBytes = recordOptions.artifactPath && fs.existsSync(recordOptions.artifactPath)
        ? fs.statSync(recordOptions.artifactPath).size : result?.bytesWritten ?? 0;
      const artifactHash = recordOptions.artifactPath && fs.existsSync(recordOptions.artifactPath)
        ? await sha256File(recordOptions.artifactPath) : null;
      const cacheDisposition = recordOptions.cacheDisposition ?? "miss";
      const sourceSeconds = result?.sourceSeconds ?? manifest?.probe?.duration_seconds ?? null;
      const attempt: StageAttempt = {
        attempt_id: randomUUID(), job_id: job.job_id, job_attempt_number: job.attempt_number,
        stage: recordOptions.stage, resource: recordOptions.resource,
        dependency_stages: recordOptions.dependencies ?? [], status, outcome: status,
        cache_hit: cacheDisposition === "hit", cache_disposition: cacheDisposition,
        queued_at: queued.wall.toISOString(),
        started_at: startedAt.toISOString(), finished_at: finishedAt.toISOString(),
        queue_wait_ms: Math.max(0, queueWaitMs),
        wall_ms: Math.max(0, activeWallMs), active_wall_ms: Math.max(0, activeWallMs),
        cpu_user_ms: result?.cpuUserMs ?? cpu.user / 1000,
        cpu_system_ms: result?.cpuSystemMs ?? cpu.system / 1000,
        input_bytes: result?.bytesRead ?? sourceSize,
        bytes_read: result?.bytesRead ?? sourceSize,
        bytes_written: artifactBytes,
        derived_bytes: artifactBytes,
        source_seconds: sourceSeconds,
        frames_processed: result?.framesProcessed ?? null,
        chunks_processed: result?.chunksProcessed ?? 1,
        peak_rss_bytes: result?.peakRssBytes ?? null,
        worker_id: owner,
        tool: recordOptions.tool ?? recordOptions.identity?.tool ?? { name: "node", version: process.version },
        warnings: result?.warnings ?? [],
        throughput_bytes_per_second: activeWallMs > 0
          ? (result?.bytesRead ?? sourceSize) / (activeWallMs / 1000) : null,
        throughput_source_realtime: sourceSeconds != null && activeWallMs > 0 ? sourceSeconds / (activeWallMs / 1000) : null,
        error,
      };
      if (manifest) {
        manifest.attempts.push(attempt);
        manifest.stages[recordOptions.stage] = status;
        if (recordOptions.identity) {
          manifest.stage_records[recordOptions.stage] = {
            ...manifest.stage_records[recordOptions.stage], status,
            artifact_path: recordOptions.artifactPath ? portableRelative(mediaAnalysisContentDir(manifest.fingerprint_sha256), recordOptions.artifactPath) : null,
            artifact_sha256: artifactHash,
            output_bytes: artifactBytes,
            updated_at: finishedAt.toISOString(),
            stale_reason: null,
          };
        }
        manifest.timing = calculateTimingRollup(
          manifest.attempts.filter((item) => item.job_id === job.job_id && item.job_attempt_number === job.attempt_number),
          { cacheReferenceAttempts: manifest.attempts },
        );
        manifest.updated_at = finishedAt.toISOString();
        writeManifest(manifest);
      } else {
        pendingAttempts.push(attempt);
        const current = readJob(job.job_id) ?? job;
        writeJob({ ...current, attempts: [...(current.attempts ?? []), attempt], timing: calculateTimingRollup([...(current.attempts ?? []), attempt]) });
      }
    }
  };

  const recordWithFfmpegSlot = async <T>(options: {
    stage: string; dependencies?: string[]; cacheDisposition?: CacheDisposition;
    identity?: StageCacheIdentity; artifactPath?: string | null; tool?: StageToolIdentity;
    queued?: QueueMark;
    run: () => Promise<RecordedResult<T>>;
  }): Promise<T> => {
    const queued = options.queued ?? queueMark();
    return ffmpegPool.use(() => record({ ...options, resource: "ffmpeg", queued }));
  };

  try {
    if (!fingerprint) {
      fingerprint = await record({
        stage: "fingerprint", resource: "io",
        cacheDisposition: "miss", tool: { name: "node:crypto", version: process.version },
        run: async () => ({ value: await fingerprintStableSource(sourcePath, options.afterFingerprintRead) }),
      });
      manifest = readManifest(fingerprint) ?? blankManifest(fingerprint, sourceSize);
      manifest.attempts.push(...pendingAttempts);
      manifest.stages.fingerprint = "completed";
      const fingerprintIdentity = createStageCacheIdentity({
        stage: "fingerprint", fingerprint, tool: { name: "node:crypto", version: process.version },
        parameters: { algorithm: "sha256", stable_stat_check: true },
      });
      manifest.stage_records.fingerprint = {
        ...fingerprintIdentity, status: "completed", artifact_path: null, artifact_sha256: fingerprint,
        output_bytes: 0, updated_at: new Date().toISOString(), stale_reason: null,
      };
      manifest.timing = calculateTimingRollup(
        manifest.attempts.filter((item) => item.job_id === job.job_id && item.job_attempt_number === job.attempt_number),
        { cacheReferenceAttempts: manifest.attempts },
      );
      writeManifest(manifest);
    } else {
      manifest = manifest ?? blankManifest(fingerprint, sourceSize);
      const fingerprintIdentity = createStageCacheIdentity({
        stage: "fingerprint", fingerprint, tool: { name: "node:crypto", version: process.version },
        parameters: { algorithm: "sha256", stable_stat_check: true },
      });
      await record({
        stage: "fingerprint", resource: "io", cacheDisposition: "hit", identity: fingerprintIdentity,
        run: async () => ({ value: fingerprint as string, bytesRead: 0, chunksProcessed: 0 }),
      });
    }
    const pipelineQueued = queueMark();
    releasePipelineLease = await acquireAnalysisStageLease(fingerprint, "pipeline", `${owner}:${job.job_id}`, cancelled);
    const pipelineIdentity = createStageCacheIdentity({
      stage: "pipeline_lease", fingerprint, tool: { name: "media-analysis-lease", version: "1" },
      parameters: { scope: "fingerprint_pipeline" },
      dependencyCacheKeys: { fingerprint: manifest.stage_records.fingerprint?.cache_key ?? fingerprint },
    });
    await record({
      stage: "pipeline_lease", resource: "io", dependencies: ["fingerprint"], cacheDisposition: "miss",
      identity: pipelineIdentity, tool: pipelineIdentity.tool, queued: pipelineQueued,
      run: async () => ({ value: undefined, bytesRead: 0, bytesWritten: 0, chunksProcessed: 1 }),
    });
    const contentDir = mediaAnalysisContentDir(fingerprint);
    const derivativesDir = path.join(contentDir, "derivatives");
    fs.mkdirSync(derivativesDir, { recursive: true });

    const ffprobeTool = await resolveToolIdentity("ffprobe", cancelled);
    const ffmpegTool = await resolveToolIdentity("ffmpeg", cancelled);
    const probeIdentity = createStageCacheIdentity({
      stage: "probe", fingerprint, tool: ffprobeTool,
      parameters: { show_streams: true, show_format: true, output: "json" },
      dependencyCacheKeys: {
        fingerprint: manifest.stage_records.fingerprint?.cache_key ?? fingerprint,
        pipeline_lease: manifest.stage_records.pipeline_lease.cache_key,
      },
    });
    const probePrepared = prepareStageRecord(manifest, probeIdentity);
    if (!probePrepared.cacheCompatible) manifest.probe = null;
    if (!manifest.probe) {
      manifest.probe = await recordWithFfmpegSlot({
        stage: "probe", dependencies: ["fingerprint", "pipeline_lease"], identity: probeIdentity, tool: ffprobeTool,
        cacheDisposition: cacheDispositionForPrepared(probePrepared.record, probePrepared.cacheCompatible),
        run: async () => {
          const command = await runMeasuredCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", sourcePath], cancelled);
          const raw = JSON.parse(command.stdout) as { streams?: Record<string, unknown>[]; format?: { duration?: string } };
      const video = raw.streams?.find((stream) => stream.codec_type === "video");
      const audio = raw.streams?.find((stream) => stream.codec_type === "audio");
      const sideData = Array.isArray(video?.side_data_list) ? video.side_data_list as Array<Record<string, unknown>> : [];
      const tags = video?.tags && typeof video.tags === "object" ? video.tags as Record<string, unknown> : {};
      const averageFrameRate = typeof video?.avg_frame_rate === "string" ? video.avg_frame_rate : null;
      const nominalFrameRate = typeof video?.r_frame_rate === "string" ? video.r_frame_rate : null;
          const probe: ProbeResult = {
        duration_seconds: raw.format?.duration ? Number(raw.format.duration) : null,
        width: typeof video?.width === "number" ? video.width : null,
        height: typeof video?.height === "number" ? video.height : null,
        frame_rate: averageFrameRate,
        nominal_frame_rate: nominalFrameRate,
        is_variable_frame_rate: averageFrameRate && nominalFrameRate ? averageFrameRate !== nominalFrameRate : null,
        video_time_base: typeof video?.time_base === "string" ? video.time_base : null,
        display_rotation_degrees: typeof sideData.find((item) => typeof item.rotation === "number")?.rotation === "number"
          ? Number(sideData.find((item) => typeof item.rotation === "number")?.rotation)
          : typeof tags.rotate === "string" ? Number(tags.rotate) : null,
        sample_aspect_ratio: typeof video?.sample_aspect_ratio === "string" ? video.sample_aspect_ratio : null,
        pixel_format: typeof video?.pix_fmt === "string" ? video.pix_fmt : null,
        video_alpha_mode: typeof tags.alpha_mode === "string" ? tags.alpha_mode : null,
        color_transfer: typeof video?.color_transfer === "string" ? video.color_transfer : null,
        color_primaries: typeof video?.color_primaries === "string" ? video.color_primaries : null,
        video_codec: typeof video?.codec_name === "string" ? video.codec_name : null,
        audio_codec: typeof audio?.codec_name === "string" ? audio.codec_name : null,
        audio_channels: typeof audio?.channels === "number" ? audio.channels : null,
        audio_channel_layout: typeof audio?.channel_layout === "string" ? audio.channel_layout : null,
        sample_rate: typeof audio?.sample_rate === "string" ? Number(audio.sample_rate) : null,
        has_video: Boolean(video), has_audio: Boolean(audio),
          };
          return {
            value: probe, cpuUserMs: command.cpuUserMs, cpuSystemMs: command.cpuSystemMs,
            peakRssBytes: command.peakRssBytes, bytesRead: sourceSize,
            sourceSeconds: probe.duration_seconds, chunksProcessed: 1,
          };
        },
      });
      writeManifest(manifest);
    } else {
      await record({
        stage: "probe", resource: "ffmpeg", dependencies: ["fingerprint", "pipeline_lease"], cacheDisposition: "hit",
        identity: probeIdentity, tool: ffprobeTool,
        run: async () => ({ value: undefined, bytesRead: 0, sourceSeconds: manifest!.probe!.duration_seconds, chunksProcessed: 0 }),
      });
    }

    const dependencyKeys = (dependencies: string[]) => Object.fromEntries(dependencies.map((stage) => [stage, manifest!.stage_records[stage]?.cache_key ?? stage]));
    const cachedArtifactIsValid = async (identity: StageCacheIdentity, outputPath: string): Promise<boolean> => {
      const record = manifest!.stage_records[identity.stage];
      if (record?.cache_key !== identity.cache_key || record.status !== "completed" || !fs.existsSync(outputPath)) return false;
      if (!record.artifact_sha256) return false;
      const valid = await sha256File(outputPath) === record.artifact_sha256;
      if (!valid) {
        const stale = { ...record, status: "stale" as const, stale_reason: "artifact_checksum_mismatch", updated_at: new Date().toISOString() };
        manifest!.stage_records[identity.stage] = stale;
        manifest!.stages[identity.stage] = "stale";
        manifest!.stage_history.push(stale);
        writeManifest(manifest!);
      }
      return valid;
    };
    const publishBinary = (temporaryPath: string, outputPath: string) => {
      const descriptor = fs.openSync(temporaryPath, "r");
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      fs.renameSync(temporaryPath, outputPath);
      const directoryDescriptor = fs.openSync(path.dirname(outputPath), "r");
      try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    };

    const commandStage = async (input: {
      stage: string; filename: string; parameters: Record<string, unknown>; dependencies: string[];
      buildArgs: (outputPath: string) => string[]; inputPath?: string;
    }): Promise<string> => {
      const queued = queueMark();
      const identity = createStageCacheIdentity({
        stage: input.stage, fingerprint: fingerprint!, tool: ffmpegTool,
        parameters: input.parameters, dependencyCacheKeys: dependencyKeys(input.dependencies),
      });
      const prepared = prepareStageRecord(manifest!, identity);
      writeManifest(manifest!);
      const outputPath = path.join(contentDir, stageArtifactRelativePath(identity, input.filename));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const releaseStage = await acquireAnalysisStageLease(fingerprint!, `${input.stage}-${identity.cache_key}`, `${owner}:${job.job_id}`, cancelled);
      try {
        if (await cachedArtifactIsValid(identity, outputPath)) {
          await record({
            stage: input.stage, resource: "ffmpeg", dependencies: input.dependencies, cacheDisposition: "hit",
            identity, artifactPath: outputPath, tool: ffmpegTool, queued,
            run: async () => ({ value: undefined, bytesRead: 0, bytesWritten: 0, chunksProcessed: 0 }),
          });
        } else {
          await recordWithFfmpegSlot({
            stage: input.stage, dependencies: input.dependencies,
            cacheDisposition: cacheDispositionForPrepared(prepared.record, false),
            identity, artifactPath: outputPath, tool: ffmpegTool, queued,
            run: async () => {
              const extension = path.extname(outputPath);
              const temporaryOutput = path.join(path.dirname(outputPath), `.${path.basename(outputPath, extension)}.${randomUUID()}.tmp${extension}`);
              try {
                const result = await runMeasuredCommand("ffmpeg", input.buildArgs(temporaryOutput), cancelled);
                publishBinary(temporaryOutput, outputPath);
                return {
                  value: undefined, cpuUserMs: result.cpuUserMs, cpuSystemMs: result.cpuSystemMs,
                  peakRssBytes: result.peakRssBytes, bytesRead: fs.statSync(input.inputPath ?? sourcePath).size,
                  bytesWritten: fs.statSync(outputPath).size, sourceSeconds: manifest!.probe?.duration_seconds,
                  chunksProcessed: 1,
                };
              } catch (error) {
                try { fs.unlinkSync(temporaryOutput); } catch { /* no partial output */ }
                throw error;
              }
            },
          });
        }
        manifest!.derivatives[input.stage] = portableRelative(contentDir, outputPath);
        writeManifest(manifest!);
        return outputPath;
      } finally { releaseStage(); }
    };

    const jsonCommandStage = async (input: {
      stage: string; filename: string; parameters: Record<string, unknown>; dependencies: string[];
      tool: StageToolIdentity; command: string; args: string[];
      parse: (result: CommandResult) => { payload: unknown; framesProcessed?: number | null; warnings?: string[] };
    }): Promise<string> => {
      const queued = queueMark();
      const identity = createStageCacheIdentity({
        stage: input.stage, fingerprint: fingerprint!, tool: input.tool,
        parameters: input.parameters, dependencyCacheKeys: dependencyKeys(input.dependencies),
      });
      const prepared = prepareStageRecord(manifest!, identity);
      writeManifest(manifest!);
      const outputPath = path.join(contentDir, stageArtifactRelativePath(identity, input.filename));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const releaseStage = await acquireAnalysisStageLease(fingerprint!, `${input.stage}-${identity.cache_key}`, `${owner}:${job.job_id}`, cancelled);
      try {
        if (await cachedArtifactIsValid(identity, outputPath)) {
          await record({
            stage: input.stage, resource: "ffmpeg", dependencies: input.dependencies, cacheDisposition: "hit",
            identity, artifactPath: outputPath, tool: input.tool, queued,
            run: async () => ({ value: undefined, bytesRead: 0, bytesWritten: 0, chunksProcessed: 0 }),
          });
        } else {
          await recordWithFfmpegSlot({
            stage: input.stage, dependencies: input.dependencies,
            cacheDisposition: cacheDispositionForPrepared(prepared.record, false),
            identity, artifactPath: outputPath, tool: input.tool, queued,
            run: async () => {
              const result = await runMeasuredCommand(input.command, input.args, cancelled);
              const parsed = input.parse(result);
              writeJsonFileAtomic(outputPath, parsed.payload, (value) => {
                if (!value || typeof value !== "object") throw new Error(`Invalid ${input.stage} artifact`);
              });
              return {
                value: undefined, cpuUserMs: result.cpuUserMs, cpuSystemMs: result.cpuSystemMs,
                peakRssBytes: result.peakRssBytes, bytesRead: sourceSize, bytesWritten: fs.statSync(outputPath).size,
                sourceSeconds: manifest!.probe?.duration_seconds, framesProcessed: parsed.framesProcessed ?? null,
                chunksProcessed: 1, warnings: parsed.warnings ?? [],
              };
            },
          });
        }
        manifest!.derivatives[input.stage] = portableRelative(contentDir, outputPath);
        writeManifest(manifest!);
        return outputPath;
      } finally { releaseStage(); }
    };

    const jsonValueStage = async (input: {
      stage: string; filename: string; parameters: Record<string, unknown>; dependencies: string[];
      tool: StageToolIdentity; resource: ResourceClass;
      build: (identity: StageCacheIdentity) => Promise<RecordedResult<unknown>>;
    }): Promise<string> => {
      const queued = queueMark();
      const identity = createStageCacheIdentity({
        stage: input.stage, fingerprint: fingerprint!, tool: input.tool,
        parameters: input.parameters, dependencyCacheKeys: dependencyKeys(input.dependencies),
      });
      const prepared = prepareStageRecord(manifest!, identity);
      writeManifest(manifest!);
      const outputPath = path.join(contentDir, stageArtifactRelativePath(identity, input.filename));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      const releaseStage = await acquireAnalysisStageLease(fingerprint!, `${input.stage}-${identity.cache_key}`, `${owner}:${job.job_id}`, cancelled);
      try {
        if (await cachedArtifactIsValid(identity, outputPath)) {
          await record({
            stage: input.stage, resource: input.resource, dependencies: input.dependencies,
            cacheDisposition: "hit", identity, artifactPath: outputPath, tool: input.tool, queued,
            run: async () => ({ value: undefined, bytesRead: 0, bytesWritten: 0, chunksProcessed: 0 }),
          });
        } else {
          await record({
            stage: input.stage, resource: input.resource, dependencies: input.dependencies,
            cacheDisposition: cacheDispositionForPrepared(prepared.record, false), identity,
            artifactPath: outputPath, tool: input.tool, queued,
            run: async () => {
              const built = await input.build(identity);
              writeJsonFileAtomic(outputPath, built.value, (value) => {
                if (!value || typeof value !== "object") throw new Error(`Invalid ${input.stage} artifact`);
              });
              return { ...built, value: undefined, bytesWritten: fs.statSync(outputPath).size };
            },
          });
        }
        manifest!.derivatives[input.stage] = portableRelative(contentDir, outputPath);
        writeManifest(manifest!);
        return outputPath;
      } finally { releaseStage(); }
    };

    const skipStage = async (stage: string, dependencies: string[], reason: string): Promise<void> => {
      const identity = createStageCacheIdentity({
        stage, fingerprint: fingerprint!, tool: { name: "media-analysis-planner", version: "2" },
        parameters: { skipped_because: reason }, dependencyCacheKeys: dependencyKeys(dependencies),
      });
      await record({
        stage, resource: "cpu", dependencies, cacheDisposition: "skipped", identity, tool: identity.tool,
        run: async () => ({ value: undefined, bytesRead: 0, bytesWritten: 0, chunksProcessed: 0, warnings: [reason] }),
      });
    };

    const branches: Promise<unknown>[] = [];
    branches.push(jsonCommandStage({
      stage: "decode_smoke", filename: "decode-smoke.json", parameters: { map: "primary-video+primary-audio", output: "null" }, dependencies: ["probe"],
      tool: ffmpegTool, command: "ffmpeg", args: decodeSmokeArgs(sourcePath, manifest.probe),
      parse: () => ({ payload: { ok: true, warnings: [] } }),
    }));
    if (manifest.probe.has_video) {
      const hdrSource = sourceNeedsSdrRenderAuthority(manifest.probe);
      if (hdrSource) {
        branches.push(skipStage("thumbnail", ["probe"], "hdr_requires_color_managed_render_authority_pair"));
        branches.push(skipStage("proxy", ["probe"], "hdr_requires_color_managed_render_authority_pair"));
      } else {
        branches.push(commandStage({
          stage: "thumbnail", filename: "thumbnail.jpg", parameters: { frames: 1, scale: "640:-2" }, dependencies: ["probe"],
          buildArgs: (output) => ["-y", "-v", "error", "-i", sourcePath, "-frames:v", "1", "-vf", "scale=640:-2", output],
        }));
        branches.push(commandStage({
          stage: "proxy", filename: "proxy.mp4", parameters: { scale: "min(1280,iw):-2", codec: "libx264", preset: "veryfast", crf: 28, audio: false }, dependencies: ["probe"],
          buildArgs: (output) => ["-y", "-v", "error", "-i", sourcePath, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-an", output],
        }));
      }
      branches.push(jsonCommandStage({
        stage: "black_freeze", filename: "black-freeze.json", parameters: { blackdetect: "d=0.25:pix_th=0.10", freezedetect: "n=-50dB:d=1" }, dependencies: ["probe"],
        tool: ffmpegTool, command: "ffmpeg", args: ["-hide_banner", "-i", sourcePath, "-vf", "blackdetect=d=0.25:pix_th=0.10,freezedetect=n=-50dB:d=1", "-an", "-f", "null", "-"],
        parse: (result) => {
          const black = [...result.stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map((match) => ({ type: "black", start_seconds: Number(match[1]), end_seconds: Number(match[2]), duration_seconds: Number(match[3]) }));
          const starts = [...result.stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
          const freezes = [...result.stderr.matchAll(/freeze_end:\s*([\d.]+)\s*\|\s*freeze_duration:\s*([\d.]+)/g)].map((match, index) => ({ type: "freeze", start_seconds: starts[index] ?? null, end_seconds: Number(match[1]), duration_seconds: Number(match[2]) }));
          return { payload: { events: [...black, ...freezes] } };
        },
      }));
      // One expensive pass at HIGH sensitivity, capturing a per-boundary scene
      // score — downstream rules can then pick any threshold ≥0.12 as a cheap L2
      // decision without re-decoding. The old single fixed-0.3 pass silently
      // missed soft cuts and duplicated detections on flicker; parse now de-dups
      // boundaries closer than min_gap (keeping the higher score) and drops
      // first-frame artifacts before min_start.
      const shotsPromise = jsonCommandStage({
        stage: "shots", filename: "shots.json",
        parameters: { scene_threshold: 0.12, min_gap_seconds: 0.15, min_start_seconds: 0.3, scores: true },
        dependencies: ["probe"],
        tool: ffmpegTool, command: "ffmpeg",
        args: ["-hide_banner", "-nostats", "-i", sourcePath, "-vf", "select='gt(scene,0.12)',metadata=print:file=-", "-an", "-f", "null", "-"],
        parse: (result) => {
          const raw: Array<{ time_seconds: number; scene_score: number }> = [];
          let pending: number | null = null;
          for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/)) {
            const time = /pts_time:([\d.]+)/.exec(line);
            if (time) { pending = Number(time[1]); continue; }
            const score = /lavfi\.scene_score=([\d.]+)/.exec(line);
            if (score && pending != null) {
              raw.push({ time_seconds: pending, scene_score: Number(score[1]) });
              pending = null;
            }
          }
          const events: Array<{ type: "shot_boundary"; time_seconds: number; scene_score: number }> = [];
          for (const candidate of raw) {
            if (candidate.time_seconds < 0.3) continue; // first-frame artifacts
            const previous = events[events.length - 1];
            if (previous && candidate.time_seconds - previous.time_seconds <= 0.15) {
              // Flicker double-detection: keep the stronger boundary.
              if (candidate.scene_score > previous.scene_score) {
                events[events.length - 1] = { type: "shot_boundary", ...candidate };
              }
              continue;
            }
            events.push({ type: "shot_boundary", ...candidate });
          }
          return { payload: { events } };
        },
      });
      branches.push(shotsPromise);
      branches.push(shotsPromise.then(() => jsonCommandStage({
        stage: "frame_pts", filename: "frames.json", parameters: { entries: ["best_effort_timestamp", "pkt_duration_time"] }, dependencies: ["probe", "shots"],
        tool: ffprobeTool, command: "ffprobe", args: ["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp,pkt_duration_time", "-of", "json", sourcePath],
        parse: (result) => {
          const raw = JSON.parse(result.stdout) as { frames?: Array<{ best_effort_timestamp?: number | string; pkt_duration_time?: string }> };
          const [timeBaseNum, timeBaseDen] = (manifest!.probe?.video_time_base ?? "0/1").split("/").map(Number);
          const frames = (raw.frames ?? []).flatMap((frame) => frame.best_effort_timestamp == null ? [] : [{
            pts: String(frame.best_effort_timestamp), duration_seconds: frame.pkt_duration_time ? Number(frame.pkt_duration_time) : null,
          }]);
          return { payload: { time_base_num: timeBaseNum, time_base_den: timeBaseDen, frames }, framesProcessed: frames.length };
        },
      })));
    } else {
      branches.push(skipStage("thumbnail", ["probe"], "source_has_no_video"));
      branches.push(skipStage("proxy", ["probe"], "source_has_no_video"));
      branches.push(skipStage("black_freeze", ["probe"], "source_has_no_video"));
      const shotsSkipped = skipStage("shots", ["probe"], "source_has_no_video");
      branches.push(shotsSkipped);
      branches.push(shotsSkipped.then(() => skipStage("frame_pts", ["probe", "shots"], "source_has_no_video")));
    }
    if (manifest.probe.has_audio) {
      const audioPromise = commandStage({
        stage: "audio_pcm", filename: "audio.wav", parameters: { channels: 1, sample_rate: 16_000 }, dependencies: ["probe"],
        buildArgs: (output) => ["-y", "-v", "error", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", output],
      });
      branches.push(audioPromise);
      branches.push(audioPromise.then(async (audioPath) => {
        const peaksPath = await jsonValueStage({
          stage: "waveform_peaks",
          filename: "waveform-peaks.json",
          parameters: {
            recipe_id: WAVEFORM_PEAK_RECIPE_ID,
            target_samples: WAVEFORM_PEAK_TARGET_SAMPLES,
            channel: 0,
          },
          dependencies: ["probe", "audio_pcm"],
          tool: { name: "timeline-waveform-peaks", version: "1" },
          resource: "cpu",
          build: async () => ({
            value: extractWaveformPeaksFromPcmWav(audioPath),
            bytesRead: fs.statSync(audioPath).size,
            sourceSeconds: manifest!.probe?.duration_seconds,
            chunksProcessed: 1,
          }),
        });
        const artifact = JSON.parse(fs.readFileSync(peaksPath, "utf8")) as WaveformPeaksArtifact;
        await withProjectLock(job.project_id, async () => {
          const peaks = readPeaks(job.project_id);
          peaks[mediaUrl(job.project_id, job.relative_path)] = {
            peaks: artifact.peaks,
            source_duration_seconds: artifact.source_duration_seconds,
          };
          writePeaks(job.project_id, peaks);
        });
      }));
      branches.push(audioPromise.then((audioPath) => commandStage({
        stage: "waveform", filename: "waveform.png", parameters: { size: "1200x160", frames: 1 }, dependencies: ["probe", "audio_pcm"], inputPath: audioPath,
        buildArgs: (output) => ["-y", "-v", "error", "-i", audioPath, "-filter_complex", "showwavespic=s=1200x160", "-frames:v", "1", output],
      })));
    } else {
      const audioSkipped = skipStage("audio_pcm", ["probe"], "source_has_no_audio");
      branches.push(audioSkipped);
      branches.push(audioSkipped.then(() => skipStage("waveform_peaks", ["probe", "audio_pcm"], "source_has_no_audio")));
      branches.push(audioSkipped.then(() => skipStage("waveform", ["probe", "audio_pcm"], "source_has_no_audio")));
    }
    await Promise.all(branches);

    const detectorRequested = options.detectorEnabled ?? process.env.MEDIA_ANALYSIS_DETECTOR_ENABLED === "true";
    if (!manifest.probe.has_video) {
      await skipStage("detections", ["probe", "shots", "frame_pts"], "source_has_no_video");
      await skipStage("semantic_tracks", ["shots", "detections"], "source_has_no_video");
      manifest.detector = { status: "unavailable", reason: "Source has no video frames." };
    } else if (!detectorRequested) {
      await skipStage("detections", ["probe", "shots", "frame_pts"], "detector_not_opted_in");
      await skipStage("semantic_tracks", ["shots", "detections"], "detector_not_opted_in");
      manifest.detector = { status: "unavailable", reason: "Semantic detection is opt-in; set MEDIA_ANALYSIS_DETECTOR_ENABLED=true or pass detectorEnabled." };
    } else {
      const detector = new AppleVisionDetector();
      const doctor = await detector.doctor();
      manifest.detector = { status: doctor.status, reason: doctor.reason };
      if (doctor.status !== "available") {
        await skipStage("detections", ["probe", "shots", "frame_pts"], `detector_${doctor.status}:${doctor.reason ?? "not_promoted"}`);
        await skipStage("semantic_tracks", ["shots", "detections"], `detector_${doctor.status}:${doctor.reason ?? "not_promoted"}`);
      } else {
        const framePtsPath = path.join(contentDir, manifest.derivatives.frame_pts!);
        const framePts = JSON.parse(fs.readFileSync(framePtsPath, "utf8")) as {
          time_base_num: number; time_base_den: number;
          frames: Array<{ pts: string }>;
        };
        const secondsPerTick = framePts.time_base_num / framePts.time_base_den;
        const selected: Array<{ index: number; pts: string; time_seconds: number }> = [];
        let nextSampleSeconds = 0;
        for (const [index, frame] of framePts.frames.entries()) {
          const timeSeconds = Number(frame.pts) * secondsPerTick;
          if (!Number.isFinite(timeSeconds) || timeSeconds + 1e-9 < nextSampleSeconds) continue;
          selected.push({ index, pts: frame.pts, time_seconds: timeSeconds });
          nextSampleSeconds = timeSeconds + 0.5;
          if (selected.length >= 240) break;
        }
        const detectorTool = detector.toolIdentity(doctor.compiler_version);
        const detectionsPath = await jsonValueStage({
          stage: "detections", filename: "detections.json",
          parameters: { sample_interval_seconds: 0.5, maximum_frames: 240, coverage_schema: 1, coordinates: "normalized_top_left_display", promotion_required: true },
          dependencies: ["probe", "shots", "frame_pts"], tool: detectorTool, resource: "detector",
          build: async (identity) => {
            const temporaryDirectory = fs.mkdtempSync(path.join(contentDir, ".detector-frames-"));
            try {
              if (selected.length === 0) throw new Error("Video frame index contained no sampleable PTS entries");
              const selector = selected.map((frame) => `eq(n\\,${frame.index})`).join("+");
              const extraction = await runMeasuredCommand("ffmpeg", [
                "-v", "error", "-i", sourcePath, "-vf", `select=${selector}`, "-fps_mode", "vfr", "-q:v", "3",
                path.join(temporaryDirectory, "%06d.jpg"),
              ], cancelled);
              const imageFiles = fs.readdirSync(temporaryDirectory).filter((name) => name.endsWith(".jpg")).sort();
              if (imageFiles.length !== selected.length) throw new Error(`Detector frame extraction produced ${imageFiles.length} frames for ${selected.length} selected PTS entries`);
              const inputFrames = selected.map((frame, index) => ({
                frame_id: `frame_${String(index).padStart(6, "0")}`,
                image_path: path.join(temporaryDirectory, imageFiles[index]!),
                pts: frame.pts,
                time_base_num: framePts.time_base_num,
                time_base_den: framePts.time_base_den,
              }));
              const detected = await detector.detectCandidate(inputFrames);
              const timeByFrame = new Map(inputFrames.map((frame, index) => [frame.frame_id, selected[index]!.time_seconds]));
              if (detected.results.length !== inputFrames.length || new Set(detected.results.map(r => r.frame_id)).size !== inputFrames.length
                || detected.results.some(r => !timeByFrame.has(r.frame_id))) throw new Error("Detector did not return exactly one result per examined frame");
              const payloadFrames = detected.results.map((result) => ({
                frame_id: result.frame_id,
                pts: result.pts,
                time_base_num: result.time_base_num,
                time_base_den: result.time_base_den,
                time_seconds: timeByFrame.get(result.frame_id)!,
                detections: [...result.boxes]
                  .sort((a, b) => a.label.localeCompare(b.label) || a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height)
                  .map((box, index) => ({ detection_id: `${result.frame_id}_${box.label}_${String(index).padStart(3, "0")}`, ...box })),
              }));
              return {
                value: { schema_version: 1, analysis_revision: identity.cache_key, coordinate_space: "normalized_top_left_display", frames: payloadFrames },
                peakRssBytes: Math.max(extraction.peakRssBytes ?? 0, detected.metrics.peak_rss_bytes ?? 0) || null,
                bytesRead: sourceSize,
                framesProcessed: selected.length,
                chunksProcessed: 1,
                sourceSeconds: manifest!.probe?.duration_seconds,
              };
            } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
          },
        });
        const shotsPath = path.join(contentDir, manifest.derivatives.shots!);
        const shotEvents = JSON.parse(fs.readFileSync(shotsPath, "utf8")) as { events?: Array<{ time_seconds?: number }> };
        const duration = manifest.probe.duration_seconds ?? 0;
        const boundaries = [...new Set((shotEvents.events ?? []).map((event) => event.time_seconds).filter((value): value is number => typeof value === "number" && value > 0 && value < duration))].sort((a, b) => a - b);
        const starts = [0, ...boundaries];
        const ends = [...boundaries, duration];
        const shots: Shot[] = starts.map((start, index) => ({ shot_id: `shot_${String(index + 1).padStart(4, "0")}`, start_seconds: start, end_seconds: ends[index]! }));
        const tracksPath = await jsonValueStage({
          stage: "semantic_tracks", filename: "tracks.json",
          parameters: { association: "shot_bounded_geometry_v1", max_gap_seconds: 0.75, min_iou: 0.15, max_center_distance: 0.25, identity_inference: false },
          dependencies: ["shots", "detections"], tool: { name: "shot-bounded-tracker", version: "2" }, resource: "cpu",
          build: async (identity) => {
            const detectionArtifact = JSON.parse(fs.readFileSync(detectionsPath, "utf8")) as { frames: Array<{ frame_id: string; time_seconds: number; detections: Array<Omit<TrackDetection, "frame_id" | "time_seconds">> }> };
            const detections: TrackDetection[] = detectionArtifact.frames.flatMap((frame) => frame.detections.map((detection) => ({ ...detection, frame_id: frame.frame_id, time_seconds: frame.time_seconds })));
            const tracks = buildShotBoundedTracks(identity.cache_key, detections, shots);
            return { value: { schema_version: 1, analysis_revision: identity.cache_key, shot_count: shots.length, tracks }, bytesRead: fs.statSync(detectionsPath).size + fs.statSync(shotsPath).size, framesProcessed: detectionArtifact.frames.length, chunksProcessed: shots.length };
          },
        });
        const detectionRecord = manifest.stage_records.detections!;
        const detectionIndex = readMediaContextIndex(fingerprint);
        if (!detectionIndex.datasets.detections?.revisions.some(r => r.revision_id === detectionRecord.cache_key)) {
          publishMediaContextDataset(fingerprint, {
            dataset_id: "detections", revision_id: detectionRecord.cache_key,
            kind: "face_person_observations", evidence_level: "L1",
            producer: { ...detectionRecord.tool, recipe_version: "discrete-frames-v1" },
            input_revision_ids: Object.values(detectionRecord.dependency_cache_keys),
            coverage: discreteObservationCoverage(selected.map(frame => frame.time_seconds), duration),
            coordinate_space: { system: "normalized_display_source", width: manifest.probe.width, height: manifest.probe.height, display_rotation_degrees: manifest.probe.display_rotation_degrees },
            summary: { method: "model_observation", examined_frames: selected.length, continuous_coverage: false },
            artifact: detectionRecord.artifact_path && detectionRecord.artifact_sha256 ? { relative_path: detectionRecord.artifact_path, sha256: detectionRecord.artifact_sha256, media_type: "application/json" } : null,
            supersedes_revision_id: detectionIndex.datasets.detections?.active_revision_id ?? null,
            created_at: detectionRecord.updated_at,
          });
        }
        const semanticRecord = manifest.stage_records.semantic_tracks;
        const existingContext = readMediaContextIndex(fingerprint);
        if (semanticRecord && !existingContext.datasets.semantic_tracks?.revisions.some((revision) => revision.revision_id === semanticRecord.cache_key)) {
          const trackArtifact = JSON.parse(fs.readFileSync(tracksPath, "utf8")) as { tracks?: unknown[]; shot_count?: number };
          publishMediaContextDataset(fingerprint, {
            dataset_id: "semantic_tracks",
            revision_id: semanticRecord.cache_key,
            kind: "anonymous_person_face_tracks",
            evidence_level: "L2",
            producer: { name: semanticRecord.tool.name, version: semanticRecord.tool.version, recipe_version: "shot-bounded-geometry-v1" },
            input_revision_ids: [manifest.stage_records.shots?.cache_key, manifest.stage_records.detections?.cache_key].filter((value): value is string => Boolean(value)),
            coverage: discreteObservationCoverage(selected.map(frame => frame.time_seconds), duration),
            coordinate_space: {
              system: "normalized_display_source",
              width: manifest.probe.width,
              height: manifest.probe.height,
              display_rotation_degrees: manifest.probe.display_rotation_degrees,
            },
            summary: {
              track_count: trackArtifact.tracks?.length ?? 0,
              shot_count: trackArtifact.shot_count ?? shots.length,
              sample_interval_seconds: 0.5,
              identity_inference: false,
            },
            artifact: semanticRecord.artifact_path && semanticRecord.artifact_sha256 ? {
              relative_path: semanticRecord.artifact_path,
              sha256: semanticRecord.artifact_sha256,
              media_type: "application/json",
            } : null,
            supersedes_revision_id: existingContext.datasets.semantic_tracks?.active_revision_id ?? null,
            created_at: semanticRecord.updated_at,
          });
        }
        manifest.detector = { status: "available", reason: null };
      }
    }
    await options.beforeFinalSourceStat?.();
    const finalDependencies = Object.keys(manifest.stage_records).filter((stage) => stage !== "source_stability");
    const finalIdentity = createStageCacheIdentity({
      stage: "source_stability", fingerprint, tool: { name: "node:fs", version: process.version },
      parameters: { compare: ["size", "mtime_ms"], phase: "after_all_stages" },
      dependencyCacheKeys: dependencyKeys(finalDependencies),
    });
    await record({
      stage: "source_stability", resource: "io", dependencies: finalDependencies,
      identity: finalIdentity, tool: finalIdentity.tool, cacheDisposition: "miss",
      run: async () => {
        const finalStat = fs.statSync(sourcePath);
        if (finalStat.size !== initialStat.size || finalStat.mtimeMs !== initialStat.mtimeMs) {
          throw new SourceChangedError(finalStat.size, finalStat.mtimeMs);
        }
        return { value: undefined, bytesRead: 0, chunksProcessed: 1 };
      },
    });
    manifest.timing = calculateTimingRollup(
      manifest.attempts.filter((item) => item.job_id === job.job_id && item.job_attempt_number === job.attempt_number),
      { cacheReferenceAttempts: manifest.attempts },
    );
    writeManifest(manifest);

    const bindings = readAssetBindings(job.project_id);
    writeAssetBindings(job.project_id, { ...bindings, assets: bindings.assets.map((asset) => asset.asset_id === job.asset_id
      ? { ...asset, fingerprint_sha256: fingerprint, updated_at: new Date().toISOString() } : asset) });
    const completed: AnalysisJob = { ...readJob(job.job_id)!, status: "completed", fingerprint_sha256: fingerprint, timing: manifest.timing, finished_at: new Date().toISOString(), lease: null, error: null };
    writeJob(completed);
    clearInterval(jobHeartbeatTimer);
    releasePipelineLease?.();
    // Budget enforcement is installation-wide and potentially scans manifests,
    // so keep it off request paths and run only after this job has released its
    // content lease. Other active jobs and leases are protected by the sweep.
    try { enforceMediaAnalysisCacheBudget(); } catch (error) {
      console.warn(`Media analysis cache budget enforcement failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return completed;
  } catch (error) {
    clearInterval(jobHeartbeatTimer);
    releasePipelineLease?.();
    const latest = readJob(job.job_id) ?? job;
    if (error instanceof SourceChangedError) {
      if (manifest) {
        const now = new Date().toISOString();
        for (const [stage, record] of Object.entries(manifest.stage_records)) {
          if (stage === "fingerprint" || record.status === "stale") continue;
          const stale = { ...record, status: "stale" as const, stale_reason: "source_changed_during_preprocessing", updated_at: now };
          manifest.stage_records[stage] = stale;
          manifest.stages[stage] = "stale";
          manifest.stage_history.push(stale);
        }
        writeManifest(manifest);
      }
      const requeued: AnalysisJob = {
        ...latest, status: "queued", fingerprint_sha256: null, lease: null,
        source_size_bytes: error.size, source_mtime_ms: error.mtimeMs,
        started_at: null, finished_at: null, timing: null, error: error.message,
      };
      writeJob(requeued);
      return requeued;
    }
    const wasCancelled = latest.cancellation_requested_at != null || (error instanceof Error && error.message === "cancelled");
    const failed: AnalysisJob = { ...latest, status: wasCancelled ? "cancelled" : "failed", timing: manifest?.timing ?? latest.timing, finished_at: new Date().toISOString(), lease: null, error: error instanceof Error ? error.message : String(error) };
    writeJob(failed);
    return failed;
  }
}

export function workerOwner(): string {
  return `${hostname()}:${process.pid}:${randomUUID()}`;
}
