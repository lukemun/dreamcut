import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceNotesSchema, readSourceNotes, writeSourceNotes } from "./source-notes";

test("notes preserve source ownership and reject stale edits", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"source-notes-"));
  const old=process.env.TIMELINE_PROJECTS_DIR; process.env.TIMELINE_PROJECTS_DIR=root;
  try {
    const dir=path.join(root,"fixture");fs.mkdirSync(dir);
    const source={schema_version:1,project_id:"fixture",assets:[{asset_id:"test-asset",original_filename:"synthetic.wav",source_sha256:"a".repeat(64),media_path:"sources/synthetic.wav",storage_mode:"managed_copy"}]};
    source.project_id="fixture";fs.writeFileSync(path.join(dir,"source-manifest.json"),JSON.stringify(source));
    const id=source.assets[0].asset_id;
    const base=readSourceNotes("fixture",id);
    const next=writeSourceNotes("fixture",id,0,{...base,title:"My recording",moments:[{id:"a",start:1,end:2,note:"First sound"}]});
    assert.equal(next.revision,1);assert.equal(readSourceNotes("fixture",id).moments[0].note,"First sound");
    assert.throws(()=>writeSourceNotes("fixture",id,0,base),/another window/);
    assert.throws(()=>readSourceNotes("fixture","missing"),/not found/);
    assert.equal(sourceNotesSchema.safeParse({...base,moments:[{id:"bad",start:2,end:1,note:""}]}).success,false);
    const undo=writeSourceNotes("fixture",id,1,base);assert.equal(undo.title,base.title);assert.equal(undo.revision,2);
  } finally {if(old===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=old;fs.rmSync(root,{recursive:true,force:true});}
});
