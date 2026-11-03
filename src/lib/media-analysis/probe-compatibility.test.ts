import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { probeSource } from "./custom-cutout";
import { nativeSourceDimensions } from "../native-preview/source-metadata";
const available = ["ffmpeg", "ffprobe"].every(tool => spawnSync(tool, ["-version"]).status === 0);
test("source and native probes retain display rotation with portable stream selection", {skip:!available}, async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),"dreamcut-probe-compat-"));
 try {
  const source=path.join(dir,"source.mp4"),rotated=path.join(dir,"rotated.mp4");
  execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=blue:s=160x96:r=30","-t","1","-c:v","libx264","-pix_fmt","yuv420p",source]);
  const supportsDisplayRotation=execFileSync("ffmpeg",["-hide_banner","-h","full"],{encoding:"utf8",maxBuffer:8*1024*1024}).includes("-display_rotation");
  execFileSync("ffmpeg",supportsDisplayRotation ? ["-v","error","-display_rotation","90","-i",source,"-c","copy",rotated] : ["-v","error","-i",source,"-c","copy","-metadata:s:v:0","rotate=90",rotated]);
  for(const [file,width,height] of [[source,160,96],[rotated,96,160]] as const){
   const inspected=await probeSource(file),native=await nativeSourceDimensions(file,file);
   assert.equal(inspected.width,width);assert.equal(inspected.height,height);assert.equal(inspected.frameRate,30);assert.equal(inspected.duration,1);
   assert.equal(native.width,width);assert.equal(native.height,height);assert.equal(native.duration,1);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
