import fs from "node:fs";
import path from "node:path";
import { configuredLibraryDir, LIBRARY_DIR_ENV, libraryConfigPath, LibraryError, libraryMarkerPath, libraryProjectsDir, readLibrary } from "../library/library";

let chosenLibrary: { key: string; dir: string | null } | null = null;
/** The creator's chosen Library, re-read only when its environment override or saved choice changes. */
function chosenLibraryDir(): string | null {
  let stamp = "none";
  try { stamp = String(fs.statSync(libraryConfigPath()).mtimeMs); } catch { /* No saved choice. */ }
  const key = `${process.env[LIBRARY_DIR_ENV] ?? ""}|${stamp}`;
  if (chosenLibrary?.key !== key) chosenLibrary = { key, dir: configuredLibraryDir() };
  return chosenLibrary.dir;
}

/**
 * Root folder holding one subfolder per project: TIMELINE_PROJECTS_DIR when set, else the chosen
 * DreamCut Library's projects folder (once its marker exists), else ./projects.
 */
export function projectsRoot(): string {
  const fromEnv = process.env.TIMELINE_PROJECTS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const library = chosenLibraryDir();
  if (library && fs.existsSync(libraryMarkerPath(library))) {
    assertLibraryWritable(library);
    return libraryProjectsDir(library);
  }
  // Before a Library is chosen: the packaged runtime keeps projects in app data (never inside the runtime
  // install, which an upgrade replaces); a checkout keeps ./projects.
  const fallback = process.env.DREAMCUT_DEFAULT_PROJECTS_DIR?.trim();
  // A runtime folder, not a build input: the marker keeps Turbopack from bundling every project's media.
  return fallback ? path.resolve(fallback) : path.resolve(/* turbopackIgnore: true */ process.cwd(), "projects");
}

let checkedLibrary: { key: string; error: Error | null } | null = null;
/**
 * Refuse a Library this version must not write (newer format, unreadable or invalid marker) rather than
 * silently using it or falling back to another folder. Re-checked only when the marker changes.
 */
function assertLibraryWritable(root: string) {
  const key = `${root}|${fs.statSync(libraryMarkerPath(root)).mtimeMs}`;
  if (checkedLibrary?.key !== key) {
    let error: Error | null = null;
    try {
      const library = readLibrary(root);
      if (library.access !== "read-write") error = new LibraryError(`${library.reason} Update DreamCut to edit it.`, "TOO_NEW");
    } catch (caught) { error = caught as Error; }
    checkedLibrary = { key, error };
  }
  if (checkedLibrary.error) throw checkedLibrary.error;
}

export function isSafeProjectId(projectId: string): boolean {
  return projectId.length > 0
    && projectId.length <= 128
    && projectId !== "."
    && projectId !== ".."
    && /^[A-Za-z0-9._-]+$/.test(projectId);
}

export function projectDir(projectId: string): string {
  // Project ids are folder names; refuse anything that could escape the root.
  if (!isSafeProjectId(projectId)) {
    throw new Error(`Invalid project id: ${projectId}`);
  }
  const root = projectsRoot();
  const candidate = path.resolve(root, projectId);
  if (path.dirname(candidate) !== root) throw new Error(`Invalid project id: ${projectId}`);
  return candidate;
}

export function projectExists(projectId: string): boolean {
  try {
    return fs.statSync(projectDir(projectId)).isDirectory();
  } catch {
    return false;
  }
}

export function projectTimelinePath(projectId: string): string {
  return path.join(projectDir(projectId), "timeline.json");
}

export function projectMetadataPath(projectId: string): string {
  return path.join(projectDir(projectId), "metadata.json");
}

export function projectPeaksPath(projectId: string): string {
  return path.join(projectDir(projectId), "peaks.json");
}

/**
 * Short-lived marker the MCP server drops next to a project while it performs a
 * granted `agent_workspace` mutation, so the shared safe-write layer can tell an
 * agent's own write from a human edit made through the editor UI (both arrive as
 * the same HTTP route on the same dev-server process). Written by `mcp/proposal-gate.mjs`
 * — keep the basename in sync with `AGENT_WRITE_LEASE_FILENAME` there.
 */
export function projectAgentWriteLeasePath(projectId: string): string {
  return path.join(projectDir(projectId), ".agent-mcp-write.json");
}

/** A relative path in the form projects store and compare: forward slashes on every OS. */
export function portableRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

export function projectMediaDir(projectId: string): string {
  return path.join(projectDir(projectId), "media");
}

/** Provenance and storage-mode records for media ingested into a project. */
export function projectSourceManifestPath(projectId: string): string {
  return path.join(projectDir(projectId), "source-manifest.json");
}

export function projectHyperframesDir(projectId: string): string {
  return path.join(projectDir(projectId), "hyperframes");
}

export function isSafeHyperframesCompositionId(compositionId: string): boolean {
  return compositionId.length > 0
    && compositionId.length <= 128
    && compositionId !== "."
    && compositionId !== ".."
    && /^[A-Za-z0-9._-]+$/.test(compositionId);
}

export function projectHyperframesCompositionDir(projectId: string, compositionId: string): string {
  if (!isSafeHyperframesCompositionId(compositionId)) {
    throw new Error(`Invalid HyperFrames composition id: ${compositionId}`);
  }
  return path.join(projectHyperframesDir(projectId), compositionId);
}

