import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { combineMaskPixels, enqueueCutout, executeCutoutJob, getCutout, normalizeCorrection, readCutoutJob, verifyCutout } from "./cutout-preparation";
import { appendCustomCutout, type CustomCutoutReceipt } from "../local-store/custom-cutouts";
import { run, sha256 } from "./custom-cutout";
import { prepareGridMatteBinding } from "./grid-matte-preparation";
import { sourceEvidence } from "./source-evidence";

test("bounded mask operations preserve other pixels and union never removes",()=>{
  const a=Buffer.from([255,0,70,90]),b=Buffer.from([0,255,0,255]);
  assert.deepEqual([...combineMaskPixels(a,b,2,2,"union",[0.5,0,1,1])],[255,255,70,255]);
  assert.deepEqual([...combineMaskPixels(a,b,2,2,"intersection",[0,0,0.5,1])],[0,0,0,90]);
  assert.deepEqual([...a],[255,0,70,90]);
});

test("correction lifecycle, verified cache reuse and evidence packaging",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"cutout-tools-"));
  const oldRoot=process.env.TIMELINE_PROJECTS_DIR,oldWorker=process.env.CUTOUT_WORKER_AUTOSTART,oldPreview=process.env.MEDIA_PREPARATION_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR=root;process.env.CUTOUT_WORKER_AUTOSTART="0";process.env.MEDIA_PREPARATION_AUTOSTART="0";
  try {
    const projectId="fixture",project=path.join(root,projectId),media=path.join(project,"media");fs.mkdirSync(path.join(media,"cutouts"),{recursive:true});
    const source=path.join(media,"source.mp4");
    await run("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=red:s=64x64:r=3:d=1","-c:v","libx264","-pix_fmt","yuv420p",source]);
    const hash=await sha256(source);
    async function parent(id:string,value:number):Promise<CustomCutoutReceipt> {
      const dir=path.join(project,"instruments/custom-cutouts",id,"masks");fs.mkdirSync(dir,{recursive:true});
      const masks=[];
      for(let i=0;i<3;i++) {const name=`${String(i).padStart(5,"0")}.png`;await sharp(Buffer.alloc(16,value),{raw:{width:4,height:4,channels:1}}).png().toFile(path.join(dir,name));masks.push({name,sha256:await sha256(path.join(dir,name))});}
      const r:CustomCutoutReceipt={cutout_id:id,recipe_id:"sam2-custom-cutout/v3",source_relative_path:"source.mp4",source_sha256:hash,source_interval_seconds:[0,1],prompt_seconds:0,prompt_frame:0,positive_points_normalized:[{x:0.5,y:0.5}],negative_points_normalized:[],output_relative_path:"source.mp4",output_duration_seconds:1,width:64,height:64,frame_rate:3,frame_count:3,alpha_mode:"1",evidence_directory:`instruments/custom-cutouts/${id}`,created_at:new Date().toISOString(),preparation:{cache_key:id,output_sha256:hash,masks,tracking_width:4,tracking_height:4,subject:"fixture"}};
      appendCustomCutout(projectId,r);return r;
    }
    const a=await parent("a",0),b=await parent("b",255);
    const input={parent_cutout_id:"a",other_cutout_id:"b",mode:"union",frame_start:1,frame_end:2,roi:[0.5,0,1,1]};
    assert.throws(()=>normalizeCorrection({...input,frame_end:4},a,b),/frame range/);
    assert.throws(()=>normalizeCorrection(input,a,{...b,frame_rate:30}),/clock/);
    assert.throws(()=>normalizeCorrection({...input,roi:[0,0,2,1]},a,b),/ROI/);
    const job=await enqueueCutout(projectId,input);
    const duplicate=await enqueueCutout(projectId,input);assert.equal(job.id,duplicate.id);assert.equal(duplicate.reused,true);
    await executeCutoutJob(projectId,job);
    const done=readCutoutJob(projectId,job.id);assert.equal(done.state,"completed",done.error);assert.equal(done.preview?.state,"preparing");
    await verifyCutout(projectId,done.receipt!);
    assert.equal(done.grid_matte_mask?.frame_count,3);
    const published=path.join(media,"grid-mattes",done.receipt!.cutout_id,"00001.png");
    assert.equal(await sha256(published),done.receipt!.preparation!.masks[1].sha256);
    fs.writeFileSync(published,"corrupt cache");
    prepareGridMatteBinding(projectId,done.receipt!);
    assert.equal(await sha256(published),done.receipt!.preparation!.masks[1].sha256);
    assert.throws(()=>prepareGridMatteBinding(projectId,{...done.receipt!,cutout_id:"../escape"}),/identifier/);
    const corrected=done.receipt!;assert.equal(corrected.preparation!.masks[0].sha256,a.preparation!.masks[0].sha256);assert.equal(corrected.preparation!.masks[2].sha256,a.preparation!.masks[2].sha256);
    const pixels=await sharp(path.join(project,corrected.evidence_directory,"masks/00001.png")).greyscale().raw().toBuffer();assert.deepEqual([...pixels],[0,0,255,255,0,0,255,255,0,0,255,255,0,0,255,255]);
    assert.deepEqual(getCutout(projectId,"a"),a);
    assert.equal((await enqueueCutout(projectId,input)).id,job.id);
    const evidence=await sourceEvidence(projectId,{source_relative_path:"source.mp4",times_seconds:[0,0.5]});assert.equal(evidence.image.type,"image");assert.ok(evidence.image.data.length>100);assert.equal(evidence.reused,false);
    assert.equal((await sourceEvidence(projectId,{source_relative_path:"source.mp4",times_seconds:[0,0.5]})).reused,true);
    await assert.rejects(()=>sourceEvidence(projectId,{source_relative_path:"../source.mp4",times_seconds:[0]}),/project media/);
    await assert.rejects(()=>sourceEvidence(projectId,{source_relative_path:"source.mp4",times_seconds:[1]}),/outside/);
    fs.appendFileSync(path.join(media,corrected.output_relative_path),"changed");await assert.rejects(()=>verifyCutout(projectId,corrected),/changed/);
    const replacement=await enqueueCutout(projectId,input);assert.notEqual(replacement.id,job.id);
    fs.appendFileSync(path.join(project,a.evidence_directory,"masks/00000.png"),"changed");await assert.rejects(()=>enqueueCutout(projectId,input),/changed/);
  } finally {
    for(const [key,value] of Object.entries({TIMELINE_PROJECTS_DIR:oldRoot,CUTOUT_WORKER_AUTOSTART:oldWorker,MEDIA_PREPARATION_AUTOSTART:oldPreview})) {if(value===undefined) delete process.env[key];else process.env[key]=value;}
    fs.rmSync(root,{recursive:true,force:true});
  }
});
