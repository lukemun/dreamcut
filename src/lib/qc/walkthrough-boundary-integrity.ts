import crypto from "node:crypto";

export type BoundaryTimelineElement = {
  id?: unknown;
  type?: unknown;
  lane_key?: unknown;
  timeline_start?: unknown;
  duration?: unknown;
  removed_at?: unknown;
  props?: Record<string, unknown> | null;
};

export type WalkthroughBoundarySample = {
  atSeconds: number;
  reason: "visual-boundary" | "contact";
};

export type WalkthroughBoundaryIntegrityReceipt = {
  schema_version?: unknown;
  project_id?: unknown;
  timeline_sha256?: unknown;
  verdict?: unknown;
  samples?: Array<{
    atSeconds?: unknown;
    reason?: unknown;
    black?: unknown;
    meanLuma?: unknown;
    lumaStdDev?: unknown;
    still_path?: unknown;
    still_sha256?: unknown;
  }>;
};

const FPS = 30;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function walkthroughBoundarySamples(elements: BoundaryTimelineElement[]): WalkthroughBoundarySample[] {
  const active = elements.filter((element) => element.removed_at == null && element.props?.disabled !== true);
  const visuals = active.filter((element) => (
    (element.type === "video_clip" || element.type === "still")
    && element.lane_key === "visual_0"
    && finite(element.timeline_start)
    && finite(element.duration)
    && element.duration > 0
  ));
  const start = visuals.reduce((minimum, element) => Math.min(
    minimum,
    element.timeline_start as number,
  ), Number.POSITIVE_INFINITY);
  const end = visuals.reduce((maximum, element) => Math.max(
    maximum,
    (element.timeline_start as number) + (element.duration as number),
  ), 0);
  const samples = new Map<number, WalkthroughBoundarySample>();
  const add = (seconds: number, reason: WalkthroughBoundarySample["reason"]) => {
    const frame = Math.max(0, Math.min(Math.round(end * FPS), Math.round(seconds * FPS)));
    const prior = samples.get(frame);
    if (!prior || reason === "contact") samples.set(frame, { atSeconds: frame / FPS, reason });
  };
  for (const visual of visuals) {
    const clipStart = visual.timeline_start as number;
    const finish = clipStart + (visual.duration as number);
    for (const boundary of [clipStart, finish]) {
      // The outer start/end may intentionally fade to or from the composition background. Internal handoffs are
      // the failure surface: both sides promise continuing product coverage, so a black frame is never expected.
      if (boundary <= start || boundary >= end) continue;
      add(boundary - 1 / FPS, "visual-boundary");
      add(boundary, "visual-boundary");
      add(boundary + 1 / FPS, "visual-boundary");
    }
  }
  for (const element of active) {
    if (!finite(element.timeline_start)) continue;
    const contracts = element.props?.interaction_target_contracts;
    if (!Array.isArray(contracts)) continue;
    for (const contract of contracts) {
      const local = (contract as { click_local_seconds?: unknown }).click_local_seconds;
      if (!finite(local)) continue;
      const click = element.timeline_start + local;
      add(click - 1 / FPS, "contact");
      add(click, "contact");
      add(click + 1 / FPS, "contact");
    }
  }
  return [...samples.values()].sort((a, b) => a.atSeconds - b.atSeconds);
}

export function classifyUniformBlackRgb(rgb: Buffer): { black: boolean; meanLuma: number; lumaStdDev: number } {
  if (rgb.length < 3) return { black: true, meanLuma: 0, lumaStdDev: 0 };
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let offset = 0; offset + 2 < rgb.length; offset += 3) {
    const luma = 0.2126 * rgb[offset]! + 0.7152 * rgb[offset + 1]! + 0.0722 * rgb[offset + 2]!;
    count += 1;
    sum += luma;
    sumSquares += luma * luma;
  }
  const meanLuma = sum / count;
  const variance = Math.max(0, sumSquares / count - meanLuma * meanLuma);
  const lumaStdDev = Math.sqrt(variance);
  return { black: meanLuma < 8 && lumaStdDev < 3, meanLuma, lumaStdDev };
}

export function sha256(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function boundaryIntegrityReceiptFindings(
  receipt: WalkthroughBoundaryIntegrityReceipt,
  expected: { projectId: string; timelineSha256: string },
): string[] {
  const findings: string[] = [];
  if (receipt.schema_version !== 1) findings.push("unsupported schema version");
  if (receipt.project_id !== expected.projectId) findings.push("project ID does not match");
  if (receipt.timeline_sha256 !== expected.timelineSha256) findings.push("timeline hash is stale");
  if (receipt.verdict !== "PASS") findings.push("verdict is not PASS");
  if (!Array.isArray(receipt.samples) || receipt.samples.length === 0) {
    findings.push("no boundary/contact frames were inspected");
  } else {
    if (receipt.samples.some((sample) => sample.black === true)) {
      findings.push("a boundary/contact frame has a uniform-black product region");
    }
    if (receipt.samples.some((sample) => (
      !finite(sample.atSeconds)
      || (sample.reason !== "visual-boundary" && sample.reason !== "contact")
      || sample.black !== false
      || !finite(sample.meanLuma)
      || !finite(sample.lumaStdDev)
      || typeof sample.still_path !== "string"
      || !sample.still_path.trim()
      || typeof sample.still_sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(sample.still_sha256)
    ))) {
      findings.push("one or more boundary/contact samples are incomplete or unresolved");
    }
  }
  return findings;
}
