import type { AssetDraft } from "./assets";
import { modelVoices } from "./voices";

export const ASSET_CATALOG_VERSION = "2026-10-24.1";
export type ReferenceRole = AssetDraft["references"][number]["role"];
export const ROLE_LABELS: Record<ReferenceRole, string> = { start: "Start frame", end: "End frame", subject: "Subject", composition: "Composition", style: "Style", edit: "Image to edit", motion: "Motion video", source: "Source video", audio: "Audio" };
/** Reference roles carried as media with a length (sent trimmed to the reference's window). */
export const MEDIA_ROLES: readonly ReferenceRole[] = ["source", "motion", "audio"];
export const ALL_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] as const satisfies readonly AssetDraft["aspect"][];
type Adapter = "schnell" | "kontext" | "flux2" | "nano" | "gpt-image" | "kling" | "veo" | "seedance" | "seedance25" | "h3" | "sync3" | "latentsync"
  | "motion" | "recast" | "wan-replace" | "o1-edit" | "seedance-ref" | "music3" | "mureka" | "eleven-music" | "speech";
/**
 * A voiceover model on OpenRouter's /audio/speech. `variants` maps each quality (the model's `resolutions`, or
 * `best` alone) to the OpenRouter model and its USD rate: per character of input, per second of audio
 * (`second`), or per input token with `outputRate` per audio token (`token`, Gemini).
 */