export function projectHyperframesReceiptsDir(projectId: string): string {
  return path.join(projectDir(projectId), "preprocess", "hyperframes");
}

export function projectHyperframesReceiptPath(projectId: string, compositionId: string): string {
  if (!isSafeHyperframesCompositionId(compositionId)) {
    throw new Error(`Invalid HyperFrames composition id: ${compositionId}`);
  }
  return path.join(projectHyperframesReceiptsDir(projectId), `${compositionId}.json`);
}

export function projectLutsDir(projectId: string): string {
  return path.join(projectMediaDir(projectId), "luts");
}

export function projectRendersDir(projectId: string): string {
  return path.join(projectDir(projectId), "renders");
}

export function projectHistoryDir(projectId: string): string {
  return path.join(projectDir(projectId), "history");
}

export function projectArchiveDir(projectId: string): string {
  return path.join(projectDir(projectId), "archive");
}

export function projectTimelineTombstonesPath(projectId: string): string {
  return path.join(projectArchiveDir(projectId), "timeline-tombstones.v1.json.gz");
}

export function projectCompactionReceiptsDir(projectId: string): string {
  return path.join(projectArchiveDir(projectId), "compaction-receipts");
}

export function projectReviewDir(projectId: string): string {
  return path.join(projectDir(projectId), "review");
}

/** Pending and resolved agent proposals, one file each. Never written by an apply. */
export function projectProposalsDir(projectId: string): string {
  return path.join(projectDir(projectId), "proposals");
}

export function projectLayoutProposalsDir(projectId: string): string {
  return path.join(projectDir(projectId), "preprocess", "layout-proposals");
}

export function isSafeLayoutProposalId(layoutId: string): boolean {
  return layoutId.length > 0
    && layoutId.length <= 128
    && /^[A-Za-z0-9._-]+$/.test(layoutId);
}

export function projectLayoutProposalPath(projectId: string, layoutId: string): string {
  if (!isSafeLayoutProposalId(layoutId)) throw new Error(`Invalid layout proposal id: ${layoutId}`);
  return path.join(projectLayoutProposalsDir(projectId), `${layoutId}.json`);
}

export function projectLayoutProposalHistoryDir(projectId: string, layoutId: string): string {
  if (!isSafeLayoutProposalId(layoutId)) throw new Error(`Invalid layout proposal id: ${layoutId}`);
  return path.join(projectLayoutProposalsDir(projectId), "history", layoutId);
}

export function isSafeProposalId(proposalId: string): boolean {
  return /^[0-9]{8}T[0-9]{6}-[0-9a-f]{8}$/.test(proposalId);
}

export function projectProposalPath(projectId: string, proposalId: string): string {
  if (!isSafeProposalId(proposalId)) throw new Error(`Invalid proposal id: ${proposalId}`);
  return path.join(projectProposalsDir(projectId), `${proposalId}.json`);
}

export function projectFrameTagsPath(projectId: string): string {
  return path.join(projectReviewDir(projectId), "frame-tags.json");
}

export function projectInstrumentsDir(projectId: string): string {
  return path.join(projectDir(projectId), "instruments");
}

export function projectMediaIndexDir(projectId: string): string {
  return path.join(projectInstrumentsDir(projectId), "media-index");
}

export function projectMediaAssetsPath(projectId: string): string {
  return path.join(projectMediaIndexDir(projectId), "assets.json");
}

export function projectAnalysisAnnotationsPath(projectId: string): string {
  return path.join(projectMediaIndexDir(projectId), "annotations.json");
}

export function mediaAnalysisRoot(): string {
  return path.join(projectsRoot(), ".cache", "media-analysis");
}

export function mediaAnalysisJobsDir(): string {
  return path.join(mediaAnalysisRoot(), "jobs");
}

export function mediaAnalysisJobPath(jobId: string): string {
  if (!isSafeProjectId(jobId)) throw new Error(`Invalid job id: ${jobId}`);
  return path.join(mediaAnalysisJobsDir(), `${jobId}.json`);
}

export function mediaAnalysisContentDir(fingerprint: string): string {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error(`Invalid fingerprint: ${fingerprint}`);
  return path.join(mediaAnalysisRoot(), fingerprint);
}

export function mediaContextIndexPath(fingerprint: string): string {
  return path.join(mediaAnalysisContentDir(fingerprint), "context.json");
}

export function listProjectIds(): string[] {
  const root = projectsRoot();
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Receipt that a human edit cleared the agent_workspace grant, so agents can report why
 * direct editing closed. Like the handoff marker it is outside undoable state, and it can
 * only explain a revocation, never restore a grant. Keep the basename in sync with
 * `AGENT_WORKSPACE_REVOKED_FILENAME` in `mcp/proposal-gate.mjs`.
 */
export function projectAgentWorkspaceRevokedPath(projectId: string): string {
  return path.join(projectDir(projectId), ".agent-workspace-revoked.json");
}

/** Permanent review boundary, deliberately outside undoable metadata/history. */
export function projectAssemblyHandoffPath(projectId: string): string {
  return path.join(projectDir(projectId), ".assembly-handoff.json");
}
