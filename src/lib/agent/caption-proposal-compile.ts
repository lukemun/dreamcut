import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {getPreparationJob} from "./preparation-jobs";
import {projectDir} from "../local-store/paths";
import {readTimeline} from "../local-store/store";
import {validateAlignment} from "../instruments/captions";
import {groupAlignedWordsByNaturalBoundaries} from "../timeline/caption-grouping";
import {sourceTimeToTimelineTime} from "../timeline/speed-steps";
import {editorAgentOperationSchema,timelineRevision} from "./timeline-editor-agent-apply";
import {sha256} from "../media-analysis/custom-cutout";
import {toolError} from "./tool-error";
const schema=z.object({job_id:z.string().uuid(),source_element_id:z.string().uuid(),expected_revision:z.string(),style:z.object({font_preset:z.string(),font_size_px:z.number(),style_variant:z.string(),position_preset:z.string(),max_width:z.number()}).strict()}).strict();
export async function compileCaptionProposal(projectId:string,raw:unknown){
 const input=schema.parse(raw),revision=timelineRevision(projectId);
 if(input.expected_revision!==revision)throw toolError("STALE_REVISION","The working cut changed. Refresh before compiling captions.",{action:"refresh_timeline",tool:"timeline_get",arguments:{project_id:projectId}},409);
 const job=await getPreparationJob(projectId,input.job_id);
 if(job.state!=="completed"||job.input.kind!=="speech"||job.input.mode!=="align"||typeof job.result?.alignment_path!=="string")throw toolError("ALIGNMENT_REQUIRED","Use a completed MFA alignment job based on reviewed text.",{action:"inspect_alignment_job",tool:"asset_preparation_status",arguments:{project_id:projectId,job_id:input.job_id}});
 const timeline=readTimeline(projectId),source=timeline.elements.find(e=>e.id===input.source_element_id&&!e.removed_at);
 if(!source||!["video_clip","vo_segment","vo_full"].includes(source.type))throw new Error("Choose an active speech source element");
 const url=source.props?.archival_source_url??source.source_url,prefix=`/api/projects/${projectId}/media/`;
 if(typeof url!=="string"||!url.startsWith(prefix)||decodeURIComponent(url.slice(prefix.length))!==job.source)throw new Error("Alignment belongs to a different speech source");
 const file=path.join(projectDir(projectId),job.result.alignment_path),hash=await sha256(file);
 const words=validateAlignment(JSON.parse(fs.readFileSync(file,"utf8")));
 if(words.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)))throw new Error("Alignment has nonfinite times");
 const sourceDuration=source.props?.source_duration_seconds;if(typeof sourceDuration!=="number")throw new Error("Speech source needs its source duration");
 const selected=words.filter(w=>w.start>=source.trim_start&&w.end<=sourceDuration-(source.trim_end??0));
 if(!selected.length)throw new Error("No aligned words inside the retained source window");
 const cues=groupAlignedWordsByNaturalBoundaries(selected).map(group=>({element_id:randomUUID(),text:group.text,caption_source_text:group.text,caption_alignment_path:file,
  timeline_start:source.timeline_start+sourceTimeToTimelineTime(source,group.start),duration:sourceTimeToTimelineTime(source,group.end)-sourceTimeToTimelineTime(source,group.start),
  timing_source:{element_id:source.id,alignment_sha256:hash,source_start_seconds:group.start,source_end_seconds:group.end,playback_rate:source.playback_rate}}));
 const operation=editorAgentOperationSchema.parse({element_id:source.id,rationale:"Compile reviewed force-aligned speech into source-bound caption groups.",replace_captions:{...input.style,cues,source_element_ids:[source.id],lane_key:"captions_0",grouping:"pause_first_v1",word_limit:4,offsetX:0,offsetY:0}});
 if(timelineRevision(projectId)!==revision)throw new Error("Timeline changed during compilation; refresh and retry");
 return {expected_revision:revision,operation,persisted:false,next:"Select meaningful review controls, run proposal_spatial_preflight and submit through proposal_create. No timeline changes or approval occurred."};
}
