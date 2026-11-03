import {z} from "zod";
import {findElement,readTimeline} from "../local-store/store";
import {ensureLoudnessNormalizedMedia,ensureSpeechEvenedMedia,ensureVoiceEnhancedMedia,mediaFileSha256,NARRATOR_NORMALIZATION_TARGET,resolveLocalMediaSource} from "../local-store/audio-effects";
import {VOICE_ENHANCEMENT_DEFAULT_STRENGTH} from "../timeline/audio-effects";
import {toolError} from "./tool-error";

const schema=z.object({element_ids:z.array(z.string().uuid()).min(1).max(40),strength_percent:z.number().int().min(0).max(100).optional(),normalize_loudness:z.boolean().optional(),even_out:z.boolean().optional()}).strict();
const AUDIO_TYPES=new Set(["video_clip","vo_segment","vo_full","music","sound_effect"]);
const ORIGINAL_SOURCE_KEYS=["voice_enhancement_original_source_url","audio_cleanup_original_source_url","loudness_normalization_original_source_url"];
const ORIGINAL_PREVIEW_KEYS=["voice_enhancement_original_preview_audio_source_url","audio_cleanup_original_preview_audio_source_url","loudness_normalization_original_preview_audio_source_url"];
const ORIGINAL_RENDER_KEYS=["voice_enhancement_original_render_authority_source_url","audio_cleanup_original_render_authority_source_url","loudness_normalization_original_render_authority_source_url"];
const NORMALIZATION_RECIPE=`narrator-target:I=${NARRATOR_NORMALIZATION_TARGET.integratedLufs}:TP=${NARRATOR_NORMALIZATION_TARGET.truePeakDbtp}:clip-volume`;

function firstString(props:Record<string,unknown>,keys:string[]) {
  for(const key of keys) if(typeof props[key]==="string") return props[key] as string;
  return null;
}

/**
 * Prepare DeepFilterNet voice cleanup (background-noise removal) for clips on the working
 * timeline and return one `use_voice_enhancement` payload per clip for proposal_create.
 * Each distinct source is processed once and cached; clips cut from the same recording share
 * it. Also returns the clip volume that brings the cleaned voice to the narrator loudness target.
 * Never writes the timeline: adoption is the creator's approval of the card.
 */
