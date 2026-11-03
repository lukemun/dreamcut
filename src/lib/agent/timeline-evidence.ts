import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {portableRelative,projectDir,projectInstrumentsDir,projectMediaDir} from "../local-store/paths";
import {sha256} from "../media-analysis/custom-cutout";
import {toolError} from "./tool-error";
import {packagedCodeIdentity} from "../code-identity";

export async function timelineEvidenceStamp(projectId:string,proposal?:unknown){
  const hash=createHash("sha256"),root=projectDir(projectId);
  const texts=["timeline.json","metadata.json"].map(f=>fs.readFileSync(path.join(root,f),"utf8"));
  texts.forEach(t=>hash.update(t));
  const prefix=`/api/projects/${projectId}/media/`,sources=new Set<string>();
  function walk(v:unknown){if(typeof v==="string" && v.startsWith(prefix))sources.add(decodeURIComponent(v.slice(prefix.length)));else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==="object")Object.values(v).forEach(walk);}
  texts.forEach(t=>walk(JSON.parse(t)));
  if(proposal)walk(proposal);
  function codeFiles(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?codeFiles(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  // A packaged runtime ships its render code compiled; its build identity stands in for these files.
  const code=packagedCodeIdentity();
  if(code)hash.update(code);
  else for(const dir of ["src/lib/frame-runtime","src/lib/remotion","src/lib/render","src/lib/timeline"])for(const file of codeFiles(path.resolve(dir)).sort())hash.update(file).update(await sha256(file));
  for(const source of [...sources].sort()){
    const mediaRoot=path.resolve(projectMediaDir(projectId)),file=path.resolve(mediaRoot,source);
    if(!file.startsWith(mediaRoot+path.sep))throw new Error("Timeline media path escapes the project namespace");
    // Existing timeline references may intentionally use external-reference symlinks.
    if (fs.statSync(file).isDirectory()) {
      for (const member of codeFiles(file).sort()) hash.update(portableRelative(mediaRoot, member)).update(await sha256(member));
    } else hash.update(source).update(await sha256(file));
  }
  return hash.digest("hex");
}
export async function timelineEvidence(projectId:string,raw:Record<string,unknown>){
  if(typeof raw.report!=="string" || path.isAbsolute(raw.report)||raw.report.split(/[\\/]/).includes(".."))throw toolError("INVALID_REPORT","Provide a project-instruments-relative frame-state report.",{action:"select_frame_state_report"});
  const root=fs.realpathSync(projectInstrumentsDir(projectId)),file=fs.realpathSync(path.join(root,raw.report));
  if(!file.startsWith(root+path.sep))throw new Error("Report escapes instruments");
  const report=JSON.parse(fs.readFileSync(file,"utf8"));
  const recover={action:"regenerate_frame_state",tool:"run_instrument",arguments:{instrument:"frame-state",project_id:projectId},reason:"Regenerate the same requested proposal/option and sample times before reusing images."};
  let proposal:unknown;
  if(report.preview?.proposalFile){
    const proposalPath=fs.realpathSync(report.preview.proposalFile);
    const allowed=[fs.realpathSync(projectDir(projectId)),path.resolve("private")];
    if(!allowed.some(dir=>proposalPath.startsWith(dir+path.sep)) || !proposalPath.endsWith(".json") || fs.statSync(proposalPath).size>2_000_000)throw new Error("Proposal evidence must reference a bounded project/private JSON artifact");
    try{proposal=JSON.parse(fs.readFileSync(proposalPath,"utf8"));}catch{throw new Error("Proposal evidence JSON is invalid");}
  }
  if(report.projectId!==projectId || report.evidenceStamp!==await timelineEvidenceStamp(projectId,proposal))throw toolError("STALE_EVIDENCE","Report lacks a current timeline/media fingerprint; regenerate frame-state.",recover,409);
  if(report.preview){
    if(typeof report.preview.proposalFile!=="string" || await sha256(report.preview.proposalFile)!==report.proposalSha256)throw toolError("STALE_PROPOSAL","Proposal file changed since frame-state capture.",recover,409);
  }
  const page=raw.page??0;if(!Number.isInteger(page)||(page as number)<0)throw new Error("page must be a nonnegative integer");
  if(!Array.isArray(report.states))throw new Error("Invalid frame-state report");
  const states=report.states.slice((page as number)*6,(page as number)*6+6);if(!states.length)throw new Error("Page has no frames");
  const cells=[],images=[];
  for(let i=0;i<states.length;i++){
    const state=states[i],source=fs.realpathSync(state.stillPath);
    if(!source.startsWith(root+path.sep))throw new Error("Image escapes project instruments");
    const imageHash=await sha256(source);
    if(imageHash!==state.read?.stillSha256)throw toolError("CHANGED_IMAGE","Frame image changed after capture.",recover,409);
    const buffer=await sharp(source).resize(480,300,{fit:"contain",background:"#202020"}).jpeg().toBuffer();images.push({input:buffer,left:(i%2)*480,top:Math.floor(i/2)*330});
    const label=Buffer.from(`<svg width="480" height="30"><text x="12" y="21" fill="white" font-size="17">Frame ${Number(state.frame)} · ${Number(state.atSeconds).toFixed(3)} s</text></svg>`);
    images.push({input:label,left:(i%2)*480,top:Math.floor(i/2)*330+300});cells.push({frame:state.frame,at_seconds:state.atSeconds,sha256:imageHash});
  }
  if(report.evidenceStamp!==await timelineEvidenceStamp(projectId,proposal))throw toolError("STALE_EVIDENCE","Project changed while packaging evidence.",recover,409);
  const sheet=await sharp({create:{width:960,height:Math.ceil(states.length/2)*330,channels:3,background:"#202020"}}).composite(images).jpeg({quality:85}).toBuffer();
  return {report_sha256:await sha256(file),page,pages:Math.ceil(report.states.length/6),cells,preview:report.preview??null,limits:"Selected stills only; not motion, audio or human approval.",image:{type:"image",mimeType:"image/jpeg",data:sheet.toString("base64")}};
}