type Speech = {
  variants: Record<string, { model: string; rate: number; outputRate?: number; voiceSuffix?: string }>;
  billing: "character" | "token" | "second";
  /** What OpenRouter returns: MP3, or raw PCM (Gemini, HeyGen) that the Cloud wraps as WAV. */
  format: "mp3" | "pcm";
  /** The voice a new draft starts with; absent where the voice comes from the prompt or the model's own. */
  defaultVoice?: string;
  /** Takes delivery directions apart from the script (OpenRouter `instructions`). */
  delivery?: boolean;
  /** Reads a prompt that describes the voice and what it says, rather than a script spoken word for word. */
  promptVoice?: boolean;
  maxChars?: number;
};
type Model = {
  id: string; name: string; kind: "image" | "video" | "audio" | "speech"; description: string;
  roles: readonly ReferenceRole[]; required: readonly ReferenceRole[]; durations: readonly number[]; resolutions: readonly string[];
  aspects: readonly AssetDraft["aspect"][]; maxCount: number; audio: boolean; audioRequired?: boolean;
  /** Most references of one role; one when absent. */
  limits?: Partial<Record<ReferenceRole, number>>;
  promptOptional?: boolean; lyrics?: "required" | "optional";
  adapter: Adapter;
  endpoint: string; editEndpoint?: string; textEndpoint?: string; endEndpoint?: string;
  rate: number; audioRate?: number;
  speech?: Speech;
  /** False when DreamCut Cloud does not sell this model. Such models stay listed only so earlier requests keep
   * their names; they cannot be generated. */
  cloud?: false;
};
const ratios: AssetDraft["aspect"][] = ["16:9", "9:16", "1:1"];
const seconds = Array.from({ length: 13 }, (_, i) => i + 3);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => i + from);
const images = { kind: "image", required: [], durations: [], resolutions: [], aspects: ratios, maxCount: 4, audio: false } as const;
const videos = { kind: "video", durations: seconds, resolutions: [], aspects: ratios, maxCount: 1, audio: true } as const;
/** Models whose output takes its shape and length from the source video. */
const fromSource = { kind: "video", durations: [], aspects: ALL_ASPECTS, maxCount: 1 } as const;
const music = { kind: "audio", roles: [], required: [], resolutions: [], aspects: ALL_ASPECTS, maxCount: 1, audio: true, audioRequired: true } as const;
/** Voiceovers: the script is the prompt and the length follows it. `audio` references are a voice to copy. */
const speech = { kind: "speech", roles: [], required: [], durations: [], resolutions: ["best", "fast"], aspects: ALL_ASPECTS, maxCount: 1, audio: true, audioRequired: true, adapter: "speech", rate: 0 } as const;
const fixed = { resolutions: [] } as const;
// Deliberately curated capabilities; provider schemas/prices linked by endpoint, checked 2026-10-13.
// Do not expose a control until both its payload and price implications are implemented.
// The Cloud copy is site/src/lib/catalog.ts; generation-catalog-parity.test.ts keeps them in step.
export const ASSET_MODELS: readonly Model[] = [
  { ...videos, id: "h3-max-turbo", name: "H3 Max Turbo", description: "Fast, low-cost video · start/end frames · native sound included · start/end references only", roles: ["start", "end"], required: [], durations: [5, 10, 15], resolutions: ["480P", "768P", "1080P"], audioRequired: true, adapter: "h3", endpoint: "minimax/h3-max-turbo/image-to-video", textEndpoint: "minimax/h3-max-turbo/text-to-video", rate: 0.04 },
  { ...videos, id: "kling-3-pro", name: "Kling 3 Pro", description: "Start/end frames and character/object references · higher quality than Standard", roles: ["start", "end", "subject", "composition"], required: [], adapter: "kling", endpoint: "fal-ai/kling-video/v3/pro/image-to-video", textEndpoint: "fal-ai/kling-video/v3/pro/text-to-video", rate: 0.112, audioRate: 0.168 },
  { ...videos, id: "kling-3-standard", name: "Kling 3 Standard", description: "Start/end frames and character/object references · lower-cost Kling option", roles: ["start", "end", "subject", "composition"], required: [], adapter: "kling", endpoint: "fal-ai/kling-video/v3/standard/image-to-video", textEndpoint: "fal-ai/kling-video/v3/standard/text-to-video", rate: 0.084, audioRate: 0.126 },
  { ...videos, id: "veo-3.1-fast", name: "Veo 3.1 Fast", description: "Text, start frame, or first + last frame · optional native audio", roles: ["start", "end"], required: [], durations: [4, 6, 8], resolutions: ["720p", "1080p", "4k"], aspects: ["16:9", "9:16"], adapter: "veo", endpoint: "fal-ai/veo3.1/fast/image-to-video", textEndpoint: "fal-ai/veo3.1/fast", endEndpoint: "fal-ai/veo3.1/fast/first-last-frame-to-video", rate: 0.10, audioRate: 0.15 },
  { ...videos, id: "seedance-2.5", name: "Seedance 2.5", description: "Top-ranked video from text or a start frame, optionally ending at a second pose · 4–30 s · native sound", roles: ["start", "end"], required: [], durations: range(4, 30), resolutions: ["480p", "720p", "1080p"], aspects: ALL_ASPECTS, adapter: "seedance25", endpoint: "bytedance/seedance-2.5/image-to-video", textEndpoint: "bytedance/seedance-2.5/text-to-video", rate: 0.473 },
  { ...videos, id: "seedance-2", name: "Seedance 2", description: "Animate a start frame, optionally ending at a second pose", roles: ["start", "end"], required: ["start"], durations: seconds.filter(n => n >= 4), resolutions: ["480p", "720p", "1080p"], adapter: "seedance", endpoint: "bytedance/seedance-2.0/image-to-video", rate: 0.3034 },
  { ...videos, id: "kling-3-motion", name: "Kling 3 Motion Control Pro", description: "Copy a video's movement onto a character · output follows the motion video's length", roles: ["start", "motion", "subject", "composition"], required: ["start", "motion"], durations: [], adapter: "motion", endpoint: "fal-ai/kling-video/v3/pro/motion-control", rate: 0.168 },
  { ...fromSource, id: "h3-max-recast", name: "H3 Max Recast", description: "Replace the people in a 5–30 s clip with up to four people from photos · keeps the shot, motion and sound", roles: ["source", "subject"], required: ["source", "subject"], limits: { subject: 4 }, resolutions: ["1080P", "768P"], audio: false, promptOptional: true, adapter: "recast", endpoint: "minimax/h3-max/recast", rate: 0.45 },
  { ...fromSource, id: "wan-2.2-replace", name: "Wan 2.2 Animate Replace", description: "Replace one person in a clip with a character from a photo · lowest cost · up to 720p", roles: ["source", "subject"], required: ["source", "subject"], resolutions: ["480p", "580p", "720p"], audio: false, promptOptional: true, adapter: "wan-replace", endpoint: "fal-ai/wan/v2.2-14b/animate/replace", rate: 0.04 },
  { ...fromSource, id: "kling-o1-edit", name: "Kling O1 Video Edit", description: "Change a 3–10 s clip by prompt · reference up to four images as @Image1…", roles: ["source", "subject"], required: ["source"], limits: { subject: 4 }, resolutions: [], audio: true, adapter: "o1-edit", endpoint: "fal-ai/kling-video/o1/video-to-video/edit", rate: 0.168 },
  { ...videos, id: "seedance-2-reference", name: "Seedance 2 Reference", description: "Generate from up to nine images, three videos and three audio clips · refer to them as @Image1, @Video1, @Audio1", roles: ["subject", "motion", "audio"], required: [], limits: { subject: 9, motion: 3, audio: 3 }, durations: seconds.filter(n => n >= 4), resolutions: ["480p", "720p", "1080p"], aspects: ALL_ASPECTS, adapter: "seedance-ref", endpoint: "bytedance/seedance-2.0/reference-to-video", rate: 0.3034 },
  { ...videos, id: "seedance-2.5-reference", name: "Seedance 2.5 Reference", description: "Up to 30 s from images, videos and audio · refer to them as @Image1, @Video1, @Audio1", roles: ["subject", "motion", "audio"], required: [], limits: { subject: 10, motion: 3, audio: 3 }, durations: range(4, 30), resolutions: ["480p", "720p", "1080p"], aspects: ALL_ASPECTS, adapter: "seedance-ref", endpoint: "bytedance/seedance-2.5/reference-to-video", rate: 0.473 },
  { ...videos, id: "sync-3-avatar", name: "Sync 3 Singing Avatar", description: "Animate a still to supplied singing audio · output follows audio duration", roles: ["start", "audio"], required: ["start", "audio"], durations: Array.from({ length: 58 }, (_, i) => i + 3), resolutions: [], audioRequired: true, adapter: "sync3", endpoint: "fal-ai/sync-lipsync/v3/image-to-video", rate: 0.1333, cloud: false },
  { ...videos, id: "latentsync", name: "LatentSync Lip Sync", description: "Sync an existing motion video to singing audio · $0.20 up to 40 seconds · shorter motion repeats forward/backward to cover the audio", roles: ["motion", "audio"], required: ["motion", "audio"], durations: Array.from({ length: 58 }, (_, i) => i + 3), resolutions: [], audioRequired: true, adapter: "latentsync", endpoint: "fal-ai/latentsync", rate: 0.005, cloud: false },
  { ...music, id: "minimax-music-3", name: "MiniMax Music 3", description: "A sung song from your lyrics and a style description · up to 5 minutes", durations: range(10, 300), lyrics: "required", adapter: "music3", endpoint: "minimax/music-3", rate: 0.002 },
  { ...music, id: "mureka-song", name: "Mureka Song", description: "A full song from lyrics or a description · one price per song", durations: [], lyrics: "optional", promptOptional: true, adapter: "mureka", endpoint: "mureka/api/generate/song", rate: 0.225 },
  { ...music, id: "elevenlabs-music", name: "ElevenLabs Music", description: "Music from a description · set the length", durations: range(3, 300), adapter: "eleven-music", endpoint: "elevenlabs/music/v2.5", rate: 0.01 },
  // One voiceover model per provider, its faster or cheaper sibling as Quality: Fast. OpenRouter rates checked 2026-10-24.
  { ...speech, id: "elevenlabs-v4", name: "ElevenLabs v4", description: "The most expressive voices · cue the delivery in the script, like [whispers] or [laughs] · 90+ languages", endpoint: "elevenlabs/eleven-v4",
    speech: { variants: { best: { model: "elevenlabs/eleven-v4", rate: 0.00008 }, fast: { model: "elevenlabs/eleven-v4-turbo", rate: 0.00004 } }, billing: "character", format: "mp3", defaultVoice: "george" } },
  { ...speech, id: "gemini-3.8-tts", name: "Gemini 3.8 TTS", description: "Direct the delivery in your own words · 30 voices · many languages", endpoint: "google/gemini-3.8-flash-tts",
    speech: { variants: { best: { model: "google/gemini-3.8-flash-tts", rate: 0.0000005, outputRate: 0.000009 }, fast: { model: "google/gemini-3.8-flash-lite-tts", rate: 0.0000005, outputRate: 0.000006 } }, billing: "token", format: "pcm", defaultVoice: "Kore", delivery: true } },
  { ...speech, id: "minimax-speech-2.8", name: "MiniMax Speech 2.8", description: "45 character voices, from narrators to storytellers", endpoint: "minimax/speech-2.8-hd",
    speech: { variants: { best: { model: "minimax/speech-2.8-hd", rate: 0.0001 }, fast: { model: "minimax/speech-2.8-turbo", rate: 0.00006 } }, billing: "character", format: "mp3", defaultVoice: "English_expressive_narrator" } },
  { ...speech, id: "mai-voice-2.1", name: "MAI-Voice 2.1", description: "Natural narration in 23 languages · choose a voice in the script's language", endpoint: "microsoft/mai-voice-2.1",
    speech: { variants: { best: { model: "microsoft/mai-voice-2.1", rate: 0.000022, voiceSuffix: ":MAI-Voice-2.1" }, fast: { model: "microsoft/mai-voice-2.1-flash", rate: 0.000015, voiceSuffix: ":MAI-Voice-2.1-Flash" } }, billing: "character", format: "mp3", defaultVoice: "en-US-Harper" } },
  { ...speech, ...fixed, id: "fish-s2.1-pro", name: "Fish Audio S2.1 Pro", description: "Speaks in the voice of your clip, or its own · direct the delivery in your own words", roles: ["audio"], endpoint: "fish-audio/s2.1-pro",
    speech: { variants: { best: { model: "fish-audio/s2.1-pro", rate: 0.000015 } }, billing: "character", format: "mp3", delivery: true } },
  { ...speech, ...fixed, id: "aura-2", name: "Deepgram Aura-2", description: "Clear, even voices in seven languages", endpoint: "deepgram/aura-2",
    speech: { variants: { best: { model: "deepgram/aura-2", rate: 0.00003 } }, billing: "character", format: "mp3", defaultVoice: "aura-2-thalia-en" } },
  { ...speech, id: "heygen-voice-1", name: "HeyGen Voice", description: "10 voices, or the voice of your clip", roles: ["audio"], endpoint: "heygen/heygen-voice-1",
    speech: { variants: { best: { model: "heygen/heygen-voice-1", rate: 0.000015 }, fast: { model: "heygen/heygen-voice-1-turbo", rate: 0.000004 } }, billing: "character", format: "pcm", defaultVoice: "nadine" } },
  { ...speech, ...fixed, id: "voxtral-tts-3", name: "Voxtral TTS 3", description: "English and French voices, each in a chosen mood", endpoint: "mistralai/voxtral-mini-tts-3-0",
    speech: { variants: { best: { model: "mistralai/voxtral-mini-tts-3-0", rate: 0.0000143 } }, billing: "character", format: "mp3", defaultVoice: "en_paul_neutral" } },
  { ...speech, ...fixed, id: "qwen-tts-3", name: "Qwen Audio TTS 3", description: "Two voices for Chinese and English scripts", endpoint: "qwen/qwen-audio-3.0-tts-plus",
    speech: { variants: { best: { model: "qwen/qwen-audio-3.0-tts-plus", rate: 0.00002 } }, billing: "character", format: "mp3", defaultVoice: "longanlingxin" } },
  { ...speech, ...fixed, id: "grok-voice-1", name: "Grok Voice", description: "Five voices · 20+ languages, detected from the script", endpoint: "x-ai/grok-voice-tts-1.0",
    speech: { variants: { best: { model: "x-ai/grok-voice-tts-1.0", rate: 0.000015 } }, billing: "character", format: "mp3", defaultVoice: "eve" } },
  { ...speech, ...fixed, id: "seed-audio-1", name: "Seed Audio 1.0", description: "Describe the voice and setting in the prompt, or copy the voice of your clip · up to 2 minutes", roles: ["audio"], endpoint: "bytedance-seed/seed-audio-1-0",
    speech: { variants: { best: { model: "bytedance-seed/seed-audio-1-0", rate: 0.0025 } }, billing: "second", format: "mp3", promptVoice: true, maxChars: 3000 } },
  { ...images, id: "nano-banana-2", name: "Nano Banana 2", description: "Generate or edit with face, style, and composition references", roles: ["edit", "subject", "style", "composition"], resolutions: ["1K", "2K", "4K"], adapter: "nano", endpoint: "fal-ai/nano-banana-2", editEndpoint: "fal-ai/nano-banana-2/edit", rate: 0.08 },
  { ...images, id: "nano-banana-2.1", name: "Nano Banana 2.1", description: "Generate or edit from your images · strong with several characters and on-image text", roles: ["edit", "subject", "style", "composition"], resolutions: ["1K", "2K", "4K"], adapter: "nano", endpoint: "google/nano-banana-2.1", editEndpoint: "google/nano-banana-2.1/edit", rate: 0.045 },
  { ...images, id: "gpt-image-2.5", name: "GPT Image 2.5", description: "Top-ranked images: photoreal, portraits, design and text · generate or edit from your images · quality high or max", roles: ["edit", "subject", "style", "composition"], resolutions: ["high", "max"], adapter: "gpt-image", endpoint: "openai/gpt-image-2.5/sunburst/text-to-image", editEndpoint: "openai/gpt-image-2.5/sunburst/edit", rate: 0.055 },
  { ...images, id: "nano-banana-pro", name: "Nano Banana Pro", description: "Reference-led image generation and detailed editing", roles: ["edit", "subject", "style", "composition"], resolutions: ["1K", "2K", "4K"], adapter: "nano", endpoint: "fal-ai/nano-banana-pro", editEndpoint: "fal-ai/nano-banana-pro/edit", rate: 0.15 },
  { ...images, id: "flux-2-pro", name: "FLUX.2 Pro", description: "Prompt-to-image · one output per run; reference editing via Nano Banana", roles: [], maxCount: 1, adapter: "flux2", endpoint: "fal-ai/flux-2-pro", rate: 0.03 },
  { ...images, id: "flux-kontext", name: "FLUX Kontext Pro", description: "Focused editing of one source image", roles: ["edit"], required: ["edit"], adapter: "kontext", endpoint: "fal-ai/flux-pro/kontext", rate: 0.04 },
  { ...images, id: "flux-schnell", name: "FLUX Schnell", description: "Low-cost prompt-to-image drafts", roles: [], adapter: "schnell", endpoint: "fal-ai/flux/schnell", rate: 0.003 },
];
/** Models a creator can generate with DreamCut credits; mirrors the Cloud catalog (`site/src/lib/catalog.ts`). */
export const CLOUD_MODELS: readonly Model[] = ASSET_MODELS.filter(m => m.cloud !== false);
export const isCloudModel = (id: string | undefined) => CLOUD_MODELS.some(m => m.id === id);
export const cloudUnavailableMessage = (name: string) => `${name} isn't available with DreamCut credits. Choose another model.`;
export const roleLimit = (model: Pick<Model, "limits">, role: ReferenceRole) => model.limits?.[role] ?? 1;
export function getAssetModel(draft: AssetDraft): Model {
  const legacy = { image: "flux-schnell", edit: "flux-kontext", video: "kling-3-standard", animate: "kling-3-standard", motion: "kling-3-motion", recast: "h3-max-recast", music: "minimax-music-3", speech: "elevenlabs-v4", extract: "" };
  const model = ASSET_MODELS.find(m => m.id === (draft.modelId ?? legacy[draft.task]));
  if (!model) throw new Error("Choose a supported generation model.");
  return model;
}
export function modelEndpoint(draft: AssetDraft) {
  const m = getAssetModel(draft), has = (role: ReferenceRole) => draft.references.some(r => r.role === role);
  if (m.editEndpoint && draft.references.length) return m.editEndpoint;
  if (m.endEndpoint && has("end")) return m.endEndpoint;
  if (m.textEndpoint && !has("start")) return m.textEndpoint;
  return m.endpoint;
}
/** Roles an image model reads as one flat list of pictures; the prompt, not the role, says what each is for. */
export const POOLED_IMAGE_ROLES: readonly ReferenceRole[] = ["subject", "edit", "style", "composition"];
/** The roles that fill the form's numbered "Images" list, in order, or null where each role is its own slot. */
export function pooledImageRoles(draft: AssetDraft): readonly ReferenceRole[] | null {
  if (draft.route !== "fal") return null;
  const m = getAssetModel(draft);
  // Nano Banana sends every reference as image_urls whatever its role.
  return m.adapter === "nano" || m.adapter === "gpt-image" ? POOLED_IMAGE_ROLES.filter(role => m.roles.includes(role)) : null;
}
export function modelTask(draft: AssetDraft): AssetDraft["task"] {
  const m = getAssetModel(draft);
  if (m.kind === "audio") return "music";
  if (m.kind === "speech") return "speech";
  if (m.roles.includes("source")) return "recast";
  return m.kind === "image" ? (draft.references.length ? "edit" : "image") : m.adapter === "motion" ? "motion" : draft.references.some(r => r.role === "start") ? "animate" : "video";
}
// Ported from MakeTrailer video-studio-state/request-draft; current endpoint
// schemas remain authoritative (H3 Turbo differs from base H3).
export function modelSettingKeys(draft: AssetDraft): readonly (keyof NonNullable<AssetDraft["settings"]>)[] {
  switch (getAssetModel(draft).adapter) {
    case "kling": return ["negativePrompt", "cfgScale"];
    case "h3": return ["seed", "promptExpansion", "enableSafetyChecker"];
    case "veo": return ["negativePrompt", "seed", "autoFix", "safetyTolerance"];
    case "seedance": case "seedance25": return ["bitrateMode"];
    case "recast": return ["seed", "enhanceRealism"];
    case "wan-replace": case "music3": return ["seed"];
    case "seedance-ref": return ["seed", "bitrateMode"];
    default: return [];
  }
}
function settingsPayload(d: AssetDraft) {
  const s = d.settings ?? {};
  const names = { negativePrompt: "negative_prompt", cfgScale: "cfg_scale", seed: "seed", promptExpansion: "prompt_expansion_mode", enableSafetyChecker: "enable_safety_checker", autoFix: "auto_fix", safetyTolerance: "safety_tolerance", bitrateMode: "bitrate_mode", enhanceRealism: "enhance_realism" };
  return Object.fromEntries(modelSettingKeys(d).filter(k => s[k] !== undefined).map(k => [names[k], s[k]]));
}
/** Longest window one video or audio reference may send to this model, in seconds. */
export function windowLimit(draft: AssetDraft, role: ReferenceRole) {
  const m = getAssetModel(draft);
  switch (m.adapter) {
    case "motion": return draft.orientation === "image" ? 10 : 30;
    case "o1-edit": return 10;
    case "seedance-ref": return m.id === "seedance-2-reference" ? 15 : 30;
    case "recast": case "wan-replace": case "speech": return 30;
    default: return role === "audio" ? 60 : 30;
  }
}
/** Seconds of one reference's window, to 0.01 s; what its price and the Cloud length check use. */
export const windowSeconds = (ref: { window?: { start: number; end: number } }) => ref.window ? Math.round((ref.window.end - ref.window.start) * 100) / 100 : 0;
/** Total seconds of one media role. */
export function mediaSeconds(d: Pick<AssetDraft, "references">, role: ReferenceRole) {
  return Math.round(d.references.filter(r => r.role === role).reduce((sum, r) => sum + windowSeconds(r), 0) * 100) / 100;
}
function mediaIssue(m: Model, d: AssetDraft): string | null {
  const count = (role: ReferenceRole) => d.references.filter(r => r.role === role).length;
  const each = (role: ReferenceRole, min: number, max: number) => d.references.filter(r => r.role === role).every(r => windowSeconds(r) >= min && windowSeconds(r) <= max);
  const source = mediaSeconds(d, "source"), motion = mediaSeconds(d, "motion"), audio = mediaSeconds(d, "audio");
  switch (m.adapter) {
    case "motion": return motion < 3 || motion > (d.orientation === "image" ? 10 : 30) ? "The motion video must be 3–10 seconds (image orientation) or 3–30 seconds (video orientation)." : null;
    case "recast": return source < 5 || source > 30 ? "The source video must be 5–30 seconds." : null;
    case "wan-replace": return source < 2 || source > 30 ? "The source video must be 2–30 seconds." : null;
    case "o1-edit": return source < 3 || source > 10 ? "The source video must be 3–10 seconds." : null;
    case "speech": return count("audio") && (audio < 3 || audio > 30) ? "The voice to copy must be 3–30 seconds." : null;
    case "seedance-ref":
      if (!count("subject") && !count("motion")) return "Add at least one reference image or video.";
      if (m.id === "seedance-2-reference") {
        if (count("motion") && (motion < 2 || motion > 15)) return "Reference videos must total 2–15 seconds.";
        if (audio > 15) return "Reference audio must total 15 seconds or less.";
        if (d.references.length > 12) return "Use at most 12 references with this model.";
        return null;
      }
      if (!each("motion", 1.8, 30.2) || !each("audio", 1.8, 30.2)) return "Each reference video or audio must be 1.8–30 seconds.";
      if (motion > 30.2 || audio > 30.2) return "Reference videos and audio must each total 30 seconds or less.";
      return null;
    default: return null;
  }
}
export function validateModelDraft(d: AssetDraft) {
  const m = getAssetModel(d), roles = d.references.map(r => r.role);
  if (m.cloud === false) throw new Error(cloudUnavailableMessage(m.name));
  const supportedSettings = modelSettingKeys(d);
  if (Object.entries(d.settings ?? {}).some(([k, v]) => v !== undefined && !supportedSettings.includes(k as keyof NonNullable<AssetDraft["settings"]>))) throw new Error("Some settings are not supported by this model. Reset model settings or switch models.");
  if (!m.promptOptional && !d.prompt.trim()) throw new Error(m.kind === "speech" ? "Write what the voice says." : "Describe what you want to create.");
  if (d.prompt.length > 2500) throw new Error("Keep the generation prompt under 2,500 characters.");
  if (m.kind === "image" ? !["image", "edit"].includes(d.task) : m.kind === "audio" ? d.task !== "music" : m.kind === "speech" ? d.task !== "speech" : ["image", "edit", "music", "speech"].includes(d.task)) throw new Error("Model and output type do not match.");
  speechIssue(m, d);
  if (roles.some(r => !m.roles.includes(r)) || roles.some(r => roles.filter(x => x === r).length > roleLimit(m, r))) throw new Error("Some attached references are not supported by this model. Remove them or switch models.");
  for (const r of m.required) if (!roles.includes(r)) throw new Error(`Choose ${modelReferenceLabel(d, r).toLowerCase()}.`);
  for (const r of d.references) {
    if (!MEDIA_ROLES.includes(r.role) && r.window) throw new Error("Only video and audio references have a time range.");
    if (MEDIA_ROLES.includes(r.role) && (!r.window || r.window.end - r.window.start < 0.5)) throw new Error(`Choose the part of ${r.label || modelReferenceLabel(d, r.role).toLowerCase()} to use.`);
  }
  if (roles.includes("end") && !roles.includes("start")) throw new Error("An end frame needs a start frame.");
  const kling = m.adapter === "kling" || m.adapter === "motion";
  if (kling && roles.includes("subject") && !roles.includes("start")) throw new Error("Subject references need a start frame in this composer.");
  if (kling && roles.includes("composition") && !roles.includes("subject")) throw new Error("Add a primary subject reference before an additional subject view.");
  if (m.adapter === "motion" && roles.includes("subject") && d.orientation !== "video") throw new Error("Face references require matching the motion video's orientation.");
  if (kling && roles.includes("subject") && !d.prompt.includes("@Element1")) throw new Error("Refer to your character as @Element1 in the prompt.");
  if (m.lyrics === "required" && !d.lyrics?.trim()) throw new Error("Add the lyrics to sing, or [instrumental].");
  if (!m.lyrics && d.lyrics?.trim()) throw new Error("This model does not take lyrics.");
  if (m.adapter === "mureka" && !d.prompt.trim() && !d.lyrics?.trim()) throw new Error("Describe the song or add its lyrics.");
  if (d.count > m.maxCount) throw new Error(`This model creates at most ${m.maxCount} output(s) per request.`);
  if (m.durations.length && !m.durations.includes(d.duration)) throw new Error("Choose a duration supported by this model.");
  if (m.resolutions.length && !m.resolutions.includes(d.resolution ?? m.resolutions[0])) throw new Error("Choose a resolution supported by this model.");
  if (!m.aspects.includes(d.aspect)) throw new Error("Choose a shape supported by this model.");
  if (!m.audio && d.audio) throw new Error("This model does not support sound.");
  if (m.audioRequired && !d.audio) throw new Error("This model always generates sound. Enable sound or choose another model.");
  if (m.adapter === "veo" && ["1080p", "4k"].includes(d.resolution ?? "") && d.duration !== 8) throw new Error("Veo 1080p / 4k requires an 8-second video.");
  const issue = mediaIssue(m, d);
  if (issue) throw new Error(issue);
}
/** Voice, delivery and script length, for voiceover models; other models take none of them. */
function speechIssue(m: Model, d: AssetDraft) {
  if (!m.speech) {
    if (d.voice || d.delivery?.trim()) throw new Error("This model does not take a voice.");
    return;
  }
  const voices = modelVoices(m.id), copying = d.references.some(r => r.role === "audio");
  if (d.voice && !voices.some(v => v.id === d.voice)) throw new Error(voices.length ? "Choose one of this model's voices." : "This model does not have voices to choose.");
  if (voices.length && !d.voice && !copying) throw new Error("Choose a voice.");
  if (!m.speech.delivery && d.delivery?.trim()) throw new Error("This model takes delivery cues in the script.");
  if (m.speech.maxChars && d.prompt.trim().length > m.speech.maxChars) throw new Error(`Keep the script under ${m.speech.maxChars.toLocaleString()} characters.`);
}
/** The OpenRouter model and rate for the draft's quality. */
export function speechVariant(d: AssetDraft) {
  const m = getAssetModel(d);
  if (!m.speech) throw new Error(`${m.name} is not a voiceover model.`);
  return m.speech.variants[d.resolution ?? m.resolutions[0] ?? "best"] ?? m.speech.variants.best;
}
/** Seconds of speech a script is priced as: slower than most reads, so the estimate rounds up. */
export const speechSeconds = (script: string) => Math.ceil(script.trim().length / 10) + 1;
/** Provider cost of a voiceover in USD, including OpenRouter's 5.5% funding fee, as the Cloud quotes it
 * (`site/src/lib/catalog.ts`). Gemini bills about 25 audio tokens per second and a token per ~3 characters in. */
