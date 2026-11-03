import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { SCALE_ENTRANCE_CURVES } from "./animation-presets";
import { CAPTION_TEMPLATES, CAPTION_TEMPLATE_IDS, captionTemplate, captionTemplateStyleProps, isCaptionTemplateCatalogConsistent, pickCaptionTemplateStyle } from "./caption-templates";
import { resolveCaptionProps } from "./captions";
import { captionStylePropsFromRaw } from "./captions";
import { PROPOSAL_TUNABLE_FIELDS } from "../agent/proposal-controls";

test("the catalog ships 25 templates with unique ids and real treatments and fonts", () => {
  assert.equal(CAPTION_TEMPLATES.length, 25);
  assert.equal(new Set(CAPTION_TEMPLATE_IDS).size, 25);
  assert.equal(new Set(CAPTION_TEMPLATES.map(item => item.label)).size, 25);
  assert.ok(isCaptionTemplateCatalogConsistent());
});

test("every lead dial is a tunable number and a card never leads with too many", () => {
  for (const item of CAPTION_TEMPLATES) {
    assert.ok(item.dials.length >= 1 && item.dials.length <= 5, item.id);
    for (const dial of item.dials) assert.ok(Object.hasOwn(PROPOSAL_TUNABLE_FIELDS, dial), `${item.id}: ${dial}`);
  }
});

test("a template with a scale entrance states its curve, which otherwise follows the preset", () => {
  for (const item of CAPTION_TEMPLATES) {
    if (!item.style.animationIn || !SCALE_ENTRANCE_CURVES[item.style.animationIn]) continue;
    assert.equal(typeof item.style.entranceStartScale, "number", item.id);
    assert.equal(typeof item.style.entranceOvershoot, "number", item.id);
  }
});

test("applying a template resolves to its own values and clears what an earlier template left", () => {
  const glow = captionTemplate("glow_outline")!;
  const punch = captionTemplate("speaking_word_punch")!;
  const afterGlow = resolveCaptionProps({ text: "a b c", ...captionTemplateStyleProps(glow) });
  assert.equal(afterGlow.glowStrength, 0.7);
  assert.equal(afterGlow.fontPreset, "archivo_black");
  // A lane restyle starts from the caption's current style, as the Captions panel does.
  const restyled = resolveCaptionProps({ text: "a b c", ...captionStylePropsFromRaw(afterGlow), ...captionTemplateStyleProps(punch) });
  assert.equal(restyled.glowStrength, 0);
  assert.equal(restyled.speakingWordScale, 1.25);
  assert.equal(restyled.speakingWordOvershoot, 0.45);
  assert.equal(restyled.fontPreset, "anton");
});

test("overrides win over the template, and only template fields are picked from a record", () => {
  const props = captionTemplateStyleProps(captionTemplate("punch_in_phrase")!, { entranceOvershoot: 0.05, fontPreset: "inter" });
  assert.equal(props.entranceOvershoot, 0.05);
  assert.equal(props.fontPreset, "inter");
  assert.equal(resolveCaptionProps({ text: "x", ...props }).entranceStartScale, 0.6);
  assert.deepEqual(pickCaptionTemplateStyle({ glowStrength: 0.2, font_size_px: 40, keywordColor: undefined }), { glowStrength: 0.2 });
});

test("the MCP tool lists exactly the catalog's template ids", () => {
  const server = fs.readFileSync(new URL("../../../mcp/server.mjs", import.meta.url), "utf8");
  const match = /CAPTION_TEMPLATE_IDS=(\[[^\]]*\])/.exec(server);
  assert.ok(match, "mcp/server.mjs declares CAPTION_TEMPLATE_IDS");
  assert.deepEqual(JSON.parse(match[1]!), CAPTION_TEMPLATE_IDS);
});
