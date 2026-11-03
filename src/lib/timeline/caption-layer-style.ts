/**
 * The layered text style every caption treatment can carry on top of its own look: an outline
 * colour, a second outline, a two-colour fill, a glow, a drop shadow, an extrude, a background box and
 * spacing. Glow and Extruded in the Text treatment
 * picker are presets of these same controls (owner decision 2026-11-02), so any treatment can be
 * tuned toward them and a human can take them apart again.
 */
export type CaptionLayerStyle = {
  /** Colour of the treatment's outline; null keeps the treatment's own. */
  outlineColor: string | null;
  /** How strongly the text glows (0 = no glow). */
  glowStrength: number;
  glowColor: string;
  /** How far the glow spreads, in em. */
  glowRadiusEm: number;
  /** Opacity of the drop shadow (0 = no shadow). */
  shadowOpacity: number;
  shadowColor: string;
  /** How far the shadow falls from the text, in em. */
  shadowDistanceEm: number;
  /** Direction the shadow falls, in degrees clockwise from the right (90 = straight down). */
  shadowAngleDeg: number;
  /** How soft the shadow edge is, in em (0 = hard). */
  shadowSoftnessEm: number;
  /** Depth of the solid 3D side (0 = flat). */
  extrudeDepthEm: number;
  extrudeColor: string;
  /** Direction the 3D side extends, in degrees clockwise from the right. */
  extrudeAngleDeg: number;
  /** Tracking added to the font's own, in em. */
  letterSpacingEm: number;
  /** Line height relative to the font's own (1 = unchanged). */
  lineHeightScale: number;
  /** Second colour of a fill that blends from the text colour; null keeps a solid fill. */
  fillGradientColor: string | null;
  /** Direction the fill blends toward its second colour, in degrees (180 = top to bottom). */
  fillGradientAngleDeg: number;
  /** A second outline around the first, as wide as this in em (0 = none). */
  outline2WidthEm: number;
  outline2Color: string;
  /** Colour of a box behind the text; null keeps the treatment's own (or none). */
  boxColor: string | null;
  boxOpacity: number;
  /** Box corner radius, in em. */
  boxRadiusEm: number;
  /** Box padding around the text, in em. */
  boxPadEm: number;
  /** One box per line, or one box around the whole caption. */
  boxScope: "line" | "block";
  /** Red and cyan copies split either side of the text, in em (0 = none). */
  chromaSplitEm: number;
  /** Fading copies of the text trailing behind it (0 = none). */
  echoCount: number;
  /** Gap between echo copies, in em. */
  echoDistanceEm: number;
  /** Direction the echoes trail, in degrees clockwise from the right. */
  echoAngleDeg: number;
  echoColor: string;
  /** Two-colour fill: an optional middle colour, making it three. */
  fillGradientMidColor: string | null;
  /** Seconds for the caption's colours to turn once round the colour wheel (0 = still). */
  colorCycleSeconds: number;
};

export const CAPTION_LAYER_STYLE_KEYS = [
  "outlineColor", "glowStrength", "glowColor", "glowRadiusEm",
  "shadowOpacity", "shadowColor", "shadowDistanceEm", "shadowAngleDeg", "shadowSoftnessEm",
  "extrudeDepthEm", "extrudeColor", "extrudeAngleDeg", "letterSpacingEm", "lineHeightScale",
  "fillGradientColor", "fillGradientAngleDeg", "outline2WidthEm", "outline2Color",
  "boxColor", "boxOpacity", "boxRadiusEm", "boxPadEm", "boxScope",
  "chromaSplitEm", "echoCount", "echoDistanceEm", "echoAngleDeg", "echoColor",
  "fillGradientMidColor", "colorCycleSeconds",
] as const satisfies readonly (keyof CaptionLayerStyle)[];

/** Every layer off: the treatment draws exactly as it did before layers existed. */
export const NEUTRAL_CAPTION_LAYERS: CaptionLayerStyle = {
  outlineColor: null,
  glowStrength: 0,
  glowColor: "#ffffff",
  glowRadiusEm: 0.3,
  shadowOpacity: 0,
  shadowColor: "#000000",
  shadowDistanceEm: 0.06,
  shadowAngleDeg: 90,
  shadowSoftnessEm: 0.08,
  extrudeDepthEm: 0,
  extrudeColor: "#000000",
  extrudeAngleDeg: 60,
  letterSpacingEm: 0,
  lineHeightScale: 1,
  fillGradientColor: null,
  fillGradientAngleDeg: 180,
  outline2WidthEm: 0,
  outline2Color: "#000000",
  boxColor: null,
  boxOpacity: 1,
  boxRadiusEm: 0.2,
  boxPadEm: 0.25,
  boxScope: "line",
  chromaSplitEm: 0,
  echoCount: 0,
  echoDistanceEm: 0.08,
  echoAngleDeg: 90,
  echoColor: "#ffffff",
  fillGradientMidColor: null,
  colorCycleSeconds: 0,
};

