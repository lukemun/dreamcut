import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash,randomUUID} from "node:crypto";
import { spawnBackgroundWorker as spawn } from "../local-store/background-worker";
import {z} from "zod";
import {projectInstrumentsDir,projectDir,projectMediaDir} from "../local-store/paths";
import {writeJsonFileAtomic} from "../local-store/atomic-json";
import {acquireCutoutLock,cutoutMediaPath,getCutout,verifyCutout} from "../media-analysis/cutout-preparation";
import {run,sha256} from "../media-analysis/custom-cutout";
import {readCustomCutouts} from "../local-store/custom-cutouts";
import {enqueueMediaPreparation,readPreparation} from "../local-store/media-preparation";
import {toolError} from "./tool-error";
import {dictionaryWords,findOovTokens} from "../instruments/oov";
const inputSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("speech"),source:z.string().min(1),mode:z.enum(["transcribe","align"]),reviewed_text:z.string().trim().min(1).max(30000).optional(),retry:z.boolean().optional()}).strict(),
 z.object({kind:z.literal("treatment"),parent_cutout_id:z.string().uuid(),mode:z.enum(["outline","scratchpad"]),width:z.number().int().min(1).max(32).default(12),retry:z.boolean().optional()}).strict()
]);
type Input=z.infer<typeof inputSchema>;
export type PreparationJob={id:string;key:string;state:"queued"|"running"|"completed"|"failed";input:Input;source_hash:string;source:string;created_at:string;dependency_hashes?:string[];parent_fingerprint?:string;pid?:number;error?:string;artifacts?:Array<{path:string;sha256:string}>;result?:Record<string,unknown>};
export const preparationJobsDir=(project:string)=>path.join(projectInstrumentsDir(project),"agent-preparation");
function jobPath(project:string,id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error("Invalid job ID");return path.join(preparationJobsDir(project),id,"job.json");}
const save=(p:string,j:PreparationJob)=>writeJsonFileAtomic(jobPath(p,j.id),j);
export async function getPreparationJob(project:string,id:string){
 const job=JSON.parse(fs.readFileSync(jobPath(project,id),"utf8")) as PreparationJob;
 if(job.state==="running"&&job.pid){try{process.kill(job.pid,0);}catch{job.state="failed";job.error="Worker interrupted; retry the same request explicitly.";save(project,job);}}
 if(job.state==="completed"){
  if(await sha256(cutoutMediaPath(project,job.source))!==job.source_hash)throw toolError("STALE_SOURCE","Source bytes changed since preparation.",{action:"prepare_again"},409);
  for(const artifact of job.artifacts??[])if(await sha256(path.join(projectDir(project),artifact.path))!==artifact.sha256)throw toolError("STALE_ARTIFACT","Prepared evidence changed; preserve existing versions and prepare again.",{action:"prepare_again"},409);
 }
 const output=job.result?.output_relative_path;
 return {...job,preview:typeof output==="string"?readPreparation(project,output):undefined,visual_verification:"not_performed"};
}
function start(project:string,id:string){
 if(process.env.AGENT_PREPARATION_AUTOSTART==="0")return;
 const dir=path.dirname(jobPath(project,id)),log=fs.openSync(path.join(dir,"worker.log"),"a");
 try{const child=spawn(process.execPath,["--import","tsx",path.resolve("scripts/prepare-agent-assets.ts"),project,id],{detached:true,stdio:["ignore",log,log],env:process.env});child.on("error",()=>{});child.unref();}finally{fs.closeSync(log);}
}
async function dependencies(input:Input){
 const mfaRoot=process.env.MFA_ROOT_DIR??path.join(os.homedir(),".local/share/mfa-data");
 const dictionary=process.env.MFA_DICTIONARY_PATH??path.join(mfaRoot,"pretrained_models/dictionary/english_us_mfa.dict");
 if(input.kind==="speech"&&input.mode==="align"){
  if(!fs.existsSync(dictionary))throw toolError("RUNTIME_UNAVAILABLE","The configured MFA dictionary is unavailable.",{action:"report_missing_prerequisite"});
  const unknown=findOovTokens(input.reviewed_text??"",dictionaryWords(fs.readFileSync(dictionary,"utf8")));
  if(unknown.length)throw toolError("PRONUNCIATION_REVIEW_REQUIRED",`Review pronunciations before alignment: ${unknown.slice(0,20).join(", ")}`,{action:"review_pronunciations",reason:"This tool does not generate or approve unknown pronunciations, download a model, or substitute ASR timing."});
 }
 const files=input.kind==="treatment"?["scripts/scratchpad-cutout.ts", ".matting/clean_mask_sequence.py"]:input.mode==="transcribe"?["scripts/transcribe.ts",process.env.WHISPER_MODEL??path.join(os.homedir(),".cache/whisper-models/ggml-small.bin"),process.env.WHISPER_VAD_MODEL??path.join(os.homedir(),".cache/whisper-models/ggml-silero-v6.2.0.bin")]:["scripts/align.ts",dictionary];
 try{return await Promise.all(files.map(sha256));}catch{throw toolError("RUNTIME_UNAVAILABLE","Required local model or preparation implementation is missing.",{action:"report_missing_prerequisite",reason:"No models are downloaded automatically."});}
}
export async function enqueuePreparation(project:string,raw:unknown){
 const parsed=inputSchema.safeParse(raw);if(!parsed.success)throw toolError("INVALID_INPUT",parsed.error.issues.map(i=>i.message).join("; "),{action:"correct_arguments"});
 const input=parsed.data;
 if(input.kind==="speech"&&input.mode==="align"&&!input.reviewed_text)throw toolError("TRANSCRIPT_REVIEW_REQUIRED","Alignment requires the reviewed transcript text.",{action:"review_transcript_then_supply_reviewed_text"});
 const parent=input.kind==="treatment"?getCutout(project,input.parent_cutout_id):null;
 if(parent)await verifyCutout(project,parent);
 const source=parent?.source_relative_path??(input as Extract<Input,{kind:"speech"}>).source;
 const sourceFile=cutoutMediaPath(project,source);
 if(input.kind==="speech"){
  const facts=await run("ffprobe",["-v","error","-show_entries","format=duration","-of","json",sourceFile]);
  const duration=Number(JSON.parse(facts.stdout).format?.duration);
  if(!Number.isFinite(duration)||duration<=0||duration>600)throw toolError("SOURCE_WINDOW_TOO_LARGE","Speech preparation accepts a complete source up to 10 minutes.",{action:"select_bounded_source",reason:"Do not bake ordinary editorial trims or change the source clock to bypass this limit."});
 }
 const sourceHash=await sha256(sourceFile);
 const {retry,...identity}=input;
 const dependencyHashes=await dependencies(input);
 const parentFingerprint=parent?createHash("sha256").update(JSON.stringify(parent)).digest("hex"):undefined;
 const key=createHash("sha256").update(JSON.stringify(["agent-preparation/v2",identity,sourceHash,parentFingerprint,dependencyHashes])).digest("hex");
 const dir=preparationJobsDir(project);fs.mkdirSync(dir,{recursive:true});const release=acquireCutoutLock(path.join(dir,"admission.lock"));if(!release)throw toolError("BUSY","Preparation queue is busy.",{action:"retry_after_delay"},409);
 try{
  const jobs=fs.readdirSync(dir).filter(n=>/^[a-f0-9-]{36}$/.test(n)).map(id=>JSON.parse(fs.readFileSync(jobPath(project,id),"utf8")) as PreparationJob).filter(j=>j.key===key).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  for(const j of jobs){
   let current;try{current=await getPreparationJob(project,j.id);}catch{continue;}
   if(current.state==="failed"&&retry)continue;
   if(current.state==="queued")start(project,j.id);
   return {...current,reused:true};
  }
  const job:PreparationJob={id:randomUUID(),key,state:"queued",input,dependency_hashes:dependencyHashes,parent_fingerprint:parentFingerprint,source_hash:sourceHash,source,created_at:new Date().toISOString()};fs.mkdirSync(path.dirname(jobPath(project,job.id)),{recursive:true});save(project,job);start(project,job.id);return {...job,reused:false};
 }finally{release();}
}
export async function executePreparation(project:string,id:string){
 const dir=path.dirname(jobPath(project,id)),release=acquireCutoutLock(path.join(dir,"worker.lock"));if(!release)return;
 let job:Awaited<ReturnType<typeof getPreparationJob>>;
 try{job=await getPreparationJob(project,id);}catch(error){release();throw error;}
 if(job.state!=="queued"){release();return;}
 job.state="running";job.pid=process.pid;save(project,job);
 try{
  if(JSON.stringify(await dependencies(job.input))!==JSON.stringify(job.dependency_hashes))throw new Error("Preparation implementation or models changed since enqueue");
  const source=cutoutMediaPath(project,job.source);if(await sha256(source)!==job.source_hash)throw new Error("Source changed before preparation");
  let artifacts:string[]=[];
  if(job.input.kind==="speech"){
   const file=path.join(dir,job.input.mode==="align"?"alignment.json":"transcript.json");
   if(job.input.mode==="align"){
    const text=path.join(dir,"reviewed.txt");fs.writeFileSync(text,job.input.reviewed_text!);
    const wav=path.join(dir,"source-audio.wav");
    await run("ffmpeg",["-v","error","-y","-i",source,"-vn","-af","aresample=async=1:first_pts=0","-ar","16000","-ac","1","-c:a","pcm_s16le",wav]);
    await run(process.execPath,["--import","tsx","scripts/align.ts",wav,text,"--out",file],{env:{...process.env,HF_HUB_OFFLINE:"1",TRANSFORMERS_OFFLINE:"1"}});
    job.result={alignment_path:path.relative(projectDir(project),file),method:"mfa",reviewed_text_sha256:await sha256(text)};artifacts.push(text);
   }else{await run(process.execPath,["--import","tsx","scripts/transcribe.ts",source,"--out",file]);job.result={transcript:JSON.parse(fs.readFileSync(file,"utf8")),review_required:true};}
   artifacts.push(file);
  }else{
   const parent=getCutout(project,job.input.parent_cutout_id);await verifyCutout(project,parent);
   if(createHash("sha256").update(JSON.stringify(parent)).digest("hex")!==job.parent_fingerprint)throw new Error("Parent receipt changed since enqueue");
   if(job.input.mode==="outline"){
    const maskDir=path.join(projectMediaDir(project),"outline-masks",id);fs.mkdirSync(maskDir,{recursive:true});
    await run("ffmpeg",["-v","error","-c:v","libvpx-vp9","-i",cutoutMediaPath(project,parent.output_relative_path),"-vf","format=rgba,lutrgb=r=255:g=255:b=255","-frames:v",String(parent.frame_count),"-fps_mode","passthrough","-start_number","0",path.join(maskDir,"%05d.png")]);
    for(let i=0;i<parent.frame_count;i++)artifacts.push(path.join(maskDir,`${String(i).padStart(5,"0")}.png`));
    job.result={source_url:`/api/projects/${project}/media/outline-masks/${id}`,frame_count:parent.frame_count,fps:parent.frame_rate,width:parent.width,height:parent.height,source_interval_seconds:parent.source_interval_seconds,parent_cutout_id:parent.cutout_id,timestamps:Array.from({length:parent.frame_count},(_,i)=>i/parent.frame_rate)};
    const manifest=path.join(maskDir,"manifest.json");writeJsonFileAtomic(manifest,job.result);artifacts.push(manifest);
   }else{
    const width=job.input.width;
    const before=new Set(readCustomCutouts(project).cutouts.map(r=>r.cutout_id));
    await run(process.execPath,["--import","tsx","scripts/scratchpad-cutout.ts",project,parent.cutout_id,String(job.input.width)]);
    const results=readCustomCutouts(project).cutouts.filter(r=>!before.has(r.cutout_id)&&r.scratchpad_treatment?.parent_cutout_id===parent.cutout_id&&r.scratchpad_treatment.outline_width===width);
    if(results.length!==1)throw new Error("Treatment receipt identity is missing or ambiguous");
    const result=results[0];
    job.result={cutout_id:result.cutout_id,output_relative_path:result.output_relative_path};artifacts.push(cutoutMediaPath(project,result.output_relative_path));enqueueMediaPreparation(project,result.output_relative_path);
   }
   await verifyCutout(project,parent);
  }
  if(await sha256(source)!==job.source_hash)throw new Error("Source changed during preparation");
  if(JSON.stringify(await dependencies(job.input))!==JSON.stringify(job.dependency_hashes))throw new Error("Preparation dependencies changed during execution");
  job.artifacts=await Promise.all(artifacts.map(async file=>({path:path.relative(projectDir(project),file),sha256:await sha256(file)})));job.state="completed";
 }catch(error){job.state="failed";job.error=error instanceof Error?error.message:String(error);}
 finally{try{save(project,job);}finally{release();}}
}
