import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { createRequire } from "node:module";
// The Node markup test has no CSS loader; preserve class names while testing the rendered navigation.
const require = createRequire(import.meta.url);
require.extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_target, key) => String(key) }); };
const { ProjectsDashboard } = require("../../../app/ProjectsDashboard") as typeof import("../../../app/ProjectsDashboard");

const timelineDir = path.resolve(process.cwd(), "src/components/studio/timeline");
const memoryPage = fs.readFileSync(path.join(timelineDir, "EditingMemory.tsx"), "utf8");
const projectHistory = fs.readFileSync(path.join(timelineDir, "ProjectHistory.tsx"), "utf8");
const timelineStep = fs.readFileSync(path.resolve(timelineDir, "../TimelineStep.tsx"), "utf8");
const projectHeader = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/ProjectVersionHeader.tsx"), "utf8");
const memoryRoute = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/memory/page.tsx"), "utf8");
const guideRoute = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/guide/page.tsx"), "utf8");
const userRoute = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/user/page.tsx"), "utf8");
const dashboard = fs.readFileSync(path.resolve(timelineDir, "../../../app/ProjectsDashboard.tsx"), "utf8");
const homePage = fs.readFileSync(path.resolve(timelineDir, "../../../app/page.tsx"), "utf8");
const guidePageContent = fs.readFileSync(path.join(timelineDir, "GuidePageContent.tsx"), "utf8");
const projectShell = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/ProjectShell.tsx"), "utf8");
const skillCatalog = fs.readFileSync(path.join(timelineDir, "SkillCatalog.tsx"), "utf8");
const guideCatalog = fs.readFileSync(path.join(timelineDir, "GuideCatalog.tsx"), "utf8");
const userSkills = fs.readFileSync(path.join(timelineDir, "UserSkills.tsx"), "utf8");
const guideOverview = fs.readFileSync(path.join(timelineDir, "GuideOverview.tsx"), "utf8");

test("editing memory is a project page rather than an editor drawer", () => {
  assert.doesNotMatch(memoryPage, /Dialog\./);
  assert.doesNotMatch(timelineStep, /<EditingMemory/);
  // Guide lives in the dashboard sidebar; the project /guide route redirects there. User is in both:
  // the dashboard sidebar, and the project header's section switcher (2026-10-24), whose /user route
  // renders inside the project so the header stays in place.
  assert.doesNotMatch(projectHeader, /\/guide`/);
  assert.match(projectHeader, /\["user", "User", `\/p\/\$\{currentProjectId\}\/user`/);
  const page = renderToStaticMarkup(createElement(AppRouterContext.Provider, {
    value: { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} },
  }, createElement(ProjectsDashboard, {
    projects: [], view: "user", projectId: "memory-navigation-test",
  })));
  const memoryLink = page.match(/<a\b[^>]*href="\/\?view=user&amp;project=memory-navigation-test"[^>]*>[\s\S]*?User/);
  assert.ok(memoryLink, "the dashboard must render a labeled User link carrying this project");
  assert.match(memoryLink[0], /aria-current="page"/);
  assert.doesNotMatch(page, /skill improvements to review/);
  const navigation = page.match(/<nav[^>]*aria-label="Resources and preferences"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(navigation?.includes(memoryLink[0]), "User belongs inside the dashboard resources navigation");
  assert.doesNotMatch(page, /Project history|project-user-link|project-history-link/);
  assert.match(projectHeader, /activeView/);
  assert.match(memoryRoute, /redirect\(`/);
  assert.match(memoryRoute, /\/user/);
  assert.doesNotMatch(userRoute, /redirect\(/);
  assert.match(userRoute, /<EditingMemoryPage projectId=\{projectId\}/);
  assert.match(homePage, /view === "user" && project && <EditingMemoryPage/);
  assert.doesNotMatch(memoryPage, /<SkillCatalog/);
});

test("the memory page keeps its sections as tabs and links history back to the editor", () => {
  assert.match(memoryPage, /role="tablist"/);
  assert.match(memoryPage, /role="tab"/);
  assert.match(memoryPage, /<ProjectHistory /);
  assert.match(projectHistory, /\?at=\$\{/);
  assert.match(projectHistory, />Go to \{clock/);
  // The editor does not learn: no skill proposals, maintenance or learning switches.
  assert.doesNotMatch(memoryPage, /skill_maintenance|skill_candidate|Learn from exports|auto_apply_preferences/);
  assert.doesNotMatch(homePage, /memoryAttentionCount/);
});

test("project history reads as a creator's feed, not the agent's record", () => {
  assert.match(projectHistory, /You asked/);
  assert.match(projectHistory, /waiting for your review/);
  // Record-keeping stays in the evidence and ledger download, never on this page.
  assert.doesNotMatch(projectHistory, /Correct wording|Add direction|provenance|JSON\.stringify|Reason:|skill improvement/i);
});

test("the user area owns the skill directory and supports incremental demo projects", () => {
  // Guide is a dashboard sidebar link; the project route redirects and GuidePageContent renders the catalog.
  assert.match(dashboard, /href=\{`\/\?view=guide\$\{context\}`\}[^>]*>[\s\S]{0,40}Guide<\/Link>/);
  assert.match(guideRoute, /redirect\(`\/\?view=guide&project=/);
  assert.match(guidePageContent, /<GuideCatalog/);
  // Guide opens without any project: its tour makes a practice project.
  assert.match(homePage, /view === "guide" && <GuidePageContent/);
  assert.match(projectShell, /section === "library" \|\| section === "guide" \|\| section === "user"/);
  assert.match(projectShell, /activeView=\{activeView\}/);
  assert.match(skillCatalog, /skill.catalog.demo &&/);
  assert.doesNotMatch(skillCatalog, /Coming soon/);
  assert.match(skillCatalog, /skill.catalog.demo.project_id/);
  assert.doesNotMatch(guideCatalog, /<GuideEffects/);
  assert.match(dashboard, /view=templates/);
  assert.match(guideCatalog, /<GuideOverview/);
  assert.match(guideOverview, /GUIDE_TOUR_CHAPTERS\.map/);
  assert.match(guideOverview, /CONTRIBUTING_URL/);
  // Third-party media without a licence never ships in the Guide.
  assert.doesNotMatch(guideOverview, /celfstudies|instagram\.com/);
  // The skills directory is labels and data only; no instructional prose.
  assert.match(userSkills, /No personal skills yet/);
  assert.match(userSkills, /Skill instructions/);
  assert.doesNotMatch(userSkills, /Turn a repeated workflow into a skill|Ask your assistant/);
  assert.doesNotMatch(guideCatalog, /<form|<input|<textarea/);
});
