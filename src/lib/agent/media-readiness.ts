import { z } from "zod";
import {cutoutMediaPath} from "../media-analysis/cutout-preparation";
import {sha256} from "../media-analysis/custom-cutout";
import {enqueueMediaPreparation,readPreparation,preparationKey,writePreparation} from "../local-store/media-preparation";
import {enqueuePreparation,getPreparationJob} from "./preparation-jobs";
import {toolError} from "./tool-error";
const schema=z.object({temporal_average:z.object({sample_frames:z.number().int().min(3).max(15).refine(n=>n%2===1,"sample_frames must be odd").default(5)}).strict().optional(),job_id:z.string().uuid().optional(),source:z.string().min(1).max(500),action:z.enum(["prepare","status","retry"]).default("status")}).strict();
export async function mediaReadiness(projectId:string,raw:unknown):Promise<Record<string, unknown>>{
  const parsed=schema.safeParse(raw);
  if(!parsed.success)throw toolError("INVALID_INPUT",parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; "),{action:"correct_arguments"});
  const {action}=parsed.data;
  const source=parsed.data.temporal_average?parsed.data.source.replace(/^media\//, ""):parsed.data.source;
  let file:string;try{file=cutoutMediaPath(projectId,source);}catch{throw toolError("SOURCE_UNAVAILABLE","Source must be an existing file inside this project's media directory.",{action:"select_imported_source",tool:"timeline_get",arguments:{project_id:projectId}});}
  if(!/\.(mov|mp4|m4v|webm)$/i.test(source))throw toolError("UNSUPPORTED_MEDIA","Playback preparation currently accepts video assets.",{action:"select_video_source"});
  if(parsed.data.temporal_average){
    const settings=parsed.data.temporal_average;
    if(action==="status"&&!parsed.data.job_id)throw toolError("INVALID_INPUT","Temporal average status requires job_id from action prepare.",{action:"supply_preparation_job_id"});
    const job=await (async()=>{
      try{return action==="status"?await getPreparationJob(projectId,parsed.data.job_id!):await enqueuePreparation(projectId,{kind:"temporal_average",source,sample_frames:settings.sample_frames,retry:action==="retry"});}
      catch(error){if((error as {toolError?:unknown}).toolError)throw error;throw toolError("PREPARATION_UNAVAILABLE","Temporal preparation job or runtime is unavailable; inspect local diagnostics before retrying.",{action:"inspect_preparation_prerequisite"});}
    })();
    if(job.input.kind!=="temporal_average"||job.source!==source||job.input.sample_frames!==settings.sample_frames)throw toolError("JOB_MISMATCH","Job does not belong to this source and temporal kernel.",{action:"supply_matching_source_and_kernel"});
    const verified=job.state==="completed"&&typeof job.result?.output_relative_path==="string"?await mediaReadiness(projectId,{source:job.result.output_relative_path,action:action==="retry"?"retry":"status"}):undefined;
    const preview=verified?.preparation as ReturnType<typeof readPreparation>|undefined;
    const state=job.state==="completed"?(preview?.state==="ready"?"ready":preview?.state==="failed"?"failed":"preparing"):job.state;
    const result=job.result;
    const compact=result?Object.fromEntries(Object.entries(result).filter(([key])=>key!=="source_pts"&&key!=="output_pts")):undefined;
    return {job_id:job.id,source,state,reused:"reused" in job?job.reused:true,preparation_state:job.state,error:job.error,preview,
      preparation:compact,temporal_blur:job.state==="completed"&&result?{source_url:result.source_url,original_source_url:result.original_source_url,source_duration_seconds:result.source_duration_seconds,frame_rate:result.frame_rate,sample_frames:result.sample_frames}:undefined,
      next:{action:state==="ready"?"prepare_proposal":state==="failed"?"inspect_error_then_retry":"poll_existing_job",tool:"media_readiness",arguments:{project_id:projectId,source,temporal_average:settings,job_id:job.id,action:state==="failed"?"retry":"status"}},
      limits:"Authenticated source-clock preparation only. No timeline changes, audio, visual approval or automatic action marks. Inspect motion contours before adoption."};
  }
  if(parsed.data.job_id)throw toolError("INVALID_INPUT","job_id applies only with temporal_average.",{action:"supply_temporal_average_or_remove_job_id"});
  let record=readPreparation(projectId,source);
  if(record?.state==="ready"){
    const valid=record.source_hash===await sha256(file) && !!record.preview && record.preview_hash===await sha256(cutoutMediaPath(projectId,record.preview));
    if(!valid && action==="retry") {record={...record,state:"failed",error:"Source or preview fingerprint changed"};writePreparation(projectId,record);}
    else if(!valid)throw toolError("STALE_PREPARATION","Prepared source or preview bytes changed; repair media preparation before adoption.",{action:"retry_preparation",tool:"media_readiness",arguments:{project_id:projectId,source,action:"retry"}},409);
  }
  const reused=!!record && !(action==="retry" && record.state==="failed");
  if(action!=="status")record=enqueueMediaPreparation(projectId,source,action==="retry");
  const state=record?.state??"not_prepared";
  return {job_id:preparationKey(source),source,state,reused,preparation:record,
    next:state==="ready"?{action:"prepare_proposal"}:state==="failed"?{action:"inspect_error_then_retry",tool:"media_readiness",arguments:{project_id:projectId,source,action:"retry"}}:{action:state==="preparing"?"poll_existing_job":"prepare",tool:"media_readiness",arguments:{project_id:projectId,source,action:state==="preparing"?"status":"prepare"}},
    limits:"Readiness is technical preparation, not visual approval. No timeline changes or optional analysis enablement."};
}
