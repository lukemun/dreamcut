import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { configuredLibraryDir, createLibrary, defaultLibraryDir, dreamcutAppDataRoot, LIBRARY_DIR_ENV, LibraryError, libraryMarkerPath,
  libraryProjectsDir, readLibrary, saveLibraryChoice, type Library } from "./library";
import { planProjectMigration, runProjectMigration } from "./migrate";

/**
 * Library setup for the creator and their agent: where projects live, and moving existing projects in.
 * Choosing or creating a Library writes only the marker and the saved choice; moving projects needs an
 * explicit confirmation naming exactly the projects shown in the plan.
 */
const countProjects = (dir: string) => {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(name => !name.startsWith(".") && fs.existsSync(path.join(dir, name, "timeline.json"))).length;
};

/** Folders that held projects before the Library existed: the dev default and the desktop app's old data folder. */
export function legacyProjectFolders(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([path.resolve(cwd, "projects"), path.join(dreamcutAppDataRoot(process.platform, env), "projects")])];
}

export function libraryStatus(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const chosen = configuredLibraryDir(env);
  let library: (Pick<Library, "root" | "access" | "reason"> & { format_version: number }) | null = null, problem: string | null = null;
  if (chosen && fs.existsSync(libraryMarkerPath(chosen))) {
    try { const opened = readLibrary(chosen); library = { root: opened.root, access: opened.access, reason: opened.reason, format_version: opened.marker.format_version }; }
    catch (error) { problem = (error as Error).message; }
  }
  const override = env.TIMELINE_PROJECTS_DIR?.trim() ? path.resolve(env.TIMELINE_PROJECTS_DIR.trim()) : null;
  const libraryProjects = library ? libraryProjectsDir(library.root) : null;
  return {
    library, problem,
    chosen_dir: chosen,
    chosen_by: env[LIBRARY_DIR_ENV]?.trim() ? LIBRARY_DIR_ENV : chosen ? "saved choice" : null,
    suggested_dir: defaultLibraryDir(),
    /** Development and test setups pin the projects folder; a Library choice does not apply until it is removed. */
    projects_override: override,
    legacy_folders: legacyProjectFolders(cwd, env)
      .filter(dir => dir !== libraryProjects && dir !== override)
      .map(dir => ({ dir, projects: countProjects(dir) }))
      .filter(entry => entry.projects > 0),
  };
}

export const librarySetupSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), dir: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal("use_existing"), dir: z.string().min(1) }).strict(),
  z.object({ action: z.literal("plan_migration"), from: z.string().min(1) }).strict(),
  z.object({ action: z.literal("migrate"), from: z.string().min(1), confirm: z.literal(true), project_ids: z.array(z.string().min(1)).min(1).max(10000) }).strict(),
]);
export type LibrarySetup = z.infer<typeof librarySetupSchema>;

function currentLibrary(env: NodeJS.ProcessEnv) {
  const chosen = configuredLibraryDir(env);
  if (!chosen) throw new LibraryError("Choose or create a DreamCut Library first.", "NOT_A_LIBRARY");
  return readLibrary(chosen);
}

export function librarySetup(input: unknown, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const command = librarySetupSchema.parse(input);
  if (command.action === "create") {
    const library = createLibrary(path.resolve(command.dir ?? defaultLibraryDir()), "dreamcut-local-web");
    saveLibraryChoice(library.root);
    return { ...libraryStatus(env, cwd), created: library.root };
  }
  if (command.action === "use_existing") {
    const library = readLibrary(command.dir);
    // Saving a Library this version must not write would make every project path refuse to resolve.
    if (library.access !== "read-write") throw new LibraryError(`${library.reason} Update DreamCut before choosing it.`, "TOO_NEW");
    saveLibraryChoice(library.root);
    return { ...libraryStatus(env, cwd), using: library.root };
  }
  const library = currentLibrary(env);
  const plan = planProjectMigration(command.from, library);
  if (command.action === "plan_migration") {
    return { plan: { ...plan, total_bytes: plan.projects.reduce((sum, p) => sum + (p.action === "skip" ? 0 : p.bytes), 0) } };
  }
  // Exactly the confirmed projects: a project that appeared after the plan was shown is not moved.
  const confirmed = new Set(command.project_ids);
  const unknown = command.project_ids.filter(id => !plan.projects.some(p => p.id === id));
  if (unknown.length) throw new Error(`Not in the migration plan: ${unknown.join(", ")}. Plan again and confirm what it shows.`);
  const results = runProjectMigration({ ...plan, projects: plan.projects.filter(p => confirmed.has(p.id)) });
  return { results, status: libraryStatus(env, cwd) };
}
