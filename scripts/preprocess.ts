import { setTimeout as delay } from "node:timers/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { claimNextJob, enqueueAssets, listJobs, readAssetBindings, readManifest, requestCancellation, retryJob } from "../src/lib/local-store/media-analysis";
import { processAnalysisJob, workerOwner } from "../src/lib/media-analysis/worker";
import { AppleVisionDetector } from "../src/lib/media-analysis/apple-vision";
import { runCapacityBenchmark } from "../src/lib/media-analysis/benchmark";
import { generateDetectorFixtures } from "../src/lib/media-analysis/detector-fixtures";
import { runDetectorPromotionBenchmark } from "../src/lib/media-analysis/detector-promotion";
import { enforceMediaAnalysisCacheBudget, inspectMediaAnalysisCache } from "../src/lib/media-analysis/cache-budget";

function usage(): never {
  throw new Error("Usage: preprocess <worker|once|status|cache|cache-enforce|enqueue|cancel|retry|doctor|benchmark|detector-fixtures|detector-benchmark> [argument] [argument]");
}

const detectorManifestPath = () => process.env.APPLE_VISION_FIXTURE_MANIFEST
  ?? path.resolve(process.cwd(), "native/apple-vision-detector/fixtures/manifest.json");
const detectorSourcePath = () => path.resolve(process.cwd(), "native/apple-vision-detector/main.swift");
const detectorFixtureRoot = () => path.resolve(process.cwd(), ".cache/media-analysis/apple-vision-fixtures");
const detectorReportPath = () => process.env.APPLE_VISION_PROMOTION_REPORT
  ?? path.resolve(process.cwd(), ".cache/media-analysis/apple-vision-promotion.json");
const commandVersion = (command: string, args: string[]) => {
  try { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return null; }
};

async function runOnce(owner: string): Promise<boolean> {
  const job = claimNextJob(owner);
  if (!job) return false;
  console.log(JSON.stringify(await processAnalysisJob(job, owner), null, 2));
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const [command, first, second] = argv;
  if (!command) usage();
  if (command === "enqueue") {
    if (!first) usage();
    console.log(JSON.stringify(enqueueAssets(first, second ? [second] : undefined), null, 2));
    return;
  }
  if (command === "status") {
    const jobs = listJobs(first);
    const assets = first ? readAssetBindings(first).assets : [];
    console.log(JSON.stringify({ jobs, assets, manifests: assets.flatMap((asset) => asset.fingerprint_sha256 ? [readManifest(asset.fingerprint_sha256)] : []) }, null, 2));
    return;
  }
  if (command === "cache") {
    console.log(JSON.stringify(inspectMediaAnalysisCache(), null, 2));
    return;
  }
  if (command === "cache-enforce") {
    console.log(JSON.stringify(enforceMediaAnalysisCacheBudget(), null, 2));
    return;
  }
  if (command === "cancel") {
    if (!first) usage();
    console.log(JSON.stringify(requestCancellation(first), null, 2));
    return;
  }
  if (command === "retry") {
    if (!first) usage();
    console.log(JSON.stringify(retryJob(first), null, 2));
    return;
  }
  if (command === "once") {
    process.exitCode = await runOnce(workerOwner()) ? 0 : 2;
    return;
  }
  if (command === "doctor") {
    console.log(JSON.stringify({ detector: await new AppleVisionDetector().doctor() }, null, 2));
    return;
  }
  if (command === "detector-fixtures") {
    console.log(JSON.stringify(await generateDetectorFixtures({ manifestPath: detectorManifestPath(), fixtureRoot: first ? path.resolve(first) : detectorFixtureRoot() }), null, 2));
    return;
  }
  if (command === "detector-benchmark") {
    const fixtureRoot = first ? path.resolve(first) : detectorFixtureRoot();
    const reportPath = second ? path.resolve(second) : detectorReportPath();
    await generateDetectorFixtures({ manifestPath: detectorManifestPath(), fixtureRoot });
    console.log(JSON.stringify(await runDetectorPromotionBenchmark({
      detector: new AppleVisionDetector(),
      manifestPath: detectorManifestPath(),
      fixtureRoot,
      detectorSourcePath: detectorSourcePath(),
      reportPath,
      compilerVersion: commandVersion("xcrun", ["swiftc", "--version"]),
      platformVersion: commandVersion("sw_vers", ["-productVersion"]),
    }), null, 2));
    return;
  }
  if (command === "worker") {
    const owner = workerOwner();
    while (true) if (!await runOnce(owner)) await delay(1_000);
  }
  if (command === "benchmark") {
    if (!first) usage();
    console.log(JSON.stringify({
      detector: await new AppleVisionDetector().doctor(),
      capacity_sweep: await runCapacityBenchmark(first, second),
    }, null, 2));
    return;
  }
  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
