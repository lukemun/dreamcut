import { currentFrameRate, setEditorFrameRate } from "../src/lib/timeline/frame-rate-scope";
import { projectFrameRate } from "../src/lib/timeline/frame-quantization";
import { isAudioElementType } from "../src/lib/timeline/animation-presets";
import { timelineEvidenceStamp } from "../src/lib/agent/timeline-evidence";
import { sha256 as evidenceFileHash } from "../src/lib/media-analysis/custom-cutout";
/**
 * pnpm frame-state <projectId> [--at 1.5,8,12.5] [--expect-gap captionId:visualId:minPx:maxPx]
 *   [--base http://127.0.0.1:3123] [--out dir] [--no-cache] [--fresh-browser] [--warm-renderer]
 *
 * With no `--at`, samples every ordinary caption midpoint and every active-word state plus its
 * quantized handoff boundaries. A fixed handful of times cannot certify the moving highlight.
 *
 * Renders stills from the CURRENT timeline (not a stale export), writes the on-screen state as
 * TEXT, and draws the measured caption box + safe area onto each still for a vision pass.
 *
 * Stills, not an mp4: an export is ~75s of wall clock and re-encodes 23s of video to answer a
 * question about 31 instants.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createBrowserStillSession, renderBrowserStill } from "@/lib/render/browser-renderer";
import sharp from "sharp";
import { colorScopeStats } from "@/lib/color/scopes";

import { activeElements, activeTransitions, readMetadata, readTimeline } from "@/lib/local-store/store";
import { previewEditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import { parseProposalFile } from "@/lib/agent/proposal-file";
import { buildCompositionElements, getCompositionDimensions } from "@/lib/render/composition-adapters";
import { absolutizeMediaUrls } from "@/lib/render/pipeline";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import type { TimelineAspectRatio } from "@/components/studio/timeline/types";
import { validateWordTimings } from "@/lib/timeline/active-word-captions";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";
import {
  OVERLAY_LEGEND,
  buildCaptionState,
  computeReadDelta,
  frameFor,
  layersAt,
  stillComposition,
  legalRectFor,
  measureCaptions,
  safeAreaFor,
  writeOverlay,
  type FrameState,
} from "@/lib/instruments/frame-state";
import { execFileSync } from "node:child_process";
import { frameChangeBrief } from "@/lib/instruments/frame-change-brief";
import { createMeasurementCache } from "@/lib/instruments/measurement-cache";
import { createWarmStillSession } from "@/lib/render/warm-still-worker";
import { scopeStillRequest } from "@/lib/instruments/still-scope";
import { frameCheckRenderSources } from "@/lib/local-store/export-render-sources";
import { createStillDependencyHasher, stillCacheKey, readStillCache, writeStillCache, verifyStillCacheEnvironment } from "@/lib/instruments/still-cache";
import { measureRenderedDifferenceBounds } from "@/lib/instruments/rendered-ink";
import {
  captionBottomToMaskTopRelation,
  parseGapExpectation,
} from "@/lib/instruments/spatial-relations";


const COMPOSITION_ID = "TimelineComposition";

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const startedAt = new Date();
  const projectId = process.argv[2];
  if (!projectId || projectId.startsWith("--")) {
    throw new Error("usage: pnpm frame-state <projectId> [--at 1.5,8,12.5] [--proposal-file <proposal or proposals/<id>.json> [--option <id>]] [--expect-gap captionId:visualId:minPx:maxPx] [--base http://127.0.0.1:3123]");
  }
  const base = flag("--base") ?? process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123";
  const gapExpectation = parseGapExpectation(flag("--expect-gap"));

  const proposalFile = flag("--proposal-file");
  const proposalSha256 = proposalFile ? await evidenceFileHash(proposalFile) : undefined;
  const proposal = proposalFile ? parseProposalFile(JSON.parse(readFileSync(proposalFile, "utf8"))) : null;
  const evidenceStamp = await timelineEvidenceStamp(projectId, proposal);
  if (proposal && proposal.project_id !== projectId) throw new Error("Proposal project does not match requested project");
  const preview = proposal ? previewEditorAgentProposal(proposal, flag("--option")) : null;
  if (preview?.stale) throw new Error("Proposal is stale; refresh before measuring its preview");
  const timeline = preview?.timeline ?? readTimeline(projectId);
  const originalMetadata = readMetadata(projectId);
  // One project per run: its frame rate drives every frame index below.
  setEditorFrameRate(projectFrameRate(originalMetadata));
  const metadata = preview ? { ...originalMetadata,
    lane_order_keys: preview.laneOrderKeys ?? originalMetadata.lane_order_keys,
    muted_lane_keys: preview.mutedLaneKeys ?? originalMetadata.muted_lane_keys,
    output_aspect_ratio: preview.outputFormat?.aspect_ratio ?? originalMetadata.output_aspect_ratio,
    delivery_target: preview.outputFormat?.delivery_target ?? originalMetadata.delivery_target,
  } : originalMetadata;
  const canvas = getCompositionDimensions(metadata.output_aspect_ratio as TimelineAspectRatio);
  const safe = safeAreaFor(metadata.delivery_target, canvas, metadata.caption_safe_area_mode);
  const legal = legalRectFor(safe, canvas);

  const elements = activeElements(timeline);
  const captions = elements
    .filter((element) => element.type === "caption_text")
    .sort((a, b) => a.timeline_start - b.timeline_start);
  if (gapExpectation && !captions.some((element) => element.id === gapExpectation.captionId)) {
    throw new Error(`--expect-gap caption ${gapExpectation.captionId} does not exist.`);
  }
  if (gapExpectation && !elements.some((element) => element.id === gapExpectation.visualId && (element.type === "video_clip" || element.type === "still" || element.type === "shape"))) {
    throw new Error(`--expect-gap visual ${gapExpectation.visualId} does not exist or is not a visual.`);
  }

  // One sample per ordinary caption; active-word captions add every word/gap state and boundary.
  const explicit = flag("--at");
  const samples: Array<{ atSeconds: number; captionId: string | null }> = explicit
    ? explicit.split(",").map((value) => ({ atSeconds: Number(value), captionId: null }))
    : (() => {
      const generated: Array<{ atSeconds: number; captionId: string | null }> = [];
      for (const caption of captions) {
        const props = (caption.props ?? {}) as Record<string, unknown>;
        const text = typeof props.text === "string" ? props.text : "";
        const validation = props.timingMode === "active_word"
          ? validateWordTimings(text, caption.duration, props.wordTimings, currentFrameRate())
          : null;
        if (!validation || validation.findings.length > 0) {
          generated.push({ atSeconds: Number((caption.timeline_start + caption.duration / 2).toFixed(3)), captionId: caption.id });
          continue;
        }
        validation.timings.forEach((word, index) => {
          generated.push({ atSeconds: caption.timeline_start + (word.start + word.end) / 2, captionId: caption.id });
          const startFrame = Math.ceil((caption.timeline_start + word.start) * currentFrameRate() - 1e-9);
          if (startFrame > 0) generated.push({ atSeconds: (startFrame - 1) / currentFrameRate(), captionId: caption.id });
          generated.push({ atSeconds: startFrame / currentFrameRate(), captionId: caption.id });
          const next = validation.timings[index + 1];
          if (next && next.start - word.end >= 1 / currentFrameRate()) {
            generated.push({ atSeconds: caption.timeline_start + (word.end + next.start) / 2, captionId: caption.id });
          }
        });
      }
      const byFrame = new Map<number, { atSeconds: number; captionId: string | null }>();
      for (const sample of generated) byFrame.set(Math.round(sample.atSeconds * currentFrameRate()), sample);
      return [...byFrame.values()].sort((a, b) => a.atSeconds - b.atSeconds);
    })();
  if (!samples.length) throw new Error("Nothing to sample: the project has no captions and no --at times.");

  const outDir = flag("--out")
    ?? path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId, "instruments", proposal ? "proposal-frame-state" : "frame-state");
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "frame-state.json");

  // The previous report's hashes are what make "unchanged" provable. An absent or unreadable
  // report proves nothing, so every frame degrades to "new" — never to a silent skip.
  const prevByLabel = new Map<string, { stillSha256: string | null; overlaySha256: string | null }>();
  let previousReportAt: string | null = null;
  let previousSampleTimes: number[] = [];
  if (existsSync(reportPath)) {
    try {
      const prev = JSON.parse(readFileSync(reportPath, "utf8")) as {
        createdAt?: string;
        states?: Array<{ atSeconds: number; read?: { stillSha256?: string | null; overlaySha256?: string | null } }>;
      };
      previousReportAt = prev.createdAt ?? null;
      previousSampleTimes = (prev.states ?? []).map(state => state.atSeconds);
      for (const state of prev.states ?? []) {
        prevByLabel.set(state.atSeconds.toFixed(3), {
          stillSha256: state.read?.stillSha256 ?? null,
          overlaySha256: state.read?.overlaySha256 ?? null,
        });
      }
    } catch {
      previousReportAt = null;
    }
  }
  const sha256Of = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

  const measurableCaptions=captions.filter(c=>!c.props?.surface_track);
  console.log(`[frame-state] measuring ${measurableCaptions.length} caption(s) with their real loaded fonts...`);
  const measurements = await measureCaptions(measurableCaptions, canvas);

  // Preview a caption style WITHOUT writing to the project. Judging a treatment requires seeing it
  // on real frames, and mutating the timeline to look at it means every rejected candidate has to
  // be undone — worse when a human is editing the same file.
  const variantOverride = flag("--variant");

  const layout = buildTimelineTransitionLayout(elements, activeTransitions(timeline));
  // HDR clips draw what the editor shows, never the browser-tone-mapped original decoded a second time.
  const drawn = frameCheckRenderSources(projectId, layout.renderedElements as never);
  const compositionElements = absolutizeMediaUrls(
    buildCompositionElements(drawn.clips as typeof layout.renderedElements, new Set(metadata.muted_lane_keys), new Set(metadata.hidden_lane_keys)),
    base,
  ).map((element) =>
    variantOverride && element.type === "caption_text"
      ? { ...element, props: { ...(element.props ?? {}), styleVariant: variantOverride } }
      : element,
  );
  const inputProps = { elements: compositionElements, laneOrderKeys: metadata.lane_order_keys };

  const composition = stillComposition(canvas, layout.effectiveDurationSeconds);
  const serveUrl = base;
  // --fresh-browser remains an independent-session comparison and recovery path.
  const session = process.argv.includes("--fresh-browser") ? null : process.argv.includes("--warm-renderer")
    ? await createWarmStillSession(process.cwd(), base) : await createBrowserStillSession();
  const cacheDirectory = path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId, "instruments", ".still-cache-v1");
  const hashDependencies = createStillDependencyHasher(process.cwd());
  const cache = { hits: 0, misses: 0, bypasses: 0, hashingMs: 0 };
  let measurementFingerprint: string | null = null;
  if (!process.argv.includes("--no-cache") && !process.argv.includes("--fresh-browser")) {
    const code = hashDependencies({ baseUrl: base, ...composition, frame: 0, inputProps: {}, output: "unused" });
    try {
      if (code) measurementFingerprint = createHash("sha256").update(code).update(execFileSync("ffmpeg", ["-version"])).digest("hex");
    } catch { /* An unverifiable analysis runtime computes fresh. */ }
  }
  const measurementsCache = createMeasurementCache(path.join(cacheDirectory, "measurements"), measurementFingerprint);

  const useCache = session && !process.argv.includes("--no-cache") && await verifyStillCacheEnvironment(base, process.cwd());
  const renderStill = async (options: { composition: typeof composition; output: string; inputProps: typeof inputProps; frame: number; [key: string]: unknown }) => {
    const request = { baseUrl: base, ...options.composition, output: options.output, inputProps: options.inputProps, frame: options.frame };
    const scopedRequest = scopeStillRequest(request);
    let key: string | null = null, dependencies: string | null = null, renderer: string | null = null;
    if (useCache) {
      const started = performance.now();
      dependencies = hashDependencies(scopedRequest);
      renderer = dependencies ? await session!.fingerprint(request) : null;
      key = stillCacheKey(scopedRequest, renderer, dependencies);
      cache.hashingMs += performance.now() - started;
    }
    if (key && readStillCache(cacheDirectory, key, request.output)) { cache.hits++; return; }
    if (key) cache.misses++; else cache.bypasses++;
    await (session ? session.render(request) : renderBrowserStill(request));
    // Do not publish evidence under the old hash if a dependency changed during capture.
    if (key && dependencies === hashDependencies(scopedRequest) && renderer === await session!.fingerprint(request)) {
      writeStillCache(cacheDirectory, key, request.output);
    }
  };

  const states: FrameState[] = [];
  try {
    for (const sample of samples) {
      const label = sample.atSeconds.toFixed(3).replace(".", "_");
      const stillPath = path.join(outDir, `${label}s.png`);
      const overlayPath = path.join(outDir, `${label}s.overlay.png`);

      await renderStill({
        chromiumOptions: { gl: "angle" },
        composition,
        serveUrl,
        output: stillPath,
        inputProps,
        frame: frameFor(sample.atSeconds),
        overwrite: true,
      });

      const caption = gapExpectation
        ? captions.find((element) =>
            element.id === gapExpectation.captionId
            && sample.atSeconds >= element.timeline_start
            && sample.atSeconds < element.timeline_start + element.duration,
          )
        : sample.captionId
        ? captions.find((element) => element.id === sample.captionId)
        : captions.find(
            (element) =>
              sample.atSeconds >= element.timeline_start
              && sample.atSeconds < element.timeline_start + element.duration,
          );

      let renderedInkBox = null;
      if (caption && !caption.props?.surface_track) {
        const withoutCaptionPath = path.join(outDir, `${label}s.without-${caption.id}.png`);
        const withoutCaptionProps = {
          ...inputProps,
          elements: compositionElements.filter((element) => element.id !== caption.id),
        };
        const withoutCaptionComposition = composition;
        try {
          await renderStill({
            chromiumOptions: { gl: "angle" },
            composition: withoutCaptionComposition,
            serveUrl,
            output: withoutCaptionPath,
            inputProps: withoutCaptionProps,
            frame: frameFor(sample.atSeconds),
            overwrite: true,
          });
          renderedInkBox = measurementsCache.measure("ink", [stillPath, withoutCaptionPath], canvas, () => measureRenderedDifferenceBounds(stillPath, withoutCaptionPath, canvas));
        } finally {
          if (existsSync(withoutCaptionPath)) unlinkSync(withoutCaptionPath);
        }
      }

      const captionState = caption && !caption.props?.surface_track
        ? measurementsCache.measure("caption-state", [stillPath], { caption, measured: measurements[caption.id], canvas, safe, at: sample.atSeconds, renderedInkBox }, () => buildCaptionState(caption, measurements[caption.id]!, canvas, safe, stillPath, sample.atSeconds, renderedInkBox))
        : null;

      const activeVisuals = elements.filter((element) =>
        (element.type === "video_clip" || element.type === "still")
        && sample.atSeconds >= element.timeline_start
        && sample.atSeconds < element.timeline_start + element.duration,
      );
      const spatialRelations = captionState?.inkBox
        ? activeVisuals.map((visual) => captionBottomToMaskTopRelation({
            captionId: captionState.id,
            captionText: captionState.text,
            inkBounds: captionState.inkBox!,
            visual,
            atSeconds: sample.atSeconds,
            canvas,
            expectation: gapExpectation?.captionId === captionState.id && gapExpectation.visualId === visual.id
              ? gapExpectation
              : null,
          }))
        : [];
      if (gapExpectation && !spatialRelations.some((relation) => relation.expectation)) {
        throw new Error(
          `--expect-gap pair is not simultaneously visible at ${sample.atSeconds.toFixed(3)}s; no gate was evaluated.`,
        );
      }

      writeOverlay(stillPath, overlayPath, legal, captionState?.box ?? null, canvas, captionState?.inkBox ?? null);
      // Scopes on a 320-wide sample of the still: brightness, clipping, channel balance, cast, skin.
      const scopeSample = await sharp(stillPath).resize({ width: 320, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const colorScopes = colorScopeStats(new Uint8Array(scopeSample.data), scopeSample.info.width, scopeSample.info.height);
      const read = computeReadDelta(prevByLabel.get(sample.atSeconds.toFixed(3)), sha256Of(stillPath), sha256Of(overlayPath));

      states.push({
        atSeconds: sample.atSeconds,
        frame: frameFor(sample.atSeconds),
        canvas,
        deliveryTarget: metadata.delivery_target,
        safeArea: { margins: safe, legalRect: legal },
        // Hidden lanes draw no picture; their sound-only actors are listed as before.
        layers: layersAt(elements.filter((element) => !metadata.hidden_lane_keys.includes(element.lane_key)
          || isAudioElementType(element.type)), metadata.lane_order_keys, sample.atSeconds),
        caption: captionState,
        spatialRelations,
        stillPath,
        overlayPath,
        read,
        colorScopes,
      });
      console.log(`[frame-state] ${sample.atSeconds.toFixed(3)}s [${read.status.toUpperCase()}] -> ${path.basename(overlayPath)}`);
      spatialRelations.forEach((relation) => {
        const status = relation.expectation ? ` [${relation.expectation.status.toUpperCase()}]` : "";
        console.log(`[frame-state]${status} ${relation.statement}`);
      });
    }

  } finally {
    await session?.close();
  }

  const counts = { new: 0, changed: 0, unchanged: 0 };
  for (const state of states) counts[state.read.status] += 1;

  if (evidenceStamp !== await timelineEvidenceStamp(projectId, proposal)) throw new Error("Project changed during frame-state capture");
  const report = {
    evidenceStamp, proposalSha256,
    projectId,
    ...(proposal ? { preview: { proposalFile, optionId: flag("--option") ?? proposal.options.find(option => option.recommended)?.id, expectedRevision: proposal.expected_revision, applied: false } } : {}),
    createdAt: new Date().toISOString(),
    frameCache: { ...cache, directory: cacheDirectory },
    measurementCache: measurementsCache.stats,
    renderSession: session ? { mode: process.argv.includes("--warm-renderer") ? "warm-worker-or-fallback" : "batch", ...session.stats } : { mode: "fresh-browser" },
    canvas,
    deliveryTarget: metadata.delivery_target,
    captionSafeAreaMode: metadata.caption_safe_area_mode,
    outputAspectRatio: metadata.output_aspect_ratio,
    overlayLegend: OVERLAY_LEGEND,
    limitations: [
      ...(captions.some(c => c.props?.surface_track) ? ["Tracked surface text is rendered, but ordinary caption box and ink-difference metrics are not supported for it. Inspect the rendered frames; no continuous clearance claim."] : []),
      ...(drawn.fromProxy.length ? [`HDR footage drawn from its preview proxy, as the editor shows it, until its full-resolution version is made at export: ${drawn.fromProxy.join(", ")}. Colour matches; fine detail is the proxy's.`] : []),
    ],
    sampledAt: explicit ? "explicit --at times" : "midpoint of every caption",
    readDelta: {
      previousReportAt,
      ...counts,
      meaning: "unchanged = still AND overlay byte-identical to the previous report. That licenses"
        + " skipping a frame only when the SAME question was already answered from that same frame."
        + " A new question voids the delta — the delta tracks pixel novelty, not question coverage —"
        + " so scanning for something different reads every frame the question needs, regardless of"
        + " status. Always read every frame marked changed or new.",
    },
    states,
  };
  const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(reportPath, reportBytes);
  writeFileSync(path.join(outDir, "frame-state-changes.json"), `${JSON.stringify(frameChangeBrief(report, path.resolve(reportPath), reportBytes, previousSampleTimes), null, 2)}\n`);
  console.log(reportPath);
  console.log(`[frame-state] change index: ${path.join(outDir, "frame-state-changes.json")}`);

  // Sample times shift between runs, so PNGs from earlier runs survive on disk and a later
  // contact-sheet pass can pick a nearest-by-filename stray from an older timeline state. Purge
  // only AFTER the new report is on disk — a crashed run keeps the prior frames, and the report
  // stays the authority over the directory either way.
  const referencedPngs = new Set(
    states.flatMap((state) => [path.resolve(state.stillPath), path.resolve(state.overlayPath)]),
  );
  const stalePngs = readdirSync(outDir).filter(
    (name) => name.endsWith(".png") && !referencedPngs.has(path.resolve(outDir, name)),
  );
  for (const name of stalePngs) unlinkSync(path.join(outDir, name));
  console.log(`[frame-state] purged ${stalePngs.length} stale png(s) from previous runs`);

  // Append-only claim record: the report is overwritten each run, so this line is what preserves
  // "what did the tool mark unchanged on run N" for later audit of a wrong skip.
  const runId = `frame-state-${startedAt.toISOString()}`;
  const failedExpectations = states.flatMap((state) =>
    state.spatialRelations.filter((relation) => relation.expectation?.status === "fail"),
  );
  appendFileSync(path.join(outDir, "frame-state-history.jsonl"), `${JSON.stringify({
    schema_version: 1,
    run_id: runId,
    created_at: report.createdAt,
    previous_report_at: previousReportAt,
    samples: states.length,
    new_at: states.filter((state) => state.read.status === "new").map((state) => state.atSeconds),
    changed_at: states.filter((state) => state.read.status === "changed").map((state) => state.atSeconds),
    unchanged_count: counts.unchanged,
    failed_expectations: failedExpectations.length,
  })}\n`);

  const finishedAt = new Date();
  const preprocessDir = path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId, "preprocess");
  mkdirSync(preprocessDir, { recursive: true });
  appendFileSync(path.join(preprocessDir, "run-metrics.jsonl"), `${JSON.stringify({
    schema_version: 1,
    run_id: runId,
    operation: "frame-state",
    status: "complete",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    elapsed_ms: finishedAt.getTime() - startedAt.getTime(),
    input_count: samples.length,
    output_count: states.length * 2,
    output_bytes: states.reduce((sum, state) => sum + statSync(state.stillPath).size + statSync(state.overlayPath).size, 0),
    frames_new: counts.new,
    frames_changed: counts.changed,
    frames_unchanged: counts.unchanged,
    recipe_id: "frame-state-read-delta-v1",
    cache_hit: cache.hits > 0,
    frame_cache: report.frameCache,
    render_session: report.renderSession,
    note: failedExpectations.length > 0 ? `${failedExpectations.length} spatial expectation(s) failed` : undefined,
    execution: { kind: "deterministic", engine: "dreamcut-chromium-still+sha256", version: "local", device: "cpu", concurrency: 1 },
  })}\n`);

  console.log(
    `[frame-state] read delta: ${counts.changed} changed, ${counts.new} new, ${counts.unchanged} unchanged`
    + " (unchanged = byte-identical to the previous report — no new pixels to read)",
  );
  if (failedExpectations.length > 0) {
    throw new Error(`${failedExpectations.length} spatial relation expectation(s) failed. See ${reportPath}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