export function speechCostUsd(d: AssetDraft) {
  const m = getAssetModel(d), v = speechVariant(d), script = d.prompt.trim();
  const input = script.length + (m.speech!.delivery ? d.delivery?.trim().length ?? 0 : 0);
  const usd = m.speech!.billing === "second" ? v.rate * Math.min(120, speechSeconds(script))
    : m.speech!.billing === "token" ? v.rate * Math.ceil(input / 3) + v.outputRate! * 25 * speechSeconds(script)
    : v.rate * input;
  return Math.ceil(usd * 1.055 * 1_000_000) / 1_000_000;
}
/** GPT Image 2.5 sizes per shape; fal bills by size and quality (multiples of 16). */
const GPT_IMAGE_SIZES: Record<string, { width: number; height: number }> = { "1:1": { width: 1024, height: 1024 }, "16:9": { width: 1920, height: 1072 }, "9:16": { width: 1072, height: 1920 } };
/** Nano Banana 2.1 per image by resolution: fal's token prices for a typical prompt, rounded up for references and thinking. */
const NANO_21_RATES: Record<string, number> = { "1K": 0.045, "2K": 0.065, "4K": 0.14 };
/** GPT Image 2.5 Sunburst per image by quality, square vs wide or tall; each reference image adds about a cent. */
function gptImageRate(d: { aspect: string; resolution?: string }) {
  const square = d.aspect === "1:1";
  return d.resolution === "max" ? (square ? 0.215 : 0.162) : (square ? 0.055 : 0.042);
}
const PRICED_2026_10_22: readonly Adapter[] = ["seedance25", "gpt-image"];
const PRICED_2026_10_13: readonly Adapter[] = ["motion", "recast", "wan-replace", "o1-edit", "seedance-ref", "music3", "mureka", "eleven-music"];
const SEEDANCE_REF_RATES: Record<string, Record<string, number>> = {
  "seedance-2-reference": { "480p": 0.1344, "720p": 0.3034, "1080p": 0.682 },
  "seedance-2.5-reference": { "480p": 0.2205, "720p": 0.473, "1080p": 1.164 },
};
/** Credits per US dollar of provider cost, as DreamCut Cloud charges (`site/src/lib/catalog.ts`). */
export const CREDITS_PER_USD = 650;
/** Conservative fal-based estimate at 30% markup; the authoritative Cloud quote may use a cheaper provider. */
export function modelCreditEstimate(d: AssetDraft) {
  const estimate = modelEstimate(d);
  return estimate ? Math.max(1, Math.ceil(Math.round(estimate.usd * 1_000_000) * CREDITS_PER_USD / 1_000_000)) : null;
}
/** Provider cost in USD. Media-priced models use the reference windows; `motionDuration` is for requests
 * recorded before windows existed. */
