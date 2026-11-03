export const VOICE_ENHANCEMENT_DEFAULT_STRENGTH = 40;

export type AudioEffectAction =
  | "enhance_voice"
  | "toggle_voice_enhancement"
  | "reduce_background_noise"
  | "restore_original"
  | "detach_audio"
  | "reattach_audio";