export function prepareVoiceEnhancement(projectId:string,raw:unknown) {
  const input=schema.safeParse(raw);
  if(!input.success) throw toolError("INVALID_INPUT",input.error.issues.map(issue=>`${issue.path.join(".")}: ${issue.message}`).join("; "),{action:"fix_arguments"});
  const strength=input.data.strength_percent??VOICE_ENHANCEMENT_DEFAULT_STRENGTH;
  const timeline=readTimeline(projectId);
  type Prepared={sourceUrl:string;previewAudioSourceUrl:string;absolutePath:string;recipe:string;strength:number;attenuationLimitDb:number;outputLufs:number;outputTruePeak:number;inputLufs:number;inputNoiseRmsDbfs:number;outputNoiseRmsDbfs:number};
  const processedBySource=new Map<string,Prepared>();
  const prepare=(sourcePath:string,hasVideo:boolean):Prepared=>{
    const enhanced=ensureVoiceEnhancedMedia(projectId,sourcePath,hasVideo,strength);
    const base={strength:enhanced.strength,attenuationLimitDb:enhanced.attenuationLimitDb,inputLufs:Number(enhanced.inputMeasurement.input_i),inputNoiseRmsDbfs:enhanced.inputNoiseRmsDbfs,outputNoiseRmsDbfs:enhanced.outputNoiseRmsDbfs};
    if(!input.data.normalize_loudness) return {...base,sourceUrl:enhanced.sourceUrl,previewAudioSourceUrl:enhanced.previewAudioSourceUrl,absolutePath:enhanced.absolutePath,recipe:enhanced.recipe,outputLufs:Number(enhanced.outputMeasurement.input_i),outputTruePeak:Number(enhanced.outputMeasurement.input_tp)};
    // Cleanup leaves speech quieter; level the cleaned recording to the narrator target so
    // clip volume has headroom to even out sections instead of hitting its 4x ceiling.
    // Even out first when one recording has quiet and loud sections: one constant gain can't
    // fix that, and boosting the quiet clips afterwards clips their peaks.
    const evened=input.data.even_out?ensureSpeechEvenedMedia(projectId,enhanced.absolutePath,hasVideo):null;
    const levelled=ensureLoudnessNormalizedMedia(projectId,evened?.absolutePath??enhanced.absolutePath,hasVideo);
    const recipe=[enhanced.recipe,evened?.recipe,levelled.recipe].filter(Boolean).join("|");
    return {...base,sourceUrl:levelled.sourceUrl,previewAudioSourceUrl:levelled.previewAudioSourceUrl,absolutePath:levelled.absolutePath,recipe,outputLufs:Number(levelled.outputMeasurement.input_i),outputTruePeak:Number(levelled.outputMeasurement.input_tp)};
  };
  const items=input.data.element_ids.map(elementId=>{
    const element=findElement(timeline,elementId);
    if(!element||element.removed_at!=null) throw toolError("ELEMENT_NOT_FOUND",`Timeline element ${elementId} not found`,{action:"read_timeline"},404);
    if(!AUDIO_TYPES.has(element.type)) throw toolError("NO_AUDIO",`Element ${elementId} has no editable audio`,{action:"choose_audio_clips"});
    const props=(element.props??{}) as Record<string,unknown>;
    const originalSourceUrl=firstString(props,ORIGINAL_SOURCE_KEYS)??element.source_url;
    if(typeof originalSourceUrl!=="string") throw toolError("NO_AUDIO",`Element ${elementId} has no audio source`,{action:"choose_audio_clips"});
    const source=resolveLocalMediaSource(projectId,originalSourceUrl,{allowReferencedProject:true});
    if(!source) throw toolError("NOT_LOCAL_MEDIA",`Element ${elementId} uses media outside the project; import it first`,{action:"media_import"});
    const key=`${source.absolutePath}\u0000${element.type==="video_clip"}`;
    let processed=processedBySource.get(key);
    if(!processed) {
      processed=prepare(source.absolutePath,element.type==="video_clip");
      processedBySource.set(key,processed);
    }
    const outputLufs=processed.outputLufs;
    // Never suggest a gain that pushes the loudest peak past -0.5 dBFS: that clips (crackle).
    const peakSafe=Number.isFinite(processed.outputTruePeak)?10**((-0.5-processed.outputTruePeak)/20):4;
    const suggestedVolume=Number.isFinite(outputLufs)
      ? Math.min(4,Number(peakSafe.toFixed(2)),Math.max(0.1,Number((10**((NARRATOR_NORMALIZATION_TARGET.integratedLufs-outputLufs)/20)).toFixed(2))))
      : 1;
    return {
      element_id:elementId,
      use_voice_enhancement:{
        processed_source_url:processed.sourceUrl,
        processed_preview_audio_source_url:processed.previewAudioSourceUrl,
        original_source_url:originalSourceUrl,
        original_preview_audio_source_url:firstString(props,ORIGINAL_PREVIEW_KEYS)??(typeof props.preview_audio_source_url==="string"?props.preview_audio_source_url:originalSourceUrl),
        original_render_authority_source_url:firstString(props,ORIGINAL_RENDER_KEYS)??(typeof props.render_authority_source_url==="string"?props.render_authority_source_url:originalSourceUrl),
        processed_sha256:mediaFileSha256(processed.absolutePath),
        strength_percent:processed.strength,
        attenuation_limit_db:processed.attenuationLimitDb,
        recipe:processed.recipe,
        normalization_target_lufs:NARRATOR_NORMALIZATION_TARGET.integratedLufs,
        normalization_true_peak_dbtp:NARRATOR_NORMALIZATION_TARGET.truePeakDbtp,
        normalization_recipe:NORMALIZATION_RECIPE,
      },
      suggested_volume:suggestedVolume,
      measurements:{
        input_lufs:processed.inputLufs,
        output_lufs:outputLufs,
        output_true_peak_dbtp:processed.outputTruePeak,
        input_noise_rms_dbfs:processed.inputNoiseRmsDbfs,
        output_noise_rms_dbfs:processed.outputNoiseRmsDbfs,
      },
    };
  });
  return {
    items,
    next:"Put each item's use_voice_enhancement on a proposal_create operation for its element_id, with patch.volume set to suggested_volume so the cleaned voice lands near the narrator loudness target. Approval adopts it; nothing changed yet.",
  };
}
