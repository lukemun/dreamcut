export type DetectorFrame = {
  frame_id: string;
  image_path: string;
  pts: string;
  time_base_num: number;
  time_base_den: number;
};

export type DetectorBox = {
  label: "face" | "person";
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectorFrameResult = DetectorFrame & { boxes: DetectorBox[] };

export type DetectorDoctorResult = {
  status: "unavailable" | "candidate" | "available";
  reason: string | null;
  compiler_available: boolean;
  fixtures_available: boolean;
  compiler_version: string | null;
  platform_version: string | null;
};

export interface MediaDetector {
  readonly name: string;
  doctor(): Promise<DetectorDoctorResult>;
  detect(frames: DetectorFrame[]): Promise<DetectorFrameResult[]>;
}

/** Candidate execution is deliberately separate from production `detect()`.
 * Promotion benchmarks must be able to test an unpromoted detector, while
 * production callers must still fail closed until a current report passes. */
export type DetectorRunMetrics = {
  wall_ms: number;
  peak_rss_bytes: number | null;
};

export interface CandidateMediaDetector extends MediaDetector {
  detectCandidate(frames: DetectorFrame[]): Promise<{
    results: DetectorFrameResult[];
    metrics: DetectorRunMetrics;
  }>;
}