/** What a colour layer that is off starts from when it is turned on. */
export const CAPTION_LAYER_TURN_ON = { fillGradientMidColor: "#7c5cff", colorCycleSeconds: 3, fillGradientColor: "#ff4fd8", boxColor: "#000000", boxOpacity: 0.6, outline2WidthEm: 0.04, chromaSplitEm: 0.04, echoCount: 3 } as const;

/** The layer preset a treatment starts from; treatments without one start neutral. */
export const CAPTION_VARIANT_LAYER_PRESETS: Partial<Record<string, Partial<CaptionLayerStyle>>> = {
  glow: { glowStrength: 0.85, glowColor: "#ff4fd8", glowRadiusEm: 0.32 },
  extruded: { outlineColor: "#1a1a1a", extrudeDepthEm: 0.09, extrudeColor: "#c2410c", extrudeAngleDeg: 60 },
};

export function captionVariantLayers(variant: string): CaptionLayerStyle {
  return { ...NEUTRAL_CAPTION_LAYERS, ...CAPTION_VARIANT_LAYER_PRESETS[variant] };
}

const round = (value: number) => Math.round(value * 10000) / 10000;

function rgba(hex: string, alpha: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = Number.parseInt(match[1]!, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${round(Math.max(0, Math.min(1, alpha)))})`;
}

/** The text-shadow entries the layers add, nearest-on-top: extrude, drop shadow, then glow. */
export function captionLayerShadows(layers: CaptionLayerStyle, strokeHalfPx = 0) {
  const above: string[] = [];
  const below: string[] = [];
  if (layers.outline2WidthEm > 0) {
    // Hard copies in a ring read as a second outline; it starts where the first outline ends.
    const reach = (sin: number) => strokeHalfPx > 0
      ? `calc(${round(sin * layers.outline2WidthEm)}em + ${round(sin * strokeHalfPx)}px)`
      : `${round(sin * layers.outline2WidthEm)}em`;
    for (let step = 0; step < 16; step += 1) {
      const radians = (step / 16) * 2 * Math.PI;
      above.push(`${reach(Math.cos(radians))} ${reach(Math.sin(radians))} 0 ${layers.outline2Color}`);
    }
  }
  if (layers.extrudeDepthEm > 0) {
    // Stepped hard copies read as a solid side; enough steps that no gap shows at large sizes.
    const steps = Math.max(4, Math.min(24, Math.round(layers.extrudeDepthEm * 160)));
    const radians = (layers.extrudeAngleDeg * Math.PI) / 180;
    for (let step = 1; step <= steps; step += 1) {
      const distance = (layers.extrudeDepthEm * step) / steps;
      above.push(`${round(Math.cos(radians) * distance)}em ${round(Math.sin(radians) * distance)}em 0 ${layers.extrudeColor}`);
    }
  }
  if (layers.shadowOpacity > 0) {
    const radians = (layers.shadowAngleDeg * Math.PI) / 180;
    const distance = layers.shadowDistanceEm + (layers.extrudeDepthEm > 0 ? layers.extrudeDepthEm : 0);
    above.push(`${round(Math.cos(radians) * distance)}em ${round(Math.sin(radians) * distance)}em ${round(layers.shadowSoftnessEm)}em ${rgba(layers.shadowColor, layers.shadowOpacity)}`);
  }
  if (layers.chromaSplitEm > 0) {
    const d = round(layers.chromaSplitEm);
    below.push(`-${d}em 0 0 rgba(255, 0, 64, 0.85)`, `${d}em 0 0 rgba(0, 229, 255, 0.85)`);
  }
  if (layers.echoCount > 0 && layers.echoDistanceEm > 0) {
    const radians = (layers.echoAngleDeg * Math.PI) / 180;
    for (let copy = 1; copy <= layers.echoCount; copy += 1) {
      const distance = layers.echoDistanceEm * copy;
      below.push(`${round(Math.cos(radians) * distance)}em ${round(Math.sin(radians) * distance)}em 0 ${rgba(layers.echoColor, 0.6 * (1 - (copy - 1) / layers.echoCount))}`);
    }
  }
  if (layers.glowStrength > 0 && layers.glowRadiusEm > 0) {
    // Three falloff rings; strength above 0.5 doubles the inner ring so a strong glow saturates.
    const alpha = Math.min(1, layers.glowStrength * 1.2);
    const rings = [0.2, 0.5, 1].map((share) => `0 0 ${round(layers.glowRadiusEm * share)}em ${rgba(layers.glowColor, alpha)}`);
    below.push(...(layers.glowStrength > 0.5 ? [rings[0]!, ...rings] : rings));
  }
  return { above, below };
}

/**
 * Applies the layers to a treatment's CSS. The treatment's own shadows sit between the layer's
 * drop shadow and its glow; an outline colour recolours the treatment's stroke.
 */
export function applyCaptionLayers(
  base: Record<string, string | number>,
  layers: CaptionLayerStyle,
  typography: Record<string, string | number>,
): Record<string, string | number> {
  const style = { ...base };
  if (layers.outlineColor && typeof style.WebkitTextStroke === "string") {
    const width = /^\s*(-?\d*\.?\d+px)/.exec(style.WebkitTextStroke)?.[1];
    if (width) style.WebkitTextStroke = `${width} ${layers.outlineColor}`;
  }
  const strokeWidth = typeof style.WebkitTextStroke === "string" ? Number.parseFloat(style.WebkitTextStroke) || 0 : 0;
  const { above, below } = captionLayerShadows(layers, strokeWidth / 2);
  const own = typeof style.textShadow === "string" && style.textShadow !== "none" ? [style.textShadow] : [];
  if (above.length || below.length) style.textShadow = [...above, ...own, ...below].join(", ");
  // The box layer replaces a treatment's own box: it draws on a span inside (captionBoxWrapCSS).
  if (layers.boxColor && style.backgroundColor) Object.assign(style, { backgroundColor: "transparent", padding: 0, border: "none", borderRadius: 0, boxShadow: "none" });
  if (layers.letterSpacingEm !== 0) {
    const fontTracking = typeof typography.letterSpacing === "string" ? Number.parseFloat(typography.letterSpacing) || 0 : 0;
    style.letterSpacing = `${round(fontTracking + layers.letterSpacingEm)}em`;
  }
  if (layers.lineHeightScale !== 1 && typeof typography.lineHeight === "number") {
    style.lineHeight = round(typography.lineHeight * layers.lineHeightScale);
  }
  return style;
}

/**
 * A two-colour fill, drawn as a fill-only copy of the text laid over it: a background clipped to
 * the glyphs would sit under the text's own shadows, so the shadows, outlines and box stay on the
 * text beneath and this copy only paints the fill. Null for a solid fill, or a treatment with a box.
 */
export function captionGradientFillCSS(layers: CaptionLayerStyle, treatment: Record<string, string | number>): Record<string, string | number> | null {
  if (!layers.fillGradientColor || treatment.backgroundColor || layers.boxColor) return null;
  const start = typeof treatment.color === "string" && treatment.color !== "transparent" ? treatment.color : "#ffffff";
  return {
    backgroundImage: `linear-gradient(${layers.fillGradientAngleDeg}deg, ${start}, ${layers.fillGradientMidColor ? `${layers.fillGradientMidColor}, ` : ""}${layers.fillGradientColor})`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    textShadow: "none",
    WebkitTextStroke: "0px transparent",
  };
}

/** The colour of a treatment's outline (`WebkitTextStroke`), or null when it draws none. */
export function captionStrokeColor(stroke: unknown): string | null {
  if (typeof stroke !== "string") return null;
  const match = /^\s*(-?\d*\.?\d+)px\s+(.+)$/.exec(stroke);
  return match && Number(match[1]) > 0 ? match[2]!.trim() : null;
}

export function pickCaptionLayers(props: CaptionLayerStyle): CaptionLayerStyle {
  return Object.fromEntries(CAPTION_LAYER_STYLE_KEYS.map((key) => [key, props[key]])) as CaptionLayerStyle;
}

/** Degrees the caption's colours have turned round the wheel at `seconds`, or 0 when they hold still. */
export function captionColorCycleDeg(layers: Pick<CaptionLayerStyle, "colorCycleSeconds">, seconds: number) {
  if (!(layers.colorCycleSeconds > 0)) return 0;
  const turn = (seconds / layers.colorCycleSeconds) % 1;
  return Math.round(turn * 3600) / 10;
}

function captionBoxCSS(layers: CaptionLayerStyle): Record<string, string | number> {
  const pad = layers.boxPadEm;
  return {
    backgroundColor: rgba(layers.boxColor!, layers.boxOpacity),
    borderRadius: `${layers.boxRadiusEm}em`,
    padding: `${round(pad * 0.5)}em ${pad}em`,
  };
}

/**
 * The style for a span round the caption's text that draws its box, or null with no box: inline so
 * each line gets its own, or inline-block for one box fitted to the whole caption. The positioned
 * caption itself cannot break into lines, and is as wide as its width setting, not its text.
 */
export function captionBoxWrapCSS(layers: CaptionLayerStyle): Record<string, string | number> | null {
  if (!layers.boxColor) return null;
  return layers.boxScope === "block"
    ? { ...captionBoxCSS(layers), display: "inline-block" }
    : { ...captionBoxCSS(layers), display: "inline", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
}
