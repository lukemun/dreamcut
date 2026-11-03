import type { TimelineElement } from "@/components/studio/timeline/types";
import { captionAudioSourceId, captionFollowsAudio } from "./caption-audio-link";
import { sourceTimeToTimelineTime, timelineTimeToSourceTime } from "./speed-steps";

export type SpeechWord = { text: string; start: number; end: number; captionId: string };
export function speechTranscript(elements: readonly TimelineElement[], laneKey?: string) {
  return elements.filter(source => !source.removed_at && ["video_clip", "vo_full", "vo_segment"].includes(source.type)
    && (!laneKey || source.lane_key === laneKey)).sort((a,b) => a.timeline_start-b.timeline_start).map(source => {
    const captions = elements.filter(c => !c.removed_at && captionFollowsAudio(c) && captionAudioSourceId(c) === source.id)
      .sort((a,b) => a.timeline_start-b.timeline_start);
    const words: SpeechWord[] = [];
    for (const c of captions) {
      const binding = c.props?.caption_audio_binding as { words?: {text:string;start:number;end:number}[] } | undefined;
      for (const w of binding?.words ?? []) {
        if (Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start && w.start >= source.trim_start-0.001
          && w.end <= timelineTimeToSourceTime(source, source.duration)+0.001) words.push({...w, captionId:c.id});
      }
    }
    words.sort((a,b) => a.start-b.start);
    return { source, captions, words, text: captions.map(c => String(c.props?.text ?? "")).join(" ") };
  });
}
export function speechPauses(elements: readonly TimelineElement[], laneKey: string, minimum = 0.6, keep = 0.2) {
  return speechTranscript(elements,laneKey).flatMap(({source,words}) => words.slice(1).flatMap((word,index) => {
    const previous = words[index]!;
    const start = source.timeline_start + sourceTimeToTimelineTime(source,previous.end);
    const end = source.timeline_start + sourceTimeToTimelineTime(source,word.start);
    if (end-start < minimum || end-start <= keep) return [];
    return [{ sourceId:source.id, start, end, duration:end-start,
      sourceStart: timelineTimeToSourceTime(source,start-source.timeline_start+keep/2),
      sourceEnd: timelineTimeToSourceTime(source,end-source.timeline_start-keep/2) }];
  }));
}

/** Hesitation sounds only. Words such as "like" or "actually" often carry meaning, so they stay a manual cut. */
const FILLER_WORDS = new Set(["um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "hmm", "mm", "mhm"]);
export const speechWordKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
/** Source range that removes words first..last, splitting the gaps to their neighbours and staying inside the clip. */
export function speechWordCutRange(source: TimelineElement, words: readonly SpeechWord[], first: number, last: number) {
  const start = first > 0 ? (words[first-1]!.end+words[first]!.start)/2 : words[first]!.start-0.04;
  const end = last+1 < words.length ? (words[last]!.end+words[last+1]!.start)/2 : words[last]!.end+0.04;
  return { sourceStart: Math.max(source.trim_start, start), sourceEnd: Math.min(timelineTimeToSourceTime(source, source.duration), end) };
}
/** Runs of adjacent filler words per clip, so back-to-back fillers leave as one cut. */
export function speechFillers(elements: readonly TimelineElement[], laneKey: string) {
  return speechTranscript(elements,laneKey).flatMap(({source,words}) => {
    const runs: { sourceId: string; first: number; last: number; start: number; text: string; sourceStart: number; sourceEnd: number }[] = [];
    words.forEach((word,index) => {
      if (!FILLER_WORDS.has(speechWordKey(word.text))) return;
      const run = runs.at(-1);
      if (run && run.last === index-1) { run.last = index; run.text += ` ${word.text}`; }
      else runs.push({ sourceId:source.id, first:index, last:index, text:word.text,
        start: source.timeline_start+sourceTimeToTimelineTime(source,word.start), sourceStart:0, sourceEnd:0 });
    });
    return runs.map(run => ({ ...run, ...speechWordCutRange(source,words,run.first,run.last) }));
  });
}
/** Word ranges whose words contain the query's words in order. */
export function speechWordMatches(words: readonly { text: string }[], query: string) {
  const terms = query.split(/\s+/).map(speechWordKey).filter(Boolean);
  if (!terms.length) return [];
  const matches: { first: number; last: number }[] = [];
  for (let first = 0; first+terms.length <= words.length; first++)
    if (terms.every((term,offset) => speechWordKey(words[first+offset]!.text).includes(term))) matches.push({ first, last:first+terms.length-1 });
  return matches;
}
