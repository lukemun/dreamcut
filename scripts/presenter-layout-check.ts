import fs from "node:fs";
import path from "node:path";

import { readTimeline } from "../src/lib/local-store/store";
import { getCompositionDimensions } from "../src/lib/render/composition-adapters";
import { sanitizeTimelineOutputAspectRatio } from "../src/lib/timeline/metadata";
import { resolveMediaEffectAtTime, resolveMediaTransformAtTime } from "../src/lib/timeline/media-transform";

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

const args = process.argv.slice(2);
const projectId = args[0];
if (!projectId) {
  throw new Error("usage: pnpm presenter-layout-check <projectId> --at 75,94,123 [--presenter id,id] [--strict]");
}

function option(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const requestedAt = (option("--at") ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter(Number.isFinite);
const auto = args.includes("--auto");
if (requestedAt.length === 0 && !auto) throw new Error("provide --at <seconds,...> or --auto");

const explicitPresenterIds = new Set((option("--presenter") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const strict = args.includes("--strict");
const timeline = readTimeline(projectId);
const projectDir = path.resolve("projects", projectId);
const metadataPath = path.join(projectDir, "metadata.json");
const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
const canvas = getCompositionDimensions(sanitizeTimelineOutputAspectRatio(metadata.output_aspect_ratio));

const noGo = {
  bottomUiRail: { left: 0, top: canvas.height * 0.65625, right: canvas.width, bottom: canvas.height },
  rightControlRail: { left: canvas.width * 0.7222, top: canvas.height * 0.4375, right: canvas.width, bottom: canvas.height },
};

function intersects(a: Rect, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectFor(scale: number, offsetX: number, offsetY: number): Rect {
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  const centerX = canvas.width / 2 + offsetX * canvas.width / 2;
  const centerY = canvas.height / 2 + offsetY * canvas.height / 2;
  return {
    left: Math.round(centerX - width / 2),
    top: Math.round(centerY - height / 2),
    right: Math.round(centerX + width / 2),
    bottom: Math.round(centerY + height / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function zone(rect: Rect) {
  const x = (rect.left + rect.right) / 2 / canvas.width;
  const y = (rect.top + rect.bottom) / 2 / canvas.height;
  const horizontal = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "center";
  const vertical = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "middle";
  return `${vertical}-${horizontal}`;
}

function isAutoPresenter(element: (typeof timeline.elements)[number], scale: number) {
  if (element.type !== "video_clip" || scale >= 0.8) return false;
  const props = element.props ?? {};
  const width = Number(props.source_width ?? 0);
  const height = Number(props.source_height ?? 0);
  const portraitSource = width > 0 && height > 0 && width / height <= 0.8;
  const presenterLanguage = /presenter|talking.head|floating|credential|proof|take/i.test(
    [props.section, props.composition_contract, props.source_id].filter(Boolean).join(" "),
  );
  return portraitSource || presenterLanguage;
}

const from = Number(option("--from") ?? Number.NEGATIVE_INFINITY);
const to = Number(option("--to") ?? Number.POSITIVE_INFINITY);
const at = auto
  ? [...new Set(timeline.elements.flatMap((element) => {
      if (element.removed_at != null || element.type !== "video_clip") return [];
      const initial = resolveMediaTransformAtTime(element.props, 0);
      if (!isAutoPresenter(element, initial.scale)) return [];
      const keyframes = (element.props?.keyframes as Record<string, unknown> | undefined) ?? {};
      const changePoints = Object.values(keyframes).flatMap((value) => Array.isArray(value)
        ? value.map((point) => Number((point as { t?: number }).t)).filter(Number.isFinite)
        : []);
      const local = [0.05, element.duration / 2, Math.max(0.05, element.duration - 0.05), ...changePoints.flatMap((time) => [time - 1 / 30, time, time + 1 / 30])];
      return local
        .filter((time) => time >= 0 && time < element.duration)
        .map((time) => Number((element.timeline_start + time).toFixed(3)));
    }))]
      .filter((time) => time >= from && time <= to)
      .sort((a, b) => a - b)
  : requestedAt;

if (at.length === 0) throw new Error("no presenter sample points matched the requested range");

const results = at.flatMap((atSeconds) => {
  const active = timeline.elements.filter((element) =>
    element.removed_at == null
    && element.timeline_start <= atSeconds
    && element.timeline_start + element.duration > atSeconds,
  );
  const evidenceCount = active.filter((element) => element.lane_key?.startsWith("visual") && element.type !== "video_clip").length;
  return active.flatMap((element) => {
    const localSeconds = atSeconds - element.timeline_start;
    const transform = resolveMediaTransformAtTime(element.props, localSeconds);
    const effect = resolveMediaEffectAtTime(element.props, localSeconds);
    const selected = explicitPresenterIds.size > 0
      ? explicitPresenterIds.has(element.id)
      : isAutoPresenter(element, transform.scale);
    if (!selected || effect.opacity <= 0.05) return [];

    const rect = rectFor(transform.scale, transform.offsetX, transform.offsetY);
    const placementZone = zone(rect);
    const failures: string[] = [];
    const warnings: string[] = [];
    if (rect.left < 0 || rect.top < 0 || rect.right > canvas.width || rect.bottom > canvas.height) failures.push("off-canvas");
    if (intersects(rect, noGo.rightControlRail)) failures.push("right-control-rail");
    if (
      intersects(rect, noGo.bottomUiRail)
      && (placementZone === "bottom-left" || placementZone === "bottom-right")
    ) failures.push("bottom-corner-ui-rail");
    if (transform.scale < 0.18) warnings.push("presenter-may-be-too-small");
    if (evidenceCount > 0 && !element.props?.composition_contract) warnings.push("missing-evidence-placement-contract");
    return [{
      atSeconds,
      elementId: element.id,
      section: element.props?.section ?? null,
      zone: placementZone,
      opacity: Number(effect.opacity.toFixed(3)),
      transform: {
        scale: Number(transform.scale.toFixed(3)),
        offsetX: Number(transform.offsetX.toFixed(3)),
        offsetY: Number(transform.offsetY.toFixed(3)),
      },
      rect,
      evidenceLayerCount: evidenceCount,
      failures,
      warnings,
      status: failures.length ? "fail" : warnings.length ? "warn" : "pass",
    }];
  });
});

const summary = {
  pass: results.filter((result) => result.status === "pass").length,
  warn: results.filter((result) => result.status === "warn").length,
  fail: results.filter((result) => result.status === "fail").length,
};
const receipt = {
  schemaVersion: 1,
  projectId,
  sampledAt: at,
  canvas,
  noGo,
  summary,
  results,
  visualProofCommand: `pnpm frame-state ${projectId} --at ${at.join(",")}`,
};

const outputDir = path.join(projectDir, "analysis", "presenter-layout-check");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "latest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);

console.table(results.map((result) => ({
  at: result.atSeconds,
  element: result.elementId.slice(0, 8),
  zone: result.zone,
  rect: `${result.rect.left},${result.rect.top} ${result.rect.width}x${result.rect.height}`,
  status: result.status,
  issues: [...result.failures, ...result.warnings].join(", ") || "—",
})));
console.log(JSON.stringify({ summary, outputPath, visualProofCommand: receipt.visualProofCommand }, null, 2));

if (strict && summary.fail > 0) process.exitCode = 1;
