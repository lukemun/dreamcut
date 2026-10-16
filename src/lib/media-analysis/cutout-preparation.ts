import { prepareGridMatteBinding } from "./grid-matte-preparation";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnBackgroundWorker as spawn } from "../local-store/background-worker";
import sharp from "sharp";
import { projectDir, projectMediaDir, projectInstrumentsDir } from "../local-store/paths";
import { readJsonFile, writeJsonFileAtomic } from "../local-store/atomic-json";
import { appendCustomCutout, readCustomCutouts, type CustomCutoutReceipt } from "../local-store/custom-cutouts";
import { enqueueMediaPreparation, readPreparation } from "../local-store/media-preparation";
import { buildCustomCutoutEncodeArgs, createCustomCutout, normalizeCustomCutoutRequest, run, sha256 } from "./custom-cutout";

export type Correction = { parent_cutout_id: string; other_cutout_id: string; mode: "union" | "intersection"; frame_start: number; frame_end: number; roi: [number, number, number, number] };
export type CutoutJob = {
  id: string; key: string; state: "queued" | "running" | "completed" | "failed";
  created_at: string; updated_at: string; input: Record<string, unknown>; source_sha256: string;
  runtime?: string; receipt_id?: string; error?: string; pid?: number;
};
export const cutoutJobsDir = (projectId: string) => path.join(projectInstrumentsDir(projectId), "cutout-jobs");
const jobPath = (projectId: string, id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid cutout job id");
  return path.join(cutoutJobsDir(projectId), `${id}.json`);
};
export function cutoutMediaPath(projectId: string, relative: string) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Expected project media path");
  const root = fs.realpathSync(projectMediaDir(projectId));
  // Paths are relative to the media folder; a project-relative "media/…" path names the same file.
  const candidates = [relative, ...(/^media[\\/]/.test(relative) ? [relative.slice(6)] : [])];
  for (const candidate of candidates) {
    let file: string;
    try { file = fs.realpathSync(path.join(root, candidate)); } catch { continue; }
    if (file.startsWith(root + path.sep) && fs.statSync(file).isFile()) return file;
  }
  // Never echo the local folder layout back to the agent.
  throw new Error(`No media file at ${JSON.stringify(relative)}; use a path relative to the project's media folder`);
}
export function cutoutMasksPath(projectId: string, receipt: CustomCutoutReceipt) {
  const root = fs.realpathSync(projectInstrumentsDir(projectId));
  const file = fs.realpathSync(path.join(projectDir(projectId), receipt.evidence_directory, "masks"));
  if (!file.startsWith(root + path.sep)) throw new Error("Mask evidence must be inside project instruments");
  return file;
}
export function getCutout(projectId: string, id: unknown) {
  const receipt = readCustomCutouts(projectId).cutouts.find(r => r.cutout_id === id);
  if (!receipt) throw new Error("Unknown cutout receipt");
  return receipt;
}
export async function verifyCutout(projectId: string, receipt: CustomCutoutReceipt) {
  const prep = receipt.preparation;
  if (receipt.scratchpad_treatment) throw new Error("Correct the untreated cutout before applying Scratchpad");
  if (!prep) throw new Error("Legacy cutout has no verified mask manifest; prepare through cutout_prepare first");
  if (await sha256(cutoutMediaPath(projectId, receipt.source_relative_path)) !== receipt.source_sha256 ||
      await sha256(cutoutMediaPath(projectId, receipt.output_relative_path)) !== prep.output_sha256) throw new Error("Cutout source or output changed");
  const masks = cutoutMasksPath(projectId, receipt);
  if (prep.masks.length !== receipt.frame_count) throw new Error("Incomplete mask manifest");
  for (let i = 0; i < prep.masks.length; i++) {
    const item = prep.masks[i];
    if (item.name !== `${String(i).padStart(5, "0")}.png` || await sha256(path.join(masks, item.name)) !== item.sha256) throw new Error("Mask evidence changed or missing");
  }
}
export function normalizeCorrection(raw: Record<string, unknown>, parent: CustomCutoutReceipt, other: CustomCutoutReceipt): Correction {
  if (!["union", "intersection"].includes(String(raw.mode))) throw new Error("Correction mode must be union or intersection");
  if (parent.source_sha256 !== other.source_sha256 || JSON.stringify(parent.source_interval_seconds) !== JSON.stringify(other.source_interval_seconds) ||
      parent.frame_rate !== other.frame_rate || parent.frame_count !== other.frame_count || parent.width !== other.width || parent.height !== other.height ||
      parent.preparation?.tracking_width !== other.preparation?.tracking_width || parent.preparation?.tracking_height !== other.preparation?.tracking_height) throw new Error("Correction masks must have identical source, clock and geometry");
  const start = raw.frame_start, end = raw.frame_end, roi = raw.roi;
  if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > parent.frame_count) throw new Error("Correction needs a half-open frame range inside the parent");
  if (!Array.isArray(roi) || roi.length !== 4 || roi.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) || roi[2] <= roi[0] || roi[3] <= roi[1]) throw new Error("ROI must be normalized [left,top,right,bottom]");
  return { parent_cutout_id: parent.cutout_id, other_cutout_id: other.cutout_id, mode: raw.mode as Correction["mode"], frame_start: start as number, frame_end: end as number, roi: roi as Correction["roi"] };
}
export function combineMaskPixels(parent: Buffer, other: Buffer, width: number, height: number, mode: Correction["mode"], roi: Correction["roi"]) {
  if (parent.length !== width * height || other.length !== parent.length) throw new Error("Mask dimensions differ");
  const result = Buffer.from(parent);
  const [l,t,r,b] = [Math.floor(roi[0]*width),Math.floor(roi[1]*height),Math.ceil(roi[2]*width),Math.ceil(roi[3]*height)];
  for (let y=t;y<b;y++) for (let x=l;x<r;x++) { const i=y*width+x; result[i]=mode === "union" ? Math.max(parent[i],other[i]) : Math.min(parent[i],other[i]); }
  return result;
}
async function runtimeFingerprint() {
  const root = path.resolve(process.env.TIMELINE_MATTING_DIR ?? ".matting");
  if (!fs.existsSync(path.join(root, "sam2.1_hiera_small.pt")) || !fs.existsSync(path.join(root, "venv"))) {
    throw Object.assign(new Error("Subject tracing is not installed. It is a one-time download of about 1 GB: ask the creator, then call cutout_setup with action install, wait until its status is ready, and retry."), { code: "MATTING_NOT_INSTALLED" });
  }
  // Model and implementation changes invalidate reuse. Missing runtimes fail explicitly.
  // The worker scripts are tracked under scripts/matting; the model stays in the local environment.
  const hashes = await Promise.all([
    path.resolve("scripts/matting/hand_cutout.py"), path.resolve("scripts/matting/mask_postprocess.py"), path.join(root, "sam2.1_hiera_small.pt"),
  ].map(sha256));
  const version = await run(path.join(root, process.platform === "win32" ? "venv/Scripts/python.exe" : "venv/bin/python"), ["-c", "import importlib.metadata as m,json; print(json.dumps({p:m.version(p) for p in ['torch','sam2','numpy','Pillow','scipy']},sort_keys=True))"]);
  return createHash("sha256").update(JSON.stringify([hashes,version.stdout,await sha256(path.resolve("scripts/run-sam2-cutout.mjs"))])).digest("hex");
}
const saveJob = (projectId: string, job: CutoutJob) => writeJsonFileAtomic(jobPath(projectId,job.id), {...job, updated_at:new Date().toISOString()});
export function readCutoutJob(projectId: string, id: string) {
  const job = readJsonFile<CutoutJob | null>(jobPath(projectId,id),null);
  if (!job) throw new Error("Unknown cutout job");
  if (job.state === "running" && job.pid) {
    try { process.kill(job.pid,0); } catch { job.state="failed"; job.error="Worker interrupted; resubmit with retry=true"; saveJob(projectId,job); }
  }
  const receipt = job.receipt_id ? getCutout(projectId,job.receipt_id) : undefined;
  return {...job, receipt, grid_matte_mask: receipt?.preparation ? prepareGridMatteBinding(projectId,receipt) : null, preview:receipt ? readPreparation(projectId,receipt.output_relative_path) : null, visual_verification:"not_performed"};
}
export function startCutoutWorker(projectId: string) {
  if (process.env.CUTOUT_WORKER_AUTOSTART === "0") return;
  fs.mkdirSync(cutoutJobsDir(projectId),{recursive:true});
  const log = fs.openSync(path.join(cutoutJobsDir(projectId),"worker.log"),"a");
  try {
    const child=spawn(process.execPath,["--import","tsx",path.resolve("scripts/prepare-cutouts.ts"),projectId],{detached:true,stdio:["ignore",log,log],env:process.env});
    child.on("error", error=>console.error("Cutout worker failed to start",error)); child.unref();
  } finally { fs.closeSync(log); }
}
export async function enqueueCutout(projectId: string, raw: Record<string, unknown>) {
  let source: string, normalized: Record<string, unknown>, runtime: string | undefined;
  if (raw.mode === "union" || raw.mode === "intersection") {
    const parent=getCutout(projectId,raw.parent_cutout_id),other=getCutout(projectId,raw.other_cutout_id);
    await verifyCutout(projectId,parent); await verifyCutout(projectId,other);
    const correction=normalizeCorrection(raw,parent,other);
    source=parent.source_relative_path;
    normalized={...correction, parent_fingerprint:parent.preparation,other_fingerprint:other.preparation};
  } else {
    if (raw.mode !== undefined && raw.mode !== "reprompt") throw new Error("Unknown cutout mode");
    const request=normalizeCustomCutoutRequest(raw);
    source=request.sourceRelativePath;
    if (!/\.(mp4|mov|webm|m4v)$/i.test(source)) throw new Error("Cutout requires video");
    if (typeof raw.subject !== "string" || !raw.subject.trim() || raw.subject.length>500) throw new Error("Describe included subject parts in subject (1–500 characters)");
    normalized={request,subject:raw.subject.trim()};
    if (raw.parent_cutout_id) {
      const parent=getCutout(projectId,raw.parent_cutout_id); await verifyCutout(projectId,parent);
      if (source!==parent.source_relative_path || request.startSeconds!==parent.source_interval_seconds[0] || request.endSeconds!==parent.source_interval_seconds[1]) throw new Error("Re-prompt must preserve parent source window");
      normalized.parent_cutout_id=parent.cutout_id;
    } else if (raw.mode === "reprompt") throw new Error("Re-prompt requires parent_cutout_id");
    runtime=await runtimeFingerprint();
  }
  const sourceHash=await sha256(cutoutMediaPath(projectId,source));
  if (normalized.parent_cutout_id && getCutout(projectId,normalized.parent_cutout_id).source_sha256!==sourceHash) throw new Error("Parent source changed during enqueue");
  // v2: v1 cutouts of rotated phone footage carry a stale display matrix (sam2-custom-cutout/v5).
  const key=createHash("sha256").update(JSON.stringify(["cutout-preparation/v2",sourceHash,normalized,runtime])).digest("hex");
  fs.mkdirSync(cutoutJobsDir(projectId),{recursive:true});
  // Cross-process admission lock closes the duplicate-request race after hashing.
  const lock=path.join(cutoutJobsDir(projectId),"admission.lock");
  const release = acquireCutoutLock(lock);
  if (!release) throw new Error("Cutout queue busy; retry shortly");
  try {
    const candidates=fs.readdirSync(cutoutJobsDir(projectId)).filter(f=>f.endsWith(".json"))
      .map(filename=>readJsonFile<CutoutJob | null>(path.join(cutoutJobsDir(projectId),filename),null))
      .filter((job): job is CutoutJob => !!job && job.key===key)
      .sort((a,b)=>b.created_at.localeCompare(a.created_at) || Number(a.state==="failed")-Number(b.state==="failed"));
    for (const job of candidates) {
      const state=readCutoutJob(projectId,job.id);
      if (state.state==="completed" && state.receipt) {
        let valid=true;
        try { await verifyCutout(projectId,state.receipt); } catch { valid=false; }
        if(valid) {
          enqueueMediaPreparation(projectId,state.receipt.output_relative_path,raw.retry===true);
          return {...readCutoutJob(projectId,job.id),reused:true};
        }
        // Invalid cache produces a new immutable attempt.
      } else if (state.state==="queued" || state.state==="running") { startCutoutWorker(projectId); return {...state,reused:true}; }
      else if (raw.retry!==true) return {...state,reused:true};
    }
    const now=new Date().toISOString();
    const job:CutoutJob={id:randomUUID(),key,state:"queued",created_at:now,updated_at:now,input:normalized,source_sha256:sourceHash,runtime};
    saveJob(projectId,job); startCutoutWorker(projectId); return {...job,reused:false};
  } finally { release(); }
}