export function modelEstimate(d: AssetDraft, motionDuration?: number, now = new Date()) {
  const m = getAssetModel(d);
  if (m.speech) return d.prompt.trim() ? { usd: speechCostUsd(d), checkedAt: "2026-10-24", source: `https://openrouter.ai/${speechVariant(d).model}`, kind: "estimate" as const } : null;
  if (m.adapter === "latentsync") return { usd: Math.round(Math.max(0.20, d.duration * m.rate) * 10000) / 10000, checkedAt: "2026-09-27", source: `https://fal.ai/models/${m.endpoint}`, kind: "estimate" as const };
  let rate = d.audio ? (m.audioRate ?? m.rate) : m.rate;
  if (m.adapter === "nano") rate = m.id === "nano-banana-2.1" ? NANO_21_RATES[d.resolution ?? "1K"] : rate * (d.resolution === "4K" ? 2 : d.resolution === "2K" && m.id === "nano-banana-2" ? 1.5 : 1);
  if (m.adapter === "gpt-image") rate = gptImageRate(d);
  if (m.adapter === "seedance25") rate = SEEDANCE_REF_RATES["seedance-2.5-reference"][d.resolution ?? m.resolutions[0]];
  if (m.adapter === "seedance" && d.resolution === "1080p") rate = 0.682;
  if (m.adapter === "seedance" && (d.resolution ?? m.resolutions[0]) === "480p") rate = 0.1344;
  if (m.adapter === "veo" && d.resolution === "4k") rate = d.audio ? 0.35 : 0.3;
  // Endpoint launch promotion ends September 30; never leave an expired discount hard-coded.
  if (m.adapter === "h3") {
    rate = (d.resolution ?? m.resolutions[0]) === "480P" ? 0.025 : d.resolution === "1080P" ? 0.08 : 0.04;
    if (now < new Date("2026-10-01T00:00:00Z")) rate *= 0.5;
  }
  if (m.adapter === "recast") rate = (d.resolution ?? m.resolutions[0]) === "768P" ? 0.30 : 0.45;
  if (m.adapter === "wan-replace") rate = ({ "480p": 0.04, "580p": 0.06, "720p": 0.08 } as Record<string, number>)[d.resolution ?? m.resolutions[0]];
  if (m.adapter === "seedance-ref") rate = SEEDANCE_REF_RATES[m.id][d.resolution ?? m.resolutions[0]] * (mediaSeconds(d, "motion") ? 0.6 : 1);
  if (m.adapter === "mureka") rate = d.lyrics?.trim() ? 0.225 : 0.75;
  const motion = mediaSeconds(d, "motion") || motionDuration;
  const units = m.adapter === "motion" ? motion
    : m.adapter === "recast" || m.adapter === "o1-edit" ? mediaSeconds(d, "source")
    // Billed per 16 frames; reference videos are sent at 30 fps.
    : m.adapter === "wan-replace" ? mediaSeconds(d, "source") * 30 / 16
    : m.adapter === "seedance-ref" ? d.duration + mediaSeconds(d, "motion")
    : m.adapter === "mureka" ? 1
    : m.kind !== "image" ? d.duration : m.adapter === "schnell" ? d.count * 2 : d.count;
  if (!units) return null;
  const extra = m.adapter === "gpt-image" ? 0.01 * d.references.length : 0;
  return { usd: Math.round((rate * units + extra) * 10000) / 10000, checkedAt: m.adapter === "sync3" ? "2026-09-27" : PRICED_2026_10_22.includes(m.adapter) || m.id === "nano-banana-2.1" ? "2026-10-22" : PRICED_2026_10_13.includes(m.adapter) ? "2026-10-13" : "2026-09-23", source: `https://fal.ai/models/${modelEndpoint(d)}`, kind: "estimate" as const };
}
/**
 * Provider input. `refs` holds a fetchable URL per reference: an array aligned with `d.references`, or (for
 * one reference per role) a role → URL record.
 */
