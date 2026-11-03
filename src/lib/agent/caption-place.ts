import {z} from "zod";
import {isAgentWorkspaceProject,readTimeline,withProjectLock,writeTimeline} from "../local-store/store";
import {expandCompiledOperations} from "./compiled-operations";
import {deriveProposalTimeline,editorAgentOperationSchema,timelineRevision} from "./timeline-editor-agent-apply";
import {toolError} from "./tool-error";

const inputSchema=z.object({compile_id:z.string().uuid(),expected_revision:z.string().length(64).regex(/^[0-9a-f]+$/)}).strict();

/**
 * Lay a caption compile straight onto an agent build's timeline: the first captions of a new edit need
 * no card. Only inside a live agent_workspace; on a handed-off or human-edited timeline captions go
 * through proposal_create with operations_from. The write derives exactly what approving the same
 * operations would, so a later card tunes the same captions.
 */
export async function placeCompiledCaptions(projectId:string,raw:unknown){
 const parsed=inputSchema.safeParse(raw);
 if(!parsed.success)throw toolError("INVALID_INPUT",parsed.error.issues.map(issue=>`${issue.path.join(".")}: ${issue.message}`).join("; "),{action:"correct_arguments"});
 const {compile_id,expected_revision}=parsed.data;
 if(!isAgentWorkspaceProject(projectId))throw toolError("PROPOSAL_REQUIRED","This timeline was handed off or edited by the creator, so captions arrive on a card.",{action:"propose",tool:"proposal_create",reason:`Give the option operations_from: [{compile_id: "${compile_id}"}].`},409);
 const expanded=expandCompiledOperations(projectId,{expected_revision,options:[{operations_from:[{compile_id}]}]}) as {options:{operations:unknown[]}[]};
 const operations=expanded.options[0]!.operations.map(operation=>editorAgentOperationSchema.parse(operation));
 if(!operations.length||operations.some(operation=>!operation.replace_captions))throw toolError("NOT_A_CAPTION_COMPILE",`Compile ${compile_id} holds more than captions; propose it with proposal_create.`,{action:"propose",tool:"proposal_create"});
 return withProjectLock(projectId,async()=>{
  if(timelineRevision(projectId)!==expected_revision)throw toolError("STALE_COMPILE","The timeline changed since this compile; compile again.",{action:"recompile",tool:"caption_proposal_compile"},409);
  const derived=deriveProposalTimeline(readTimeline(projectId),operations,projectId);
  writeTimeline(projectId,derived.timeline,"agent_captions_place");
  const captions=derived.timeline.elements.filter(element=>element.type==="caption_text"&&!element.removed_at&&derived.touched.includes(element.id));
  return {placed:true as const,compile_id,caption_count:captions.length,before_revision:expected_revision,after_revision:timelineRevision(projectId),
   next:"Tune or restyle these captions directly while the build is yours; after assembly_handoff every change is a card."};
 });
}
