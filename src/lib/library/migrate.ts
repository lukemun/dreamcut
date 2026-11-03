import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { libraryProjectsDir, type Library } from "./library";

/**
 * Move existing projects into a Library. Same volume: rename, which moves nothing and cannot leave a
 * half-copied project. Different volume: copy into a hidden staging folder, verify every file's size,
 * then rename into place; the originals are never deleted. Conflicting names are skipped, never merged.
 */
export type ProjectMigrationItem = { id: string; bytes: number; files: number; action: "move" | "copy" | "skip"; reason?: string };
export type ProjectMigrationPlan = { from: string; to: string; sameVolume: boolean; projects: ProjectMigrationItem[] };
export type ProjectMigrationResult = { id: string; outcome: "moved" | "copied" | "skipped" | "failed"; reason?: string };

const isProjectFolder = (dir: string, name: string) => !name.startsWith(".")
  && fs.statSync(path.join(dir, name)).isDirectory()
  && fs.existsSync(path.join(dir, name, "timeline.json"));

function walk(dir: string): { files: number; bytes: number } {
  let files = 0, bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // Never follow links out of a project.
    if (entry.isDirectory()) { const inner = walk(full); files += inner.files; bytes += inner.bytes; }
    else if (entry.isFile()) { files += 1; bytes += fs.statSync(full).size; }
  }
  return { files, bytes };
}

export function planProjectMigration(fromProjectsDir: string, library: Library): ProjectMigrationPlan {
  const from = path.resolve(fromProjectsDir), to = libraryProjectsDir(library.root);
  if (library.access !== "read-write") throw new Error(library.reason ?? "This Library is read-only.");
  fs.mkdirSync(to, { recursive: true });
  const sameVolume = fs.existsSync(from) && fs.statSync(from).dev === fs.statSync(to).dev;
  const names = fs.existsSync(from) ? fs.readdirSync(from).filter(name => isProjectFolder(from, name)).sort() : [];
  return { from, to, sameVolume, projects: names.map(id => {
    const size = walk(path.join(from, id));
    if (fs.existsSync(path.join(to, id))) return { id, ...size, action: "skip" as const, reason: "A project with this name already exists in the Library." };
    return { id, ...size, action: sameVolume ? "move" as const : "copy" as const };
  }) };
}

function copyTree(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
}

export function runProjectMigration(plan: ProjectMigrationPlan): ProjectMigrationResult[] {
  return plan.projects.map(item => {
    const source = path.join(plan.from, item.id), target = path.join(plan.to, item.id);
    if (item.action === "skip") return { id: item.id, outcome: "skipped", reason: item.reason };
    if (fs.existsSync(target)) return { id: item.id, outcome: "skipped", reason: "A project with this name appeared in the Library." };
    try {
      if (item.action === "move") { fs.renameSync(source, target); return { id: item.id, outcome: "moved" }; }
      const staging = path.join(plan.to, `.${item.id}.migrating-${randomUUID()}`);
      try {
        copyTree(source, staging);
        const copied = walk(staging), original = walk(source);
        if (copied.files !== original.files || copied.bytes !== original.bytes) throw new Error(`Copy verification failed (${copied.files}/${original.files} files, ${copied.bytes}/${original.bytes} bytes).`);
        fs.renameSync(staging, target);
      } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
      return { id: item.id, outcome: "copied" };
    } catch (error) {
      return { id: item.id, outcome: "failed", reason: error instanceof Error ? error.message : "Migration failed" };
    }
  });
}
