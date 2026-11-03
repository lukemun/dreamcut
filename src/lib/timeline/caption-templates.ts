import type { CaptionTimingMode } from "./active-word-captions";
import type { CaptionElementProps, CaptionFontPreset, CaptionStyleVariant } from "./captions";
import { CAPTION_FONT_PRESET_LABELS, DEFAULT_CAPTION_PROPS, isCaptionFontPreset, isCaptionStyleVariant } from "./captions";
import { CAPTION_LAYER_STYLE_KEYS, captionVariantLayers } from "./caption-layer-style";
import { CAPTION_WORD_MARKER_KEYS } from "./caption-word-marker";
import { LOOP_MOTION_KEYS } from "./loop-motion";

/**
 * Caption templates: named bundles of caption props that already exist (a text treatment, a font,
 * the layered text style, reading states, keyword look, word marker, entrance and loop motion), so a template
 * is only a starting point. Applying one writes plain props; every one stays tunable on the
 * caption and a saved personal Template captures them like any other caption style.
 */

/** Props a template may set, beyond its treatment and font. Timing (how many words, which mode) travels separately. */
export const CAPTION_TEMPLATE_STYLE_KEYS = [
  "textColor",
  ...CAPTION_LAYER_STYLE_KEYS,
  "upcomingWords", "upcomingWordOpacity", "speakingWordColor", "speakingWordScale", "speakingWordLiftEm",
  "speakingWordOvershoot", "spokenWordColor", "wordStateSeconds", "speakingWordHoldsGap",
  "keywordColor", "keywordScale", "keywordUppercase",
  ...CAPTION_WORD_MARKER_KEYS,
  "animationIn", "animationOut", "animationInDuration", "animationOutDuration",
  "entranceStartScale", "entranceOvershoot",
  ...LOOP_MOTION_KEYS,
] as const satisfies readonly (keyof CaptionElementProps)[];

export type CaptionTemplateStyleKey = (typeof CAPTION_TEMPLATE_STYLE_KEYS)[number];
export type CaptionTemplateStyle = Partial<Pick<CaptionElementProps, CaptionTemplateStyleKey>>;

/**
 * Entrance curve fields follow their entrance preset when unset, so a template never resets them:
 * a template with a scale entrance states both (caption-templates.test.ts checks this).
 */
const PRESET_FOLLOWING_KEYS = new Set<CaptionTemplateStyleKey>(["entranceStartScale", "entranceOvershoot"]);

export type CaptionTemplate = {
  id: string;
  label: string;
  /** What a viewer sees, in a few words. */
  detail: string;
  styleVariant: CaptionStyleVariant;
  fontPreset: CaptionFontPreset;
  /** Suggested size in px at 1080; the caption's size stays the creator's to set. */
  fontSizePx: number;
  timingMode: CaptionTimingMode;
  /** Most words in one caption. */
  wordLimit: number;
  style: CaptionTemplateStyle;
  /** The dials a review card leads with, most important first. */
  dials: CaptionTemplateStyleKey[];
};

const YELLOW = "#ffd400";

