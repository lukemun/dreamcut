import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "./store";
import { listHistoryPage } from "./history-list";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-list-"));
process.env.TIMELINE_PROJECTS_DIR = root;
test("saved history pages skip before-snapshots and read bounded headers", () => {
 createProject("history", "web");
 const dir = path.join(root, "history", "history"); fs.mkdirSync(dir, {recursive:true});
 for (let i=0;i<45;i++) {
  const id=`2026-09-27T00-00-${String(i).padStart(2,"0")}-000-frame_tag_add`;
  const header = '{"op":"frame_tag_add","at":"2026-09-27T00:00:00Z","timeline":';
  // Deliberately invalid large tail: listing must not parse entire timeline bodies.
  fs.writeFileSync(path.join(dir,id+'.json'),header+'x'.repeat(70000));
  fs.writeFileSync(path.join(dir,id+'_before.json'),header+'{} }');
 }
 const first=listHistoryPage("history"); assert.equal(first.entries.length,40); assert.ok(first.next);
 assert.ok(first.entries.every(e=>e.label==='Add review mark' && e.kind==='Review mark'));
 const next=listHistoryPage("history",first.next!); assert.equal(next.entries.length,5); assert.equal(next.next,null);
 assert.ok(!next.entries.some(e=>first.entries.some(a=>a.id===e.id)));
});
test("proposal approvals show their editorial name without exposing timeline data", () => {
 createProject("named-history", "web");
 const dir = path.join(root,"named-history","history"); fs.mkdirSync(dir,{recursive:true});
 const proposals = path.join(root,"named-history","proposals"); fs.mkdirSync(proposals,{recursive:true});
 const proposalId = "20260927T030000-aabbccdd";
 fs.writeFileSync(path.join(proposals,proposalId+".json"),JSON.stringify({proposal:{summary:"Purple ending"}}));
 fs.writeFileSync(path.join(dir,"2026-09-27T03-00-00-000-editor_agent_workshop_applied.json"),JSON.stringify({op:"editor_agent_workshop_applied",at:"2026-09-27T03:00:00Z",proposal_ids:[proposalId],timeline:{elements:[{private_field:"not returned"}]}}));
 const page=listHistoryPage("named-history");
 assert.equal(page.entries[0]!.label,"Apply: Purple ending");
 assert.equal(JSON.stringify(page).includes("private_field"),false);
});
