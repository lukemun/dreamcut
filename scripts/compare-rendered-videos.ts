/** Compare completed exports without re-rendering or changing their source projects. */
import fs from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const directory=path.resolve(process.argv[2]??"testing/results/renderer-reference/scratchpad-layered-cutout");
const files=["reference.mp4","candidate.mp4"].map(name=>path.join(directory,name));
const probe=(file:string)=>JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8"}));
const probes=files.map(probe),videos=probes.map(p=>p.streams.find((s:any)=>s.codec_type==="video"));
for(const key of ["width","height","nb_frames","r_frame_rate"])assert.equal(videos[0][key],videos[1][key],key);
assert.ok(Math.abs(Number(videos[0].duration)-Number(videos[1].duration))<1/30,"video durations differ");
// This evaluates every decoded frame, with timestamps rebased equally.
const stats=path.join(directory,"ssim-frames.txt");
execFileSync("ffmpeg",["-v","error","-y","-i",files[0],"-i",files[1],"-lavfi",`[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=${stats}`,"-an","-f","null","-"],{stdio:["ignore","ignore","pipe"],timeout:300000});
const ssim=fs.readFileSync(stats,"utf8").trim().split("\n").map(line=>Number(line.match(/All:([\d.]+)/)![1]));
assert.equal(ssim.length,Number(videos[0].nb_frames));
const meanSsim=ssim.reduce((a,b)=>a+b,0)/ssim.length;
assert.ok(meanSsim>.97,`full-video SSIM too low: ${meanSsim}`);
let audio:Record<string,unknown>={present:false};
const hasAudio=probes.map(p=>p.streams.some((s:any)=>s.codec_type==="audio"));assert.equal(hasAudio[0],hasAudio[1],"audio stream missing");
if(hasAudio[0]){
 const waves=files.map(file=>execFileSync("ffmpeg",["-v","error","-i",file,"-vn","-ac","1","-ar","12000","-f","f32le","-"],{maxBuffer:128*1024*1024,timeout:300000}));
 const delayFlag=process.argv.indexOf("--reference-audio-delay");
 const referenceDelay=delayFlag<0?0:Number(process.argv[delayFlag+1]);
 assert.ok(Number.isFinite(referenceDelay)&&referenceDelay>=0&&referenceDelay<=.05,"invalid documented reference delay");
 const skip=Math.round(referenceDelay*12000);
 assert.equal(waves[0].length/4-skip,waves[1].length/4,"aligned audio length mismatch; unmatched tails must not be discarded");
 const length=waves[1].length/4;let aa=0,bb=0,ab=0;
 for(let i=0;i<length;i++){const a=waves[0].readFloatLE((i+skip)*4),b=waves[1].readFloatLE(i*4);aa+=a*a;bb+=b*b;ab+=a*b;}
 const correlation=aa&&bb?ab/Math.sqrt(aa*bb):null;
 const gainRatio=aa?Math.sqrt(bb/aa):null;
 let method="waveform";
 if(process.argv.includes("--time-stretched-audio")){
  const proof=JSON.parse(fs.readFileSync(path.join(directory,"time-stretched-audio-comparison.json"),"utf8"));
  assert.equal(proof.passed,true);assert.equal(proof.reference_delay_seconds,referenceDelay);
  for(const file of files)assert.equal(proof.files[path.basename(file)],createHash("sha256").update(fs.readFileSync(file)).digest("hex"),"stale audio proof");
  method="time-stretch-spectrum-and-envelope";
 }else if(correlation!==null)assert.ok(correlation>.98,`audio correlation ${correlation}`);
 if(gainRatio!==null)assert.ok(gainRatio>.95&&gainRatio<1.05,`audio gain mismatch ${gainRatio}`);
 audio={present:true,method,referenceDelaySeconds:referenceDelay,alignedCorrelation:correlation,gainRatio,samplesCompared:length};
}
const receipt={passed:true,framesCompared:ssim.length,meanSsim,minimumFrameSsim:Math.min(...ssim),audio,files};
fs.writeFileSync(path.join(directory,"encoded-comparison.json"),JSON.stringify(receipt,null,2));console.log(receipt);
