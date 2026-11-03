import { NextResponse } from "next/server";

import { exportsDir, finishedExportFile } from "@/lib/local-store/export-library";
import { projectRendersDir, listProjectIds } from "@/lib/local-store/paths";
import { listJobs } from "@/lib/local-store/render-jobs";
import { readMetadata } from "@/lib/local-store/store";

/** Library → Exports: every finished export whose file still exists, newest first. */
export async function GET() {
  try {
    const projects = new Set(listProjectIds());
    const titles = new Map<string, string>();
    const title = (projectId: string) => {
      if (!titles.has(projectId)) {
        let value = projectId;
        try { value = readMetadata(projectId).title ?? projectId; } catch { /* A project mid-write keeps its id as its name. */ }
        titles.set(projectId, value);
      }
      return titles.get(projectId)!;
    };
    const exports = listJobs({ targetType: "render" })
      .filter((job) => job.status === "completed" && projects.has(job.projectId))
      .flatMap((job) => {
        const file = finishedExportFile(job, projectRendersDir(job.projectId));
        if (!file) return [];
        return [{
          job_id: job.id,
          project_id: job.projectId,
          project_title: title(job.projectId),
          completed_at: job.completedAt ?? job.createdAt,
          file_url: `/api/exports/${encodeURIComponent(job.id)}/file`,
          in_exports_folder: Boolean(job.libraryPath && file === job.libraryPath),
        }];
      })
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
    return NextResponse.json({ folder: exportsDir(), exports });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not list exports" }, { status: 500 });
  }
}
