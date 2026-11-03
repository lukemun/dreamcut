import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { activeElements, activeTransitions, getRevision, readMetadata, readTimeline } from "@/lib/local-store/store";
import { checkTimeline } from "@/lib/qc/check-timeline";
import { assessColorContinuityReview } from "@/lib/qc/color-continuity-review";
import { renderProjectVideo } from "@/lib/render/pipeline";
import { unexpectedBlackIntervals, type BlackInterval } from "@/lib/qc/intentional-black";
import { loudnessReport, timelineExpectsAudio } from "@/lib/qc/loudness";
import type { TimelineAspectRatio } from "@/components/studio/timeline/types";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) throw new Error("usage: pnpm verify <projectId> [--base http://127.0.0.1:3123] [--render file.mp4] [--taste-status human_review_required|model_review_passed]");
  const root = process.env.TIMELINE_PROJECTS_DIR ?? "projects";
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1]! : "http://127.0.0.1:3123";
  const renderIndex = process.argv.indexOf("--render");
  const existingRender = renderIndex >= 0 ? path.resolve(process.argv[renderIndex + 1]!) : null;
  const tasteIndex = process.argv.indexOf("--taste-status");
  const tasteStatus = tasteIndex >= 0 ? process.argv[tasteIndex + 1]! : "human_review_required";
  if (existingRender && !existsSync(existingRender)) throw new Error(`Render does not exist: ${existingRender}`);
  if (!["human_review_required", "model_review_passed"].includes(tasteStatus)) throw new Error(`Invalid --taste-status: ${tasteStatus}`);
  let server: ReturnType<typeof spawn> | null = null;
  try {
    if (!existingRender) {
      try { await fetch(base); } catch {
        server = spawn("pnpm", ["dev"], { stdio: "inherit", detached: true });
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try { if ((await fetch(base)).ok) break; } catch { /* keep polling */ }
          if (attempt === 59) throw new Error(`Dev server did not become ready at ${base}`);
        }
      }
    }
    const timeline = readTimeline(projectId);
    const metadata = readMetadata(projectId);
    const timelineRevision = getRevision(projectId).rev;
    const canvas = metadata.output_aspect_ratio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    const deterministic = checkTimeline({
      elements: timeline.elements,
      canvas,
      target: metadata.delivery_target,
      captionSafeAreaMode: metadata.caption_safe_area_mode,
    });
    if (!deterministic.ok) throw new Error(`Deterministic QC has ${deterministic.counts.blocker} blocker(s); refusing to render.`);
    const instruments = path.join(root, projectId, "instruments");
    mkdirSync(instruments, { recursive: true });
    const geometryPath = path.join(instruments, "caption-geometry.json");
    execFileSync("pnpm", ["caption-geometry", projectId, "--out", geometryPath], { stdio: "inherit" });
    const geometry = JSON.parse(readFileSync(geometryPath, "utf8"));
    if (!geometry.ok) throw new Error("Exact loaded-font caption geometry failed; refusing to render.");
    const render = existingRender
      ? { filePath: existingRender, durationSeconds: deterministic.summary.durationSeconds }
      : await renderProjectVideo({ projectId: projectId, elements: activeElements(timeline), transitions: activeTransitions(timeline), laneOrderKeys: metadata.lane_order_keys, mutedLaneKeys: metadata.muted_lane_keys, hiddenLaneKeys: metadata.hidden_lane_keys, aspectRatio: metadata.output_aspect_ratio as TimelineAspectRatio, mediaBaseUrl: base });
    const probePath = path.join(instruments, "render-probe.json");
    execFileSync("pnpm", ["probe", render.filePath, "--out", probePath], { stdio: "inherit" });
    const colorContinuity = assessColorContinuityReview({
      projectId,
      timelineRevision,
      elements: timeline.elements,
      durationSeconds: render.durationSeconds,
    });
    const fixedFrameTimes = [1.5, 6, 12.5, 19.5, Math.max(0, render.durationSeconds - 1.167)];
    const frameTimes = [...new Set([
      ...fixedFrameTimes,
      ...colorContinuity.boundaries.flatMap((boundary) => boundary.sampleTimes),
    ].map((time) =>
      Math.min(time, Math.max(0, render.durationSeconds - 0.033)).toFixed(3),
    ))].map(Number).sort((left, right) => left - right);
    execFileSync("pnpm", ["frames", projectId, "--input", render.filePath, "--at", frameTimes.map((time) => time.toFixed(3)).join(",")], { stdio: "inherit" });
    const probe = JSON.parse(readFileSync(probePath, "utf8"));
    const frames = frameTimes.map((time) => path.join(instruments, "frames", `${time.toFixed(3).replace(".", "_")}s.png`));
    const unexpectedBlack = unexpectedBlackIntervals(probe.black as BlackInterval[], timeline.elements);
    // STANDARD_ENFORCEMENT marks LOUDNESS_TARGETS "post-render": this is that
    // enforcement — probe already measured ebur128; compare it to the sourced targets.
    const loudness = loudnessReport(
      metadata.delivery_target,
      { integratedLufs: probe.loudness?.integratedLufs ?? NaN, truePeakDbfs: probe.loudness?.truePeakDbfs ?? NaN },
      timelineExpectsAudio(timeline.elements, metadata.muted_lane_keys),
    );
    for (const finding of loudness.findings) console.log(`loudness ${finding.severity}: ${finding.message}`);
    const report = {
      projectId,
      createdAt: new Date().toISOString(),
      timelineRevision,
      deterministic,
      render,
      postRender: { probe, captionGeometry: geometry, unexpectedBlack, loudness },
      colorContinuity: {
        ...colorContinuity,
        boundaries: colorContinuity.boundaries.map((boundary) => ({
          ...boundary,
          frames: boundary.sampleTimes.map((time) =>
            path.join(instruments, "frames", `${time.toFixed(3).replace(".", "_")}s.png`)),
        })),
      },
      tastePass: {
        status: tasteStatus,
        questions: [
          "Is the subject cropped?",
          "Do captions maintain strong contrast against every sampled background?",
          "Is text illegible or obscuring the subject?",
          "Is any sampled frame visibly ugly?",
          "At every sampled effect boundary, does skin tone, contrast, and exposure remain intentional?",
        ],
        frames,
      },
      ok: deterministic.ok
        && geometry.ok
        && unexpectedBlack.length === 0
        && loudness.ok
        // Color boundaries are sampled as evidence; the editor no longer collects per-boundary approval.
        && tasteStatus === "model_review_passed",
    };
    const reportPath = path.join(instruments, "verification-report.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(reportPath);
    if (!report.ok) process.exitCode = 1;
  } finally {
    if (server?.pid) {
      try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
    }
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
