import { currentFrameRate, setEditorFrameRate } from "../src/lib/timeline/frame-rate-scope";
import { projectFrameRate } from "../src/lib/timeline/frame-quantization";
/** Read-only moving workshop preview. Never writes timelines or approves proposals.
 * pnpm exec tsx scripts/render-preview.ts <project> --out <mp4>
 *   [--proposal-file <proposal or proposals/<id>.json> ...] [--base <origin>] [--scale 0.5]
 *   [--start-seconds <seconds>] [--end-seconds <seconds>]
 * Draft inspection artifact only; delivery uses pnpm render's tracked lifecycle.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { renderBrowserVideo } from "@/lib/render/browser-renderer";
import { activeElements, activeTransitions, readMetadata, readTimeline } from "@/lib/local-store/store";
import { previewEditorAgentProposal, previewEditorAgentProposalBatch, timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { parseProposalFile } from "@/lib/agent/proposal-file";
import { absolutizeMediaUrls } from "@/lib/render/pipeline";
import { buildCompositionElements, getCompositionDimensions } from "@/lib/render/composition-adapters";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";

async function main() {
  const args = process.argv.slice(2);
  const project = args[0];
  const flag = (name: string) => args[args.indexOf(name) + 1];
  if (!project || !args.includes("--out")) throw new Error("Project and --out are required");
  const out = path.resolve(flag("--out"));
  if (fs.existsSync(out)) throw new Error("Preview output already exists; choose a new filename");
  const scale = args.includes("--scale") ? Number(flag("--scale")) : 0.5;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error("Scale must be in (0,1]");
  const revision = timelineRevision(project);
  const proposals = args.flatMap((arg, i) => arg === "--proposal-file"
    ? [parseProposalFile(JSON.parse(fs.readFileSync(args[i + 1], "utf8")))] : []);
  const options = proposals.map(proposal => {
    if (proposal.project_id !== project) throw new Error("Proposal belongs to another project");
    const preview = previewEditorAgentProposal(proposal);
    if (preview.stale) throw new Error("Proposal is stale; refresh before preview rendering");
    return preview.option;
  });
  const preview = options.length ? previewEditorAgentProposalBatch(project, options) : null;
  const timeline = preview?.timeline ?? readTimeline(project);
  const metadata = readMetadata(project);
  setEditorFrameRate(projectFrameRate(metadata));
  const layout = buildTimelineTransitionLayout(activeElements(timeline), activeTransitions(timeline));
  const inputProps = {
    elements: absolutizeMediaUrls(buildCompositionElements(layout.renderedElements,
      new Set(preview?.mutedLaneKeys ?? metadata.muted_lane_keys), new Set(metadata.hidden_lane_keys)), args.includes("--base") ? flag("--base") : "http://127.0.0.1:3123"),
    laneOrderKeys: preview?.laneOrderKeys ?? metadata.lane_order_keys,
    renderScale: scale,
  };
  const composition = {width:1920,height:1080,durationInFrames:1};
  const canvas = getCompositionDimensions(preview?.outputFormat?.aspect_ratio ?? metadata.output_aspect_ratio);
  composition.width = Math.max(2, Math.round(canvas.width * scale / 2) * 2);
  composition.height = Math.max(2, Math.round(canvas.height * scale / 2) * 2);
  composition.durationInFrames = Math.max(1, Math.round(layout.effectiveDurationSeconds * currentFrameRate()));
  const startFrame = args.includes("--start-seconds") ? Math.round(Number(flag("--start-seconds")) * currentFrameRate()) : 0;
  const endFrame = args.includes("--end-seconds") ? Math.round(Number(flag("--end-seconds")) * currentFrameRate()) : composition.durationInFrames;
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame <= startFrame || endFrame > composition.durationInFrames) throw new Error("Preview window must be inside the timeline and contain at least one frame");
  fs.mkdirSync(path.dirname(out), {recursive:true});
  let lastProgress = -1;
  await renderBrowserVideo({baseUrl: args.includes("--base") ? flag("--base") : "http://127.0.0.1:3123", ...composition, fps:currentFrameRate(), inputProps, outputLocation:out, imageFormat:"jpeg", concurrency:2, frameRange:[startFrame,endFrame - 1],
    onProgress:(progress) => {
      const bucket = Math.floor(progress * 5) * 20;
      if (bucket !== lastProgress) { lastProgress = bucket; console.log(`Preview ${bucket}%`); }
    }});
  fs.writeFileSync(out + ".json", JSON.stringify({stage:proposals.length ? "unapplied workshop preview" : "saved timeline sample", project, revision,
    timeline_unchanged:timelineRevision(project) === revision, proposal_summaries:proposals.map(p=>p.summary),
    fps:currentFrameRate(), frames:endFrame - startFrame, source_start_frame:startFrame, source_end_frame_exclusive:endFrame, scale,
    sha256:createHash("sha256").update(fs.readFileSync(out)).digest("hex")}, null, 2));
  console.log(`\nPreview: ${out}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
