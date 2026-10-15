import { z } from "zod";
import {cutoutMediaPath} from "../media-analysis/cutout-preparation";
import {sha256} from "../media-analysis/custom-cutout";
import {enqueueMediaPreparation,readPreparation,preparationKey,writePreparation} from "../local-store/media-preparation";
import {toolError} from "./tool-error";
const schema=z.object({source:z.string().min(1).max(500),action:z.enum(["prepare","status","retry"]).default("status")}).strict();
export async function mediaReadiness(projectId:string,raw:unknown){
  const parsed=schema.safeParse(raw);
  if(!parsed.success)throw toolError("INVALID_INPUT","Provide a project-relative source and action prepare, status or retry.",{action:"correct_arguments"});
  const {source,action}=parsed.data;
  let file:string;try{file=cutoutMediaPath(projectId,source);}catch{throw toolError("SOURCE_UNAVAILABLE","Source must be an existing file inside this project's media directory.",{action:"select_imported_source",tool:"timeline_get",arguments:{project_id:projectId}});}
  if(!/\.(mov|mp4|m4v|webm)$/i.test(source))throw toolError("UNSUPPORTED_MEDIA","Playback preparation currently accepts video assets.",{action:"select_video_source"});
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
