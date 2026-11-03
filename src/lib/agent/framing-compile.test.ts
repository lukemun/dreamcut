import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {compileFraming} from "./framing-compile";
import {resolveNumberKeyframe} from "../timeline/keyframes";

test("a timed framing glides between regions instead of holding and snapping", async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"framing-compile-")),old=process.env.TIMELINE_PROJECTS_DIR;
 process.env.TIMELINE_PROJECTS_DIR=root;
 try{
  const project="fixture",dir=path.join(root,project),id=randomUUID();fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"metadata.json"),JSON.stringify({output_aspect_ratio:"16:9",delivery_target:"web"}));
  fs.writeFileSync(path.join(dir,"timeline.json"),JSON.stringify({schema_version:1,transitions:[],elements:[{id,type:"video_clip",source_url:`/api/projects/${project}/media/s.mp4`,timeline_start:0,duration:10,trim_start:0,trim_end:0,playback_rate:1,props:{source_width:1920,source_height:1080},removed_at:null}]}));
  const whole={x:0,y:0,width:1,height:1},corner={x:0.5,y:0,width:0.5,height:0.5};
  const out=await compileFraming(project,{element_id:id,regions:[{t:0,...whole},{t:2,...whole,ease:"hold"},{t:4,...corner},{t:7,...corner,ease:"hold"},{t:9,...whole}]});
  const keys=(out.props as {transition_keyframes:{media_scale:{t:number;v:number;ease?:string}[]}}).transition_keyframes.media_scale;
  // Each key's ease shapes the move to the next key: the moves out of 2 s and 7 s ease, the holds before them stay put.
  assert.deepEqual(keys.map(key=>key.ease),["hold","easeInOut","hold","easeInOut",undefined]);
  const props={keyframes:{media_scale:keys}},at=(t:number)=>resolveNumberKeyframe(props,"media_scale",t,1);
  const [start,zoom]=[keys[0]!.v,keys[2]!.v];
  assert.equal(at(1),start);
  assert.ok(at(3)>start&&at(3)<zoom,"mid push-in sits between the two framings");
  assert.equal(at(5.5),zoom);
  assert.ok(at(8)<zoom&&at(8)>start,"mid pull-back sits between the two framings");
 }finally{if(old===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=old;fs.rmSync(root,{recursive:true,force:true});}
});
