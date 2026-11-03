import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseProjectPath, readEditorContext, recordOpenProject } from "./open-project";
import { writeWorkspaceTabs } from "./workspace-tabs";
import { POST } from "@/app/api/editor-context/route";

function withProfile(run: (projects: string, profile: string) => void) {
  const saved = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-project-"));
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  for (const [id, title] of [["city-walk", "City walk"], ["demo", "Demo"]]) {
    fs.mkdirSync(path.join(root, "projects", id), { recursive: true });
    fs.writeFileSync(path.join(root, "projects", id, "timeline.json"), "{}");
    fs.writeFileSync(path.join(root, "projects", id, "metadata.json"), JSON.stringify({ title }));
  }
  try { run(path.join(root, "projects"), process.env.DREAMCUT_PROFILE_DIR); } finally {
    for (const [key, value] of [["DREAMCUT_PROFILE_DIR", saved.profile], ["TIMELINE_PROJECTS_DIR", saved.projects]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 12, minutes));

test("editor paths map to a project and route; other pages do not", () => {
  assert.deepEqual(parseProjectPath("/p/city-walk"), { project_id: "city-walk", route: "editor" });
  assert.deepEqual(parseProjectPath("/p/city-walk/storyboard"), { project_id: "city-walk", route: "storyboard" });
  assert.deepEqual(parseProjectPath("/p/demo/library/"), { project_id: "demo", route: "library" });
  for (const other of ["/", "/ui-lab", "/p/../x", "/p/demo/unknown", "/p/demo/library/extra"]) assert.equal(parseProjectPath(other), null, other);
});

test("the viewed project is current, then stale, and survives leaving the project", () => {
  withProfile((_projects, profile) => {
    assert.equal(readEditorContext(at(0)).status, "none");
    recordOpenProject({ window_id: "window-one", pathname: "/p/city-walk/storyboard" }, at(0));
    writeWorkspaceTabs({ open: ["city-walk", "demo", "missing"] });
    const current = readEditorContext(at(5));
    assert.equal(current.status, "current");
    assert.deepEqual(current.open_project, { project_id: "city-walk", title: "City walk", route: "storyboard", updated_at: at(0).toISOString(), age_seconds: 300 });
    assert.deepEqual(current.open_tabs, [{ project_id: "city-walk", title: "City walk" }, { project_id: "demo", title: "Demo" }]);
    // Going to the Library home clears the window but keeps the last viewed project.
    recordOpenProject({ window_id: "window-one", pathname: "/" }, at(6));
    assert.equal(readEditorContext(at(10)).open_project?.project_id, "city-walk");
    assert.equal(readEditorContext(at(31)).status, "stale");
    assert.ok(fs.existsSync(path.join(profile, "open-project.json")));
  });
});

test("another recent window showing a different project makes the context ambiguous", () => {
  withProfile(() => {
    recordOpenProject({ window_id: "window-one", pathname: "/p/demo" }, at(0));
    recordOpenProject({ window_id: "window-two", pathname: "/p/city-walk" }, at(2));
    const context = readEditorContext(at(3));
    assert.equal(context.status, "ambiguous");
    assert.equal(context.open_project?.project_id, "city-walk");
    assert.deepEqual(context.other_open_windows.map(view => view.project_id), ["demo"]);
    // Navigating within one window replaces what it shows; closing it removes it.
    recordOpenProject({ window_id: "window-one", pathname: "/p/city-walk/library" }, at(4));
    assert.equal(readEditorContext(at(5)).status, "current");
    recordOpenProject({ window_id: "window-two", pathname: null }, at(6));
    assert.equal(readEditorContext(at(7)).open_project?.route, "library");
  });
});

test("recording rejects unknown projects and malformed windows", () => {
  withProfile(() => {
    assert.throws(() => recordOpenProject({ window_id: "window-one", pathname: "/p/not-a-project" }), /Unknown project/);
    assert.throws(() => recordOpenProject({ window_id: "x", pathname: "/p/demo" }), /window_id/);
    assert.throws(() => recordOpenProject({ window_id: "window-one", pathname: 3 }), /pathname/);
  });
});

test("only a same-origin editor page can record the open project", async () => {
  const saved = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-project-route-"));
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  fs.mkdirSync(path.join(root, "projects", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "projects", "demo", "timeline.json"), "{}");
  const post = (headers: Record<string, string>) => POST(new Request("http://127.0.0.1:3123/api/editor-context", {
    method: "POST", headers: { host: "127.0.0.1:3123", ...headers }, body: JSON.stringify({ window_id: "window-one", pathname: "/p/demo" }),
  }));
  try {
    assert.equal((await post({ origin: "https://example.com", "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await post({ origin: "https://example.com" })).status, 403);
    assert.equal((await post({})).status, 403);
    assert.equal(readEditorContext().status, "none");
    assert.equal((await post({ origin: "http://127.0.0.1:3123", "sec-fetch-site": "same-origin" })).status, 200);
    assert.equal(readEditorContext().open_project?.project_id, "demo");
  } finally {
    for (const [key, value] of [["DREAMCUT_PROFILE_DIR", saved.profile], ["TIMELINE_PROJECTS_DIR", saved.projects]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("project_shown says whether a visible window shows the project now, so the agent knows to open it", () => {
  withProfile(() => {
    assert.equal(readEditorContext(at(0)).project_shown, undefined, "only answered for a named project");
    assert.deepEqual(readEditorContext(at(0), "demo").project_shown, { project_id: "demo", showing: false, last_seen_seconds: null });
    recordOpenProject({ window_id: "window-one", pathname: "/p/demo/library", visible: true }, at(0));
    assert.equal(readEditorContext(at(5), "demo").project_shown?.showing, true);
    assert.equal(readEditorContext(at(5), "city-walk").project_shown?.showing, false, "another project is not showing");
    assert.equal(readEditorContext(at(7), "demo").project_shown?.showing, false, "no heartbeat for longer than SHOWING_MS");
    recordOpenProject({ window_id: "window-one", pathname: "/p/demo/library", visible: false }, at(8));
    const hidden = readEditorContext(at(8), "demo");
    assert.equal(hidden.project_shown?.showing, false, "a just-hidden window is not showing");
    assert.equal(hidden.status, "current", "hiding still counts as recently viewed for picking the project");
    recordOpenProject({ window_id: "window-two", pathname: "/p/demo" }, at(9));
    assert.deepEqual(readEditorContext(at(9), "demo").project_shown, { project_id: "demo", showing: true, last_seen_seconds: 0 });
  });
});

test("a named project reports its own selection, not the other window's", () => {
  withProfile((projects) => {
    recordOpenProject({ window_id: "window-one", pathname: "/p/demo" }, at(0));
    recordOpenProject({ window_id: "window-two", pathname: "/p/city-walk" }, at(1));
    fs.writeFileSync(path.join(projects, "demo", "workspace-selection.json"), JSON.stringify({ source: null, sources: [], selected_at: at(0).toISOString(),
      items: [{ id: "caption-look:bold_outline", group: "caption-looks", kind: "Caption look", label: "Bold Outline", agent_text: "Caption look \"Bold Outline\"" }] }));
    assert.deepEqual(readEditorContext(at(2), "demo").selection?.items.map((item) => item.label), ["Bold Outline"]);
    assert.equal(readEditorContext(at(2)).open_project?.project_id, "city-walk");
  });
});
