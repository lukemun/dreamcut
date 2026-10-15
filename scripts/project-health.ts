import { buildProjectHealthReport } from "@/lib/local-store/project-health";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error("Usage: pnpm project-health <projectId> [--json]");
}

const report = buildProjectHealthReport(projectId);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const rows = [
    ["Timeline", `${report.timeline.active_elements} active / ${report.timeline.total_elements} stored`, formatBytes(report.timeline.bytes)],
    ["Media", `${report.storage.media.files} files`, formatBytes(report.storage.media.bytes)],
    ["Renders", `${report.storage.renders.files} files`, formatBytes(report.storage.renders.bytes)],
    ["History", `${report.storage.history.files} snapshots`, formatBytes(report.storage.history.bytes)],
    ["Preprocess", `${report.storage.preprocess.files} files`, formatBytes(report.storage.preprocess.bytes)],
    ["Instruments", `${report.storage.instruments.files} files`, formatBytes(report.storage.instruments.bytes)],
  ];
  console.log(`Project health: ${projectId}`);
  console.log(`Duration: ${report.timeline.duration_seconds.toFixed(3)}s`);
  console.log(`Active lanes: ${report.timeline.active_lanes}; active sources: ${report.timeline.active_sources}`);
  console.log(`Removed rows retained: ${report.timeline.removed_elements}`);
  console.table(rows.map(([area, detail, size]) => ({ area, detail, size })));
  console.log(`Total project storage: ${formatBytes(report.storage.project.bytes)}`);
  if (report.motion.length > 0) {
    console.log("Motion graphics and sounds:");
    console.table(report.motion.map((summary) => ({
      item: `${summary.kind}:${summary.id}`,
      revisions: summary.revisions,
      renders: summary.renders,
      controls: summary.latest_coverage?.declared_controls ?? 0,
      actors: summary.latest_coverage?.declared_actors ?? 0,
      markers: summary.latest_coverage?.declared_markers ?? 0,
      person_edits: summary.value_changes.by_person,
      model_requests: summary.model_requests,
      missed_controls: summary.missed_controls,
      approved: summary.reviews.approved,
      mean_rating: summary.reviews.mean_rating ?? "–",
    })));
  }
}
