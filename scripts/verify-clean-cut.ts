/** Archive-backed clean_plate_cut proof, never edits an existing project.
 * --source <prepared-cfr-mp4> --plate-start <seconds> --performance-start <seconds>
 * --duration <seconds> --out <directory> [--fps 24] [--base http://127.0.0.1:3137]
 * Requires HYPERSPEED_FFMPEG or an ffmpeg on PATH; sources remain private/local.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { Input, ALL_FORMATS, BufferSource } from "mediabunny";
import { editorAgentOptionSchema, deriveProposalTimeline } from "../src/lib/agent/timeline-editor-agent-apply";
import { buildCompositionElements } from "../src/lib/render/composition-adapters";
import { projectMediaDir } from "../src/lib/local-store/paths";
import { writePreparation } from "../src/lib/local-store/media-preparation";
async function main(){
 const args=process.argv.slice(2), flag=(name:string)=>args[args.indexOf(name)+1];
 for(const name of ["--source","--plate-start","--performance-start","--duration","--out"])if(!args.includes(name))throw new Error(`${name} required`);
 const out=path.resolve(flag("--out")), source=path.resolve(flag("--source")), fps=Number(args.includes("--fps")?flag("--fps"):24);
 fs.mkdirSync(out,{recursive:true});
 const bytes=fs.readFileSync(source), probe=new Input({formats:ALL_FORMATS,source:new BufferSource(bytes)});
 const track=(await probe.getPrimaryVideoTrack())!, stats=await track.computePacketStats(), duration=stats.packetCount/fps;
 const actualDuration=await probe.computeDuration();assert.ok(Math.abs(actualDuration-duration)<1/fps,"Prepared source must have declared CFR duration");probe.dispose();
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"clean-cut-proof-"));process.env.TIMELINE_PROJECTS_DIR=scratch;
 const project="archive-cut", media=projectMediaDir(project);fs.mkdirSync(media,{recursive:true});fs.copyFileSync(source,path.join(media,"source.mp4"));
 const stat=fs.statSync(path.join(media,"source.mp4"));
 // Disposable verification fixture; actual encoded source verified above. Not a
 // normal import shortcut or a claim of passing the editor preparation worker.
 writePreparation(project,{recipe:"editor-media-v1",source:"source.mp4",size:stat.size,mtime:stat.mtimeMs,state:"ready",preview:"source.mp4",render:"source.mp4",duration,alpha:false});
 fs.writeFileSync(path.join(scratch,project,"timeline.json"),JSON.stringify({elements:[],transitions:[]}));
 fs.writeFileSync(path.join(scratch,project,"metadata.json"),JSON.stringify({frame_rate:fps,delivery_target:"web",hidden_lane_keys:[],output_aspect_ratio:"9:16"}));
 const src={source_url:`/api/projects/${project}/media/source.mp4`,source_duration_seconds:duration};
 const option=editorAgentOptionSchema.parse({id:"appear",label:"Person Appear",summary:"Empty scene cuts to normal landing",recommended:true,operations:[],blocks:[{
  block_id:"appear",kind:"clean_plate_cut",version:1,seed:"archive-person-appear",frame_rate:fps,settings:{volume:0},inputs:{
   plate:{...src,source_start_seconds:Number(flag("--plate-start"))},performance:{...src,source_start_seconds:Number(flag("--performance-start"))},
   performance_duration_seconds:Number(flag("--duration")),empty_seconds:2/3,
  },
 }]});
 fs.writeFileSync(path.join(out,"option.json"),JSON.stringify(option,null,2));
 const derived=deriveProposalTimeline({elements:[],transitions:[]},option.operations,project);
 const url=`data:video/mp4;base64,${bytes.toString("base64")}`;
 const elements=buildCompositionElements(derived.timeline.elements,new Set()).map(e=>({...e,source_url:url,props:{...e.props,preview_source_url:url,archival_source_url:url}}));
 const frames=Math.round(Math.max(...derived.timeline.elements.map(e=>e.timeline_start+e.duration))*fps), boundary=Math.round(derived.timeline.elements[1]!.timeline_start*fps);
 const browser=await chromium.launch({headless:true,executablePath:process.env.DREAMCUT_CHROME_EXECUTABLE??"/tmp/dreamcut-effect-browsers/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",args:["--autoplay-policy=no-user-gesture-required"]});
 try{
  const page=await browser.newPage();await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(`${args.includes("--base")?flag("--base"):"http://127.0.0.1:3137"}/render-frame`,{waitUntil:"networkidle"});await page.waitForFunction(()=>Boolean(window.__dreamcutRender));
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{gpu:true,width:270,height:480,fps,durationInFrames:frames,inputProps:{elements,laneOrderKeys:["visual_0"]}});
  const pngs:Buffer[]=[];
  for(let f=0;f<frames;f++){
   await page.evaluate(f=>window.__dreamcutRender!.frame(f),f);
   const png=Buffer.from(await page.evaluate(()=>(document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!),"base64");
   const {data}=await sharp(png).raw().toBuffer({resolveWithObject:true});assert.ok(data.some(v=>v>150),`Blank frame${f}`);pngs.push(png);
  }
  for(const f of [boundary+2,boundary,boundary-1,0]){
   await page.evaluate(f=>window.__dreamcutRender!.frame(f),f);
   const png=Buffer.from(await page.evaluate(()=>(document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!),"base64");assert.deepEqual(png,pngs[f],`Changed seek${f}`);
  }
  const sampled=[boundary-2,boundary-1,boundary,boundary+1,boundary+2,boundary+6];
  await sharp({create:{width:270*sampled.length,height:480,channels:3,background:"black"}}).composite(sampled.map((f,i)=>({input:pngs[f]!,left:i*270,top:0}))).png().toFile(path.join(out,"boundary.png"));
  const encoded=path.join(out,"person-appear-archive-result.mp4");
  const ff=spawnSync(process.env.HYPERSPEED_FFMPEG??"ffmpeg",["-v","error","-y","-f","image2pipe","-framerate",String(fps),"-c:v","png","-i","pipe:0","-an","-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",encoded],{input:Buffer.concat(pngs),maxBuffer:8_000_000});assert.equal(ff.status,0,ff.stderr?.toString());
  const encodedProbe=new Input({formats:ALL_FORMATS,source:new BufferSource(fs.readFileSync(encoded))});const encodedTrack=(await encodedProbe.getPrimaryVideoTrack())!;const encodedStats=await encodedTrack.computePacketStats();assert.equal(encodedStats.packetCount,frames);encodedProbe.dispose();
  const playback=await page.evaluate(async base64=>{
   const v=document.createElement("video");v.src=`data:video/mp4;base64,${base64}`;v.muted=true;let count=0;const cb=()=>{count++;if(!v.ended)v.requestVideoFrameCallback(cb);};v.requestVideoFrameCallback(cb);
   const ended=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Playback timeout")),15_000);v.onended=()=>{clearTimeout(timer);resolve();};v.onerror=()=>{clearTimeout(timer);reject(new Error("Decode failed"));};});await v.play();await ended;return{ended:v.ended,frame_callbacks:count,duration:v.duration};
  },fs.readFileSync(encoded).toString("base64"));assert.ok(playback.ended&&playback.frame_callbacks>frames/2);
  const report={source,source_sha256:createHash("sha256").update(bytes).digest("hex"),source_frames:stats.packetCount,source_duration:duration,option:"option.json",native_renderer:"Browser GPU",fps,frames,boundary_frame:boundary,every_frame_nonblank:true,repeat_seek_identical:true,encoding_frames:encodedStats.packetCount,playback,audio:"Silent: tutorial narration is not isolated camera feed",result_sha256:createHash("sha256").update(fs.readFileSync(encoded)).digest("hex"),provenance:"Tutorial-derived real camera-feed crop; new native clean_plate_cut construction. Not a fresh input or original untampered camera file."};
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();fs.rmSync(scratch,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
