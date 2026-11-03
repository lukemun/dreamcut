"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CAPTION_FONT_PRESET_LABELS, captionStylePropsFromRaw, resolveCaptionProps, type CaptionFontPreset } from "@/lib/timeline/captions";
import { pickCaptionLayers } from "@/lib/timeline/caption-layer-style";
import { CAPTION_TEMPLATES, captionTemplateFontLabel, captionTemplateStyleProps, type CaptionTemplate } from "@/lib/timeline/caption-templates";
import { CAPTION_LOOKS, TEXT_PANEL_FONTS, TEXT_PRESETS, captionLookStyleProps, type CaptionLook, type TextPreset } from "@/lib/timeline/panel-text-presets";
import { CatalogTile, CatalogTileGrid } from "./CatalogTile";
import { CaptionStylePreview, type CaptionPreviewWord } from "./CaptionStylePreview";
import { useChatSelection } from "./useChatSelection";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { buildCaptionLookPayload, buildCaptionTemplatePayload, buildFontTextPayload, buildTextPresetPayload, type ElementCreatePayload } from "./asset-shelf-payloads";

/** The caption or title currently selected on the timeline, which panel actions apply to. */
export type PanelTextTarget = { elementId: string; laneKey: string; laneLabel: string; props: Record<string, unknown> } | null;

const SAMPLE_CAPTION = "Captions";
// Entrance names already ending in "in" ("drop_in", "pop_in") are not suffixed again ("Drop in in").
const motionLabel = (preset: string) => {
  if (preset === "none") return "No motion";
  const words = `${preset[0].toUpperCase()}${preset.slice(1).replaceAll("_", " ")}`;
  return /\bin$/i.test(words) ? words : `${words} in`;
};

function useBusyAction() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const run = (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    void action().catch(error => toast.error(error instanceof Error ? error.message : "Could not update the timeline")).finally(() => setBusyId(null));
  };
  return { busyId, run };
}

const TEMPLATE_SAMPLE = "Say it loud";

/** A still of a template: its effects, and the middle word as it looks while said (or as a keyword). */
function CaptionTemplatePreview({ item }: { item: CaptionTemplate }) {
  const props = resolveCaptionProps({ text: TEMPLATE_SAMPLE, ...captionTemplateStyleProps(item) });
  const keyword = item.style.keywordScale != null || item.style.keywordColor != null;
  const speaking = props.speakingWordColor != null || props.speakingWordScale !== 1 || props.speakingWordLiftEm !== 0 || props.wordMarker !== "none";
  const word: CaptionPreviewWord | undefined = keyword
    ? { index: 2, color: props.keywordColor, scale: props.keywordScale, uppercase: props.keywordUppercase, marker: "none", markerColor: props.wordMarkerColor }
    : speaking ? { index: 1, color: props.speakingWordColor, scale: props.speakingWordScale, marker: props.wordMarker, markerColor: props.wordMarkerColor } : undefined;
  return <CaptionStylePreview text={item.timingMode === "single_word" ? "Loud" : TEMPLATE_SAMPLE} styleVariant={props.styleVariant} fontPreset={props.fontPreset}
    layers={pickCaptionLayers(props)} textColor={props.textColor} word={word} />;
}

export function CaptionLookGallery({ target, onApplyLaneStyle, onAddElement, children }: {
  target: PanelTextTarget;
  onApplyLaneStyle?: (laneKey: string, styleProps: Record<string, unknown>) => Promise<unknown>;
  onAddElement?: (payload: ElementCreatePayload) => Promise<void>;
  children?: React.ReactNode;
}) {
  const selection = useChatSelection("caption-looks");
  const { busyId, run } = useBusyAction();
  const apply = (look: CaptionLook) => target && onApplyLaneStyle
    ? run(look.id, () => onApplyLaneStyle(target.laneKey, { ...captionStylePropsFromRaw(target.props), ...captionLookStyleProps(look) }))
    : onAddElement ? run(look.id, () => onAddElement(buildCaptionLookPayload(look))) : undefined;
  // A template restyles the lane; how many words each caption shows stays the lane's own.
  const applyTemplate = (item: CaptionTemplate) => target && onApplyLaneStyle
    ? run(`template:${item.id}`, () => onApplyLaneStyle(target.laneKey, { ...captionStylePropsFromRaw(target.props), ...captionTemplateStyleProps(item) }))
    : onAddElement ? run(`template:${item.id}`, () => onAddElement(buildCaptionTemplatePayload(item))) : undefined;
  return <>
    {children}
    <div className="mb-2"><InspectorItemHeader title="Templates" /></div>
    <CatalogTileGrid label="Caption templates">
      {CAPTION_TEMPLATES.map(item => {
        const id = `caption-template:${item.id}`;
        return <CatalogTile key={item.id} label={item.label} detail={item.detail}
          preview={<CaptionTemplatePreview item={item} />}
          selected={selection.selectedIds.has(id)}
          onSelect={() => selection.toggle({ id, kind: "Caption template", label: item.label,
            agentText: `Caption template "${item.label}" (${item.detail}; ${captionTemplateFontLabel(item)}): caption_proposal_compile template "${item.id}".` })}
          addLabel={target ? "Apply to caption lane" : "Add caption at playhead"}
          actionText={target ? "Apply" : "Add"}
          onAdd={(target ? onApplyLaneStyle : onAddElement) ? () => applyTemplate(item) : undefined}
          adding={busyId === `template:${item.id}`}
          dragPayload={onAddElement ? buildCaptionTemplatePayload(item) : null} />;
      })}
    </CatalogTileGrid>
    <div className="mb-2 mt-2"><InspectorItemHeader title="Looks" /></div>
    <CatalogTileGrid label="Caption looks">
      {CAPTION_LOOKS.map(look => {
        const id = `caption-look:${look.id}`;
        const fontLabel = CAPTION_FONT_PRESET_LABELS[look.fontPreset];
        return <CatalogTile key={look.id} label={look.label} detail={fontLabel}
          preview={<CaptionStylePreview text={SAMPLE_CAPTION} styleVariant={look.styleVariant} fontPreset={look.fontPreset} />}
          selected={selection.selectedIds.has(id)}
          onSelect={() => selection.toggle({ id, kind: "Caption look", label: look.label,
            agentText: `Caption look "${look.label}": caption_text props styleVariant "${look.styleVariant}", fontPreset "${look.fontPreset}" (${fontLabel}).` })}
          addLabel={target ? "Apply to caption lane" : "Add caption at playhead"}
          actionText={target ? "Apply" : "Add"}
          onAdd={(target ? onApplyLaneStyle : onAddElement) ? () => apply(look) : undefined}
          adding={busyId === look.id}
          dragPayload={onAddElement ? buildCaptionLookPayload(look) : null} />;
      })}
    </CatalogTileGrid>
  </>;
}