const template = (item: CaptionTemplate) => item;

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  // Static looks: no motion beyond a cut between captions.
  template({ id: "clean_outline", label: "Clean outline", detail: "White words, black outline",
    styleVariant: "bold_outline", fontPreset: "montserrat", fontSizePx: 64, timingMode: "phrase", wordLimit: 3,
    style: { letterSpacingEm: 0.01 }, dials: ["letterSpacingEm"] }),
  template({ id: "soft_shadow", label: "Soft shadow", detail: "Plain words lifted by a soft shadow",
    styleVariant: "none", fontPreset: "poppins", fontSizePx: 58, timingMode: "phrase", wordLimit: 4,
    style: { shadowOpacity: 0.75, shadowDistanceEm: 0.05, shadowSoftnessEm: 0.14 }, dials: ["shadowOpacity", "shadowSoftnessEm", "shadowDistanceEm"] }),
  template({ id: "boxed_phrase", label: "Boxed phrase", detail: "Phrase on a dark card, fades in",
    styleVariant: "black_card", fontPreset: "inter", fontSizePx: 52, timingMode: "phrase", wordLimit: 4,
    style: { animationIn: "fade", animationInDuration: 0.18, animationOut: "fade", animationOutDuration: 0.12 }, dials: ["animationInDuration"] }),
  template({ id: "glow_outline", label: "Glow outline", detail: "Outlined words with a coloured glow",
    styleVariant: "bold_outline", fontPreset: "archivo_black", fontSizePx: 64, timingMode: "phrase", wordLimit: 3,
    style: { glowStrength: 0.7, glowColor: "#3fa9ff", glowRadiusEm: 0.35 }, dials: ["glowStrength", "glowRadiusEm"] }),
  template({ id: "soft_glow", label: "Soft glow", detail: "Bright words in a warm halo",
    styleVariant: "glow", fontPreset: "outfit", fontSizePx: 62, timingMode: "phrase", wordLimit: 3,
    style: { glowStrength: 0.6, glowColor: "#ffb547", glowRadiusEm: 0.4 }, dials: ["glowStrength", "glowRadiusEm"] }),
  template({ id: "deep_3d", label: "Deep 3D", detail: "Words with a solid 3D side",
    styleVariant: "extruded", fontPreset: "anton", fontSizePx: 72, timingMode: "phrase", wordLimit: 3,
    style: { extrudeDepthEm: 0.1, extrudeColor: "#7c3aed", outlineColor: "#111111" }, dials: ["extrudeDepthEm", "extrudeAngleDeg"] }),
  // Words follow the speech.
  template({ id: "word_fade_in", label: "Word fade in", detail: "Each word fades in as it is said",
    styleVariant: "bold_outline", fontPreset: "poppins", fontSizePx: 60, timingMode: "phrase", wordLimit: 4,
    style: { upcomingWords: "hidden", wordStateSeconds: 0.2 }, dials: ["wordStateSeconds"] }),
  template({ id: "word_rise", label: "Word rise", detail: "Each word rises in as it is said",
    styleVariant: "none", fontPreset: "montserrat", fontSizePx: 60, timingMode: "phrase", wordLimit: 4,
    style: { animationIn: "word_rise", animationInDuration: 0.3, shadowOpacity: 0.6, shadowSoftnessEm: 0.12 }, dials: ["animationInDuration", "shadowOpacity"] }),
  template({ id: "read_along_dim", label: "Read along", detail: "Words not said yet wait dimmed",
    styleVariant: "bold_outline", fontPreset: "inter", fontSizePx: 58, timingMode: "phrase", wordLimit: 4,
    style: { upcomingWords: "dimmed", upcomingWordOpacity: 0.4, wordStateSeconds: 0.1 }, dials: ["upcomingWordOpacity", "wordStateSeconds"] }),
  template({ id: "spoken_word_yellow", label: "Spoken word yellow", detail: "Three words; the spoken one turns yellow",
    styleVariant: "bold_outline", fontPreset: "montserrat", fontSizePx: 64, timingMode: "phrase", wordLimit: 3,
    style: { speakingWordColor: YELLOW, wordStateSeconds: 0.06 }, dials: ["wordStateSeconds"] }),
  template({ id: "karaoke_fill", label: "Karaoke fill", detail: "Words fill with colour as they are said",
    styleVariant: "bold_outline", fontPreset: "archivo_black", fontSizePx: 60, timingMode: "phrase", wordLimit: 4,
    style: { speakingWordColor: "#38e07b", spokenWordColor: "#38e07b", wordStateSeconds: 0.08 }, dials: ["wordStateSeconds"] }),
  template({ id: "grow_and_colour", label: "Grow and colour", detail: "The spoken word grows and changes colour",
    styleVariant: "bold_outline", fontPreset: "poppins", fontSizePx: 60, timingMode: "phrase", wordLimit: 3,
    style: { speakingWordColor: "#ff4fa3", speakingWordScale: 1.15, wordStateSeconds: 0.1 }, dials: ["speakingWordScale", "wordStateSeconds"] }),
  template({ id: "speaking_word_punch", label: "Speaking word punch", detail: "The spoken word punches past full size",
    styleVariant: "bold_outline", fontPreset: "anton", fontSizePx: 66, timingMode: "phrase", wordLimit: 3,
    style: { speakingWordScale: 1.25, speakingWordOvershoot: 0.45, wordStateSeconds: 0.14 },
    dials: ["speakingWordScale", "speakingWordOvershoot", "wordStateSeconds"] }),
  // One word at a time.
  template({ id: "one_word_cut", label: "One word cut", detail: "One big word at a time, hard cuts",
    styleVariant: "bold_outline", fontPreset: "anton", fontSizePx: 92, timingMode: "single_word", wordLimit: 1,
    style: { letterSpacingEm: 0.02 }, dials: ["letterSpacingEm"] }),
  template({ id: "word_by_word_spring", label: "Word by word spring", detail: "One word at a time, springs into place",
    styleVariant: "bold_outline", fontPreset: "poppins", fontSizePx: 86, timingMode: "single_word", wordLimit: 1,
    style: { animationIn: "spring_pop", animationInDuration: 0.22, entranceStartScale: 0.6, entranceOvershoot: 0.18 },
    dials: ["entranceOvershoot", "entranceStartScale", "animationInDuration"] }),
  template({ id: "comic_pop", label: "Comic pop", detail: "Rounded words with a hard drop, pop in",
    styleVariant: "bold_outline", fontPreset: "fredoka", fontSizePx: 84, timingMode: "single_word", wordLimit: 1,
    style: { textColor: "#ffe14d", shadowOpacity: 1, shadowDistanceEm: 0.08, shadowSoftnessEm: 0, shadowAngleDeg: 120,
      animationIn: "pop", animationInDuration: 0.16, entranceStartScale: 0.7, entranceOvershoot: 0.12 },
    dials: ["entranceOvershoot", "shadowDistanceEm", "animationInDuration"] }),
  // Whole-phrase entrances.
  template({ id: "punch_in_phrase", label: "Punch-in phrase", detail: "Phrase punches in past full size, settles",
    styleVariant: "bold_outline", fontPreset: "montserrat", fontSizePx: 64, timingMode: "phrase", wordLimit: 3,
    style: { animationIn: "pop", animationInDuration: 0.18, entranceStartScale: 0.6, entranceOvershoot: 0.2 },
    dials: ["entranceOvershoot", "entranceStartScale", "animationInDuration"] }),
  template({ id: "gentle_zoom_in", label: "Gentle zoom in", detail: "Phrase grows gently into place",
    styleVariant: "none", fontPreset: "inter", fontSizePx: 58, timingMode: "phrase", wordLimit: 4,
    style: { animationIn: "pop", animationInDuration: 0.3, entranceStartScale: 0.8, entranceOvershoot: 0, shadowOpacity: 0.6, shadowSoftnessEm: 0.12 },
    dials: ["entranceStartScale", "animationInDuration"] }),
  template({ id: "typewriter", label: "Typewriter", detail: "Letters type on, mono font",
    styleVariant: "black_card", fontPreset: "jetbrains_mono", fontSizePx: 48, timingMode: "phrase", wordLimit: 4,
    style: { animationIn: "type_on", animationInDuration: 0.5 }, dials: ["animationInDuration"] }),
  // Looping motion while the caption is on screen.
  template({ id: "sway_words", label: "Sway words", detail: "Words sway side to side, one after another",
    styleVariant: "bold_outline", fontPreset: "fredoka", fontSizePx: 64, timingMode: "phrase", wordLimit: 3,
    style: { glowStrength: 0.45, glowColor: "#ff7ad9", glowRadiusEm: 0.3, loopMotion: "sway", loopMotionAmount: 0.45, loopMotionSeconds: 1.4, loopMotionPerWord: true },
    dials: ["loopMotionAmount", "loopMotionSeconds", "glowStrength"] }),
  template({ id: "float_and_glow", label: "Float and glow", detail: "Glowing phrase floats gently",
    styleVariant: "bold_outline", fontPreset: "outfit", fontSizePx: 62, timingMode: "phrase", wordLimit: 3,
    style: { glowStrength: 0.6, glowColor: "#7cc8ff", glowRadiusEm: 0.35, loopMotion: "float", loopMotionAmount: 0.4, loopMotionSeconds: 1.8 },
    dials: ["loopMotionAmount", "loopMotionSeconds", "glowStrength"] }),
  // Keywords.
  template({ id: "keyword_pop", label: "Keyword pop", detail: "Marked keywords bigger, yellow, in capitals",
    styleVariant: "bold_outline", fontPreset: "montserrat", fontSizePx: 50, timingMode: "phrase", wordLimit: 3,
    style: { keywordColor: YELLOW, keywordScale: 1.3, keywordUppercase: true }, dials: ["keywordScale"] }),
  // A shape follows the spoken word.
  template({ id: "box_follows_word", label: "Box follows word", detail: "A rounded box pops in behind the spoken word",
    styleVariant: "none", fontPreset: "montserrat", fontSizePx: 62, timingMode: "phrase", wordLimit: 3,
    style: { wordMarker: "box", wordMarkerColor: "#7c3aed", wordMarkerMotion: "pop", wordMarkerRadiusEm: 0.18, wordMarkerPadEm: 0.14, wordMarkerSeconds: 0.14,
      shadowOpacity: 0.5, shadowSoftnessEm: 0.1 },
    dials: ["wordMarkerRadiusEm", "wordMarkerPadEm", "wordMarkerSeconds", "wordMarkerOpacity"] }),
  template({ id: "underline_follows_word", label: "Underline follows word", detail: "An underline slides under the spoken word",
    styleVariant: "bold_outline", fontPreset: "poppins", fontSizePx: 60, timingMode: "phrase", wordLimit: 3,
    style: { wordMarker: "underline", wordMarkerColor: YELLOW, wordMarkerMotion: "slide", wordMarkerThicknessEm: 0.1, wordMarkerSeconds: 0.12 },
    dials: ["wordMarkerThicknessEm", "wordMarkerSeconds"] }),
  template({ id: "line_bar", label: "Line bar", detail: "A bar grows under the line as it is said",
    styleVariant: "bold_outline", fontPreset: "inter", fontSizePx: 58, timingMode: "phrase", wordLimit: 4,
    style: { wordMarker: "bar", wordMarkerColor: "#ff4f4f", wordMarkerThicknessEm: 0.12, wordMarkerRadiusEm: 0.06 },
    dials: ["wordMarkerThicknessEm", "wordMarkerRadiusEm"] }),
];

