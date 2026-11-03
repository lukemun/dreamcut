/**
 * pnpm qc <projectId> [--target tiktok|reels|shorts|feed|web] [--json] [--estimate-only]
 *
 * THE gate. One command, one answer.
 *
 * It measures the timeline against the sourced standards in `src/lib/qc/standards.ts` and, by
 * default, measures every caption with its REAL loaded font in a real browser. Measured
 * geometry violations BLOCK (exit 1). Estimated ones can only warn — and the report says so
 * out loud.
 *
 * WHY IT MEASURES BY DEFAULT: there was briefly a second, separate gate that did the font
 * measurement, and `qc` passed a video that the second gate failed — 7/7 captions bad, one of
 * them four lines deep and under TikTok's UI, reported as PASS. A gate that launders a defect
 * is worse than no gate, because it is trusted. So the expensive check is ON by default, and
 * skipping it is an explicit, loudly-labelled choice.
 *
 * `--estimate-only` skips the browser (fast, no Chrome) and downgrades geometry findings to
 * warnings. The report then states plainly that the PASS does not clear caption layout.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkTimeline, formatReport, type QcElement } from "../src/lib/qc/check-timeline";
import { getCompositionDimensions } from "../src/lib/render/composition-adapters";
import { sanitizeTimelineOutputAspectRatio } from "../src/lib/timeline/metadata";
import { measureCaptions } from "../src/lib/qc/measure-captions";
import { DELIVERY_TARGETS, isDeliveryTarget, type DeliveryTarget } from "../src/lib/qc/standards";

function parseArgs() {
  const args = process.argv.slice(2);
  const projectId = args.find((a) => !a.startsWith("--"));
  const targetIndex = args.indexOf("--target");
  const rawTarget = targetIndex >= 0 ? args[targetIndex + 1] : undefined;

  if (!projectId) {
    console.error("usage: pnpm qc <projectId> [--target tiktok|reels|shorts|feed|web] [--json] [--estimate-only]");
    process.exit(2);
  }
  if (rawTarget && !isDeliveryTarget(rawTarget)) {
    console.error(`unknown --target "${rawTarget}". one of: ${DELIVERY_TARGETS.join(", ")}`);
    process.exit(2);
  }
  return {
    projectId,
    target: rawTarget as DeliveryTarget | undefined,
    json: args.includes("--json"),
    estimateOnly: args.includes("--estimate-only"),
  };
}

async function main() {
  const { projectId, target, json, estimateOnly } = parseArgs();
  const root = process.env.TIMELINE_PROJECTS_DIR ?? "projects";
  const dir = join(root, projectId);

  const timeline = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
  const metadata = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"));

  const canvas = getCompositionDimensions(sanitizeTimelineOutputAspectRatio(metadata.output_aspect_ratio ?? "16:9"));

  if (!target && !isDeliveryTarget(metadata.delivery_target)) {
    console.error(
      `metadata.json has no valid delivery_target. Set one of: ${DELIVERY_TARGETS.join(", ")}, or pass --target for a one-off check.`,
    );
    process.exit(2);
  }
  const resolved: DeliveryTarget = target ?? metadata.delivery_target;

  const elements: QcElement[] = timeline.elements;
  const activeCaptions = elements.filter(
    (el) => el.type === "caption_text" && !el.removed_at && el.props?.disabled !== true,
  );

  const measured = estimateOnly ? undefined : await measureCaptions(activeCaptions, canvas);

  const report = checkTimeline({
    elements,
    canvas,
    target: resolved,
    captionSafeAreaMode: metadata.caption_safe_area_mode,
    measured,
    mutedLaneKeys: metadata.muted_lane_keys,
    hiddenLaneKeys: metadata.hidden_lane_keys,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }

  // Blockers fail the gate. Warnings and advisories do not — they are craft, not safety.
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
