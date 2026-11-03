export type AnalysisAssetKind = "image" | "video" | "audio";
export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type AnalysisStageStatus = "pending" | "running" | "completed" | "partial" | "failed" | "cancelled" | "stale" | "unavailable";
export type ResourceClass = "io" | "cpu" | "ffmpeg" | "detector";
export type CacheDisposition = "miss" | "hit" | "resumed" | "skipped";

export type StageToolIdentity = {
  name: string;
  version: string;
};

export type StageCacheIdentity = {
  stage: string;
  cache_key: string;
  schema_version: number;
  tool: StageToolIdentity;
  parameters: Record<string, unknown>;
  dependency_cache_keys: Record<string, string>;
};

export type StageRecord = StageCacheIdentity & {
  status: AnalysisStageStatus;
  artifact_path: string | null;
  artifact_sha256: string | null;
  output_bytes: number;
  updated_at: string;
  stale_reason: string | null;
};

export type AssetBinding = {
  asset_id: string;
  project_id: string;
  relative_path: string;
  kind: AnalysisAssetKind;
  size_bytes: number;
  mtime_ms: number;
  fingerprint_sha256: string | null;
  current_job_id: string | null;
  updated_at: string;
};

export type AssetBindingsFile = {
  schema_version: 1;
  assets: AssetBinding[];
};

export type StageAttempt = {
  attempt_id: string;
  job_id: string;
  job_attempt_number: number;
  stage: string;
  resource: ResourceClass;
  dependency_stages: string[];
  status: Exclude<AnalysisStageStatus, "pending">;
  outcome: Exclude<AnalysisStageStatus, "pending">;
  cache_hit: boolean;
  cache_disposition: CacheDisposition;
  queued_at: string;
  started_at: string;
  finished_at: string;
  queue_wait_ms: number;
  wall_ms: number;
  active_wall_ms: number;
  cpu_user_ms: number;
  cpu_system_ms: number;
  input_bytes: number | null;
  bytes_read: number | null;
  bytes_written: number | null;
  derived_bytes: number | null;
  source_seconds: number | null;
  frames_processed: number | null;
  chunks_processed: number | null;
  peak_rss_bytes: number | null;
  worker_id: string;
  tool: StageToolIdentity;
  warnings: string[];
  throughput_bytes_per_second: number | null;
  throughput_source_realtime: number | null;
  error: string | null;
};

export type TimingRollup = {
  elapsed_wall_ms: number;
  summed_stage_wall_ms: number;
  total_queue_wait_ms: number;
  critical_path_ms: number;
  critical_path_stages: string[];
  observed_parallelism: number;
  effective_parallelism: number | null;
  max_concurrency: number;
  average_concurrency: number;
  cache_hits: number;
  cache_misses: number;
  cache_resumes: number;
  cache_skips: number;
  cache_time_avoided_ms: number;
  active_union_ms: number;
  worker_busy_ms: number;
  worker_idle_ms: number;
  dependency_wait_ms: number;
  io_throughput_bytes_per_second: number | null;
  derived_bytes: number;
  peak_rss_bytes: number | null;
  serial_baseline_wall_ms: number | null;
  parallel_speedup: number | null;
  parallel_efficiency: number | null;
  time_by_stage_ms: Record<string, number>;
  by_resource: Record<string, { wall_ms: number; max_concurrency: number; average_concurrency: number }>;
};

export type ProbeResult = {
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  frame_rate: string | null;
  nominal_frame_rate: string | null;
  is_variable_frame_rate: boolean | null;
  video_time_base: string | null;
  display_rotation_degrees: number | null;
  sample_aspect_ratio: string | null;
  pixel_format: string | null;
  video_alpha_mode: string | null;
  color_transfer: string | null;
  color_primaries: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  audio_channels: number | null;
  audio_channel_layout: string | null;
  sample_rate: number | null;
  has_video: boolean;
  has_audio: boolean;
};

export type AnalysisManifest = {
  schema_version: 1 | 2;
  fingerprint_sha256: string;
  source_size_bytes: number;
  probe: ProbeResult | null;
  derivatives: Record<string, string>;
  stages: Record<string, AnalysisStageStatus>;
  stage_records: Record<string, StageRecord>;
  stage_history: StageRecord[];
  attempts: StageAttempt[];
  timing: TimingRollup;
  detector: { status: "unavailable" | "candidate" | "available"; reason: string | null };
  updated_at: string;
};

export type AnalysisJob = {
  schema_version: 1;
  job_id: string;
  project_id: string;
  asset_id: string;
  relative_path: string;
  source_size_bytes: number;
  source_mtime_ms: number;
  status: AnalysisJobStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  cancellation_requested_at: string | null;
  lease: { owner: string; expires_at: string; heartbeat_at: string } | null;
  attempt_number: number;
  fingerprint_sha256: string | null;
  timing: TimingRollup | null;
  attempts?: StageAttempt[];
  error: string | null;
};

export type AnalysisAnnotation = {
  annotation_id: string;
  asset_id: string;
  track_id: string | null;
  start_seconds: number;
  end_seconds: number;
  label: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalysisAnnotationsFile = { schema_version: 1; annotations: AnalysisAnnotation[] };

/**
 * Durable, source-addressed context datasets.
 *
 * A source context may contain only descriptive per-source evidence (L1) and
 * deterministic per-source derivations (L2). Set-level findings and editorial
 * guidance remain outside this shared record because their inputs include
 * other sources or a project goal.
 */
export type MediaContextEvidenceLevel = "L1" | "L2";
export type MediaContextDatasetStatus = "complete" | "partial" | "stale" | "unavailable";

export type MediaContextCoverage = {
  /** Absent on legacy records: never infer examined frames from track presence. */
  observation_kind?: "discrete_frames";
  observed_times_seconds?: number[];
  timebase: "source_seconds";
  status: MediaContextDatasetStatus;
  ranges: Array<[number, number]>;
  gaps: Array<[number, number]>;
};

export type MediaContextCoordinateSpace = {
  system: "none" | "normalized_display_source" | "display_source_pixels" | "encoded_source_pixels";
  width: number | null;
  height: number | null;
  display_rotation_degrees: number | null;
};

export type MediaContextDatasetRevision = {
  dataset_id: string;
  revision_id: string;
  kind: string;
  evidence_level: MediaContextEvidenceLevel;
  producer: { name: string; version: string; recipe_version: string };
  input_revision_ids: string[];
  coverage: MediaContextCoverage;
  coordinate_space: MediaContextCoordinateSpace;
  /** Compact descriptive facts safe to place in an agent context pack. */
  summary: Record<string, unknown>;
  artifact: {
    relative_path: string;
    sha256: string;
    media_type: string;
  } | null;
  supersedes_revision_id: string | null;
  created_at: string;
};

export type MediaContextDatasetHistory = {
  active_revision_id: string;
  revisions: MediaContextDatasetRevision[];
};

export type MediaContextIndex = {
  schema_version: 1;
  context_id: string;
  source_fingerprint_sha256: string;
  datasets: Record<string, MediaContextDatasetHistory>;
  updated_at: string;
};

export type MediaContextDerivative = {
  stage: string;
  status: AnalysisStageStatus;
  relative_path: string | null;
  artifact_sha256: string | null;
  cache_key: string;
  producer: StageToolIdentity;
  parameters: Record<string, unknown>;
};

export type SourceMediaContext = {
  schema_version: 1;
  context_id: string;
  source_fingerprint_sha256: string;
  source_size_bytes: number | null;
  probe: ProbeResult | null;
  derivatives: MediaContextDerivative[];
  datasets: MediaContextDatasetHistory[];
  updated_at: string;
};