export const CAPTION_TEMPLATE_IDS = CAPTION_TEMPLATES.map((item) => item.id) as [string, ...string[]];

export function captionTemplate(id: string): CaptionTemplate | undefined {
  return CAPTION_TEMPLATES.find((item) => item.id === id);
}

/** The template's font, by its display name. */
export function captionTemplateFontLabel(item: CaptionTemplate) {
  return CAPTION_FONT_PRESET_LABELS[item.fontPreset];
}

const STYLE_KEYS = new Set<string>(CAPTION_TEMPLATE_STYLE_KEYS);

/** The template-style props present on a record (an operation's overrides, for one). */
export function pickCaptionTemplateStyle(record: Record<string, unknown>): CaptionTemplateStyle {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => STYLE_KEYS.has(key) && value !== undefined)) as CaptionTemplateStyle;
}

/**
 * Every prop a template sets on a caption: its treatment and font, its style on top of neutral
 * values (so nothing an earlier look or template left survives), then any overrides.
 */
export function captionTemplateStyleProps(item: CaptionTemplate, overrides: Record<string, unknown> = {}) {
  const styleVariant = typeof overrides.styleVariant === "string" ? overrides.styleVariant : item.styleVariant;
  const neutral = Object.fromEntries(CAPTION_TEMPLATE_STYLE_KEYS
    .filter((key) => !PRESET_FOLLOWING_KEYS.has(key))
    .map((key) => [key, DEFAULT_CAPTION_PROPS[key]]));
  return {
    ...neutral,
    ...captionVariantLayers(styleVariant),
    styleVariant: item.styleVariant,
    fontPreset: item.fontPreset,
    outlineWidthPx: null,
    ...item.style,
    ...overrides,
  };
}

export function isCaptionTemplateCatalogConsistent() {
  return CAPTION_TEMPLATES.every((item) => isCaptionStyleVariant(item.styleVariant) && isCaptionFontPreset(item.fontPreset)
    && item.dials.every((dial) => typeof (item.style[dial] ?? DEFAULT_CAPTION_PROPS[dial]) === "number"));
}
