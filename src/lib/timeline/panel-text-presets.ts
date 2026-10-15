import type { AnimationPreset } from "./animation-presets";
import type { CaptionFontPreset, CaptionPositionPreset, CaptionStyleVariant } from "./captions";
import { CAPTION_STYLE_VARIANT_LABELS, isCaptionFontPreset, isCaptionStyleVariant } from "./captions";

/**
 * Caption looks and text presets offered in the editor's Captions and Text panels.
 * Each is expressed only in existing caption_text props, so the panel preview, a manual
 * add and an agent proposal all resolve through the same renderer.
 */
export type CaptionLook = { id: string; label: string; styleVariant: CaptionStyleVariant; fontPreset: CaptionFontPreset };

/** Specialised variants need extra inputs (score data, media, camera path); the agent or Properties sets them up. */
export const AGENT_ONLY_CAPTION_VARIANTS = new Set<CaptionStyleVariant>(["benchmark_card", "image_fill", "camera_reveal"]);

const LOOK_FONTS: Record<Exclude<CaptionStyleVariant, "benchmark_card" | "image_fill" | "camera_reveal">, CaptionFontPreset> = {
  none: "inter",
  cinematic: "display_serif",
  bold_outline: "anton",
  highlight_yellow: "bebas_neue",
  highlight_red: "oswald",
  boxed: "clean_sans",
  yellow_banner: "archivo_narrow",
  black_card: "space_grotesk",
  thought_bubble: "caveat",
  neon: "orbitron",
  yellow_words: "oswald",
  inverse: "bebas_neue",
};

export const CAPTION_LOOKS: CaptionLook[] = (Object.keys(LOOK_FONTS) as (keyof typeof LOOK_FONTS)[]).map(styleVariant => ({
  id: styleVariant,
  label: styleVariant === "none" ? "Plain" : CAPTION_STYLE_VARIANT_LABELS[styleVariant].replace(" (per-word)", ""),
  styleVariant,
  fontPreset: LOOK_FONTS[styleVariant],
}));

/** Style props a look sets; explicit colour and stroke overrides are cleared so the result matches its preview. */
export function captionLookStyleProps(look: CaptionLook) {
  return { styleVariant: look.styleVariant, fontPreset: look.fontPreset, textColor: null, outlineWidthPx: null };
}

export type TextPreset = {
  id: string;
  label: string;
  detail: string;
  sampleText: string;
  durationSeconds: number;
  props: {
    fontPreset: CaptionFontPreset;
    styleVariant: CaptionStyleVariant;
    positionPreset: CaptionPositionPreset;
    textAlign: "left" | "center" | "right";
    fontSizing: "fixed";
    fontSizePx: number;
    maxWidth: number;
    animationIn: AnimationPreset;
    animationOut: AnimationPreset;
  };
};

const preset = (id: string, label: string, detail: string, sampleText: string, props: Omit<TextPreset["props"], "fontSizing" | "animationOut" | "textAlign"> & { textAlign?: TextPreset["props"]["textAlign"]; animationOut?: AnimationPreset }): TextPreset => ({
  id, label, detail, sampleText, durationSeconds: 3,
  props: { textAlign: "center", animationOut: "fade", fontSizing: "fixed", ...props },
});

export const TEXT_PRESETS: TextPreset[] = [
  preset("headline", "Headline", "Big statement", "BIG IDEA", { fontPreset: "anton", styleVariant: "bold_outline", positionPreset: "center", fontSizePx: 132, maxWidth: 0.86, animationIn: "pop" }),
  preset("title_card", "Title card", "Elegant opener", "The Long Way Home", { fontPreset: "playfair_display", styleVariant: "cinematic", positionPreset: "center", fontSizePx: 92, maxWidth: 0.8, animationIn: "fade" }),
  preset("lower_third", "Lower third", "Name and role", "Alex Rivera · Host", { fontPreset: "inter", styleVariant: "black_card", positionPreset: "lower_left", textAlign: "left", fontSizePx: 40, maxWidth: 0.6, animationIn: "slide_right" }),
  preset("location", "Location", "Place stamp", "LOS ANGELES, CA", { fontPreset: "space_mono", styleVariant: "boxed", positionPreset: "top_left", textAlign: "left", fontSizePx: 34, maxWidth: 0.6, animationIn: "fade" }),
  preset("callout", "Callout", "Grab attention", "WAIT FOR IT", { fontPreset: "bebas_neue", styleVariant: "highlight_yellow", positionPreset: "upper_center", fontSizePx: 96, maxWidth: 0.8, animationIn: "spring_pop" }),
  preset("banner", "Banner", "Announcement strip", "NEW EPISODE", { fontPreset: "archivo_narrow", styleVariant: "yellow_banner", positionPreset: "top_center", fontSizePx: 56, maxWidth: 0.7, animationIn: "drop_in" }),
  preset("quote", "Quote", "Pull quote", "“Make it simple.”", { fontPreset: "instrument_serif", styleVariant: "cinematic", positionPreset: "center", fontSizePx: 72, maxWidth: 0.78, animationIn: "word_fade" }),
  preset("signature", "Signature", "Handwritten sign-off", "with love", { fontPreset: "handwritten_script", styleVariant: "none", positionPreset: "lower_center", fontSizePx: 88, maxWidth: 0.7, animationIn: "handwriting" }),
  preset("neon_sign", "Neon sign", "Glowing title", "OPEN LATE", { fontPreset: "orbitron", styleVariant: "neon", positionPreset: "center", fontSizePx: 84, maxWidth: 0.8, animationIn: "fade" }),
  preset("bubble", "Speech bubble", "Aside or reaction", "hmm…", { fontPreset: "caveat", styleVariant: "thought_bubble", positionPreset: "upper_right", fontSizePx: 56, maxWidth: 0.4, animationIn: "pop" }),
];

/** Display fonts worth browsing first; every caption font remains available in Properties. */
export const TEXT_PANEL_FONTS: CaptionFontPreset[] = [
  "inter", "anton", "bebas_neue", "oswald", "space_grotesk", "archivo_narrow", "orbitron", "teko",
  "playfair_display", "instrument_serif", "dm_serif_display", "fraunces", "cormorant_garamond", "cinzel",
  "permanent_marker", "caveat", "handwritten_script", "space_mono",
].filter(isCaptionFontPreset);

export function isPanelPresetConsistent() {
  return CAPTION_LOOKS.every(look => isCaptionStyleVariant(look.styleVariant) && isCaptionFontPreset(look.fontPreset))
    && TEXT_PRESETS.every(item => isCaptionStyleVariant(item.props.styleVariant) && isCaptionFontPreset(item.props.fontPreset));
}
