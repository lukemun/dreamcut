import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { projectInstrumentsDir } from "../local-store/paths";
import { acquireCutoutLock, cutoutMediaPath } from "./cutout-preparation";
import { probeSource, run, sha256 } from "./custom-cutout";

/** Source-clock samples only; timeline/composite judgments still require frame-state. */
export async function sourceEvidence(projectId:string, body:Record<string,unknown>) {
  if(typeof body.source_relative_path!=="string") throw new Error("source_relative_path required");
  const source=cutoutMediaPath(projectId,body.source_relative_path),times=body.times_seconds;
  if(!Array.isArray(times) || times.length<1 || times.length>12 || times.some(t=>typeof t!=="number" || !Number.isFinite(t) || t<0)) throw new Error("Supply 1–12 nonnegative source times");
  const probe=await probeSource(source);
  if(times.some(t=>t>=probe.duration)) throw new Error("Sample outside source duration");
  const sourceHash=await sha256(source);
  const key=createHash("sha256").update(JSON.stringify(["source-evidence/v1",sourceHash,times])).digest("hex");
  const dir=path.join(projectInstrumentsDir(projectId),"source-evidence",key),manifestPath=path.join(dir,"manifest.json");
  fs.mkdirSync(dir,{recursive:true});
  const release=acquireCutoutLock(path.join(dir,"build.lock"));
  if(!release) throw new Error("Source evidence is being prepared; retry shortly");
  try {
  const cells:Array<{index:number;requested_source_seconds:number;image:string;sha256:string}>=[];
  // Exact input hashes allow subsequent image delivery without decoding the video again.
  try {
    const saved=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    let valid=saved.source_sha256===sourceHash && saved.sheet_sha256===await sha256(path.join(dir,"sheet.jpg")) && saved.cells?.length===times.length;
    for(let i=0;valid && i<times.length;i++) valid=saved.cells[i].sha256===await sha256(path.join(dir,`${i}.png`));
    if(valid) return result(saved,true);
  } catch { /* Missing or stale evidence is rebuilt from source. */ }
  const images:Buffer[]=[];
  for(let i=0;i<times.length;i++) {
    const file=path.join(dir,`${i}.png`);
    await run("ffmpeg",["-v","error","-y","-ss",String(times[i]),"-i",source,"-frames:v","1","-vf","scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2","-threads","1",file]);
    images.push(await sharp(file).jpeg({quality:85}).toBuffer());
    cells.push({index:i,requested_source_seconds:times[i],image:`${i}.png`,sha256:await sha256(file)});
  }
  if(await sha256(source)!==sourceHash) throw new Error("Source changed while sampling");
  const cols=Math.min(3,images.length),rows=Math.ceil(images.length/cols);
  const sheet=await sharp({create:{width:cols*640,height:rows*360,channels:3,background:"#202020"}}).composite(images.map((input,i)=>({input,left:(i%cols)*640,top:Math.floor(i/cols)*360}))).jpeg({quality:85}).toBuffer();
  fs.writeFileSync(path.join(dir,"sheet.jpg"),sheet);
  const manifest={recipe:"source-evidence/v1",source_relative_path:body.source_relative_path,source_sha256:sourceHash,cells,columns:cols,sheet_sha256:createHash("sha256").update(sheet).digest("hex"),limits:"Source samples in row-major order; requested seek times, not frame-exact PTS. No timeline composite, motion, sound or interpretation proof."};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  return result(manifest,false);
  } finally { release(); }
  function result(manifest:unknown,reused:boolean) {
    return {manifest,manifest_path:manifestPath,reused,image:{type:"image",mimeType:"image/jpeg",data:fs.readFileSync(path.join(dir,"sheet.jpg")).toString("base64")}};
  }
}
