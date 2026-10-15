import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { EFFECT_CONTROLS, SAFE_AGENT_EFFECT_PROP_KEYS } from "./effect-controls";

const timelineDir = path.dirname(fileURLToPath(import.meta.url));
const elementMenuSource = fs.readFileSync(path.resolve(timelineDir, "../../components/studio/timeline/ElementMenu.tsx"), "utf8");
const rendererSource = fs.readFileSync(path.resolve(timelineDir, "../remotion/TimelineComposition.tsx"), "utf8");

const sceneSource = fs.readFileSync(path.resolve(timelineDir, "resolved-media-scene.ts"), "utf8");

test("every safe agent effect field is normalized and mounted with preview, commit, reset, keyframe, and renderer coverage", () => {
  assert.deepEqual(
    SAFE_AGENT_EFFECT_PROP_KEYS,
    EFFECT_CONTROLS.filter((control) => control.agentWritable).map((control) => control.prop),
  );
  // Mounts live in shared wrappers: InspectorPropertyControl / InspectorGroupActions stamp
  // data-effect-control and the keyframe diamond from their `fields` prop, and the basic grade
  // rows bind fields={field} from a mapped ["grade_…", …] tuple list. Prove the wrappers emit
  // the runtime markers once, then accept any of those source shapes as evidence of a mount.
  assert.ok(
    fs.readFileSync(path.resolve(timelineDir, "../../components/studio/timeline/InspectorPropertyControl.tsx"), "utf8").includes("data-effect-control={fields}"),
    "inspector wrapper must stamp data-effect-control from its fields prop",
  );
  assert.ok(
    fs.readFileSync(path.resolve(timelineDir, "../../components/studio/timeline/InspectorPropertyControl.tsx"), "utf8").includes("data-keyframe-fields={fields}"),
    "keyframe toggle must stamp data-keyframe-fields from its fields prop",
  );
  const mountedInElementMenu = (prop: string, elementMenuSource: string) =>
    elementMenuSource.includes(`data-effect-control="${prop}"`) ||
    elementMenuSource.includes(`fields="${prop}"`) ||
    elementMenuSource.includes(`["${prop}",`);
  for (const control of EFFECT_CONTROLS) {
    const componentSource = control.ui.component === "ElementMenu" ? elementMenuSource
      : fs.readFileSync(path.resolve(timelineDir, `../../components/studio/timeline/${control.ui.component}.tsx`), "utf8");
    if (control.ui.component !== "ElementMenu") {
      assert.ok(elementMenuSource.includes(`<${control.ui.component}`), "effect control component is mounted");
      const sharedPropertySource = fs.readFileSync(path.resolve(timelineDir, "../../components/studio/timeline/InspectorPropertyControl.tsx"), "utf8");
      assert.ok(componentSource.includes("<InspectorPropertyControl") && (componentSource.includes("fields={field}") || componentSource.includes(`fields="${control.prop}"`)));
      assert.ok(sharedPropertySource.includes("data-effect-control={fields}"));
      assert.ok(sharedPropertySource.includes("data-keyframe-fields={fields}"));
    }
    assert.ok(control.uiControl.length > 0);
    assert.ok(control.identity !== undefined);
    assert.ok(control.normalize(control.identity) !== undefined);
    assert.ok(mountedInElementMenu(control.prop, componentSource), `${control.prop} is not mounted`);
    assert.ok(componentSource.includes(control.ui.previewCallback), `${control.prop} preview callback missing`);
    assert.ok(componentSource.includes(control.ui.commitCallback), `${control.prop} commit callback missing`);
    assert.ok(componentSource.includes(control.ui.resetCallback), `${control.prop} reset callback missing`);
    // A control declares whether it animates. Keyframeable fields owe the user a
    // diamond next to the property; a field that cannot animate — a chroma key
    // colour is a fact about the shoot, not a motion — must not pretend to offer one.
    const { keyframeCallback } = control.ui as { keyframeCallback?: string };
    if (control.keyframeable) {
      assert.ok(keyframeCallback, `${control.prop} is keyframeable but names no keyframe callback`);
      assert.ok(componentSource.includes(keyframeCallback), `${control.prop} keyframe callback missing`);
      assert.ok(
        componentSource.includes(`fields="${control.prop}"`) ||
          componentSource.includes(`["${control.prop}",`) ||
          componentSource.includes(`onToggle={${keyframeCallback}}`),
        `${control.prop} must expose a property-adjacent keyframe diamond`,
      );
    } else {
      assert.equal(
        keyframeCallback,
        undefined,
        `${control.prop} is not keyframeable and must not name a keyframe callback`,
      );
    }
    assert.ok(rendererSource.includes(control.renderer), `${control.prop} renderer missing`);
    assert.ok(["analytic", "geometry_preserving", "pixel_dependent"].includes(control.spatial));
    const filterSource = control.renderer === "StickerOutlineFilter" ? fs.readFileSync(path.resolve(timelineDir,"../remotion/StickerOutlineFilter.tsx"),"utf8") : "";
    assert.ok(filterSource.includes(control.resolver) || rendererSource.includes(control.resolver) || (rendererSource.includes("resolveMediaScene(") && sceneSource.includes(control.resolver)), `${control.prop} resolver missing from renderer`);
  }
});
