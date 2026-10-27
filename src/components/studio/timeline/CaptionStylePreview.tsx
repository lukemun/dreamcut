"use client";
import type { CSSProperties } from "react";
import {
  captionCompositingCSS,
  captionFontFamily,
  captionStyleCSS,
  captionTypographyCSS,
  isPerWordBackgroundVariant,
  perWordBackgroundCSS,
  scaleCaptionPixelStyle,
  type CaptionFontPreset,
  type CaptionPositionPreset,
  type CaptionStyleVariant,
} from "@/lib/timeline/captions";

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
export function CaptionStylePreview({ text, styleVariant, fontPreset, fontPx = 17, position = "center", align = "center" }: {
  text: string;
  styleVariant: CaptionStyleVariant;
  fontPreset: CaptionFontPreset;
  fontPx?: number;
  position?: CaptionPositionPreset;
  align?: "left" | "center" | "right";
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
      ...scaleCaptionPixelStyle(captionStyleCSS(styleVariant), scale),
    } as CSSProperties}>
      {wordStyle
        ? text.split(/(\s+)/).map((part, index) => part.trim() ? <span key={index} style={wordStyle as CSSProperties}>{part}</span> : part)
        : text}
    </span>
  </span>;
}