export function modelPayload(d: AssetDraft, refs: readonly string[] | Record<string, string>) {
  validateModelDraft(d);
  const urls = Array.isArray(refs) ? refs : d.references.map(ref => (refs as Record<string, string>)[ref.role]);
  const all = (role: ReferenceRole) => d.references.flatMap((ref, i) => ref.role === role ? [urls[i]] : []);
  const r = Object.fromEntries(d.references.map((ref, i) => [ref.role, urls[i]]).reverse()) as Partial<Record<ReferenceRole, string>>;
  const m = getAssetModel(d), prompt = d.prompt.trim(), settings = settingsPayload(d);
  const imageSize = d.aspect === "1:1" ? { width: 1024, height: 1024 } : d.aspect === "16:9" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
  const elements = r.subject ? { elements: [{ frontal_image_url: r.subject, reference_image_urls: [r.composition ?? r.start] }] } : {};
  const nonEmpty = (key: string, values: string[]) => values.length ? { [key]: values } : {};
  switch (m.adapter) {
    case "latentsync": return { video_url: r.motion, audio_url: r.audio, loop_mode: "pingpong", guidance_scale: 1 };
    case "sync3": return { image_url: r.start, audio_url: r.audio };
    case "h3": return { prompt, duration: d.duration, resolution: d.resolution ?? "480P", prompt_expansion_mode: "balanced", ...settings, ...(r.start ? { image_url: r.start, ...(r.end ? { end_image_url: r.end } : {}) } : { aspect_ratio: d.aspect }) };
    case "schnell": return { prompt, image_size: imageSize, num_images: d.count, output_format: "png" };
    case "flux2": return { prompt, image_size: imageSize, output_format: "png" };
    case "kontext": return { prompt, image_url: r.edit, aspect_ratio: d.aspect, num_images: d.count, output_format: "png" };
    case "nano": return { prompt, aspect_ratio: d.aspect, resolution: d.resolution ?? "1K", num_images: d.count, output_format: "png", ...(d.references.length ? { image_urls: [...urls] } : {}) };
    case "kling": return { prompt, duration: String(d.duration), generate_audio: d.audio, ...settings, ...(r.start ? { start_image_url: r.start, ...(r.end ? { end_image_url: r.end } : {}), ...elements } : { aspect_ratio: d.aspect }) };
    case "gpt-image": return { prompt, image_size: GPT_IMAGE_SIZES[d.aspect], quality: d.resolution ?? "high", num_images: d.count, output_format: "png", ...(d.references.length ? { image_urls: [...urls] } : {}) };
    case "seedance25": return { prompt, ...(r.start ? { image_url: r.start, ...(r.end ? { end_image_url: r.end } : {}) } : { aspect_ratio: d.aspect }), duration: String(d.duration), resolution: d.resolution ?? "720p", generate_audio: d.audio, ...settings };
    case "seedance": return { prompt, image_url: r.start, ...(r.end ? { end_image_url: r.end } : {}), duration: String(d.duration), resolution: d.resolution ?? "480p", aspect_ratio: d.aspect, generate_audio: d.audio, ...settings };
    case "veo": return { prompt, duration: `${d.duration}s`, resolution: d.resolution ?? "720p", aspect_ratio: d.aspect, generate_audio: d.audio, auto_fix: false, ...settings, ...(r.end ? { first_frame_url: r.start, last_frame_url: r.end } : r.start ? { image_url: r.start } : {}) };
    case "motion": return { prompt, image_url: r.start, video_url: r.motion, character_orientation: d.orientation, keep_original_sound: d.audio, ...elements };
    case "recast": return { video_url: r.source, reference_image_urls: all("subject"), resolution: d.resolution ?? "1080P", ...(prompt ? { prompt } : {}), ...settings };
    case "wan-replace": return { video_url: r.source, image_url: r.subject, resolution: d.resolution ?? "480p", ...settings };
    case "o1-edit": return { prompt, video_url: r.source, keep_audio: d.audio, ...nonEmpty("image_urls", all("subject")) };
    case "seedance-ref": return { prompt, ...nonEmpty("image_urls", all("subject")), ...nonEmpty("video_urls", all("motion")), ...nonEmpty("audio_urls", all("audio")), duration: String(d.duration), resolution: d.resolution ?? "720p", aspect_ratio: d.aspect, generate_audio: d.audio, ...(m.id === "seedance-2.5-reference" ? { task: "reference" } : {}), ...settings };
    case "music3": return { prompt, lyrics: d.lyrics?.trim(), duration: d.duration, ...settings };
    case "mureka": return { model: "mureka-9.5", ...(prompt ? { prompt } : {}), ...(d.lyrics?.trim() ? { lyrics: d.lyrics.trim() } : {}) };
    case "eleven-music": return { prompt, music_length_ms: d.duration * 1000 };
    case "speech": throw new Error("Voiceovers are generated with DreamCut credits only.");
  }
}

/** Labels follow how each adapter sends the reference, rather than implying all subjects are faces. */
export function modelReferenceLabel(draft: AssetDraft, role: ReferenceRole): string {
  const adapter = draft.route === "fal" ? getAssetModel(draft).adapter : undefined;
  if (adapter === "kling") {
    if (role === "subject") return "Character or object";
    if (role === "composition") return "Additional subject view";
  }
  if (adapter === "motion") {
    if (role === "subject") return "Face reference";
    if (role === "composition") return "Additional character view";
  }
  if (adapter === "recast" && role === "subject") return "New person";
  if (adapter === "wan-replace" && role === "subject") return "New character";
  if ((adapter === "o1-edit" || adapter === "seedance-ref") && role === "subject") return "Reference image";
  if (adapter === "seedance-ref" && role === "motion") return "Reference video";
  if (adapter === "seedance-ref" && role === "audio") return "Reference audio";
  if ((adapter === "sync3" || adapter === "latentsync") && role === "audio") return "Singing audio";
  if (adapter === "speech" && role === "audio") return "Voice to copy";
  return ROLE_LABELS[role];
}
