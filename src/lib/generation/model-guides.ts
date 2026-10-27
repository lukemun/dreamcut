import { getAssetModel, type ReferenceRole } from "./asset-models";
import type { AssetDraft } from "./assets";

/**
 * Quality-first defaults for chat generation (generate_media) and the prompt guide returned with every draft.
 * Defaults are the strongest model in the catalog for the inputs given, chosen from blind-preference leaderboards
 * (Artificial Analysis, Oct 2026); revisit when the catalog changes. Cheaper models are used when the user names them.
 */
export type ChatMediaKind = "image" | "video" | "music" | "speech";

export function defaultModelId(kind: ChatMediaKind, roles: readonly ReferenceRole[], lyrics?: string) {
  const has = (role: ReferenceRole) => roles.includes(role);
  if (kind === "music") return lyrics?.trim() ? "minimax-music-3" : "elevenlabs-music";
  // A clip to copy goes to Fish Audio; otherwise ElevenLabs v4 leads blind voice comparisons.
  if (kind === "speech") return has("audio") ? "fish-s2.1-pro" : "elevenlabs-v4";
  // GPT Image 2.5 leads text-to-image; Nano Banana 2.1 is strongest with several references and on-image text.
  if (kind === "image") return roles.length ? "nano-banana-2.1" : "gpt-image-2.5";
  if (has("source")) return "h3-max-recast";
  if (has("motion") && has("start")) return "kling-3-motion";
  // Characters, reference video or audio: Seedance 2.5 is the top reference-to-video model.
  if (has("subject") || has("motion") || has("audio")) return "seedance-2.5-reference";
  // Text or start/end frames: Seedance 2.5 is top-three for both text- and image-to-video.
  return "seedance-2.5";
}

/** Settings a chat draft starts from when the request leaves them open: the model's best quality. */
export function qualityDefaults(modelId: string): Partial<Pick<AssetDraft, "resolution" | "audio">> {
  switch (modelId) {
    case "seedance-2.5": return { resolution: "720p", audio: true };
    case "h3-max-turbo": return { resolution: "1080P", audio: true };
    case "gpt-image-2.5": return { resolution: "high" };
    case "nano-banana-2.1": case "nano-banana-2": case "nano-banana-pro": return { resolution: "2K" };
    case "seedance-2.5-reference": case "seedance-2-reference": case "seedance-2": return { resolution: "720p" };
    default: return {};
  }
}

const IMAGE_TO_VIDEO = "With a start frame, describe the motion and camera only; the frame already sets appearance and framing.";
const GUIDES: Record<string, string> = {
  nano: "Name attached pictures as Image 1, Image 2… in the order given and say what each is for (\"keep the face from Image 1, the outfit from Image 2\"). For edits, describe only the change and what must stay. Put any on-image text in quotes. Subject, setting, lighting and style beat tag lists.",
  "gpt-image": "Write it like a brief: subject, setting, lighting, lens and style in full sentences; put any on-image text in quotes with where it goes. With attached pictures, name them Image 1, Image 2… and say what to take from each; for edits, describe only the change.",
  flux2: "One image from text: subject, setting, lighting, lens and style in plain sentences. No references.",
  schnell: "Fast drafts from text: short subject, setting and style.",
  kontext: "Describe only the edit to the attached image and what must stay unchanged.",
  h3: `Lead with the subject and what it does, then the camera move (slow push in, tracking shot, handheld). Sound is always generated: name the sounds or quoted dialogue you want. ${IMAGE_TO_VIDEO} With an end frame, describe one continuous change into it.`,
  kling: `Refer to an attached character as @Element1, never by a new description. Action first, then camera, then setting. ${IMAGE_TO_VIDEO}`,
  veo: `Put dialogue in quotes with who says it, and name ambient sound and effects. 4, 6 or 8 seconds; 1080p and 4K need 8. ${IMAGE_TO_VIDEO}`,
  seedance: `Action, then environment, camera and style. Timed beats work ("0–2s: …, 2–5s: …") and so do cuts ("cut to a close-up"). ${IMAGE_TO_VIDEO}`,
  seedance25: `Action, then environment, camera and style. Timed beats work ("0–3s: …, 3–8s: …") and so do cuts ("cut to a close-up"); up to 30 seconds. Sound is generated: name sounds or quoted dialogue. ${IMAGE_TO_VIDEO}`,
  "seedance-ref": "Refer to inputs as @Image1, @Video1, @Audio1 in the order given and give each a role (\"@Image1 is the main character; follow the camera move in @Video1; @Audio1 is the soundtrack\"). Timed beats and cuts work; describe what happens, not what the references look like.",
  motion: "Choreography comes from the motion video: don't describe the movement. Describe the character and setting, or leave the prompt short.",
  recast: "Optional: who becomes whom, left to right, and anything else to keep or change. Shot, motion and sound come from the source.",
  "wan-replace": "Optional: what to keep from the source. The subject photo replaces the person.",
  "o1-edit": "Describe the edit to the clip. Refer to attached pictures as @Image1, @Image2…",
  music3: "Describe genre, mood, instruments and tempo. Lyrics go in lyrics, with [verse] and [chorus] tags; use [instrumental] for none.",
  mureka: "Describe the song (genre, mood, voice) or give lyrics with [verse] and [chorus] tags.",
  "eleven-music": "Describe genre, mood, instruments, tempo and how it builds; no lyrics.",
};
const SCRIPT = "Write exactly what is said, with punctuation for the pauses; spell numbers, dates and names the way they are spoken.";
/** Voiceover models share one adapter, so their guides are by model. */
const SPEECH_GUIDES: Record<string, string> = {
  "elevenlabs-v4": `${SCRIPT} Put delivery cues in square brackets before a line: [whispers], [laughs], [excited].`,
  "gemini-3.8-tts": `${SCRIPT} Words in the script are all read aloud, so put tone, pace and accent in delivery ("warm and unhurried, smiling").`,
  "minimax-speech-2.8": `${SCRIPT} The voice sets the character.`,
  "mai-voice-2.1": `${SCRIPT} Choose a voice in the script's language.`,
  "fish-s2.1-pro": `${SCRIPT} Put cues in square brackets before a line ([whispering]) or in delivery. To copy a voice, add 10–30 seconds of one person speaking clearly as the audio reference.`,
  "aura-2": `${SCRIPT} Choose a voice in the script's language.`,
  "heygen-voice-1": `${SCRIPT} To copy a voice, add 10–30 seconds of one person speaking clearly as the audio reference.`,
  "voxtral-tts-3": `${SCRIPT} The voice's mood sets the delivery.`,
  "qwen-tts-3": SCRIPT,
  "grok-voice-1": `${SCRIPT} The language follows the script.`,
  "seed-audio-1": "Say who speaks and how, then what they say in quotes (\"A calm older man, close to the mic, says: '…'\"). It can also make ambience and sound effects. With an audio reference it speaks in that voice. Up to 2 minutes.",
};

/** A short guide to prompting the draft's model; positive phrasing and brevity apply to every model. */
export function promptGuide(draft: AssetDraft) {
  if (draft.route !== "fal") return "Describe the subject, setting and style; for edits, describe only the change.";
  const model = getAssetModel(draft);
  if (model.speech) return `${model.name}: ${SPEECH_GUIDES[model.id] ?? SCRIPT}`;
  return `${model.name}: ${GUIDES[model.adapter] ?? "Describe the subject, action and style."} Phrase things positively (\"tack sharp\", not \"no blur\") and keep it under about 150 words.`;
}
