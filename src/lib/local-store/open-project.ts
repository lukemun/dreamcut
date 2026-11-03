import { agentSelectionItems, readWorkspaceMediaSelection } from "./workspace-media-selection";
import fs from "node:fs";
import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { projectTimelinePath } from "./paths";
import { readProjectListMetadata } from "./project-list-metadata";
import { readWorkspaceTabs } from "./workspace-tabs";
import { listTemplateDrafts, resolveTemplateDraftMedia } from "./template-drafts";
import { waitingFirstBuild } from "./home-start";

/** The project the creator is looking at in the editor, kept in the profile so coding
 * agents can resolve "my footage" without the creator naming the project.
 * Each browser window reports what it shows; the last viewed project is never deleted. */
const settingsPath = () => path.join(profileDir(), "open-project.json");
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const WINDOW_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const OPEN_PROJECT_ROUTES = ["editor", "storyboard", "library", "generate", "history", "memory", "guide", "user"] as const;
export type OpenProjectRoute = (typeof OPEN_PROJECT_ROUTES)[number];
/** A view older than this no longer identifies the project the creator means. */
export const OPEN_PROJECT_FRESH_MS = 30 * 60 * 1000;
const WINDOW_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOWS = 12;
/** A visible window reports at least this often (the reporter's 5-minute heartbeat plus slack). */
export const SHOWING_MS = 6 * 60 * 1000;

/** `visible` false: the window was hidden or left at updated_at. Older records lack it and count as visible. */
type View = { project_id: string; route: OpenProjectRoute; updated_at: string; visible?: boolean };
type Stored = { schema_version: 1; last_viewed: View | null; windows: Record<string, View> };

const isView = (value: unknown): value is View => {
  const view = value as Partial<View> | null;
  return !!view && typeof view.project_id === "string" && PROJECT_ID.test(view.project_id)
    && OPEN_PROJECT_ROUTES.includes(view.route as OpenProjectRoute) && typeof view.updated_at === "string" && Number.isFinite(Date.parse(view.updated_at));
};

function readStored(): Stored {
  const value = readJsonFile<Partial<Stored> | null>(settingsPath(), null);
  const windows = Object.fromEntries(Object.entries(value?.windows ?? {}).filter(([id, view]) => WINDOW_ID.test(id) && isView(view)));
  return { schema_version: 1, last_viewed: isView(value?.last_viewed) ? value.last_viewed : null, windows };
}

