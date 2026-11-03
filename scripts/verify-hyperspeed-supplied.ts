/** Supplied-source hyperspeed proof, never edits an existing project.
 * --source <prepared-cfr-mp4> --blur-source <prepared-temporal-mp4> --fast-start <seconds> --fast-end <seconds>
 * --out <directory> [--fps 24] [--base http://127.0.0.1:3137]
 * Requires HYPERSPEED_FFMPEG or an ffmpeg on PATH; sources remain private/local.
 */
import fs from "node:fs";
import http from "node:http";
import { isolateDevelopmentUpdates } from "../src/lib/render/browser-renderer";
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
 for(const name of ["--source","--blur-source","--fast-start","--fast-end","--out"])if(!args.includes(name))throw new Error(`${name} required`);
 const out=path.resolve(flag("--out")), source=path.resolve(flag("--source")), fps=Number(args.includes("--fps")?flag("--fps"):24);
 fs.mkdirSync(out,{recursive:true});
 const bytes=fs.readFileSync(source), probe=new Input({formats:ALL_FORMATS,source:new BufferSource(bytes)});
 const track=(await probe.getPrimaryVideoTrack())!, stats=await track.computePacketStats(), duration=stats.packetCount/fps;
 const actualDuration=await probe.computeDuration();assert.ok(Math.abs(actualDuration-duration)<1/fps,"Prepared source must have declared CFR duration");probe.dispose();
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"hyperspeed-supplied-proof-"));process.env.TIMELINE_PROJECTS_DIR=scratch;
 const project="supplied-hyperspeed", media=projectMediaDir(project);fs.mkdirSync(media,{recursive:true});fs.copyFileSync(source,path.join(media,"source.mp4"));
 const stat=fs.statSync(path.join(media,"source.mp4"));
 // Disposable verification fixture; actual encoded source verified above. Not a
 // normal import shortcut or a claim of passing the editor preparation worker.
 writePreparation(project,{recipe:"editor-media-v1",source:"source.mp4",size:stat.size,mtime:stat.mtimeMs,state:"ready",preview:"source.mp4",render:"source.mp4",duration,alpha:false});
 fs.writeFileSync(path.join(scratch,project,"timeline.json"),JSON.stringify({elements:[],transitions:[]}));
 fs.writeFileSync(path.join(scratch,project,"metadata.json"),JSON.stringify({frame_rate:fps,delivery_target:"web",hidden_lane_keys:[],output_aspect_ratio:"9:16"}));
 const blurBytes=fs.readFileSync(path.resolve(flag("--blur-source"))), blurProbe=new Input({formats:ALL_FORMATS,source:new BufferSource(blurBytes)});
 const blurTrack=(await blurProbe.getPrimaryVideoTrack())!;assert.equal((await blurTrack.computePacketStats()).packetCount,stats.packetCount);blurProbe.dispose();
 fs.writeFileSync(path.join(media,"blur.mp4"),blurBytes);const blurStat=fs.statSync(path.join(media,"blur.mp4"));
 writePreparation(project,{recipe:"editor-media-v1",source:"blur.mp4",size:blurStat.size,mtime:blurStat.mtimeMs,state:"ready",preview:"blur.mp4",render:"blur.mp4",duration,alpha:false});
 const src={source_url:`/api/projects/${project}/media/source.mp4`,source_duration_seconds:duration};
 const option=editorAgentOptionSchema.parse({id:"hyperspeed",label:"Hyperspeed",summary:"Normal lead, accelerated run and normal payoff",recommended:true,operations:[],blocks:[{
  block_id:"hyperspeed",kind:"hyperspeed",version:1,seed:"supplied-hyperspeed",frame_rate:fps,settings:{speed:15,blur:Number(args.includes("--blur")?flag("--blur"):65),audio:"silent"},inputs:{
   source:{...src,source_start_seconds:0,source_end_seconds:duration},
   fast_start_source_seconds:Number(flag("--fast-start")),fast_end_source_seconds:Number(flag("--fast-end")),
   temporal_blur:{source_url:`/api/projects/${project}/media/blur.mp4`,source_duration_seconds:duration,original_source_url:src.source_url,frame_rate:fps,sample_frames:15},
   lane_order_keys:["visual_1","visual_0"],
  },
 }]});
 fs.writeFileSync(path.join(out,"option.json"),JSON.stringify(option,null,2));
 const derived=deriveProposalTimeline({elements:[],transitions:[]},option.operations,project);
 const files:Record<string,string>={"/source.mp4":source,"/blur.mp4":path.resolve(flag("--blur-source"))};
 const mediaServer=http.createServer((req,res)=>{
  const file=files[req.url??""];res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Accept-Ranges","bytes");
  if(!file){res.writeHead(404);res.end();return;}
  const size=fs.statSync(file).size, match=/bytes=(\d+)-(\d*)/.exec(req.headers.range??"");
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(size-1,Number(match[2])):size-1;
  res.setHeader("Content-Type","video/mp4");res.setHeader("Content-Length",end-start+1);
  if(match){res.setHeader("Content-Range",`bytes ${start}-${end}/${size}`);res.writeHead(206);}else res.writeHead(200);
  fs.createReadStream(file,{start,end}).pipe(res);
 });
 await new Promise<void>(resolve=>mediaServer.listen(0,"127.0.0.1",resolve));
 const address=mediaServer.address() as {port:number};
 const url=`http://127.0.0.1:${address.port}/source.mp4`;
 const blurUrl=`http://127.0.0.1:${address.port}/blur.mp4`;
 const elements=buildCompositionElements(derived.timeline.elements,new Set()).map(e=>{const u=e.source_url?.endsWith("/blur.mp4")?blurUrl:url;return{...e,source_url:u,props:{...e.props,preview_source_url:u,archival_source_url:u}};});
 const frames=Math.round(Math.max(...derived.timeline.elements.map(e=>e.timeline_start+e.duration))*fps), boundary=Math.round(derived.timeline.elements[1]!.timeline_start*fps);
 const browser=await chromium.launch({headless:true,executablePath:process.env.DREAMCUT_CHROME_EXECUTABLE??"/tmp/dreamcut-effect-browsers/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",args:["--autoplay-policy=no-user-gesture-required"]});
 try{
  const page=await browser.newPage();const freeze=await isolateDevelopmentUpdates(page);await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(`${args.includes("--base")?flag("--base"):"http://127.0.0.1:3137"}/render-frame`,{waitUntil:"networkidle"});await page.waitForFunction(()=>Boolean(window.__dreamcutRender));freeze();
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{gpu:true,width:270,height:480,fps,durationInFrames:frames,inputProps:{elements,laneOrderKeys:["visual_1","visual_0"]}});
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
  const exit=Math.round(derived.timeline.elements[2]!.timeline_start*fps);
  const sampled=[boundary-1,boundary,boundary+1,exit-1,exit,exit+1];
  await sharp({create:{width:270*sampled.length,height:480,channels:3,background:"black"}}).composite(sampled.map((f,i)=>({input:pngs[f]!,left:i*270,top:0}))).png().toFile(path.join(out,"boundary.png"));
  const encoded=path.join(out,"hyperspeed-supplied-result.mp4");
  const ff=spawnSync(process.env.HYPERSPEED_FFMPEG??"ffmpeg",["-v","error","-y","-f","image2pipe","-framerate",String(fps),"-c:v","png","-i","pipe:0","-an","-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart",encoded],{input:Buffer.concat(pngs),maxBuffer:8_000_000});assert.equal(ff.status,0,ff.stderr?.toString());
  const encodedProbe=new Input({formats:ALL_FORMATS,source:new BufferSource(fs.readFileSync(encoded))});const encodedTrack=(await encodedProbe.getPrimaryVideoTrack())!;const encodedStats=await encodedTrack.computePacketStats();assert.equal(encodedStats.packetCount,frames);encodedProbe.dispose();
  const playback=await page.evaluate(async base64=>{
   const v=document.createElement("video");v.src=`data:video/mp4;base64,${base64}`;v.muted=true;let count=0;const cb=()=>{count++;if(!v.ended)v.requestVideoFrameCallback(cb);};v.requestVideoFrameCallback(cb);
   const ended=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Playback timeout")),15_000);v.onended=()=>{clearTimeout(timer);resolve();};v.onerror=()=>{clearTimeout(timer);reject(new Error("Decode failed"));};});await v.play();await ended;return{ended:v.ended,frame_callbacks:count,duration:v.duration};
  },fs.readFileSync(encoded).toString("base64"));assert.ok(playback.ended&&playback.frame_callbacks>frames/2);
  const report={source,source_sha256:createHash("sha256").update(bytes).digest("hex"),source_frames:stats.packetCount,source_duration:duration,option:"option.json",native_renderer:"Browser GPU",blur_mix_percent:Number(args.includes("--blur")?flag("--blur"):65),fps,frames,boundary_frame:boundary,every_frame_nonblank:true,repeat_seek_identical:true,encoding_frames:encodedStats.packetCount,playback,audio:"Silent policy explicitly selected; no sounds or shifted source audio added",result_sha256:createHash("sha256").update(fs.readFileSync(encoded)).digest("hex"),provenance:"Instructor-supplied Hyperspeed_SHOT01.mp4; original source preserved. Native retime and editable mix of source-clock temporal-average derivative. Not a fresh-input or certified reference match."};
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{mediaServer.close();await browser.close();fs.rmSync(scratch,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
