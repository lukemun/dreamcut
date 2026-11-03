import fs from "node:fs";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {projectInstrumentsDir} from "../local-store/paths";
import {readJsonFile,writeJsonFileAtomic} from "../local-store/atomic-json";
import {toolError} from "./tool-error";

/**
 * Compile tools store their operations here so a card can name them (`operations_from`) instead of
 * the agent pasting hundreds of caption cues back into proposal_create.
 */
type CompiledOperations={compile_id:string;tool:string;expected_revision:string;created_at:string;sha256:string;
 operations:unknown[];review_controls:{operation_index:number;linked_operation_indices?:number[];[key:string]:unknown}[]};
const COMPILE_ID=/^[0-9a-f-]{36}$/;
const compilesDir=(projectId:string)=>path.join(projectInstrumentsDir(projectId),"agent-compiles");
const digest=(operations:unknown[])=>createHash("sha256").update(JSON.stringify(operations)).digest("hex");

export function storeCompiledOperations(projectId:string,tool:string,expectedRevision:string,operations:unknown[],reviewControls:CompiledOperations["review_controls"]){
 const record:CompiledOperations={compile_id:randomUUID(),tool,expected_revision:expectedRevision,created_at:new Date().toISOString(),sha256:digest(operations),operations,review_controls:reviewControls};
 fs.mkdirSync(compilesDir(projectId),{recursive:true});
 writeJsonFileAtomic(path.join(compilesDir(projectId),`${record.compile_id}.json`),record);
 return record.compile_id;
}

function readCompiledOperations(projectId:string,compileId:string){
 const record=COMPILE_ID.test(compileId)?readJsonFile<CompiledOperations|null>(path.join(compilesDir(projectId),`${compileId}.json`),null):null;
 if(!record||record.sha256!==digest(record.operations))throw toolError("COMPILE_NOT_FOUND",`No stored compile ${compileId} in this project; compile again.`,{action:"recompile"},404);
 return record;
}

/**
 * Replace each option's `operations_from` with the stored operations, placed first and in the order
 * named, so the compile's dials keep their indices. The card must target the revision they were
 * compiled against. When the option names no dials, the compile's own dials are used.
 */
export function expandCompiledOperations(projectId:string,raw:Record<string,unknown>){
 const options=Array.isArray(raw.options)?raw.options as Record<string,unknown>[]:[];
 if(!options.some(option=>option?.operations_from))return raw;
 return {...raw,options:options.map(option=>{
  const refs=option?.operations_from as {compile_id:string}[]|undefined;
  if(!refs?.length){const {operations_from:_,...rest}=option;return rest;}
  const compiled:unknown[]=[],controls:CompiledOperations["review_controls"]=[];
  for(const ref of refs){
   const record=readCompiledOperations(projectId,ref.compile_id);
   if(record.expected_revision!==raw.expected_revision)throw toolError("STALE_COMPILE",`Compile ${ref.compile_id} was made for another revision of the timeline; compile again for the card's expected_revision.`,{action:"recompile"},409);
   const offset=compiled.length;
   compiled.push(...record.operations);
   controls.push(...record.review_controls.map(control=>({...control,operation_index:control.operation_index+offset,
    ...(control.linked_operation_indices?{linked_operation_indices:control.linked_operation_indices.map(index=>index+offset)}:{})})));
  }
  const {operations_from:_,...rest}=option;
  return {...rest,operations:[...compiled,...(Array.isArray(option.operations)?option.operations:[])],
   ...(option.review_controls===undefined?{review_controls:controls}:{})};
 })};
}
