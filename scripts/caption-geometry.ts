/**
 * pnpm caption-geometry <projectId> [--out report.json]
 *
 * Writes the font-accurate caption measurement report (per-caption box, real wrapped line
 * count, safe-area violations) for inspection.
 *
 * This is a REPORTING tool, not a second gate. `pnpm qc` performs the same measurement and is
 * the single pass/fail authority — the two used to disagree (qc PASS, geometry FAIL), which is
 * exactly the split-brain that let a broken video through. Both now call `measureCaptions()`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { activeElements, readMetadata, readTimeline } from "@/lib/local-store/store";
import { captionBox } from "@/lib/qc/check-timeline";
import { measureCaptions } from "@/lib/qc/measure-captions";
import { CAPTION, safeAreaFor } from "@/lib/qc/standards";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) throw new Error("usage: pnpm caption-geometry <projectId> [--out report.json]");
  const value = (flag: string) =>
    process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined;

  const timeline = readTimeline(projectId);
  const metadata = readMetadata(projectId);
  const canvas = metadata.output_aspect_ratio === "9:16"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
  const safe = safeAreaFor(metadata.delivery_target, canvas, metadata.caption_safe_area_mode);
  const captions = activeElements(timeline).filter((element) => element.type === "caption_text");

  const measurements = await measureCaptions(captions, canvas);

  const rows = captions.map((caption) => {
    const m = measurements[caption.id]!;
    const box = captionBox(caption, canvas, m);
    const railTop = safe.rail ? safe.rail.belowFraction * canvas.height : Infinity;
    const rightMargin = safe.rail && box.bottom > railTop ? safe.rail.right : safe.right;
    const violations = [
      box.left < safe.left && "left",
      box.top < safe.top && "top",
      box.right > canvas.width - rightMargin && "right",
      box.bottom > canvas.height - safe.bottom && "bottom",
    ].filter(Boolean);
    return {
      elementId: caption.id,
      text: box.text,
      font: m.loadedFamily,
      width: m.width,
      height: m.height,
      lines: m.lines,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      violations,
      ok: m.lines <= CAPTION.maxLines && violations.length === 0,
    };
  });

  const report = {
    projectId,
    canvas,
    target: metadata.delivery_target,
    captionSafeAreaMode: metadata.caption_safe_area_mode,
    ok: rows.every((row) => row.ok),
    measurements: rows,
  };
  const out = value("--out")
    ?? path.join(process.env.TIMELINE_PROJECTS_DIR ?? "projects", projectId, "instruments", "caption-geometry.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(out);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
