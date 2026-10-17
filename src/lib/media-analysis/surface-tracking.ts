import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { z } from "zod";
import { projectInstrumentsDir } from "../local-store/paths";
import { readTimeline, findElement } from "../local-store/store";
import { writeJsonFileAtomic, readJsonFile } from "../local-store/atomic-json";
import { cutoutMediaPath } from "./cutout-preparation";
import { sha256 } from "./custom-cutout";
import { surfaceQuadSchema, surfaceTrackSchema, type SurfaceTrack } from "../timeline/surface-track";
import { readEnv } from "@/lib/env-name";
import { requireMattingPython } from "./matting-runtime";

export const surfaceTrackingRequestSchema=z.object({parentId:z.string().min(1),start:z.number().finite().min(0),end:z.number().finite().positive(),
  reference:z.number().finite().min(0),quad:surfaceQuadSchema,retry:z.boolean().optional()}).strict().refine(r=>r.end>r.start&&r.end-r.start<=15&&r.reference>=r.start&&r.reference<=r.end,"Choose a visible range of at most 15 seconds containing the reference frame");
type Job={id:string;state:"running"|"completed"|"failed";createdAt:string;error?:string;track?:SurfaceTrack};
const jobs=new Map<string,Promise<void>>();
const fileFor=(projectId:string,id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error("Invalid tracking job");return path.join(projectInstrumentsDir(projectId),"surface-tracks",`${id}.json`);};
export function readSurfaceTrackingJob(projectId:string,id:string):Job {
  const job=readJsonFile<Job|null>(fileFor(projectId,id),null);if(!job)throw Error("Tracking job not found");
  if(job.state==="running"&&!jobs.has(`${projectId}:${id}`))return {...job,state:"failed",error:"Tracking interrupted. Retry to prepare again."};
  return job;
}
export async function prepareSurfaceTracking(projectId:string,raw:unknown) {
  const input=surfaceTrackingRequestSchema.parse(raw),parent=findElement(readTimeline(projectId),input.parentId);
  const prefix=`/api/projects/${projectId}/media/`;
  if(!parent||parent.removed_at||parent.type!=="video_clip"||!parent.source_url?.startsWith(prefix))throw Error("Choose a local project video");
  const file=cutoutMediaPath(projectId,decodeURIComponent(parent.source_url.slice(prefix.length)));
  const hash=await sha256(file),script=path.resolve("scripts/track-surface.py");
  const configured=readEnv("TRACKING_PYTHON");
  if(configured&&!fs.existsSync(configured))throw Error("DREAMCUT_TRACKING_PYTHON does not exist. Existing attachments can still be corrected manually.");
  const python=configured??requireMattingPython();
  let runtime:string;
  try{runtime=execFileSync(python,["-c","import cv2,numpy; print(cv2.__version__,numpy.__version__)"],{encoding:"utf8",timeout:10000,stdio:["ignore","pipe","pipe"]}).trim();}
  catch{throw Error(`Surface tracking requires OpenCV (cv2) in ${python}. Existing attachments can still be corrected manually.`);}
  const id=createHash("sha256").update(JSON.stringify({...input,retry:undefined,source:hash,worker:await sha256(script),python,runtime})).digest("hex");
  const output=fileFor(projectId,id),key=`${projectId}:${id}`,old=readJsonFile<Job|null>(output,null);
  if(old&&(old.state==="completed"||jobs.has(key)))return old;
  if(old&&!input.retry)return readSurfaceTrackingJob(projectId,id);
  const job:Job={id,state:"running",createdAt:new Date().toISOString()};writeJsonFileAtomic(output,job);
  const promise=new Promise<void>(resolve=>{
    const child=spawn(python,[script],{stdio:["pipe","pipe","pipe"]});let stdout="",stderr="";
    const timer=setTimeout(()=>child.kill("SIGKILL"),60000);
    const fail=(message:string)=>{writeJsonFileAtomic(output,{...job,state:"failed",error:message});};
    child.stdout.on("data",d=>{stdout+=d;if(stdout.length>4_000_000)child.kill("SIGKILL");});child.stderr.on("data",d=>{stderr=(stderr+d).slice(-4000);});
    child.on("error",e=>{clearTimeout(timer);fail(e.message);resolve();});
    child.on("close",async code=>{clearTimeout(timer);try {
      if(code!==0)throw Error(stderr||"Tracking timed out or was interrupted");
      if(await sha256(file)!==hash)throw Error("Source changed during tracking");
      const result=JSON.parse(stdout);
      const track=surfaceTrackSchema.parse({version:1,id,parentId:parent.id,sourceUrl:parent.source_url,sourceSha256:hash,
        width:result.width,height:result.height,referenceTime:input.reference,samples:result.samples,visibleFrom:input.start,visibleTo:input.end});
      writeJsonFileAtomic(output,{...job,state:"completed",track});
    }catch(e){fail(e instanceof Error?e.message:String(e));}finally{resolve();}});
    child.stdin.end(JSON.stringify({...input,file}));
  }).finally(()=>jobs.delete(key));jobs.set(key,promise);
  return job;
}
