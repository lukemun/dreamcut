import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProjectsDashboard } from "../../../app/ProjectsDashboard";

const timelineDir = path.resolve(process.cwd(), "src/components/studio/timeline");
const memoryPage = fs.readFileSync(path.join(timelineDir, "EditingMemory.tsx"), "utf8");
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
  // User and Guide moved from the project header into the dashboard sidebar; the project
  // /user and /guide routes redirect there with the project as context. The header's person button
  // (2026-10-13) links straight to the dashboard's User view, never the redirecting project route.
  assert.doesNotMatch(projectHeader, /\/user`|\/guide`/);
  const page = renderToStaticMarkup(createElement(AppRouterContext.Provider, {
    value: { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} },
  }, createElement(ProjectsDashboard, {
    projects: [], view: "user", projectId: "memory-navigation-test", attentionCount: 2,
  })));
  const memoryLink = page.match(/<a\b[^>]*href="\/\?view=user&amp;project=memory-navigation-test"[^>]*>[\s\S]*?User/);
  assert.ok(memoryLink, "the dashboard must render a labeled User link carrying this project");
  assert.match(memoryLink[0], /aria-current="page"/);
  assert.match(page, /aria-label="2 skill improvements to review">2<\/span>/);
  const navigation = page.match(/<nav[^>]*aria-label="Resources and preferences"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(navigation?.includes(memoryLink[0]), "User belongs inside the dashboard resources navigation");
  assert.doesNotMatch(page, /Project history|project-user-link|project-history-link/);
  assert.match(projectHeader, /activeView/);
  assert.match(memoryRoute, /redirect\(`/);
  assert.match(memoryRoute, /\/user/);
  assert.match(userRoute, /redirect\(`\/\?view=user&project=\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(homePage, /view === "user" && project && <EditingMemoryPage/);
  assert.doesNotMatch(memoryPage, /<SkillCatalog/);
});

test("the memory page keeps its sections as tabs and links history back to the editor", () => {
  assert.match(memoryPage, /role="tablist"/);
  assert.match(memoryPage, /role="tab"/);
  assert.match(memoryPage, /\?at=\$\{/);
  assert.match(memoryPage, /Open in editor at/);
  assert.match(memoryPage, /Skill improvement proposals/);
  assert.match(memoryPage, /Review and consolidate skills/);
  assert.match(memoryPage, /action: "skill_maintenance"/);
  assert.match(memoryPage, /Apply skill maintenance/);
  assert.match(memoryPage, /Approve and update skill/);
  assert.match(memoryPage, /decision: "reject"/);
  // The attention badge is computed server-side for the dashboard instead of polled by the header.
  assert.match(homePage, /attentionCount=\{project \? memoryAttentionCount\(project\.id\) : 0\}/);
});

test("the user area owns the skill directory and supports incremental demo projects", () => {
  // Guide is a dashboard sidebar link; the project route redirects and GuidePageContent renders the catalog.
  assert.match(dashboard, /href=\{`\/\?view=guide\$\{context\}`\}[^>]*>[\s\S]{0,40}Guide<\/Link>/);
  assert.match(guideRoute, /redirect\(`\/\?view=guide&project=/);
  assert.match(guidePageContent, /<GuideCatalog/);
  assert.match(homePage, /view === "guide" && project && <GuidePageContent/);
  assert.match(projectShell, /section === "library" \|\| section === "guide" \|\| section === "user"/);
  assert.match(projectShell, /activeView=\{activeView\}/);
  assert.match(skillCatalog, /skill.catalog.demo &&/);
  assert.doesNotMatch(skillCatalog, /Coming soon/);
  assert.match(skillCatalog, /skill.catalog.demo.project_id/);
  assert.match(guideCatalog, /useState<\(typeof sections\)\[number\]>\("overview"\)/);
  assert.match(guideCatalog, /<GuideOverview/);
  assert.match(guideOverview, /Turn an effect into a reusable skill/);
  assert.match(guideOverview, /celfstudies-food-reference-silent\.mp4/);
  assert.match(guideOverview, /pop-small-birds\.mp4/);
  assert.match(guideOverview, /partial recreation/);
  assert.match(guideOverview, /Read how to contribute an effect/);
  // The skills directory is labels and data only; no instructional prose.
  assert.match(userSkills, /No personal skills yet/);
  assert.match(userSkills, /Skill instructions/);
  assert.doesNotMatch(userSkills, /Turn a repeated workflow into a skill|Ask your assistant/);
  assert.doesNotMatch(guideCatalog, /<form|<input|<textarea/);
});
