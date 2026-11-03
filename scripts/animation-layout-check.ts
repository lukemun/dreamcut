import fs from "node:fs";
import path from "node:path";

import { readTimeline } from "../src/lib/local-store/store";
import { resolveMediaEffectAtTime, resolveMediaTransformAtTime } from "../src/lib/timeline/media-transform";
import { measureHorizontalGroupBalance, unionRects } from "../src/lib/qc/group-balance";

type Rect = { left: number; top: number; right: number; bottom: number };
type Contract = {
  canvas: { width: number; height: number };
  center_checks?: Array<{ name: string; rect: Rect; axis: "x" | "y"; expected: number; tolerance_px?: number }>;
  containment_checks?: Array<{ name: string; at_seconds: number[]; container: Rect | (Rect & { width: number; height: number }); padding_px?: number; element_ids: string[]; ink_box: Rect }>;
  presence_checks?: Array<{ name: string; at_seconds: number[]; element_id: string; minimum_opacity?: number }>;
  group_balance_checks?: Array<{
    name: string;
    at_seconds: number[];
    members: Array<{ element_id: string; ink_box: Rect }>;
    center_tolerance_px?: number;
    edge_margin_tolerance_px?: number;
  }>;
};

const projectId = process.argv[2];
if (!projectId) throw new Error("usage: pnpm animation-layout-check <projectId> [contract.json]");
const projectDir = path.resolve("projects", projectId);
const contractPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(projectDir, "analysis", "animation-layout-contracts.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8")) as Contract;
const timeline = readTimeline(projectId);
const failures: Array<Record<string, unknown>> = [];
const results: Array<Record<string, unknown>> = [];

function edges(rect: Rect | (Rect & { width: number; height: number })) {
  return {
    left: rect.left,
    top: rect.top,
    right: "right" in rect ? rect.right : rect.left + rect.width,
    bottom: "bottom" in rect ? rect.bottom : rect.top + rect.height,
  };
}

function transformedInkRect(element: (typeof timeline.elements)[number], atSeconds: number, ink: Rect) {
  const local = atSeconds - element.timeline_start;
  const transform = resolveMediaTransformAtTime(element.props, local);
  const centerX = contract.canvas.width / 2 + transform.offsetX * contract.canvas.width / 2;
  const centerY = contract.canvas.height / 2 + transform.offsetY * contract.canvas.height / 2;
  return {
    left: centerX + (ink.left - contract.canvas.width / 2) * transform.scale,
    top: centerY + (ink.top - contract.canvas.height / 2) * transform.scale,
    right: centerX + (ink.right - contract.canvas.width / 2) * transform.scale,
    bottom: centerY + (ink.bottom - contract.canvas.height / 2) * transform.scale,
  };
}

for (const check of contract.center_checks ?? []) {
  const rect = edges(check.rect);
  const actual = check.axis === "x" ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
  const delta = actual - check.expected;
  const result = { kind: "center", name: check.name, axis: check.axis, expected: check.expected, actual, delta, tolerance_px: check.tolerance_px ?? 0, status: Math.abs(delta) <= (check.tolerance_px ?? 0) ? "pass" : "fail" };
  results.push(result);
  if (result.status === "fail") failures.push(result);
}

for (const check of contract.containment_checks ?? []) {
  const container = edges(check.container);
  const padding = check.padding_px ?? 0;
  for (const atSeconds of check.at_seconds) {
    for (const elementId of check.element_ids) {
      const element = timeline.elements.find((candidate) => candidate.id === elementId && candidate.removed_at == null);
      if (!element) {
        const result = { kind: "containment", name: check.name, at_seconds: atSeconds, element_id: elementId, status: "fail", issue: "missing-element" };
        results.push(result); failures.push(result); continue;
      }
      const ink = transformedInkRect(element, atSeconds, check.ink_box);
      const contained = ink.left >= container.left + padding && ink.right <= container.right - padding && ink.top >= container.top + padding && ink.bottom <= container.bottom - padding;
      const result = { kind: "containment", name: check.name, at_seconds: atSeconds, element_id: elementId, container, ink, padding_px: padding, status: contained ? "pass" : "fail" };
      results.push(result);
      if (!contained) failures.push(result);
    }
  }
}

for (const check of contract.presence_checks ?? []) {
  const element = timeline.elements.find((candidate) => candidate.id === check.element_id && candidate.removed_at == null);
  for (const atSeconds of check.at_seconds) {
    const active = Boolean(element && element.timeline_start <= atSeconds && element.timeline_start + element.duration > atSeconds);
    const opacity = active && element ? resolveMediaEffectAtTime(element.props, atSeconds - element.timeline_start).opacity : 0;
    const visible = active && opacity >= (check.minimum_opacity ?? 0.05);
    const result = { kind: "presence", name: check.name, at_seconds: atSeconds, element_id: check.element_id, active, opacity, minimum_opacity: check.minimum_opacity ?? 0.05, status: visible ? "pass" : "fail" };
    results.push(result);
    if (!visible) failures.push(result);
  }
}

for (const check of contract.group_balance_checks ?? []) {
  for (const atSeconds of check.at_seconds) {
    const memberRects: Rect[] = [];
    const missing: string[] = [];
    for (const member of check.members) {
      const element = timeline.elements.find((candidate) =>
        candidate.id === member.element_id
        && candidate.removed_at == null
        && candidate.timeline_start <= atSeconds
        && candidate.timeline_start + candidate.duration > atSeconds,
      );
      if (!element) {
        missing.push(member.element_id);
        continue;
      }
      const effect = resolveMediaEffectAtTime(element.props, atSeconds - element.timeline_start);
      if (effect.opacity < 0.05) {
        missing.push(member.element_id);
        continue;
      }
      memberRects.push(transformedInkRect(element, atSeconds, member.ink_box));
    }
    if (missing.length > 0) {
      const result = { kind: "group-balance", name: check.name, at_seconds: atSeconds, status: "fail", issue: "missing-or-hidden-member", element_ids: missing };
      results.push(result);
      failures.push(result);
      continue;
    }
    const group = unionRects(memberRects);
    const measurement = measureHorizontalGroupBalance(group, contract.canvas.width);
    const centerTolerance = check.center_tolerance_px ?? 0;
    const marginTolerance = check.edge_margin_tolerance_px ?? centerTolerance * 2;
    const pass = Math.abs(measurement.centerDeltaPx) <= centerTolerance
      && Math.abs(measurement.marginDeltaPx) <= marginTolerance;
    const result = {
      kind: "group-balance",
      name: check.name,
      at_seconds: atSeconds,
      group,
      ...measurement,
      center_tolerance_px: centerTolerance,
      edge_margin_tolerance_px: marginTolerance,
      status: pass ? "pass" : "fail",
    };
    results.push(result);
    if (!pass) failures.push(result);
  }
}

const receipt = { schema_version: 1, project_id: projectId, contract_path: contractPath, checked_at: new Date().toISOString(), summary: { pass: results.length - failures.length, fail: failures.length }, results };
const outputDir = path.join(projectDir, "analysis", "animation-layout-check");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "latest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ summary: receipt.summary, outputPath, failures }, null, 2));
if (failures.length) process.exitCode = 1;
