import { randomUUID, createHash } from "node:crypto";
import type { TimelineFile } from "./store";
import { activeElements, captureProjectHistorySnapshot, readTimeline, withProjectLock, writeTimeline } from "./store";
import { speechTranscript, speechPauses, speechFillers, speechWordCutRange } from "@/lib/timeline/speech-transcript";
import { buildGeneratedCaptions, prepareCaptionTranscript, generateReviewedCaptions } from "./generate-captions";
import { deriveProposalTimeline } from "@/lib/agent/timeline-editor-agent-apply";
import { bindGeneratedCaption } from "@/lib/timeline/caption-audio-link";

export const transcriptRevision = (timeline: TimelineFile) => createHash("sha256").update(JSON.stringify(timeline)).digest("hex");
function fail(message: string): never { throw Object.assign(new Error(message), { status: 409 }); }
export function regroupSpeech(timeline: TimelineFile, laneKey: string, limit: number): TimelineFile {
  const next = structuredClone(timeline);
  const groups = speechTranscript(next.elements, laneKey).filter(group => group.captions.length);
  if (!groups.length) fail("Transcribe this track first.");
  for (const {source,captions,words} of groups) {
    if (source.position_locked || captions.some(c => c.position_locked)) fail("Unlock the speech and captions first.");
    if (!words.length || words.map(w=>w.text).join(" ") !== captions.map(c=>String(c.props?.text ?? "")).join(" ")) fail("Correct the transcript and refresh its timing before regrouping.");
    const replacement = buildGeneratedCaptions(source,words.map(w=>({word:w.text,start:w.start-source.trim_start,end:w.end-source.trim_start})),limit);
    for (const row of replacement) {
      const style = captions.find(c => c.timeline_start+c.duration > row.timeline_start)?.props ?? captions[0]!.props;
      row.props = {...style,...row.props, ...Object.fromEntries(Object.entries(style ?? {}).filter(([key]) =>
        !["text","wordTimings","wordStyles","caption_audio_binding","caption_source_element_id","caption_follow_audio","timingMode"].includes(key)))};
      row.props.timingMode = limit === 1 ? "single_word" : style?.timingMode === "single_word" ? "phrase" : style?.timingMode ?? "phrase";
      row.lane_key = captions[0]!.lane_key;
      row.lane_index = captions[0]!.lane_index;
      bindGeneratedCaption(row,source);
    }
    for (const c of captions) Object.assign(c,{removed_at:new Date().toISOString(),removed_reason:"caption_regrouped"});
    next.elements.push(...replacement);
  }
  return next;
}
export function cleanSpeechPauses(timeline: TimelineFile,laneKey: string,minimum: number,keep: number, projectId: string, starts?: number[]) {
  if (!Number.isFinite(minimum) || minimum < 0.3 || minimum > 5 || !Number.isFinite(keep) || keep < 0.1 || keep >= minimum) fail("Choose a pause length longer than the space to keep.");
  const pauses = speechPauses(timeline.elements,laneKey,minimum,keep).filter(p=>!starts || starts.some(s=>Math.abs(s-p.start)<0.001)).sort((a,b)=>b.start-a.start);
  if (!pauses.length) fail("No matching pauses remain.");
  let next = timeline;
  // Right to left keeps each earlier source interval and target ID intact.
  for (const pause of pauses) {
    const source = next.elements.find(e=>e.id===pause.sourceId)!;
    if (source.props?.keyframes && (source.props.keyframes as Record<string,unknown>).playback_rate) fail("Pause cleanup needs constant speech speed.");
    next = deriveProposalTimeline(next,[{element_id:source.id,rationale:"Clean up a speech pause", source_range_cut:{
      source_start_seconds:pause.sourceStart,source_end_seconds:pause.sourceEnd,
      removed_segment_id:randomUUID(),inserted_element_id:randomUUID(),max_affected_elements:500,
    }}],projectId).timeline;
  }
  return {timeline:next,count:pauses.length};
}
export function removeSpeechFillers(timeline: TimelineFile, laneKey: string, projectId: string) {
  const fillers = speechFillers(timeline.elements,laneKey).sort((a,b)=>b.start-a.start);
  if (!fillers.length) fail("No filler words remain.");
  let next = timeline;
  // Right to left, as with pauses, so earlier clips keep their source intervals and IDs.
  for (const filler of fillers) {
    const source = next.elements.find(e=>e.id===filler.sourceId)!;
    if (source.props?.keyframes && (source.props.keyframes as Record<string,unknown>).playback_rate) fail("Removing filler words needs constant speech speed.");
    next = deriveProposalTimeline(next,[{element_id:source.id,rationale:"Remove filler words",source_range_cut:{
      source_start_seconds:filler.sourceStart,source_end_seconds:filler.sourceEnd,
      removed_segment_id:randomUUID(),inserted_element_id:randomUUID(),max_affected_elements:500,
    }}],projectId).timeline;
  }
  return {timeline:next,count:fillers.length};
}
export async function editSpeechTranscript(projectId: string, body: {action:string;laneKey:string;revision:string;wordLimit?:number;minimum?:number;keep?:number;starts?:number[];elementId?:string;text?:string;firstWord?:number;lastWord?:number}) {
  if (body.action === "correct") {
    const timeline = readTimeline(projectId);
    if (transcriptRevision(timeline)!==body.revision) fail("The edit changed. Reload the transcript and try again.");
    if (!body.text?.trim() || body.text.length>100000) fail("Enter the corrected speech first.");
    const group = speechTranscript(timeline.elements,body.laneKey).find(g=>g.source.id===body.elementId);
    if (!group || !group.captions.length) fail("This speech clip is no longer available.");
    const prepared = await prepareCaptionTranscript(projectId,group.source.id,body.text);
    return generateReviewedCaptions(projectId,prepared.sessionId,body.text,body.wordLimit ?? 1);
  }
  return withProjectLock(projectId, async () => {
    const timeline = readTimeline(projectId);
    if (transcriptRevision(timeline)!==body.revision) fail("The edit changed. Reload the transcript and try again.");
    let next: TimelineFile;
    let count = 0;
    if (body.action === "regroup") next = regroupSpeech(timeline,body.laneKey,body.wordLimit!);
    else if (body.action === "cleanup") {
      const result=cleanSpeechPauses(timeline,body.laneKey,body.minimum ?? 0.6,body.keep ?? 0.2,projectId,body.starts);
      next=result.timeline;count=result.count;
    } else if (body.action === "fillers") {
      const result=removeSpeechFillers(timeline,body.laneKey,projectId);
      next=result.timeline;count=result.count;
    } else if (body.action === "cut") {
      const group=speechTranscript(timeline.elements,body.laneKey).find(g=>g.source.id===body.elementId);
      if (!group || !Number.isInteger(body.firstWord) || !Number.isInteger(body.lastWord)) fail("Select words to cut.");
      if (group.source.props?.keyframes && (group.source.props.keyframes as Record<string,unknown>).playback_rate) fail("Cutting words needs constant speech speed.");
      const first=body.firstWord!,last=body.lastWord!;
      if (first<0 || last<first || last>=group.words.length) fail("Select words to cut.");
      const {sourceStart,sourceEnd}=speechWordCutRange(group.source,group.words,first,last);
      next=deriveProposalTimeline(timeline,[{element_id:group.source.id,rationale:"Cut selected speech",source_range_cut:{source_start_seconds:sourceStart,source_end_seconds:sourceEnd,removed_segment_id:randomUUID(),inserted_element_id:randomUUID(),max_affected_elements:500}}],projectId).timeline;
    } else fail("Unknown transcript action.");
    // Derivation completes before recording or writing any part of the change.
    const before=captureProjectHistorySnapshot(projectId,`transcript_${body.action}_before`);
    writeTimeline(projectId,next,`transcript_${body.action}`);
    const after=captureProjectHistorySnapshot(projectId,`transcript_${body.action}_after`);
    return {history:{before,after},count};
  });
}
