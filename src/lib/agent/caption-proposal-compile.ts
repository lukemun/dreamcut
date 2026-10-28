import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {getPreparationJob} from "./preparation-jobs";
import {projectDir} from "../local-store/paths";
import {readTimeline} from "../local-store/store";
import {validateAlignment} from "../instruments/captions";
import {groupAlignedWordsByNaturalBoundaries} from "../timeline/caption-grouping";
import {CAPTION_LOOKS} from "../timeline/panel-text-presets";
import {sourceTimeToTimelineTime} from "../timeline/speed-steps";
import {captionDisplayText,editorAgentOperationSchema,timelineRevision} from "./timeline-editor-agent-apply";
import {writtenCaptionUnits,type WrittenCaptionUnit} from "./caption-written-words";
import {sha256} from "../media-analysis/custom-cutout";
import {toolError} from "./tool-error";
import {storeCompiledOperations} from "./compiled-operations";
import {DEFAULT_CAPTION_PROPS,SPEECH_CAPTIONS_HIDE_PUNCTUATION} from "../timeline/captions";
import {readMetadata} from "../local-store/store";
import {effectivePreferences} from "../local-store/editing-memory";

/** A replace_captions operation holds at most this many cues; longer talks become several, applied in order. */
export const CAPTION_CUES_PER_OPERATION=250;
/** replace_captions scopes at most this many speech clips per operation. */
const CAPTION_SOURCES_PER_OPERATION=32;
const schema=z.object({job_id:z.string().uuid(),source_element_id:z.string().uuid().optional(),source_element_ids:z.array(z.string().uuid()).min(1).max(500).optional(),expected_revision:z.string(),
 style:z.object({look:z.string().optional(),font_preset:z.string().optional(),font_size_px:z.number(),style_variant:z.string().optional(),position_preset:z.string(),max_width:z.number()}).strict().optional(),
 font_sizing:z.enum(["fixed","fit"]).optional(),
 include_cues:z.boolean().optional(),
 written_text:z.string().min(1).max(200_000).optional(),
 word_limit:z.number().int().min(1).max(4).optional(),
 timing_mode:z.enum(["phrase","active_word","single_word"]).optional(),
 single_word_flip_seconds:z.number().min(0).max(0.3).optional(),
 hide_punctuation:z.boolean().optional(),
 offset_y:z.number().min(-0.45).max(0.45).optional()}).strict()
 .refine(input=>Boolean(input.source_element_id)!==Boolean(input.source_element_ids),{message:"Give source_element_id or source_element_ids, not both"});

/** Without a style, captions use the product's default caption look; My Style should normally choose one. */
const PRODUCT_DEFAULT_STYLE={font_preset:DEFAULT_CAPTION_PROPS.fontPreset,style_variant:DEFAULT_CAPTION_PROPS.styleVariant,
 font_size_px:DEFAULT_CAPTION_PROPS.fontSizePx,position_preset:DEFAULT_CAPTION_PROPS.positionPreset,max_width:DEFAULT_CAPTION_PROPS.maxWidth};

/** The editor's caption look sets the style and its own font; a font from elsewhere is refused. */
function resolveLookStyle(style:NonNullable<z.infer<typeof schema>["style"]>){
 const {look:lookId,...rest}=style;
 if(!lookId){
  if(!rest.font_preset||!rest.style_variant)throw new Error("Choose a caption look (style.look), or give both font_preset and style_variant");
  return {...rest,font_preset:rest.font_preset,style_variant:rest.style_variant};
 }
 const look=CAPTION_LOOKS.find(item=>item.id===lookId);
 if(!look)throw new Error(`Unknown caption look "${lookId}"; choose one of ${CAPTION_LOOKS.map(item=>item.id).join(", ")}`);
 if((rest.font_preset&&rest.font_preset!==look.fontPreset)||(rest.style_variant&&rest.style_variant!==look.styleVariant))
  throw new Error(`The ${look.label} look uses ${look.styleVariant} with the ${look.fontPreset} font; leave font_preset and style_variant out`);
 return {...rest,font_preset:look.fontPreset,style_variant:look.styleVariant};
}

const bare=(word:string)=>word.replace(/[.,!?;:]+$/,"");

