"use client";
import type { CSSProperties } from "react";
import {
  captionCompositingCSS,
  captionFontFamily,
  captionStyleCSS,
  captionTreatmentTakesLayers,
  captionTypographyCSS,
  isPerWordBackgroundVariant,
  perWordBackgroundCSS,
  perWordGapCSS,
  scaleCaptionPixelStyle,
  type CaptionFontPreset,
  type CaptionPositionPreset,
  type CaptionStyleVariant,
} from "@/lib/timeline/captions";
import { applyCaptionLayers, captionVariantLayers, type CaptionLayerStyle } from "@/lib/timeline/caption-layer-style";

/** One word drawn as it looks while said (or as a keyword): its colour, size and the marker behind it. */
export type CaptionPreviewWord = { index: number; color: string | null; scale: number; uppercase?: boolean; marker: "none" | "box" | "underline" | "bar"; markerColor: string };

function previewWordCSS(word: CaptionPreviewWord): CSSProperties {
  const marker: CSSProperties = word.marker === "box"
    ? { backgroundColor: word.markerColor, borderRadius: "0.16em", boxShadow: `0 0 0 0.1em ${word.markerColor}` }
    : word.marker === "underline" || word.marker === "bar"
      ? { backgroundImage: `linear-gradient(${word.markerColor}, ${word.markerColor})`, backgroundSize: "100% 0.12em", backgroundPosition: "0 100%", backgroundRepeat: "no-repeat" }
      : {};
  return { display: "inline-block", transform: word.scale !== 1 ? `scale(${word.scale})` : undefined, ...(word.color ? { color: word.color } : {}),
    ...(word.uppercase ? { textTransform: "uppercase" } : {}), ...marker };
}

/** Caption styles are authored at this size; previews scale strokes and padding to match. */
const AUTHORED_FONT_PX = 42;

const ALIGN: Record<string, CSSProperties["justifyContent"]> = { left: "flex-start", center: "center", right: "flex-end" };

function previewPlacement(position: CaptionPositionPreset): CSSProperties {
  const [vertical, horizontal = "center"] = position.startsWith("reels_") ? ["bottom", "center"] : position === "center" ? ["center", "center"] : position.split("_");
  return {
    alignItems: vertical === "top" || vertical === "upper" ? "flex-start" : vertical === "bottom" || vertical === "lower" ? "flex-end" : "center",
    justifyContent: ALIGN[horizontal] ?? "center",
  };
}

/**
 * A static picture of caption text using the renderer's own style CSS and font, sized for a
 * panel tile. It shows the look, not motion; animation names are listed alongside it.
 */
export function CaptionStylePreview({ text, styleVariant, fontPreset, fontPx = 17, position = "center", align = "center", layers, textColor = null, word }: {
  text: string;
  styleVariant: CaptionStyleVariant;
  fontPreset: CaptionFontPreset;
  fontPx?: number;
  position?: CaptionPositionPreset;
  align?: "left" | "center" | "right";
  /** The text effects to draw; the treatment's own preset when left out. */
  layers?: CaptionLayerStyle;
  textColor?: string | null;
  word?: CaptionPreviewWord;
}) {
  const scale = fontPx / AUTHORED_FONT_PX;
  const perWord = isPerWordBackgroundVariant(styleVariant);
  const wordStyle = perWord ? scaleCaptionPixelStyle(perWordBackgroundCSS(styleVariant), scale) : null;
  return <span style={{ position: "absolute", inset: 8, display: "flex", ...previewPlacement(position), ...captionCompositingCSS(styleVariant) } as CSSProperties}>
    <span style={{
      maxWidth: "100%",
      fontFamily: captionFontFamily(fontPreset),
      fontSize: fontPx,
      textAlign: align,
      overflowWrap: "anywhere",
      ...captionTypographyCSS(fontPreset),
      ...scaleCaptionPixelStyle(captionTreatmentTakesLayers(styleVariant)
        ? applyCaptionLayers(captionStyleCSS(styleVariant, textColor), layers ?? captionVariantLayers(styleVariant), captionTypographyCSS(fontPreset))
        : captionStyleCSS(styleVariant, textColor), scale),
    } as CSSProperties}>
      {wordStyle
        ? text.split(/(\s+)/).map((part, index, parts) => part.trim()
          ? <span key={index} style={wordStyle as CSSProperties}>{part}</span>
          : index > 0 && parts[index + 1]?.trim() ? <span key={index} style={perWordGapCSS(styleVariant) as CSSProperties}>{part}</span> : part)
        : word
          ? text.split(/(\s+)/).map((part, index) => index === word.index * 2 ? <span key={index} style={previewWordCSS(word)}>{part}</span> : part)
          : text}
    </span>
  </span>;
}
