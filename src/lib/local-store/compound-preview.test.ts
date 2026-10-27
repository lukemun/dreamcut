import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { createProject, readTimeline, writeTimeline } from "./store";
import { projectMediaDir } from "./paths";
import {
  assertCompoundPreview,
  assertCompoundPreviewForTimeline,
  hydratePreparedCompoundPreviews,
  prepareCompoundPreview,
  savePreparedCompoundLink,
} from "./compound-preview";
import { buildCompositionElements } from "../render/composition-adapters";
import { projectCompoundPreviews } from "../timeline/compound-preview";
import type { TimelineElement } from "@/components/studio/timeline/types";

const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compound-preview-test-"));
process.env.TIMELINE_PROJECTS_DIR = fixtureRoot;
after(() => { fs.rmSync(fixtureRoot, { recursive: true, force: true });
  if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
});
for (const desktop of [false, true]) test(`prepared alpha compound preserves the timeline and rejects stale or forged receipts (${desktop ? "desktop" : "browser"})`, async (t) => {
  try { execFileSync("ffmpeg", ["-version"], {stdio:"ignore"}); } catch { t.skip("ffmpeg unavailable"); return; }
  let launches = 0;
  if (desktop) {
    const { createWorkerOwner } = createRequire(import.meta.url)("../../../desktop/owned-workers.mjs");
    const owner = createWorkerOwner();
    const key = Symbol.for("dreamcut.desktop.worker-owner");
    const host = process as NodeJS.Process & { [key: symbol]: unknown };
    const previous = host[key];
    host[key] = { spawn(...args: unknown[]) { launches++; return owner.spawn(...args); } };
    t.after(async () => {
      await owner.stop();
      if (previous === undefined) delete host[key]; else host[key] = previous;
      assert.ok(launches >= 6, "Both prepared compounds must use owned encoding and validation commands");
      assert.equal(owner.size, 0);
    });
  }
  const project = `compound-fixture-${desktop ? "desktop" : "browser"}`;
  createProject(project,"web");
  const source = path.join(projectMediaDir(project),"fixture.webm");
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=red@0.5:s=32x32:r=30,format=yuva420p","-frames:v","6","-c:v","libvpx-vp9","-auto-alt-ref","0",source]);
  const url = `/api/projects/${project}/media/fixture.webm`;
  const members = [0,1].map((i):TimelineElement=>({
    id:`11111111-1111-4111-8111-11111111111${i}`,project_id:project,type:"video_clip",source_url:url,
    props:{has_alpha:true,preview_source_url:url,speech_sync_binding:{fixture:true}},
    beat_id:null,character_id:null,timeline_start:i*.1,duration:.1,lane_key:"visual_0",lane_index:0,
    trim_start:0,trim_end:0,volume:0,fade_in:0,fade_out:0,playback_rate:1,position_locked:false,
    removed_at:null,removed_reason:null,created_at:"2026-09-17T00:00:00Z",updated_at:"2026-09-17T00:00:00Z",
  }));
  writeTimeline(project,{elements:members,transitions:[]},"fixture");
  const before = readTimeline(project);
  const receipt = await prepareCompoundPreview(project,members.map(e=>e.id));
  assert.equal(receipt.frame_count,6);
  assert.equal(receipt.duration,.2);
  assert.equal(receipt.width,32);
  assert.equal(receipt.height,32);
  assert.equal(receipt.proxy_profile,"presenter-alpha-640-edge-v1");
  assert.deepEqual(readTimeline(project),before);
  assertCompoundPreview(project,receipt);
  const grouped = before.elements.map(e=>({...e,props:{...e.props,compound_clip_id:receipt.id,compound_preview:receipt}}));
  assert.equal(projectCompoundPreviews(buildCompositionElements(grouped,new Set()),false).length,1);
  savePreparedCompoundLink(project, "20260918T120000-deadbeef", "presenter", receipt);
  const hydrated = hydratePreparedCompoundPreviews(project, before);
  assert.equal(hydrated.elements[0]?.props?.runtime_compound_clip_id, receipt.id);
  assert.deepEqual(hydrated.elements[1]?.props?.runtime_compound_preview, receipt);
  assert.equal(projectCompoundPreviews(buildCompositionElements(hydrated.elements,new Set()),false).length,1);
  const reframed = {
    ...before,
    elements: before.elements.map(element => ({
      ...element,
      props: {
        ...element.props,
        media_scale: .31,
        media_offset_x: .04,
        media_offset_y: -.22,
        semantic_layout: { schema_version: 1, slot: "lower_center", size: "supporting", frame_model: "canvas" },
      },
    })),
  };
  assert.doesNotThrow(() => assertCompoundPreviewForTimeline(project, receipt, reframed));
  const divergentFraming = {
    ...reframed,
    elements: reframed.elements.map((element, index) => index === 1
      ? { ...element, props: { ...element.props, media_offset_y: -.1 } }
      : element),
  };
  assert.throws(() => assertCompoundPreviewForTimeline(project, receipt, divergentFraming), /changed/);
  assert.throws(()=>assertCompoundPreview(project,{...receipt,duration:4}),/differs/);
  const retimed = {
    ...before,
    elements: before.elements.map((e, i) => ({
      ...e,
      timeline_start: i * 2 / 30,
      duration: 2 / 30,
      playback_rate: 1.5,
    })),
  };
  writeTimeline(project, retimed, "fixture");
  assert.throws(()=>assertCompoundPreview(project,receipt),/changed/);
  const retimedReceipt = await prepareCompoundPreview(project,members.map(e=>e.id));
  assert.equal(retimedReceipt.frame_count,4);
  assert.equal(retimedReceipt.duration,4/30);
  assertCompoundPreview(project,retimedReceipt);
  writeTimeline(project,{...retimed,elements:retimed.elements.map((e,i)=>i?{...e,volume:1}:e)},"fixture");
  await assert.rejects(prepareCompoundPreview(project,members.map(e=>e.id)),/silent/);
});
