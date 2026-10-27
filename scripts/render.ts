/**
 * CLI render: `pnpm render <projectId> [--base http://127.0.0.1:3123] [--resolution 1440] [--scale 0.25] [--concurrency 1] [--image-format jpeg]`
 *
 * Renders the project's timeline to projects/<id>/renders/<timestamp>.mp4.
 * The dev server must be running at --base: elements reference media by
 * relative URL (/api/projects/<id>/media/...) and the headless renderer
 * fetches them over HTTP.
 */
import { readMetadata } from "@/lib/local-store/store";
import { startRender, getJob } from "@/lib/local-store/render-jobs";
import { projectRendersDir } from "@/lib/local-store/paths";
import path from "node:path";
import { EXPORT_RESOLUTIONS, type ExportResolution } from "@/lib/render/export-resolution";

async function main() {
  const args = process.argv.slice(2);
  const projectId = args.find((arg) => !arg.startsWith("--"));
  if (!projectId) {
    console.error("Usage: pnpm render <projectId> [--base http://127.0.0.1:3123] [--scale 0.25]");
    process.exit(1);
  }
  const baseFlagIndex = args.indexOf("--base");
  const mediaBaseUrl = baseFlagIndex >= 0 ? args[baseFlagIndex + 1] : "http://127.0.0.1:3123";
  const scaleFlagIndex = args.indexOf("--scale");
  const renderScale = scaleFlagIndex >= 0 ? Number(args[scaleFlagIndex + 1]) : 1;
  const concurrencyFlagIndex = args.indexOf("--concurrency");
  const concurrency = concurrencyFlagIndex >= 0 ? Number(args[concurrencyFlagIndex + 1]) : undefined;
  const imageFormatFlagIndex = args.indexOf("--image-format");
  const imageFormatValue = imageFormatFlagIndex >= 0 ? args[imageFormatFlagIndex + 1] : "png";
  if (imageFormatValue !== "jpeg" && imageFormatValue !== "png") {
    throw new Error(`--image-format must be jpeg or png; received ${imageFormatValue}`);
  }

  const backendIndex=args.indexOf("--backend");
  // Match the editor's Export default: the GPU path; standard screenshots each frame and is far slower.
  const backend=backendIndex>=0?args[backendIndex+1]:"gpu";
  if(backend!=="standard"&&backend!=="rust"&&backend!=="gpu")throw Error("--backend must be standard, rust or gpu");
  const resolutionIndex = args.indexOf("--resolution");
  const resolution = resolutionIndex >= 0 ? Number(args[resolutionIndex + 1]) : undefined;
  if (resolution !== undefined && !(EXPORT_RESOLUTIONS as readonly number[]).includes(resolution)) throw new Error(`--resolution must be one of ${EXPORT_RESOLUTIONS.join(", ")}`);
  const metadata = readMetadata(projectId);
  // Same durable export lifecycle as the editor. Do not call
  // the low-level renderer here: it deliberately has no delivery side effects.
  const result = startRender(projectId, metadata.muted_lane_keys, mediaBaseUrl, {
    backend,
    ...(resolution !== undefined ? { resolution: resolution as ExportResolution } : {}),
    renderScale,
    concurrency,
    imageFormat: imageFormatValue,
  });
  if (!result.ok) throw new Error(String(result.body.error));
  for (;;) {
    const job = getJob(result.job.id)!;
    if (job.status === "completed") {
      console.log(`\nRendered → ${path.join(projectRendersDir(projectId), job.fileName!)}`);
      break;
    }
    if (job.status === "failed" || job.status === "canceled") throw new Error(job.error ?? "Render canceled");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
