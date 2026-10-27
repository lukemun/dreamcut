import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { CAPTION_LOOKS, TEXT_PANEL_FONTS, TEXT_PRESETS, isPanelPresetConsistent, AGENT_ONLY_CAPTION_VARIANTS } from "@/lib/timeline/panel-text-presets";
import { buildCaptionLookPayload, buildFontTextPayload, buildTextPresetPayload } from "./asset-shelf-payloads";
import { isLaneCompatibleWithElementType } from "@/lib/timeline/lanes";
import { resolveCaptionProps } from "@/lib/timeline/captions";

test("caption looks and text presets only use supported caption props", () => {
  assert.ok(isPanelPresetConsistent());
  assert.ok(CAPTION_LOOKS.every(look => !AGENT_ONLY_CAPTION_VARIANTS.has(look.styleVariant)));
  assert.equal(new Set(CAPTION_LOOKS.map(look => look.id)).size, CAPTION_LOOKS.length);
  assert.equal(new Set(TEXT_PRESETS.map(item => item.id)).size, TEXT_PRESETS.length);
  assert.ok(TEXT_PANEL_FONTS.length >= 12);
});

test("panel text payloads resolve to the previewed look on a caption lane", () => {
  for (const payload of [...CAPTION_LOOKS.map(buildCaptionLookPayload), ...TEXT_PRESETS.map(buildTextPresetPayload), ...TEXT_PANEL_FONTS.map(buildFontTextPayload)]) {
    assert.equal(payload.type, "caption_text");
    assert.ok(isLaneCompatibleWithElementType(payload.type, payload.lane_key));
    // Unsupported bookkeeping props would push the preview off the GPU path.
    assert.ok(!("intent_key" in (payload.props ?? {})));
  }
  for (const item of TEXT_PRESETS) {
    const resolved = resolveCaptionProps(buildTextPresetPayload(item).props);
    assert.equal(resolved.styleVariant, item.props.styleVariant);
    assert.equal(resolved.fontPreset, item.props.fontPreset);
    assert.equal(resolved.positionPreset, item.props.positionPreset);
    assert.equal(resolved.animationIn, item.props.animationIn);
    assert.equal(resolved.text, item.sampleText);
  }
});

test("editor rail holds Templates, Layouts, Captions, Text and Properties (Library opens from the header), and panel picks reach chat as removable pills", () => {
  const tabs = fs.readFileSync(new URL("./MediaWorkspaceTabs.tsx", import.meta.url), "utf8");
  const chat = fs.readFileSync(new URL("../../desktop/DesktopChat.tsx", import.meta.url), "utf8");
  const canvas = fs.readFileSync(new URL("./CanvasTimeline.tsx", import.meta.url), "utf8");
  assert.ok(tabs.includes('["browse", "music", "sounds", "recipes", "layouts", "captions", "text", "properties"]'));
  assert.ok(!tabs.includes('library: { label: "Library"'), "the rail has no Library item; the header's Library button opens it");
  assert.ok(chat.includes("[Selected in the editor]"));
  assert.ok(chat.includes("onRemoveSelection(item.id)"));
  assert.ok(canvas.includes("onDropElement(payload, Number(seconds.toFixed(3)))"));
});

test("header control geometry never leaks into popovers anchored in the header", () => {
  const css = ["../../../app/editor-glass.css", "../../../app/editor-workspace.css"].map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  const broad = css.split("\n").filter(line => /\.timeline-project-header[^{]*\bbutton\b[^{]*\{/.test(line) && /(#timeline-project-header-actions button|\.timeline-project-header button:not)/.test(line));
  assert.ok(broad.length >= 4);
  for (const line of broad) assert.ok(line.includes("[popover] *"), line);
});