export function TextPanel({ target, onPatchElementProps, onAddElement }: {
  target: PanelTextTarget;
  onPatchElementProps?: (elementId: string, props: Record<string, unknown>) => Promise<unknown>;
  onAddElement?: (payload: ElementCreatePayload) => Promise<void>;
}) {
  const selection = useChatSelection("text");
  const { busyId, run } = useBusyAction();
  const canApply = !!target && !!onPatchElementProps;
  const applyPreset = (item: TextPreset) => canApply
    ? run(item.id, () => onPatchElementProps!(target!.elementId, { ...target!.props, ...item.props }))
    : onAddElement ? run(item.id, () => onAddElement(buildTextPresetPayload(item))) : undefined;
  const applyFont = (font: CaptionFontPreset) => canApply
    ? run(font, () => onPatchElementProps!(target!.elementId, { ...target!.props, fontPreset: font }))
    : onAddElement ? run(font, () => onAddElement(buildFontTextPayload(font))) : undefined;
  return <>
    <div className="mb-2"><InspectorItemHeader title="Presets" /></div>
    <CatalogTileGrid label="Text presets">
      {TEXT_PRESETS.map(item => {
        const id = `text-preset:${item.id}`;
        return <CatalogTile key={item.id} label={item.label} detail={`${item.detail} · ${motionLabel(item.props.animationIn)}`}
          preview={<CaptionStylePreview text={item.sampleText} styleVariant={item.props.styleVariant} fontPreset={item.props.fontPreset}
            fontPx={Math.round(Math.min(26, Math.max(11, item.props.fontSizePx / 5)))} position={item.props.positionPreset} align={item.props.textAlign} />}
          selected={selection.selectedIds.has(id)}
          onSelect={() => selection.toggle({ id, kind: "Text", label: item.label,
            agentText: `Text preset "${item.label}" (${item.detail}): caption_text props ${JSON.stringify(item.props)}.` })}
          addLabel={canApply ? "Apply to selected text" : "Add at playhead"}
          actionText={canApply ? "Apply" : "Add"}
          onAdd={canApply || onAddElement ? () => applyPreset(item) : undefined}
          adding={busyId === item.id}
          dragPayload={onAddElement ? buildTextPresetPayload(item) : null} />;
      })}
    </CatalogTileGrid>
    <div className="mb-2 mt-2"><InspectorItemHeader title="Fonts" /></div>
    <CatalogTileGrid label="Fonts">
      {TEXT_PANEL_FONTS.map(font => {
        const id = `text-font:${font}`;
        const label = CAPTION_FONT_PRESET_LABELS[font];
        return <CatalogTile key={font} label={label}
          preview={<CaptionStylePreview text="Aa Bb" styleVariant="none" fontPreset={font} fontPx={28} />}
          selected={selection.selectedIds.has(id)}
          onSelect={() => selection.toggle({ id, kind: "Font", label, agentText: `Font "${label}": caption_text props fontPreset "${font}".` })}
          addLabel={canApply ? "Use for selected text" : "Add text at playhead"}
          actionText={canApply ? "Apply" : "Add"}
          onAdd={canApply || onAddElement ? () => applyFont(font) : undefined}
          adding={busyId === font}
          dragPayload={onAddElement ? buildFontTextPayload(font) : null} />;
      })}
    </CatalogTileGrid>
  </>;
}
