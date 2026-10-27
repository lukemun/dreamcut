import { projectsRoot } from "../src/lib/local-store/paths";
import { buildStorageReport, type MediaBucket, type ProjectStorage } from "../src/lib/local-store/storage-report";

const USAGE = `Usage: pnpm storage-report [project-id ...] [--json] [--files N]

Read-only. Lists, per project, which media files are referenced, rebuildable or orphaned,
and sizes the record and evidence folders. Nothing is written or deleted.
  project-id   detail for these projects (default: a summary of every project)
  --json       the full machine-readable report
  --files N    largest N files per bucket in the detail view (default 10)`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0); }
const json = args.includes("--json");
const filesAt = args.indexOf("--files");
const fileLimit = filesAt >= 0 ? Number(args[filesAt + 1]) : 10;
if (!Number.isInteger(fileLimit) || fileLimit < 0) throw new Error("--files takes a whole number");
const projectIds = args.filter((arg, index) => !arg.startsWith("--") && !(filesAt >= 0 && index === filesAt + 1));

const report = buildStorageReport(projectsRoot(), projectIds);
if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const gib = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
const pad = (value: string, width: number) => value.padStart(width);
const BUCKETS: MediaBucket[] = ["referenced", "rebuildable", "orphaned"];
const REASON_LABELS: Record<string, string> = {
  original: "imported originals",
  edit: "named by timelines, history or proposals",
  "render-authority": "render authorities of current packages",
  "package-source-missing": "package files whose source is missing",
  "evidence-only": "named only by analysis or index records",
  "current-package": "current previews, audio and browsing files",
  unnamed: "named by no record",
};

console.log(`Projects: ${report.projects_root}`);
if (report.volume) console.log(`Volume: ${gib(report.volume.free)} free of ${gib(report.volume.total)}`);
for (const cache of report.shared_caches) console.log(`Shared ${cache.path}: ${gib(cache.allocated)} (${cache.owner})`);
console.log("");

function summary(projects: ProjectStorage[]) {
  const header = `${"project".padEnd(32)}${pad("total", 11)}${pad("referenced", 12)}${pad("rebuildable", 13)}${pad("orphaned", 11)}${pad("other", 11)}`;
  console.log(header);
  const totals = { total: 0, referenced: 0, rebuildable: 0, orphaned: 0, other: 0 };
  for (const project of [...projects].sort((a, b) => b.allocated - a.allocated)) {
    const other = project.folders.reduce((sum, folder) => sum + folder.allocated, 0);
    totals.total += project.allocated; totals.other += other;
    for (const bucket of BUCKETS) totals[bucket] += project.buckets[bucket].allocated;
    console.log(`${project.project_id.slice(0, 31).padEnd(32)}${pad(gib(project.allocated), 11)}${BUCKETS.map((bucket, i) => pad(gib(project.buckets[bucket].allocated), [12, 13, 11][i])).join("")}${pad(gib(other), 11)}`);
  }
  if (projects.length > 1) console.log(`${"all projects".padEnd(32)}${pad(gib(totals.total), 11)}${pad(gib(totals.referenced), 12)}${pad(gib(totals.rebuildable), 13)}${pad(gib(totals.orphaned), 11)}${pad(gib(totals.other), 11)}`);
  console.log("\nreferenced/rebuildable/orphaned cover media/; other is records, analysis, evidence and renders.");
}

function detail(project: ProjectStorage) {
  console.log(`\n${project.project_id}: ${gib(project.allocated)}`);
  for (const bucket of BUCKETS) {
    const totals = project.buckets[bucket];
    console.log(`\n  ${bucket}: ${gib(totals.allocated)} in ${totals.files} files`);
    for (const [reason, value] of Object.entries(project.reasons)) {
      if (!value || !project.files.some(file => file.bucket === bucket && file.reason === reason)) continue;
      console.log(`    ${pad(gib(value.allocated), 10)}  ${REASON_LABELS[reason] ?? reason} (${value.files})`);
    }
    for (const file of project.files.filter(entry => entry.bucket === bucket).slice(0, fileLimit)) {
      const note = file.regenerable ? " [source available: preparation can recreate it]" : file.named_by ? ` <- ${file.named_by[0]}` : "";
      console.log(`      ${pad(gib(file.allocated), 10)}  ${file.path}${note}`);
    }
  }
  console.log("\n  folders outside media/:");
  for (const folder of project.folders) console.log(`    ${pad(gib(folder.allocated), 10)}  ${folder.path}  (${folder.owner})`);
  if (project.symlinks.length) console.log(`  symlinks not followed: ${project.symlinks.length}`);
}

summary(report.projects);
if (projectIds.length) for (const project of report.projects) detail(project);
console.log("");
for (const limit of report.limits) console.log(`Note: ${limit}`);
