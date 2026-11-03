"use client";
import { useState } from "react";
import type { CaptionElementProps } from "@/lib/timeline/captions";
import { CAPTION_LAYER_TURN_ON, captionVariantLayers } from "@/lib/timeline/caption-layer-style";
import { Checkbox } from "@/components/ui/checkbox";
import { OptionSelect } from "@/components/ui/select";
import { InspectorDisclosure, InspectorItemHeader } from "./InspectorHierarchy";
import { InspectorColorControl } from "./InspectorColorControl";
import { CaptionScaledNumber } from "./CaptionWordStatesControl";
import { InspectorPropertyControl } from "./InspectorPropertyControl";

type Patch = Record<string, unknown>;

/**
 * The layered text style on any caption treatment: outline colours, two-colour fill, glow, drop
 * shadow, 3D depth, background box and spacing (timeline/caption-layer-style.ts). Glow and Extruded are presets of these controls.
 */
export function CaptionTextEffectsControl({ props, treatmentOutline, treatmentHasBox, onPreview, onPatch }: {
  props: CaptionElementProps;
  /** The colour of the treatment's own outline, or null when it draws none. */
  treatmentOutline: string | null;
  /** The treatment draws its own box, which keeps a solid fill. */
  treatmentHasBox: boolean;
  onPreview: (patch: Patch | null) => void;
  onPatch: (patch: Patch) => void;
}) {
  const preset = captionVariantLayers(props.styleVariant);
  const glowOn = props.glowStrength > 0;
  const shadowOn = props.shadowOpacity > 0;
  const depthOn = props.extrudeDepthEm > 0;
  const fillOn = props.fillGradientColor !== null;
  const outline2On = props.outline2WidthEm > 0;
  const boxOn = props.boxColor !== null;
  const splitOn = props.chromaSplitEm > 0;
  const echoOn = props.echoCount > 0;
  const cycleOn = props.colorCycleSeconds > 0;
  const changed = glowOn || shadowOn || depthOn || fillOn || outline2On || boxOn || splitOn || echoOn || cycleOn || props.outlineColor !== null
    || props.letterSpacingEm !== 0 || props.lineHeightScale !== 1;
  const [open, setOpen] = useState(changed);
  const number = { onPreview, onPatch, defaults: preset };
  // Turning a layer on starts from the treatment's preset when it has one.
  const on = (field: "glowStrength" | "shadowOpacity" | "extrudeDepthEm", fallback: number) =>
    preset[field] > 0 ? preset[field] : fallback;
  return <InspectorDisclosure title="Text effects" open={open} onOpenChange={setOpen}>
    <div className="grid min-w-0 gap-2.5">
      {treatmentOutline
        ? <InspectorColorControl label="Outline colour" ariaLabel="Outline colour"
          value={props.outlineColor ?? treatmentOutline} isCustom={props.outlineColor !== preset.outlineColor}
          onChange={(outlineColor) => onPatch({ outlineColor })} onReset={() => onPatch({ outlineColor: preset.outlineColor })} />
        : null}

      <InspectorItemHeader title="Second outline" enabled={outline2On}
        onEnabledChange={(enabled) => onPatch({ outline2WidthEm: enabled ? CAPTION_LAYER_TURN_ON.outline2WidthEm : 0 })} />
      {outline2On ? <>
        <CaptionScaledNumber field="outline2WidthEm" label="Width" value={props.outline2WidthEm} min={1} max={30} step={1} unit="%" scale={100} {...number} />
        <InspectorColorControl label="Colour" ariaLabel="Second outline colour" value={props.outline2Color} isCustom={props.outline2Color !== preset.outline2Color}
          onChange={(outline2Color) => onPatch({ outline2Color })} onReset={() => onPatch({ outline2Color: preset.outline2Color })} />
      </> : null}

      {treatmentHasBox || boxOn ? null : <>
        <InspectorItemHeader title="Two-colour fill" enabled={fillOn}
          onEnabledChange={(enabled) => onPatch({ fillGradientColor: enabled ? CAPTION_LAYER_TURN_ON.fillGradientColor : null })} />
        {fillOn ? <>
          <InspectorColorControl label="Second colour" ariaLabel="Fill second colour" value={props.fillGradientColor ?? CAPTION_LAYER_TURN_ON.fillGradientColor} isCustom
            onChange={(fillGradientColor) => onPatch({ fillGradientColor })} onReset={() => onPatch({ fillGradientColor: CAPTION_LAYER_TURN_ON.fillGradientColor })} />
          <InspectorPropertyControl fields="fillGradientMidColor" label="Middle colour" disabled={false} onReset={() => onPatch({ fillGradientMidColor: null })}>
            <Checkbox aria-label="Middle colour" checked={props.fillGradientMidColor !== null}
              onCheckedChange={(checked) => onPatch({ fillGradientMidColor: checked === true ? CAPTION_LAYER_TURN_ON.fillGradientMidColor : null })} />
          </InspectorPropertyControl>
          {props.fillGradientMidColor ? <InspectorColorControl label="Middle" ariaLabel="Fill middle colour" value={props.fillGradientMidColor} isCustom
            onChange={(fillGradientMidColor) => onPatch({ fillGradientMidColor })} onReset={() => onPatch({ fillGradientMidColor: CAPTION_LAYER_TURN_ON.fillGradientMidColor })} /> : null}
          <CaptionScaledNumber field="fillGradientAngleDeg" label="Direction" value={props.fillGradientAngleDeg} min={0} max={359} step={1} unit="°" {...number} />
        </> : null}
      </>}

      <InspectorItemHeader title="Glow" enabled={glowOn}
        onEnabledChange={(enabled) => onPatch({ glowStrength: enabled ? on("glowStrength", 0.7) : 0 })} />
      {glowOn ? <>
        <CaptionScaledNumber field="glowStrength" label="Strength" value={props.glowStrength} min={1} max={100} step={1} unit="%" scale={100} {...number} />
        <InspectorColorControl label="Glow colour" ariaLabel="Glow colour" value={props.glowColor} isCustom={props.glowColor !== preset.glowColor}
          onChange={(glowColor) => onPatch({ glowColor })} onReset={() => onPatch({ glowColor: preset.glowColor })} />
        <CaptionScaledNumber field="glowRadiusEm" label="Spread" value={props.glowRadiusEm} min={0} max={100} step={1} unit="%" scale={100} {...number} />
      </> : null}

      <InspectorItemHeader title="Shadow" enabled={shadowOn}
        onEnabledChange={(enabled) => onPatch({ shadowOpacity: enabled ? on("shadowOpacity", 0.6) : 0 })} />
      {shadowOn ? <>
        <CaptionScaledNumber field="shadowOpacity" label="Opacity" value={props.shadowOpacity} min={1} max={100} step={1} unit="%" scale={100} {...number} />
        <InspectorColorControl label="Shadow colour" ariaLabel="Shadow colour" value={props.shadowColor} isCustom={props.shadowColor !== preset.shadowColor}
          onChange={(shadowColor) => onPatch({ shadowColor })} onReset={() => onPatch({ shadowColor: preset.shadowColor })} />
        <CaptionScaledNumber field="shadowDistanceEm" label="Distance" value={props.shadowDistanceEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />
        <CaptionScaledNumber field="shadowAngleDeg" label="Direction" value={props.shadowAngleDeg} min={0} max={359} step={1} unit="°" {...number} />
        <CaptionScaledNumber field="shadowSoftnessEm" label="Softness" value={props.shadowSoftnessEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />
      </> : null}

      <InspectorItemHeader title="3D depth" enabled={depthOn}
        onEnabledChange={(enabled) => onPatch({ extrudeDepthEm: enabled ? on("extrudeDepthEm", 0.08) : 0 })} />
      {depthOn ? <>
        <CaptionScaledNumber field="extrudeDepthEm" label="Depth" value={props.extrudeDepthEm} min={1} max={30} step={1} unit="%" scale={100} {...number} />
        <InspectorColorControl label="Side colour" ariaLabel="3D side colour" value={props.extrudeColor} isCustom={props.extrudeColor !== preset.extrudeColor}
          onChange={(extrudeColor) => onPatch({ extrudeColor })} onReset={() => onPatch({ extrudeColor: preset.extrudeColor })} />
        <CaptionScaledNumber field="extrudeAngleDeg" label="Direction" value={props.extrudeAngleDeg} min={0} max={359} step={1} unit="°" {...number} />
      </> : null}

      <InspectorItemHeader title="RGB split" enabled={splitOn}
        onEnabledChange={(enabled) => onPatch({ chromaSplitEm: enabled ? CAPTION_LAYER_TURN_ON.chromaSplitEm : 0 })} />
      {splitOn ? <CaptionScaledNumber field="chromaSplitEm" label="Split" value={props.chromaSplitEm} min={1} max={20} step={1} unit="%" scale={100} {...number} /> : null}

      <InspectorItemHeader title="Echo" enabled={echoOn}
        onEnabledChange={(enabled) => onPatch({ echoCount: enabled ? CAPTION_LAYER_TURN_ON.echoCount : 0 })} />
      {echoOn ? <>
        <CaptionScaledNumber field="echoCount" label="Copies" value={props.echoCount} min={1} max={8} step={1} unit="" {...number} />
        <CaptionScaledNumber field="echoDistanceEm" label="Gap" value={props.echoDistanceEm} min={0} max={50} step={1} unit="%" scale={100} {...number} />
        <CaptionScaledNumber field="echoAngleDeg" label="Direction" value={props.echoAngleDeg} min={0} max={359} step={1} unit="°" {...number} />
        <InspectorColorControl label="Echo colour" ariaLabel="Echo colour" value={props.echoColor} isCustom={props.echoColor !== preset.echoColor}
          onChange={(echoColor) => onPatch({ echoColor })} onReset={() => onPatch({ echoColor: preset.echoColor })} />
      </> : null}

      <InspectorItemHeader title="Colour cycle" enabled={cycleOn}
        onEnabledChange={(enabled) => onPatch({ colorCycleSeconds: enabled ? CAPTION_LAYER_TURN_ON.colorCycleSeconds : 0 })} />
      {cycleOn ? <CaptionScaledNumber field="colorCycleSeconds" label="Turn time" value={props.colorCycleSeconds} min={0.5} max={20} step={0.1} unit="s" {...number} /> : null}

      <InspectorItemHeader title="Box" enabled={boxOn}
        onEnabledChange={(enabled) => onPatch(enabled
          ? { boxColor: CAPTION_LAYER_TURN_ON.boxColor, boxOpacity: CAPTION_LAYER_TURN_ON.boxOpacity, fillGradientColor: null }
          : { boxColor: null })} />
      {boxOn ? <>
        <InspectorColorControl label="Box colour" ariaLabel="Box colour" value={props.boxColor ?? CAPTION_LAYER_TURN_ON.boxColor} isCustom
          onChange={(boxColor) => onPatch({ boxColor })} onReset={() => onPatch({ boxColor: CAPTION_LAYER_TURN_ON.boxColor })} />
        <CaptionScaledNumber field="boxOpacity" label="Opacity" value={props.boxOpacity} min={0} max={100} step={1} unit="%" scale={100} {...number} />
        <CaptionScaledNumber field="boxRadiusEm" label="Corners" value={props.boxRadiusEm} min={0} max={100} step={1} unit="%" scale={100} {...number} />
        <CaptionScaledNumber field="boxPadEm" label="Padding" value={props.boxPadEm} min={0} max={100} step={1} unit="%" scale={100} {...number} />
        <InspectorPropertyControl fields="boxScope" label="Shape" disabled={false} onReset={() => onPatch({ boxScope: "line" })}>
          <OptionSelect label="Box shape" value={props.boxScope} size="sm"
            options={[{ value: "line", label: "Each line" }, { value: "block", label: "Whole caption" }]}
            onValueChange={(boxScope) => onPatch({ boxScope })} />
        </InspectorPropertyControl>
      </> : null}

      <InspectorItemHeader title="Spacing" />
      <CaptionScaledNumber field="letterSpacingEm" label="Letters" value={props.letterSpacingEm} min={-10} max={50} step={1} unit="%" scale={100} {...number} />
      <CaptionScaledNumber field="lineHeightScale" label="Lines" value={props.lineHeightScale} min={70} max={200} step={1} unit="%" scale={100} {...number} />
    </div>
  </InspectorDisclosure>;
}