export async function executeCutoutJob(projectId: string, job: CutoutJob) {
  job.state="running";job.pid=process.pid;saveJob(projectId,job);
  try {
    let receipt:CustomCutoutReceipt;
    if (job.input.mode === "union" || job.input.mode === "intersection") {
      const parent=getCutout(projectId,job.input.parent_cutout_id),other=getCutout(projectId,job.input.other_cutout_id);
      await verifyCutout(projectId,parent);await verifyCutout(projectId,other);
      const correction=normalizeCorrection(job.input,parent,other);
      if (JSON.stringify(parent.preparation)!==JSON.stringify(job.input.parent_fingerprint) || JSON.stringify(other.preparation)!==JSON.stringify(job.input.other_fingerprint)) throw new Error("Correction inputs changed since enqueue");
      const id=randomUUID(),dir=path.join(projectInstrumentsDir(projectId),"custom-cutouts",id),masks=path.join(dir,"masks");
      fs.mkdirSync(masks,{recursive:true});
      for (let i=0;i<parent.frame_count;i++) {
        const name=parent.preparation!.masks[i].name,a=path.join(cutoutMasksPath(projectId,parent),name),dest=path.join(masks,name);
        if (i<correction.frame_start || i>=correction.frame_end) {fs.copyFileSync(a,dest);continue;}
        const b=path.join(cutoutMasksPath(projectId,other),name);
        const pa=await sharp(a).greyscale().raw().toBuffer({resolveWithObject:true}),pb=await sharp(b).greyscale().raw().toBuffer({resolveWithObject:true});
        if (pa.info.width!==pb.info.width || pa.info.height!==pb.info.height) throw new Error("Mask dimensions differ");
        await sharp(combineMaskPixels(pa.data,pb.data,pa.info.width,pa.info.height,correction.mode,correction.roi),{raw:{width:pa.info.width,height:pa.info.height,channels:1}}).png().toFile(dest);
      }
      const output=`cutouts/correction-${id}.webm`;
      await run("ffmpeg",buildCustomCutoutEncodeArgs({sourcePath:cutoutMediaPath(projectId,parent.source_relative_path),masksPattern:path.join(masks,"%05d.png"),outputPath:path.join(projectMediaDir(projectId),output),width:parent.width,height:parent.height,startSeconds:parent.source_interval_seconds[0],durationSeconds:parent.output_duration_seconds,frameRateText:String(parent.frame_rate),frameCount:parent.frame_count}));
      const {preparation: _prep,preview:_preview,scratchpad_treatment:_scratch,...base}=parent;
      receipt={...base,cutout_id:id,output_relative_path:output,evidence_directory:path.relative(projectDir(projectId),dir),created_at:new Date().toISOString()};
    } else {
      if (await runtimeFingerprint()!==job.runtime) throw new Error("SAM runtime changed since enqueue");
      const request=job.input.request as ReturnType<typeof normalizeCustomCutoutRequest>;
      if (job.input.parent_cutout_id) await verifyCutout(projectId,getCutout(projectId,job.input.parent_cutout_id));
      if (await sha256(cutoutMediaPath(projectId,request.sourceRelativePath))!==job.source_sha256) throw new Error("Source changed since enqueue");
      receipt=await createCustomCutout({projectId,sourcePath:cutoutMediaPath(projectId,request.sourceRelativePath),request,persist:false});
      if (await runtimeFingerprint()!==job.runtime) throw new Error("SAM runtime changed during preparation");
    }
    if (await sha256(cutoutMediaPath(projectId,receipt.source_relative_path))!==job.source_sha256) throw new Error("Source changed during preparation");
    // Decode alpha with libvpx, rather than trusting the WebM alpha metadata tag.
    await run("ffmpeg",["-v","error","-c:v","libvpx-vp9","-i",cutoutMediaPath(projectId,receipt.output_relative_path),"-vf","alphaextract","-f","null","-"]);
    const masksDir=cutoutMasksPath(projectId,receipt),manifest:Array<{name:string;sha256:string}>=[];
    let width=0,height=0;
    for(let i=0;i<receipt.frame_count;i++) {
      const name=`${String(i).padStart(5,"0")}.png`,file=path.join(masksDir,name),meta=await sharp(file).metadata();
      if (!meta.width || !meta.height || (i>0 && (meta.width!==width || meta.height!==height))) throw new Error("Inconsistent mask geometry");
      width=meta.width;height=meta.height;manifest.push({name,sha256:await sha256(file)});
    }
    receipt.preparation={cache_key:job.key,output_sha256:await sha256(cutoutMediaPath(projectId,receipt.output_relative_path)),masks:manifest,tracking_width:width,tracking_height:height,subject:String(job.input.subject ?? getCutout(projectId,job.input.parent_cutout_id).preparation!.subject),...(job.input.parent_cutout_id ? {correction:job.input.mode ? {parent_cutout_id:String(job.input.parent_cutout_id),other_cutout_id:String(job.input.other_cutout_id),mode:job.input.mode as Correction["mode"],frame_start:job.input.frame_start as number,frame_end:job.input.frame_end as number,roi:job.input.roi as Correction["roi"]} : {parent_cutout_id:String(job.input.parent_cutout_id),mode:"reprompt" as const}} : {})};
    writeJsonFileAtomic(path.join(path.dirname(masksDir),"receipt.json"),receipt);
    appendCustomCutout(projectId,receipt);
    job.state="completed";job.receipt_id=receipt.cutout_id;
    saveJob(projectId,job);
    // A preview enqueue failure must not discard an expensive prepared derivative.
    try { enqueueMediaPreparation(projectId,receipt.output_relative_path); }
    catch(error) { job.error=`Preview preparation could not start: ${error instanceof Error ? error.message : String(error)}`; }
  } catch(error) { job.state="failed";job.error=error instanceof Error?error.message:String(error); }
  saveJob(projectId,job);
}

/** Exclusive local worker/admission lease; recover dead owners without taking live locks. */
export function acquireCutoutLock(file: string): (() => void) | null {
  try {
    const text=fs.readFileSync(file,"utf8"), pid=Number(text);
    if (pid>0) { try {process.kill(pid,0);return null;} catch(error) {if ((error as NodeJS.ErrnoException).code!=="ESRCH") return null;} }
    else if (Date.now()-fs.statSync(file).mtimeMs<60_000) return null;
    fs.unlinkSync(file);
  } catch(error) { if ((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; }
  let fd:number;
  try {fd=fs.openSync(file,"wx");} catch(error) {if((error as NodeJS.ErrnoException).code==="EEXIST") return null;throw error;}
  fs.writeFileSync(fd,String(process.pid));
  return ()=>{fs.closeSync(fd);fs.unlinkSync(file);};
}