/** Map an editor pathname (`/p/<id>`, `/p/<id>/storyboard`, ...) to its project and route. */
export function parseProjectPath(pathname: string): { project_id: string; route: OpenProjectRoute } | null {
  const match = pathname.match(/^\/p\/([^/?#]+)(?:\/([^/?#]+))?\/?$/);
  if (!match) return null;
  let id: string;
  try { id = decodeURIComponent(match[1]); } catch { return null; }
  const route = (match[2] ?? "editor") as OpenProjectRoute;
  return PROJECT_ID.test(id) && OPEN_PROJECT_ROUTES.includes(route) ? { project_id: id, route } : null;
}

/** Record what one window shows. `pathname: null` (or a page without a project) clears
 * that window only; the last viewed project and its time stay. */
export function recordOpenProject(input: unknown, now = new Date()): { recorded: boolean } {
  const body = (input && typeof input === "object" ? input : {}) as { window_id?: unknown; pathname?: unknown; visible?: unknown };
  if (typeof body.window_id !== "string" || !WINDOW_ID.test(body.window_id)) throw new Error("window_id must be 8–64 letters, digits, _ or -");
  if (body.pathname !== null && typeof body.pathname !== "string") throw new Error("pathname must be a string or null");
  const parsed = typeof body.pathname === "string" ? parseProjectPath(body.pathname) : null;
  if (parsed && !fs.existsSync(projectTimelinePath(parsed.project_id))) throw new Error(`Unknown project: ${parsed.project_id}`);
  const stored = readStored();
  const cutoff = now.getTime() - WINDOW_RETENTION_MS;
  const windows = Object.entries(stored.windows).filter(([id, view]) => id !== body.window_id && Date.parse(view.updated_at) >= cutoff);
  const view = parsed ? { ...parsed, updated_at: now.toISOString(), ...(body.visible === false ? { visible: false } : {}) } : null;
  if (view) windows.push([body.window_id, view]);
  windows.sort((a, b) => Date.parse(b[1].updated_at) - Date.parse(a[1].updated_at));
  writeJsonFileAtomic(settingsPath(), { schema_version: 1, last_viewed: view ?? stored.last_viewed, windows: Object.fromEntries(windows.slice(0, MAX_WINDOWS)) });
  return { recorded: !!view };
}

const describe = (view: View, now: number) => ({
  project_id: view.project_id,
  title: readProjectListMetadata(view.project_id).title,
  route: view.route,
  updated_at: view.updated_at,
  age_seconds: Math.max(0, Math.round((now - Date.parse(view.updated_at)) / 1000)),
});

/** What coding agents read: the project to assume, whether it is safe to assume it, and
 * the open project tabs. Read-only. */
function openProjectSelection(projectId: string) {
  try {
    const { sources, selected_at } = readWorkspaceMediaSelection(projectId);
    return { items: agentSelectionItems(projectId), library_sources: sources, selected_at: selected_at || null };
  } catch { return null; }
}

/** Whether a window is showing the project to the creator right now, so an agent knows to open it. */
function projectShown(windows: View[], projectId: string, at: number) {
  const views = windows.filter(view => view.project_id === projectId);
  const latest = views.map(view => Date.parse(view.updated_at)).sort((a, b) => b - a)[0];
  return {
    project_id: projectId,
    showing: views.some(view => view.visible !== false && at - Date.parse(view.updated_at) <= SHOWING_MS),
    last_seen_seconds: latest === undefined ? null : Math.max(0, Math.round((at - latest) / 1000)),
  };
}

function requestedTemplateDrafts() {
  try {
    return listTemplateDrafts().filter(draft => draft.stage === "requested").map(draft => ({
      draft_id: draft.id, title: draft.title, what_to_copy: draft.note || null, mark: draft.mark ?? null,
      reference_file: resolveTemplateDraftMedia(draft.id)?.file ?? null, requested_at: draft.requested_at,
      review_url: `/templates/drafts/${draft.id}`,
    }));
  } catch { return []; }
}

export function readEditorContext(now = new Date(), projectId?: string) {
  const stored = readStored();
  const at = now.getTime();
  const fresh = (view: View) => at - Date.parse(view.updated_at) <= OPEN_PROJECT_FRESH_MS;
  const exists = (view: View) => fs.existsSync(projectTimelinePath(view.project_id));
  const windows = Object.values(stored.windows).filter(view => fresh(view) && exists(view));
  const last = stored.last_viewed && exists(stored.last_viewed) ? stored.last_viewed : null;
  const others = [...new Set(windows.map(view => view.project_id))].filter(id => id !== last?.project_id);
  const status = !last ? "none" : !fresh(last) ? "stale" : others.length ? "ambiguous" : "current";
  return {
    status,
    open_project: last ? describe(last, at) : null,
    // What the creator has selected (clips, Library media, looks, layouts, sounds): in the project
    // the agent names when it names one, otherwise in the project open in the editor.
    selection: projectId && fs.existsSync(projectTimelinePath(projectId)) ? openProjectSelection(projectId)
      : last ? openProjectSelection(last.project_id) : null,
    other_open_windows: others.map(id => describe(windows.find(view => view.project_id === id)!, at)),
    open_tabs: readWorkspaceTabs().filter(id => fs.existsSync(projectTimelinePath(id))).map(id => ({ project_id: id, title: readProjectListMetadata(id).title })),
    fresh_minutes: OPEN_PROJECT_FRESH_MS / 60000,
    // Videos the creator dropped on the home page and asked an agent to recreate as their template.
    template_drafts: requestedTemplateDrafts(),
    // A project started from Home whose brief waits for its first cut ("go", "start on it").
    first_build: (() => { const id = projectId ?? last?.project_id; return id ? waitingFirstBuild(id) : null; })(),
    ...(projectId ? { project_shown: projectShown(Object.values(stored.windows), projectId, at) } : {}),
    guidance: status === "current"
      ? "Use open_project when the request does not name a project."
      : status === "ambiguous"
        ? "Several projects are open in recent editor windows; ask which one."
        : status === "stale"
          ? "The last viewed project is older than fresh_minutes; ask which project."
          : "No project has been viewed in the editor; ask which project.",
  };
}