/** One caption from a run of written units: the spoken words time it, written words read on screen. */
function cueText(units:WrittenCaptionUnit[]){
 const spoken=units.flatMap(unit=>unit.spoken.map(word=>word.word)).join(" ");
 const substitutions=units.flatMap(unit=>{
  const said=unit.spoken.map(word=>word.word),last=said.length-1,spokenText=[...said.slice(0,last),bare(said[last]!)].join(" ");
  return bare(unit.word)!==spokenText&&bare(unit.word)?[{spoken:spokenText,display:bare(unit.word)}]:[];
 }).filter((item,index,all)=>all.findIndex(other=>other.spoken===item.spoken)===index).slice(0,20);
 try{return {text:captionDisplayText(spoken,substitutions),caption_source_text:spoken,...(substitutions.length?{caption_display_substitutions:substitutions}:{})};}
 catch{return {text:spoken,caption_source_text:spoken};}
}

export async function compileCaptionProposal(projectId:string,raw:unknown){
 const input=schema.parse(raw),revision=timelineRevision(projectId);
 if(input.expected_revision!==revision)throw toolError("STALE_REVISION","The working cut changed. Refresh before compiling captions.",{action:"refresh_timeline",tool:"timeline_get",arguments:{project_id:projectId}},409);
 // A single word reads at a larger size than a phrase, so the default look grows for one-word captions.
 const singleDefault=(input.timing_mode??(input.word_limit&&input.word_limit>1?"phrase":"single_word"))==="single_word";
 const style=input.style?resolveLookStyle(input.style):{...PRODUCT_DEFAULT_STYLE,...(singleDefault?{font_size_px:72}:{})};
 // The creator's caption preferences travel with the result, so the look is chosen with them in view.
 const aspectRatio=(()=>{try{return readMetadata(projectId).output_aspect_ratio;}catch{return "";}})();
 const preferences=effectivePreferences(projectId,aspectRatio)
  .filter(preference=>preference.category==="Captions").map(preference=>({text:preference.text,scope:preference.scope}));
 const job=await getPreparationJob(projectId,input.job_id);
 if(job.state!=="completed"||job.input.kind!=="speech"||job.input.mode!=="align"||typeof job.result?.alignment_path!=="string")throw toolError("ALIGNMENT_REQUIRED","Use a completed MFA alignment job based on reviewed text.",{action:"inspect_alignment_job",tool:"asset_preparation_status",arguments:{project_id:projectId,job_id:input.job_id}});
 // A speaker cut into many clips (dead space removed) shares one aligned recording; every clip from it captions together.
 const timeline=readTimeline(projectId),prefix=`/api/projects/${projectId}/media/`;
 const sources=[...new Set(input.source_element_ids??[input.source_element_id!])].map(id=>{
  const source=timeline.elements.find(e=>e.id===id&&!e.removed_at);
  if(!source||!["video_clip","vo_segment","vo_full"].includes(source.type))throw new Error(`Choose an active speech source element: ${id}`);
  const url=source.props?.archival_source_url??source.source_url;
  if(typeof url!=="string"||!url.startsWith(prefix)||decodeURIComponent(url.slice(prefix.length))!==job.source)throw new Error(`Alignment belongs to a different speech source: ${id}`);
  if(typeof source.props?.source_duration_seconds!=="number")throw new Error(`Speech source needs its source duration: ${id}`);
  return source;
 }).sort((a,b)=>a.timeline_start-b.timeline_start);
 const file=path.join(projectDir(projectId),job.result.alignment_path),hash=await sha256(file);
 const words=validateAlignment(JSON.parse(fs.readFileSync(file,"utf8")));
 if(words.some(w=>!Number.isFinite(w.start)||!Number.isFinite(w.end)))throw new Error("Alignment has nonfinite times");
 const reviewed=typeof job.input.reviewed_text==="string"?job.input.reviewed_text:undefined;
 const units=input.written_text?writtenCaptionUnits(words,input.written_text,reviewed)
  :words.map(word=>({word:word.word,start:word.start,end:word.end,spoken:[word]}));
 // Shipped defaults: one word at a time at a fixed size. Several words per caption read as phrases.
 const timingMode=input.timing_mode??(input.word_limit&&input.word_limit>1?"phrase":"single_word");
 const wordLimit=input.word_limit??(timingMode==="single_word"?1:4);
 const cues=sources.flatMap(source=>{
  const sourceDuration=source.props!.source_duration_seconds as number;
  const selected=units.filter(u=>u.start>=source.trim_start&&u.end<=sourceDuration-(source.trim_end??0));
  // Groups stay inside one clip: a caption never spans a cut.
  const groups=wordLimit===1?selected.map(unit=>[unit])
   :groupAlignedWordsByNaturalBoundaries(selected,{maxWords:wordLimit,preferredWords:Math.min(3,wordLimit),minWords:Math.min(3,wordLimit)}).map(group=>group.words as WrittenCaptionUnit[]);
  const at=(seconds:number)=>source.timeline_start+sourceTimeToTimelineTime(source,seconds);
  return groups.map(group=>{
   const start=group[0]!.start,end=group[group.length-1]!.end;
   return {element_id:randomUUID(),...cueText(group),caption_alignment_path:file,timeline_start:at(start),duration:at(end)-at(start),
    timing_source:{element_id:source.id,alignment_sha256:hash,source_start_seconds:start,source_end_seconds:end,playback_rate:source.playback_rate}};
  });
 }).sort((a,b)=>a.timeline_start-b.timeline_start);
 if(!cues.length)throw new Error("No aligned words inside the retained source window");
 const single=timingMode==="single_word";
 const shared={...style,lane_key:"captions_0",grouping:"pause_first_v1",word_limit:wordLimit,offsetX:0,offsetY:input.offset_y??0,
  timing_mode:timingMode,font_sizing:input.font_sizing??"fixed",...(single?{singleWordFlipSeconds:input.single_word_flip_seconds??0}:{}),
  hide_punctuation:input.hide_punctuation??SPEECH_CAPTIONS_HIDE_PUNCTUATION};
 const operations:Array<ReturnType<typeof editorAgentOperationSchema.parse>>=[];
 // Each operation replaces only its own clips' captions, so chunks stay within the cue and clip limits.
 const chunks:Array<typeof cues>=[];
 for(const cue of cues){
  const chunk=chunks.at(-1),ids=new Set(chunk?.map(item=>item.timing_source.element_id));
  if(!chunk||chunk.length>=CAPTION_CUES_PER_OPERATION||(!ids.has(cue.timing_source.element_id)&&ids.size>=CAPTION_SOURCES_PER_OPERATION))chunks.push([cue]);
  else chunk.push(cue);
 }
 chunks.forEach((chunk,index)=>operations.push(editorAgentOperationSchema.parse({element_id:randomUUID(),rationale:"Compile reviewed force-aligned speech into source-bound caption groups.",
  replace_captions:{...shared,source_element_ids:[...new Set(chunk.map(cue=>cue.timing_source.element_id))],cues:chunk,...(index?{from_timeline_seconds:chunk[0]!.timeline_start}:{})}})));
 if(timelineRevision(projectId)!==revision)throw new Error("Timeline changed during compilation; refresh and retry");
 // Every chunk is one caption track: each dial on the first operation moves them all.
 const linked=operations.slice(1).map((_,index)=>index+1);
 const review_controls=["font_size_px","offsetX","offsetY",...(single?["singleWordFlipSeconds"]:[])]
  .map(field=>({operation_index:0,target:"replace_captions",field,...(linked.length?{linked_operation_indices:linked}:{})}));
 const compile_id=storeCompiledOperations(projectId,"caption_proposal_compile",revision,operations,review_controls);
 return {compile_id,expected_revision:revision,style_source:input.style?"given":"product_default",preferences,
  ...(input.include_cues?{operations}:{}),review_controls,cue_count:cues.length,operation_count:operations.length,
  first_cues:cues.slice(0,5).map(cue=>({text:cue.text,timeline_start:cue.timeline_start})),
  written_differently:cues.filter(cue=>"caption_display_substitutions" in cue).length,
  next:`In proposal_create, give the option operations_from: [{compile_id: "${compile_id}"}] (its operations come first, with these review_controls unless you send your own) and the same expected_revision. ${preferences.length?"Apply the creator's caption preferences above; compile again with the look they name.":input.style?"":"No caption preference or style was given, so the product's default look was used."} No timeline changes or approval occurred.`};
}
